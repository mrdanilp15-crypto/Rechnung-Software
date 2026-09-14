import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { nextDocumentNumber } from "../shared/numbering";
import { calculateDocumentTotals } from "../tax/calculator";
import { renderDocumentPdf } from "../pdf/documentTemplate";

export const orderConfirmationsRouter = Router();
orderConfirmationsRouter.use(requireAuth);

orderConfirmationsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.orderConfirmation.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  await prisma.orderConfirmation.delete({ where: { id: existing.id } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "order_confirmation.delete", entityType: "OrderConfirmation", entityId: existing.id });
  res.status(204).send();
});

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().default("Stk."),
  unitPriceCents: z.number().int(),
  vatRateBps: z.number().int().min(0).max(10000),
});

const createSchema = z.object({
  customerId: z.string(),
  issueDate: z.coerce.date().optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  items: z.array(lineItemSchema).min(1),
});

orderConfirmationsRouter.get("/", async (req, res) => {
  const list = await prisma.orderConfirmation.findMany({
    where: { companyId: req.auth!.companyId },
    include: { customer: true },
    orderBy: { issueDate: "desc" },
  });
  res.json(list);
});

orderConfirmationsRouter.post("/", async (req, res) => {
  const body = createSchema.parse(req.body);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });
  const customer = await prisma.customer.findFirst({ where: { id: body.customerId, companyId: company.id } });
  if (!customer) throw new HttpError(404, "Kunde nicht gefunden");
  const totals = calculateDocumentTotals(body.items, company.isSmallBusiness);

  const confirmation = await prisma.$transaction(async (tx) => {
    const confirmationNumber = await nextDocumentNumber(company.id, "ORDER_CONFIRMATION", tx);
    return tx.orderConfirmation.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        confirmationNumber,
        issueDate: body.issueDate ?? new Date(),
        expectedDeliveryDate: body.expectedDeliveryDate,
        notes: body.notes,
        subtotalCents: totals.subtotalCents,
        vatTotalCents: totals.vatTotalCents,
        totalCents: totals.totalCents,
        items: {
          create: body.items.map((item, idx) => ({
            position: idx + 1,
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

  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "order_confirmation.create", entityType: "OrderConfirmation", entityId: confirmation.id });
  res.status(201).json(confirmation);
});

orderConfirmationsRouter.get("/:id/pdf", async (req, res) => {
  const confirmation = await prisma.orderConfirmation.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { items: true, customer: true, company: true },
  });
  if (!confirmation) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  const locale = (req.query.lang as "de" | "en") || (confirmation.company.defaultLocale as "de" | "en") || "de";

  const pdfBuffer = await renderDocumentPdf({
    docTypeLabel: { de: "Auftragsbestätigung", en: "Order Confirmation" },
    documentNumber: confirmation.confirmationNumber,
    issueDate: confirmation.issueDate,
    locale,
    branding: confirmation.company,
    recipient: confirmation.customer,
    items: confirmation.items,
    subtotalCents: confirmation.subtotalCents,
    vatTotalCents: confirmation.vatTotalCents,
    totalCents: confirmation.totalCents,
    isSmallBusiness: confirmation.company.isSmallBusiness,
    notes: confirmation.notes,
    showPrices: true,
    showSepaQr: false,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${confirmation.confirmationNumber}.pdf"`);
  res.send(pdfBuffer);
});
