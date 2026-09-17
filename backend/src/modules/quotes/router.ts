import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { nextDocumentNumber } from "../shared/numbering";
import { calculateDocumentTotals, vatBreakdownFromLineItems } from "../tax/calculator";
import { renderDocumentPdf } from "../pdf/documentTemplate";
import { emitEvent } from "../plugins/hooks";

export const quotesRouter = Router();
quotesRouter.use(requireAuth);

const lineItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().default("Stk."),
  unitPriceCents: z.number().int(),
  vatRateBps: z.number().int().min(0).max(10000),
});

const createQuoteSchema = z.object({
  customerId: z.string(),
  issueDate: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().optional(),
  items: z.array(lineItemSchema).min(1),
});

quotesRouter.get("/", async (req, res) => {
  const quotes = await prisma.quote.findMany({
    where: { companyId: req.auth!.companyId },
    include: { customer: true },
    orderBy: { issueDate: "desc" },
  });
  res.json(quotes);
});

quotesRouter.get("/:id", async (req, res) => {
  const quote = await prisma.quote.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { items: true, customer: true },
  });
  if (!quote) throw new HttpError(404, "Angebot nicht gefunden");
  res.json(quote);
});

quotesRouter.post("/", async (req, res) => {
  const body = createQuoteSchema.parse(req.body);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });
  const customer = await prisma.customer.findFirst({ where: { id: body.customerId, companyId: company.id } });
  if (!customer) throw new HttpError(404, "Kunde nicht gefunden");
  const totals = calculateDocumentTotals(body.items, company.isSmallBusiness);

  const quote = await prisma.$transaction(async (tx) => {
    const quoteNumber = await nextDocumentNumber(company.id, "QUOTE", tx);
    return tx.quote.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        quoteNumber,
        issueDate: body.issueDate ?? new Date(),
        validUntil: body.validUntil,
        notes: body.notes,
        subtotalCents: totals.subtotalCents,
        vatTotalCents: totals.vatTotalCents,
        totalCents: totals.totalCents,
        items: {
          create: body.items.map((item, idx) => ({
            position: idx + 1,
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPriceCents: item.unitPriceCents,
            vatRateBps: company.isSmallBusiness ? 0 : item.vatRateBps,
            lineTotalCents: Math.round(item.quantity * item.unitPriceCents),
          })),
        },
      },
      include: { items: true, customer: true },
    });
  });

  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "quote.create", entityType: "Quote", entityId: quote.id });
  await emitEvent("quote.created", { companyId: company.id, quote });
  res.status(201).json(quote);
});

// Angebote sind (anders als Rechnungen) keine GoBD-pflichtigen Steuerbelege - Entwürfe
// dürfen daher weiterhin uneingeschränkt bearbeitet werden. Ein bereits versendetes/vom
// Kunden beantwortetes Angebot ist aber ein nachvollziehbarkeits-relevanter Geschäfts-
// vorgang und wird ab dann nicht mehr bearbeitet oder gelöscht, sondern nur noch per
// PATCH /:id/status im Status fortgeschrieben (siehe unten) - analog zu Rechnungen.
quotesRouter.patch("/:id", async (req, res) => {
  const existing = await prisma.quote.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Angebot nicht gefunden");
  if (existing.status !== "DRAFT") {
    throw new HttpError(409, "Nur Entwürfe können bearbeitet werden. Bereits versendete Angebote bitte über den Status (Angenommen/Abgelehnt) fortschreiben.");
  }
  const body = createQuoteSchema.partial().parse(req.body);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });

  let updateData: any = {
    customerId: body.customerId,
    issueDate: body.issueDate,
    validUntil: body.validUntil,
    notes: body.notes,
  };

  if (body.items) {
    const totals = calculateDocumentTotals(body.items, company.isSmallBusiness);
    updateData = {
      ...updateData,
      subtotalCents: totals.subtotalCents,
      vatTotalCents: totals.vatTotalCents,
      totalCents: totals.totalCents,
      items: {
        deleteMany: {},
        create: body.items.map((item, idx) => ({
          position: idx + 1,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPriceCents: item.unitPriceCents,
          vatRateBps: company.isSmallBusiness ? 0 : item.vatRateBps,
          lineTotalCents: Math.round(item.quantity * item.unitPriceCents),
        })),
      },
    };
  }

  const updated = await prisma.quote.update({ where: { id: existing.id }, data: updateData, include: { items: true, customer: true } });
  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "quote.update", entityType: "Quote", entityId: existing.id });
  res.json(updated);
});

quotesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.quote.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Angebot nicht gefunden");
  if (existing.status !== "DRAFT") {
    throw new HttpError(409, "Nur Entwürfe können gelöscht werden. Bereits versendete/beantwortete Angebote bleiben aus Nachvollziehbarkeitsgründen erhalten.");
  }
  await prisma.quote.delete({ where: { id: existing.id } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "quote.delete", entityType: "Quote", entityId: existing.id });
  res.status(204).send();
});

quotesRouter.patch("/:id/status", async (req, res) => {
  const schema = z.object({ status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"]) });
  const body = schema.parse(req.body);
  const quote = await prisma.quote.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!quote) throw new HttpError(404, "Angebot nicht gefunden");
  const updated = await prisma.quote.update({ where: { id: quote.id }, data: { status: body.status } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "quote.status_change", entityType: "Quote", entityId: quote.id, metadata: body });
  if (body.status === "ACCEPTED") await emitEvent("quote.accepted", { companyId: req.auth!.companyId, quote: updated });
  res.json(updated);
});

// Wandelt ein angenommenes Angebot in eine Rechnung um (übernimmt Positionen 1:1).
quotesRouter.post("/:id/convert-to-invoice", async (req, res) => {
  const quote = await prisma.quote.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { items: true },
  });
  if (!quote) throw new HttpError(404, "Angebot nicht gefunden");

  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });
  const invoice = await prisma.$transaction(async (tx) => {
    // Nummer wird bewusst erst beim Versenden vergeben (siehe finalizeInvoiceNumber in
    // modules/invoices/router.ts) - die aus dem Angebot erzeugte Rechnung ist zunächst
    // ein normaler Entwurf wie jede andere neu angelegte Rechnung auch.
    return tx.invoice.create({
      data: {
        companyId: company.id,
        customerId: quote.customerId,
        isSmallBusiness: company.isSmallBusiness,
        sourceQuoteId: quote.id,
        footerText: company.invoiceFooterText,
        subtotalCents: quote.subtotalCents,
        vatTotalCents: quote.vatTotalCents,
        totalCents: quote.totalCents,
        items: {
          create: quote.items.map((item) => ({
            position: item.position,
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPriceCents: item.unitPriceCents,
            vatRateBps: item.vatRateBps,
            lineTotalCents: item.lineTotalCents,
          })),
        },
      },
      include: { items: true, customer: true },
    });
  });

  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "quote.convert_to_invoice", entityType: "Quote", entityId: quote.id, metadata: { invoiceId: invoice.id } });
  await emitEvent("invoice.created", { companyId: company.id, invoice });
  res.status(201).json(invoice);
});

quotesRouter.get("/:id/pdf", async (req, res) => {
  const quote = await prisma.quote.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { items: true, customer: true, company: true },
  });
  if (!quote) throw new HttpError(404, "Angebot nicht gefunden");
  const locale = (req.query.lang as "de" | "en") || (quote.company.defaultLocale as "de" | "en") || "de";

  const pdfBuffer = await renderDocumentPdf({
    docTypeLabel: { de: "Angebot", en: "Quote" },
    documentNumber: quote.quoteNumber,
    issueDate: quote.issueDate,
    validUntil: quote.validUntil,
    locale,
    branding: quote.company,
    recipient: quote.customer,
    items: quote.items,
    subtotalCents: quote.subtotalCents,
    vatBreakdown: vatBreakdownFromLineItems(quote.items),
    vatTotalCents: quote.vatTotalCents,
    totalCents: quote.totalCents,
    isSmallBusiness: quote.company.isSmallBusiness,
    notes: quote.notes,
    showPrices: true,
    showSepaQr: false,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${quote.quoteNumber}.pdf"`);
  res.send(pdfBuffer);
});
