import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { nextDocumentNumber } from "../shared/numbering";
import { renderDocumentPdf } from "../pdf/documentTemplate";

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
        sourceOrderConfirmationId: body.sourceOrderConfirmationId,
        items: { create: body.items.map((item, idx) => ({ position: idx + 1, ...item })) },
      },
      include: { items: true, customer: true },
    });
  });

  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "delivery_note.create", entityType: "DeliveryNote", entityId: note.id });
  res.status(201).json(note);
});

deliveryNotesRouter.get("/:id/pdf", async (req, res) => {
  const note = await prisma.deliveryNote.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { items: true, customer: true, company: true },
  });
  if (!note) throw new HttpError(404, "Lieferschein nicht gefunden");
  const locale = (req.query.lang as "de" | "en") || (note.company.defaultLocale as "de" | "en") || "de";

  const pdfBuffer = await renderDocumentPdf({
    docTypeLabel: { de: "Lieferschein", en: "Delivery Note" },
    documentNumber: note.noteNumber,
    issueDate: note.deliveryDate,
    locale,
    branding: note.company,
    recipient: note.customer,
    items: note.items,
    notes: note.notes,
    showPrices: false,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${note.noteNumber}.pdf"`);
  res.send(pdfBuffer);
});
