import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { nextDocumentNumber } from "../shared/numbering";
import { calculateDocumentTotals } from "../tax/calculator";
import { parseEtsyCsv, type ImportedOrder } from "./etsy";

/**
 * Bestellungen aus Etsy (CSV-Export) übernehmen: je Bestellung wird ein Kunde (falls noch nicht vorhanden) und eine
 * Auftragsbestätigung als ENTWURF angelegt - sie erscheint sofort im Produktionsboard und kann dort wie jeder Auftrag
 * bearbeitet, fertiggestellt und später in eine Rechnung überführt werden. Es gibt keine Live-Verbindung zu Etsy.
 */

export const orderImportRouter = Router();
orderImportRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const marker = (orderId: string) => `Etsy #${orderId}`;

async function readOrders(file: Express.Multer.File | undefined): Promise<ImportedOrder[]> {
  if (!file) throw new HttpError(400, "Bitte eine CSV-Datei auswählen.");
  let parsed;
  try {
    parsed = parseEtsyCsv(file.buffer.toString("utf8"));
  } catch (err) {
    throw new HttpError(400, `Die Datei konnte nicht gelesen werden (${(err as Error).message}). Ist es der CSV-Export aus Etsy?`);
  }
  if (parsed.orders.length === 0) throw new HttpError(400, "Die Datei enthält keine Bestellungen.");
  if (!parsed.columns.orderId && !parsed.columns.itemName && !parsed.columns.orderValue) {
    throw new HttpError(400, "Die Spalten wurden nicht erkannt. Bitte den CSV-Export \"Bestellte Artikel\" oder \"Bestellungen\" aus Etsy verwenden.");
  }
  return parsed.orders.slice(0, 500);
}

// Vorschau: zeigt, was angelegt würde, und welche Bestellungen schon importiert sind
orderImportRouter.post("/etsy/preview", upload.single("file"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const orders = await readOrders(req.file);
  const existing = await prisma.orderConfirmation.findMany({ where: { companyId, OR: orders.map((o) => ({ notes: { contains: marker(o.orderId) } })) }, select: { notes: true, confirmationNumber: true } });
  res.json({
    orders: orders.map((o) => {
      const dup = existing.find((e) => e.notes?.split("\n").some((line) => line.trim() === marker(o.orderId)));
      return { ...o, alreadyImportedAs: dup?.confirmationNumber ?? null };
    }),
  });
});

const commitSchema = z.object({ only: z.string().optional() }); // kommagetrennte Bestellnummern; leer = alle neuen

orderImportRouter.post("/etsy", upload.single("file"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const { only } = commitSchema.parse(req.body);
  const wanted = only ? new Set(only.split(",").map((x) => x.trim()).filter(Boolean)) : null;
  const orders = (await readOrders(req.file)).filter((o) => !wanted || wanted.has(o.orderId));
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });

  const result = { created: [] as { orderId: string; confirmationNumber: string; customerName: string }[], skipped: [] as { orderId: string; reason: string }[], newCustomers: 0 };

  for (const order of orders) {
    const already = await prisma.orderConfirmation.findFirst({ where: { companyId, notes: { contains: marker(order.orderId) } }, select: { notes: true } });
    if (already?.notes?.split("\n").some((l) => l.trim() === marker(order.orderId))) {
      result.skipped.push({ orderId: order.orderId, reason: "bereits importiert" });
      continue;
    }

    // Preise bei Regelbesteuerung sind Endkundenpreise (brutto): auf netto umrechnen; Kleinunternehmer ohne USt. übernehmen 1:1
    const vatRateBps = company.isSmallBusiness ? 0 : 1900;
    const net = (cents: number) => (vatRateBps ? Math.round(cents / (1 + vatRateBps / 10000)) : cents);
    const items = [
      ...order.items.map((i) => ({ description: i.description, quantity: i.quantity, unit: "Stk.", unitPriceCents: net(i.unitPriceCents), vatRateBps })),
      ...(order.shippingCents > 0 ? [{ description: "Versandkosten", quantity: 1, unit: "Pausch.", unitPriceCents: net(order.shippingCents), vatRateBps }] : []),
    ];
    const totals = calculateDocumentTotals(items, company.isSmallBusiness);

    await prisma.$transaction(async (tx) => {
      let customer = await tx.customer.findFirst({
        where: { companyId, isArchived: false, name: { equals: order.buyerName, mode: "insensitive" }, ...(order.postalCode ? { postalCode: order.postalCode } : {}) },
      });
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            companyId,
            customerNumber: await nextDocumentNumber(companyId, "CUSTOMER", tx),
            type: "PRIVAT",
            name: order.buyerName,
            street: order.street,
            postalCode: order.postalCode,
            city: order.city,
            country: order.country,
            notes: "Angelegt durch Etsy-Import",
          },
        });
        result.newCustomers++;
      }
      const confirmationNumber = await nextDocumentNumber(companyId, "ORDER_CONFIRMATION", tx);
      await tx.orderConfirmation.create({
        data: {
          companyId,
          customerId: customer.id,
          confirmationNumber,
          issueDate: order.date ? new Date(order.date) : new Date(),
          notes: [marker(order.orderId), ...order.notes].join("\n"),
          introText: company.orderConfirmationIntroText,
          closingText: company.orderConfirmationClosingText,
          subtotalCents: totals.subtotalCents,
          vatTotalCents: totals.vatTotalCents,
          totalCents: totals.totalCents,
          items: {
            create: items.map((item, idx) => ({
              position: idx + 1,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitPriceCents: item.unitPriceCents,
              vatRateBps: item.vatRateBps,
              lineTotalCents: Math.round(item.quantity * item.unitPriceCents),
            })),
          },
        },
      });
      result.created.push({ orderId: order.orderId, confirmationNumber, customerName: customer.name });
    });
  }

  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "order_import.etsy", entityType: "Company", entityId: companyId, metadata: { created: result.created.length, skipped: result.skipped.length, newCustomers: result.newCustomers } });
  res.status(result.created.length ? 201 : 200).json(result);
});
