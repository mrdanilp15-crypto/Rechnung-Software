import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { nextDocumentNumber } from "../shared/numbering";
import { calculateDocumentTotals, vatBreakdownFromLineItems } from "../tax/calculator";
import { renderDocumentPdf } from "../pdf/documentTemplate";
import { resolvePdfLayout } from "../pdf/layout";
import { renderSimplePreview, simplePreviewSchema } from "../pdf/docPreview";
import { buildInvoiceFinancials, defaultDueDate } from "../invoices/build";
import { createDownPaymentInvoice, deductionLinesFor } from "../invoices/downPayments";
import { previewRateLimiter } from "../../middleware/rateLimit";

export const orderConfirmationsRouter = Router();
orderConfirmationsRouter.use(requireAuth);

// Auftragsbestätigungen sind nachvollziehbarkeits-relevante Geschäftsunterlagen (GoBD) -
// "Löschen" markiert sie deshalb nur als ungültig (voidedAt), statt den Datensatz zu entfernen.
orderConfirmationsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.orderConfirmation.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  if (existing.voidedAt) throw new HttpError(409, "Auftragsbestätigung ist bereits ungültig markiert.");
  await prisma.orderConfirmation.update({ where: { id: existing.id }, data: { voidedAt: new Date() } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "order_confirmation.void", entityType: "OrderConfirmation", entityId: existing.id });
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
  introText: z.string().max(3000).optional(),
  closingText: z.string().max(3000).optional(),
  sourceQuoteId: z.string().optional(),
  items: z.array(lineItemSchema).min(1),
});

orderConfirmationsRouter.get("/", async (req, res) => {
  const list = await prisma.orderConfirmation.findMany({
    where: { companyId: req.auth!.companyId, voidedAt: null },
    include: { customer: true, _count: { select: { deliveryNotes: true } } },
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
        introText: body.introText ?? company.orderConfirmationIntroText,
        closingText: body.closingText ?? company.orderConfirmationClosingText,
        sourceQuoteId: body.sourceQuoteId,
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

orderConfirmationsRouter.get("/:id", async (req, res) => {
  const confirmation = await prisma.orderConfirmation.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { items: true, customer: true },
  });
  if (!confirmation) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  res.json(confirmation);
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
    numberLabel: { de: "Auftragsnr.", en: "Order no." },
    documentNumber: confirmation.confirmationNumber,
    issueDate: confirmation.issueDate,
    deliveryDate: confirmation.expectedDeliveryDate,
    deliveryDateLabel: { de: "Voraussichtl. Lieferung", en: "Expected delivery" },
    locale,
    branding: confirmation.company,
    recipient: confirmation.customer,
    items: confirmation.items,
    subtotalCents: confirmation.subtotalCents,
    vatBreakdown: vatBreakdownFromLineItems(confirmation.items),
    vatTotalCents: confirmation.vatTotalCents,
    totalCents: confirmation.totalCents,
    isSmallBusiness: confirmation.company.isSmallBusiness,
    notes: confirmation.notes,
    layout: resolvePdfLayout(confirmation.company.pdfLayout, req.query.layout),
    isDraft: confirmation.status === "DRAFT",
    introText: confirmation.introText,
    closingText: confirmation.closingText,
    showPrices: true,
    showSepaQr: false,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${confirmation.confirmationNumber}.pdf"`);
  res.send(pdfBuffer);
});

// ---------- Entwürfe, Vorschau und Weiterführen ----------

orderConfirmationsRouter.post("/preview-pdf", previewRateLimiter, async (req, res) => {
  const body = simplePreviewSchema.parse(req.body);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });
  const customer = body.customerId ? await prisma.customer.findFirst({ where: { id: body.customerId, companyId: company.id } }) : null;
  const pdf = await renderSimplePreview("confirmation", company, customer, body);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "no-store");
  res.send(pdf);
});

orderConfirmationsRouter.patch("/:id", async (req, res) => {
  const existing = await prisma.orderConfirmation.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, voidedAt: null } });
  if (!existing) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  if (existing.status !== "DRAFT") throw new HttpError(409, "Nur Entwürfe können bearbeitet werden.");
  const body = createSchema.partial().parse(req.body);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });
  if (body.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: body.customerId, companyId: company.id } });
    if (!customer) throw new HttpError(404, "Kunde nicht gefunden");
  }
  let data: any = {
    customerId: body.customerId,
    issueDate: body.issueDate,
    expectedDeliveryDate: body.expectedDeliveryDate,
    notes: body.notes,
    introText: body.introText,
    closingText: body.closingText,
  };
  if (body.items) {
    const totals = calculateDocumentTotals(body.items, company.isSmallBusiness);
    data = {
      ...data,
      subtotalCents: totals.subtotalCents,
      vatTotalCents: totals.vatTotalCents,
      totalCents: totals.totalCents,
      items: {
        deleteMany: {},
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
    };
  }
  const updated = await prisma.orderConfirmation.update({ where: { id: existing.id }, data, include: { items: true, customer: true } });
  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "order_confirmation.update", entityType: "OrderConfirmation", entityId: existing.id });
  res.json(updated);
});

// "Fertigstellen": der Entwurf wird zur ausgestellten Auftragsbestätigung (PDF ohne Entwurfs-Wasserzeichen).
orderConfirmationsRouter.post("/:id/finalize", async (req, res) => {
  const existing = await prisma.orderConfirmation.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, voidedAt: null }, include: { items: true } });
  if (!existing) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  if (existing.items.length === 0) throw new HttpError(400, "Bitte mindestens eine Position eintragen.");
  const updated = existing.status === "DRAFT" ? await prisma.orderConfirmation.update({ where: { id: existing.id }, data: { status: "SENT" } }) : existing;
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "order_confirmation.finalize", entityType: "OrderConfirmation", entityId: existing.id });
  res.json(updated);
});

// Weiter im Ablauf: Auftragsbestätigung -> Lieferschein (Entwurf, ohne Preise)
orderConfirmationsRouter.post("/:id/convert-to-delivery-note", async (req, res) => {
  const source = await prisma.orderConfirmation.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, voidedAt: null }, include: { items: true } });
  if (!source) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: source.companyId } });
  const note = await prisma.$transaction(async (tx) => {
    const noteNumber = await nextDocumentNumber(company.id, "DELIVERY_NOTE", tx);
    return tx.deliveryNote.create({
      data: {
        companyId: company.id,
        customerId: source.customerId,
        noteNumber,
        sourceOrderConfirmationId: source.id,
        introText: company.deliveryNoteIntroText,
        closingText: company.deliveryNoteClosingText,
        items: { create: source.items.map((i, idx) => ({ position: idx + 1, description: i.description, quantity: i.quantity, unit: i.unit })) },
      },
      include: { items: true, customer: true },
    });
  });
  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "order_confirmation.convert_to_delivery_note", entityType: "OrderConfirmation", entityId: source.id, metadata: { deliveryNoteId: note.id } });
  res.status(201).json(note);
});

// Weiter im Ablauf: Auftragsbestätigung -> Rechnung (Entwurf, Steuerbehandlung wird neu berechnet)
orderConfirmationsRouter.post("/:id/convert-to-invoice", async (req, res) => {
  const source = await prisma.orderConfirmation.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, voidedAt: null }, include: { items: true, customer: true } });
  if (!source) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: source.companyId } });
  // Bereits abgerechnete Anzahlungen (zu dieser AB oder dem zugrunde liegenden Angebot) werden abgezogen
  const deductions = await deductionLinesFor(prisma, company.id, { orderConfirmationId: source.id, quoteId: source.sourceQuoteId });
  const financials = buildInvoiceFinancials(company, source.customer, [...source.items, ...deductions.items], "GOODS");
  const issueDate = new Date();
  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
    data: {
      kind: deductions.items.length > 0 ? "FINAL" : "STANDARD",
      companyId: company.id,
      customerId: source.customerId,
      issueDate,
      dueDate: defaultDueDate(company, issueDate),
      isSmallBusiness: financials.isSmallBusiness,
      vatNoticeKey: financials.vatNoticeKey,
      sourceOrderConfirmationId: source.id,
      sourceQuoteId: source.sourceQuoteId,
      introText: company.invoiceIntroText,
      closingText: company.invoiceClosingText,
      footerText: company.invoiceFooterText,
      subtotalCents: financials.subtotalCents,
      vatTotalCents: financials.vatTotalCents,
      totalCents: financials.totalCents,
      items: { create: financials.itemsCreate },
    },
    include: { items: true, customer: true },
    });
    if (deductions.downPaymentIds.length > 0) {
      await tx.invoice.updateMany({ where: { id: { in: deductions.downPaymentIds } }, data: { finalInvoiceId: created.id } });
    }
    return created;
  });
  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "order_confirmation.convert_to_invoice", entityType: "OrderConfirmation", entityId: source.id, metadata: { invoiceId: invoice.id } });
  res.status(201).json(invoice);
});

orderConfirmationsRouter.post("/:id/duplicate", async (req, res) => {
  const source = await prisma.orderConfirmation.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, voidedAt: null }, include: { items: true } });
  if (!source) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: source.companyId } });
  const totals = calculateDocumentTotals(source.items, company.isSmallBusiness);
  const copy = await prisma.$transaction(async (tx) => {
    const confirmationNumber = await nextDocumentNumber(company.id, "ORDER_CONFIRMATION", tx);
    return tx.orderConfirmation.create({
      data: {
        companyId: company.id,
        customerId: source.customerId,
        confirmationNumber,
        notes: source.notes,
        introText: source.introText ?? company.orderConfirmationIntroText,
        closingText: source.closingText ?? company.orderConfirmationClosingText,
        subtotalCents: totals.subtotalCents,
        vatTotalCents: totals.vatTotalCents,
        totalCents: totals.totalCents,
        items: {
          create: source.items.map((i, idx) => ({
            position: idx + 1,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unitPriceCents: i.unitPriceCents,
            vatRateBps: company.isSmallBusiness ? 0 : i.vatRateBps,
            lineTotalCents: Math.round(i.quantity * i.unitPriceCents),
          })),
        },
      },
      include: { items: true, customer: true },
    });
  });
  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "order_confirmation.duplicate", entityType: "OrderConfirmation", entityId: source.id, metadata: { newId: copy.id } });
  res.status(201).json(copy);
});

// Anzahlungsrechnung (Entwurf) zu einer Auftragsbestätigung: Prozentsatz ODER fester Nettobetrag
orderConfirmationsRouter.post("/:id/down-payment", async (req, res) => {
  const body = z.object({ percent: z.number().optional(), netAmountCents: z.number().int().optional() }).parse(req.body);
  const source = await prisma.orderConfirmation.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, voidedAt: null }, include: { items: true, customer: true } });
  if (!source) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  if (source.status === "DRAFT") throw new HttpError(409, "Bitte die Auftragsbestätigung zuerst fertigstellen.");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: source.companyId } });
  const invoice = await createDownPaymentInvoice(prisma, { company, customer: source.customer, sourceItems: source.items, percent: body.percent, netAmountCents: body.netAmountCents, sourceLabel: `Auftragsbestätigung ${source.confirmationNumber}`, sourceQuoteId: source.sourceQuoteId, sourceOrderConfirmationId: source.id });
  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "order_confirmation.down_payment", entityType: "OrderConfirmation", entityId: source.id, metadata: { invoiceId: invoice.id } });
  res.status(201).json(invoice);
});
