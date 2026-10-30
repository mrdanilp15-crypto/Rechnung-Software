import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { sendDocumentEmail, sendDocumentEmailSchema } from "../email/documentMail";
import { nextDocumentNumber } from "../shared/numbering";
import { renderDocumentPdf } from "../pdf/documentTemplate";
import { resolvePdfLayout } from "../pdf/layout";
import { renderSimplePreview, simplePreviewSchema } from "../pdf/docPreview";
import { previewRateLimiter } from "../../middleware/rateLimit";

export const deliveryNotesRouter = Router();
deliveryNotesRouter.use(requireAuth);

// Lieferscheine sind nachvollziehbarkeits-relevante Geschäftsunterlagen (GoBD) - "Löschen"
// markiert sie deshalb nur als ungültig (voidedAt), statt den Datensatz zu entfernen.
deliveryNotesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.deliveryNote.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Lieferschein nicht gefunden");
  if (existing.voidedAt) throw new HttpError(409, "Lieferschein ist bereits ungültig markiert.");
  await prisma.deliveryNote.update({ where: { id: existing.id }, data: { voidedAt: new Date() } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "delivery_note.void", entityType: "DeliveryNote", entityId: existing.id });
  res.status(204).send();
});

const createSchema = z.object({
  customerId: z.string(),
  deliveryDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  introText: z.string().max(3000).optional(),
  closingText: z.string().max(3000).optional(),
  sourceOrderConfirmationId: z.string().optional(),
  items: z.array(
    z.object({ description: z.string().min(1), quantity: z.number().positive(), unit: z.string().default("Stk.") })
  ).min(1),
});

deliveryNotesRouter.get("/", async (req, res) => {
  const notes = await prisma.deliveryNote.findMany({
    where: { companyId: req.auth!.companyId, voidedAt: null },
    include: { customer: true, _count: { select: { items: true } } },
    orderBy: { deliveryDate: "desc" },
  });
  res.json(notes);
});

deliveryNotesRouter.post("/", async (req, res) => {
  const body = createSchema.parse(req.body);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });
  const customer = await prisma.customer.findFirst({ where: { id: body.customerId, companyId: company.id } });
  if (!customer) throw new HttpError(404, "Kunde nicht gefunden");

  if (body.sourceOrderConfirmationId) {
    const source = await prisma.orderConfirmation.findFirst({ where: { id: body.sourceOrderConfirmationId, companyId: company.id } });
    if (!source) throw new HttpError(404, "Auftragsbestätigung nicht gefunden");
  }

  const note = await prisma.$transaction(async (tx) => {
    const noteNumber = await nextDocumentNumber(company.id, "DELIVERY_NOTE", tx);
    return tx.deliveryNote.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        noteNumber,
        deliveryDate: body.deliveryDate ?? new Date(),
        notes: body.notes,
        introText: body.introText ?? company.deliveryNoteIntroText,
        closingText: body.closingText ?? company.deliveryNoteClosingText,
        sourceOrderConfirmationId: body.sourceOrderConfirmationId,
        items: { create: body.items.map((item, idx) => ({ position: idx + 1, ...item })) },
      },
      include: { items: true, customer: true },
    });
  });

  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "delivery_note.create", entityType: "DeliveryNote", entityId: note.id });
  res.status(201).json(note);
});

async function renderNotePdf(note: Prisma.DeliveryNoteGetPayload<{ include: { items: true; customer: true; company: true } }>, locale: "de" | "en", layout?: unknown): Promise<Buffer> {
  return await renderDocumentPdf({
    docTypeLabel: { de: "Lieferschein", en: "Delivery Note" },
    numberLabel: { de: "Lieferscheinnr.", en: "Delivery note no." },
    documentNumber: note.noteNumber,
    issueDate: note.deliveryDate,
    locale,
    branding: note.company,
    recipient: note.customer,
    items: note.items,
    notes: note.notes,
    layout: resolvePdfLayout(note.company.pdfLayout, layout),
    isDraft: note.status === "DRAFT",
    introText: note.introText,
    closingText: note.closingText,
    showPrices: false,
  });
}

deliveryNotesRouter.get("/:id/pdf", async (req, res) => {
  const note = await prisma.deliveryNote.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { items: true, customer: true, company: true },
  });
  if (!note) throw new HttpError(404, "Lieferschein nicht gefunden");
  const locale = (req.query.lang as "de" | "en") || (note.company.defaultLocale as "de" | "en") || "de";

  const pdfBuffer = await renderNotePdf(note, locale, req.query.layout);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${note.noteNumber}.pdf"`);
  res.send(pdfBuffer);
});

// ---------- Entwürfe, Vorschau ----------

deliveryNotesRouter.get("/:id", async (req, res) => {
  const note = await prisma.deliveryNote.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, voidedAt: null }, include: { items: true, customer: true } });
  if (!note) throw new HttpError(404, "Lieferschein nicht gefunden");
  res.json(note);
});

deliveryNotesRouter.post("/preview-pdf", previewRateLimiter, async (req, res) => {
  const body = simplePreviewSchema.parse(req.body);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });
  const customer = body.customerId ? await prisma.customer.findFirst({ where: { id: body.customerId, companyId: company.id } }) : null;
  const pdf = await renderSimplePreview("deliveryNote", company, customer, body);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "no-store");
  res.send(pdf);
});

deliveryNotesRouter.patch("/:id", async (req, res) => {
  const existing = await prisma.deliveryNote.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, voidedAt: null } });
  if (!existing) throw new HttpError(404, "Lieferschein nicht gefunden");
  if (existing.status !== "DRAFT") throw new HttpError(409, "Nur Entwürfe können bearbeitet werden.");
  const body = createSchema.partial().parse(req.body);
  if (body.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: body.customerId, companyId: req.auth!.companyId } });
    if (!customer) throw new HttpError(404, "Kunde nicht gefunden");
  }
  const data: any = { customerId: body.customerId, deliveryDate: body.deliveryDate, notes: body.notes, introText: body.introText, closingText: body.closingText };
  if (body.items) data.items = { deleteMany: {}, create: body.items.map((item, idx) => ({ position: idx + 1, description: item.description, quantity: item.quantity, unit: item.unit })) };
  const updated = await prisma.deliveryNote.update({ where: { id: existing.id }, data, include: { items: true, customer: true } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "delivery_note.update", entityType: "DeliveryNote", entityId: existing.id });
  res.json(updated);
});

deliveryNotesRouter.post("/:id/finalize", async (req, res) => {
  const existing = await prisma.deliveryNote.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, voidedAt: null }, include: { items: true } });
  if (!existing) throw new HttpError(404, "Lieferschein nicht gefunden");
  if (existing.items.length === 0) throw new HttpError(400, "Bitte mindestens eine Position eintragen.");
  const updated = existing.status === "DRAFT" ? await prisma.deliveryNote.update({ where: { id: existing.id }, data: { status: "SENT" } }) : existing;
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "delivery_note.finalize", entityType: "DeliveryNote", entityId: existing.id });
  res.json(updated);
});

deliveryNotesRouter.post("/:id/duplicate", async (req, res) => {
  const source = await prisma.deliveryNote.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, voidedAt: null }, include: { items: true } });
  if (!source) throw new HttpError(404, "Lieferschein nicht gefunden");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: source.companyId } });
  const copy = await prisma.$transaction(async (tx) => {
    const noteNumber = await nextDocumentNumber(company.id, "DELIVERY_NOTE", tx);
    return tx.deliveryNote.create({
      data: {
        companyId: company.id,
        customerId: source.customerId,
        noteNumber,
        notes: source.notes,
        introText: source.introText ?? company.deliveryNoteIntroText,
        closingText: source.closingText ?? company.deliveryNoteClosingText,
        items: { create: source.items.map((i, idx) => ({ position: idx + 1, description: i.description, quantity: i.quantity, unit: i.unit })) },
      },
      include: { items: true, customer: true },
    });
  });
  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "delivery_note.duplicate", entityType: "DeliveryNote", entityId: source.id, metadata: { newId: copy.id } });
  res.status(201).json(copy);
});

// Beleg per E-Mail verschicken (PDF im Anhang). Ein Entwurf wird dabei fertiggestellt - aber erst, wenn die E-Mail tatsächlich
// übergeben wurde. "Fertigstellen" allein verschickt nichts.
deliveryNotesRouter.post("/:id/send-email", async (req, res) => {
  const body = sendDocumentEmailSchema.parse(req.body);
  const note = await prisma.deliveryNote.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId, voidedAt: null },
    include: { items: true, customer: true, company: true },
  });
  if (!note) throw new HttpError(404, "Lieferschein nicht gefunden");
  if (note.items.length === 0) throw new HttpError(400, "Bitte mindestens eine Position eintragen.");
  const locale = (note.company.defaultLocale as "de" | "en") || "de";
  const wasDraft = note.status === "DRAFT";
  const pdf = await renderNotePdf(wasDraft ? { ...note, status: "SENT" } : note, locale);
  const to = await sendDocumentEmail({
    company: note.company,
    customer: note.customer,
    body,
    locale,
    sentence: { de: "den Lieferschein", en: "the delivery note" },
    subject: { de: "Lieferschein", en: "Delivery note" },
    number: note.noteNumber,
    pdf,
  });
  const updated = await prisma.deliveryNote.update({ where: { id: note.id }, data: { emailSentAt: new Date(), ...(wasDraft ? { status: "SENT" } : {}) } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "note.send_email", entityType: "Note", entityId: note.id, metadata: { to } });
  res.json({ ...updated, sentTo: to });
});
