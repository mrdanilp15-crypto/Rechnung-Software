import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { sendDocumentEmail, sendDocumentEmailSchema } from "../email/documentMail";
import { nextDocumentNumber } from "../shared/numbering";
import { calculateDocumentTotals, vatBreakdownFromLineItems } from "../tax/calculator";
import { renderDocumentPdf } from "../pdf/documentTemplate";
import { resolvePdfLayout } from "../pdf/layout";
import { renderSimplePreview, simplePreviewSchema } from "../pdf/docPreview";
import { buildInvoiceFinancials, defaultDueDate } from "../invoices/build";
import { createDownPaymentInvoice, deductionLinesFor } from "../invoices/downPayments";
import { previewRateLimiter } from "../../middleware/rateLimit";
import { checkQuoteLink } from "./link";
import { defaultAssigneeId, notifyAssigneeOnCreate } from "../documents/assignee";

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
  // Zuständig: ohne Angabe der Anlegende selbst, null = niemand (Änderung später über PATCH /orders/:id)
  assigneeId: z.string().min(1).nullable().optional(),
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
  const assigneeId = await defaultAssigneeId(req, body.assigneeId);

  const confirmation = await prisma.$transaction(async (tx) => {
    const confirmationNumber = await nextDocumentNumber(company.id, "ORDER_CONFIRMATION", tx);
    return tx.orderConfirmation.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        confirmationNumber,
        assigneeId,
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
  await notifyAssigneeOnCreate(req, "ORDER", confirmation.id, assigneeId);
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

async function renderConfirmationPdf(confirmation: Prisma.OrderConfirmationGetPayload<{ include: { items: true; customer: true; company: true } }>, locale: "de" | "en", layout?: unknown): Promise<Buffer> {
  return await renderDocumentPdf({
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
    layout: resolvePdfLayout(confirmation.company.pdfLayout, layout),
    isDraft: confirmation.status === "DRAFT",
    introText: confirmation.introText,
    closingText: confirmation.closingText,
    showPrices: true,
    showSepaQr: false,
  });
}

orderConfirmationsRouter.get("/:id/pdf", async (req, res) => {
  const confirmation = await prisma.orderConfirmation.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { items: true, customer: true, company: true },
  });
  if (!confirmation) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  const locale = (req.query.lang as "de" | "en") || (confirmation.company.defaultLocale as "de" | "en") || "de";

  const pdfBuffer = await renderConfirmationPdf(confirmation, locale, req.query.layout);

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

// Bestehenden Auftrag nachträglich mit einem Angebot verknüpfen (z.B. weil der Auftrag separat angelegt wurde); das Angebot gilt dann als angenommen
orderConfirmationsRouter.post("/:id/link-quote", async (req, res) => {
  const companyId = req.auth!.companyId;
  const { quoteId } = z.object({ quoteId: z.string().min(1) }).parse(req.body);
  const order = await prisma.orderConfirmation.findFirst({ where: { id: req.params.id, companyId } });
  if (!order) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, companyId } });
  if (!quote) throw new HttpError(404, "Angebot nicht gefunden");
  const other = await prisma.orderConfirmation.count({ where: { companyId, sourceQuoteId: quote.id, voidedAt: null, id: { not: order.id } } });
  const check = checkQuoteLink({ customerId: order.customerId, sourceQuoteId: order.sourceQuoteId, voided: !!order.voidedAt }, { customerId: quote.customerId, status: quote.status, alreadyHasOrder: other > 0 });
  if (!check.ok) throw new HttpError(check.status, check.error);
  await prisma.$transaction([
    prisma.orderConfirmation.update({ where: { id: order.id }, data: { sourceQuoteId: quote.id } }),
    ...(check.markAccepted ? [prisma.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } })] : []),
  ]);
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "order_confirmation.link_quote", entityType: "OrderConfirmation", entityId: order.id, metadata: { quoteId: quote.id, quoteNumber: quote.quoteNumber, markedAccepted: check.markAccepted } });
  res.json({ ok: true, quoteNumber: quote.quoteNumber, markedAccepted: check.markAccepted });
});

// Verknüpfung wieder lösen (falls das falsche Angebot gewählt wurde); der Status des Angebots bleibt unverändert
orderConfirmationsRouter.post("/:id/unlink-quote", async (req, res) => {
  const order = await prisma.orderConfirmation.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!order) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  if (!order.sourceQuoteId) throw new HttpError(409, "Dieser Auftrag ist mit keinem Angebot verknüpft.");
  await prisma.orderConfirmation.update({ where: { id: order.id }, data: { sourceQuoteId: null } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "order_confirmation.unlink_quote", entityType: "OrderConfirmation", entityId: order.id, metadata: { quoteId: order.sourceQuoteId } });
  res.json({ ok: true });
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
  const assigneeId = source.assigneeId ?? (await defaultAssigneeId(req));
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
      assigneeId,
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
  const assigneeId = await defaultAssigneeId(req);
  const copy = await prisma.$transaction(async (tx) => {
    const confirmationNumber = await nextDocumentNumber(company.id, "ORDER_CONFIRMATION", tx);
    return tx.orderConfirmation.create({
      data: {
        companyId: company.id,
        customerId: source.customerId,
        confirmationNumber,
        assigneeId,
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
  const invoice = await createDownPaymentInvoice(prisma, { company, customer: source.customer, sourceItems: source.items, percent: body.percent, netAmountCents: body.netAmountCents, sourceLabel: `Auftragsbestätigung ${source.confirmationNumber}`, sourceQuoteId: source.sourceQuoteId, sourceOrderConfirmationId: source.id, assigneeId: source.assigneeId ?? (await defaultAssigneeId(req)) });
  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "order_confirmation.down_payment", entityType: "OrderConfirmation", entityId: source.id, metadata: { invoiceId: invoice.id } });
  res.status(201).json(invoice);
});

// Beleg per E-Mail verschicken (PDF im Anhang). Ein Entwurf wird dabei fertiggestellt - aber erst, wenn die E-Mail tatsächlich
// übergeben wurde. "Fertigstellen" allein verschickt nichts.
orderConfirmationsRouter.post("/:id/send-email", async (req, res) => {
  const body = sendDocumentEmailSchema.parse(req.body);
  const confirmation = await prisma.orderConfirmation.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId, voidedAt: null },
    include: { items: true, customer: true, company: true },
  });
  if (!confirmation) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  if (confirmation.items.length === 0) throw new HttpError(400, "Bitte mindestens eine Position eintragen.");
  const locale = (confirmation.company.defaultLocale as "de" | "en") || "de";
  const wasDraft = confirmation.status === "DRAFT";
  const pdf = await renderConfirmationPdf(wasDraft ? { ...confirmation, status: "SENT" } : confirmation, locale);
  const to = await sendDocumentEmail({
    company: confirmation.company,
    customer: confirmation.customer,
    body,
    locale,
    sentence: { de: "die Auftragsbestätigung", en: "the order confirmation" },
    subject: { de: "Auftragsbestätigung", en: "Order confirmation" },
    number: confirmation.confirmationNumber,
    pdf,
  });
  const updated = await prisma.orderConfirmation.update({ where: { id: confirmation.id }, data: { emailSentAt: new Date(), ...(wasDraft ? { status: "SENT" } : {}) } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "confirmation.send_email", entityType: "Confirmation", entityId: confirmation.id, metadata: { to } });
  res.json({ ...updated, sentTo: to });
});
