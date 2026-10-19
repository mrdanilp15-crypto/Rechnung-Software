import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { calculateDocumentTotals } from "../tax/calculator";
import { addInterval, createDraftFromTemplate, parseItems, IntervalUnit } from "./service";

export const recurringRouter = Router();
recurringRouter.use(requireAuth);

const unitSchema = z.enum(["WEEK", "MONTH", "QUARTER", "YEAR"]);

function present(t: any) {
  const items = parseItems(t.itemsJson);
  const totals = calculateDocumentTotals(items, false);
  return {
    id: t.id,
    name: t.name,
    customerId: t.customerId,
    customerName: t.customer?.name,
    intervalUnit: t.intervalUnit,
    intervalCount: t.intervalCount,
    nextRunDate: t.nextRunDate,
    endDate: t.endDate,
    isActive: t.isActive,
    lastRunAt: t.lastRunAt,
    lastInvoiceId: t.lastInvoiceId,
    runCount: t.runCount,
    itemCount: items.length,
    netCents: totals.subtotalCents,
    grossCents: totals.totalCents,
    firstItem: items[0]?.description ?? "",
  };
}

recurringRouter.get("/", async (req, res) => {
  const list = await prisma.recurringInvoice.findMany({ where: { companyId: req.auth!.companyId }, include: { customer: { select: { name: true } } }, orderBy: [{ isActive: "desc" }, { nextRunDate: "asc" }] });
  res.json(list.map(present));
});

const createSchema = z.object({
  fromInvoiceId: z.string(),
  name: z.string().min(1).max(120).optional(),
  intervalUnit: unitSchema,
  intervalCount: z.number().int().min(1).max(52).default(1),
  firstRunDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
});

/** Richtet aus einer bestehenden Rechnung (Positionen, Anmerkung, Texte, Kunde) eine wiederkehrende Rechnung ein. */
recurringRouter.post("/", requireRole("ADMIN", "BUCHHALTUNG"), async (req, res) => {
  const body = createSchema.parse(req.body);
  const source = await prisma.invoice.findFirst({ where: { id: body.fromInvoiceId, companyId: req.auth!.companyId }, include: { items: true, customer: true } });
  if (!source) throw new HttpError(404, "Rechnung nicht gefunden");
  if (source.isCancellationDocument) throw new HttpError(400, "Ein Korrekturbeleg kann nicht wiederholt werden.");
  const items = source.items
    .filter((i) => !i.isDownPaymentDeduction)
    .map((i) => ({ productId: i.productId, description: i.description, quantity: i.quantity, unit: i.unit, unitPriceCents: i.unitPriceCents, vatRateBps: i.vatRateBps }));
  if (items.length === 0) throw new HttpError(400, "Die Rechnung enthält keine wiederholbaren Positionen.");
  if (body.endDate && body.endDate < body.firstRunDate) throw new HttpError(400, "Das Enddatum liegt vor dem ersten Termin.");

  const tpl = await prisma.recurringInvoice.create({
    data: {
      companyId: req.auth!.companyId,
      customerId: source.customerId,
      name: body.name ?? `${source.customer.name} (${source.invoiceNumber ?? "Entwurf"})`,
      intervalUnit: body.intervalUnit,
      intervalCount: body.intervalCount,
      nextRunDate: body.firstRunDate,
      endDate: body.endDate,
      supplyType: source.supplyType,
      notes: source.notes,
      introText: source.introText,
      closingText: source.closingText,
      itemsJson: JSON.stringify(items),
    },
    include: { customer: { select: { name: true } } },
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "recurring.create", entityType: "RecurringInvoice", entityId: tpl.id });
  res.status(201).json(present(tpl));
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  intervalUnit: unitSchema.optional(),
  intervalCount: z.number().int().min(1).max(52).optional(),
  nextRunDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
});

recurringRouter.patch("/:id", requireRole("ADMIN", "BUCHHALTUNG"), async (req, res) => {
  const body = patchSchema.parse(req.body);
  const existing = await prisma.recurringInvoice.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Wiederkehrende Rechnung nicht gefunden");
  const updated = await prisma.recurringInvoice.update({ where: { id: existing.id }, data: body, include: { customer: { select: { name: true } } } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "recurring.update", entityType: "RecurringInvoice", entityId: existing.id, metadata: body });
  res.json(present(updated));
});

recurringRouter.delete("/:id", requireRole("ADMIN", "BUCHHALTUNG"), async (req, res) => {
  const existing = await prisma.recurringInvoice.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Wiederkehrende Rechnung nicht gefunden");
  await prisma.recurringInvoice.delete({ where: { id: existing.id } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "recurring.delete", entityType: "RecurringInvoice", entityId: existing.id });
  res.status(204).send();
});

/** Erzeugt sofort einen zusätzlichen Entwurf, ohne den Terminplan zu verändern. */
recurringRouter.post("/:id/run-now", requireRole("ADMIN", "BUCHHALTUNG"), async (req, res) => {
  const tpl = await prisma.recurringInvoice.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId }, include: { customer: true, company: true } });
  if (!tpl) throw new HttpError(404, "Wiederkehrende Rechnung nicht gefunden");
  const invoice = await createDraftFromTemplate(tpl, tpl.company, tpl.customer);
  await prisma.recurringInvoice.update({ where: { id: tpl.id }, data: { lastRunAt: new Date(), lastInvoiceId: invoice.id, runCount: { increment: 1 } } });
  await writeAuditLog({ req, companyId: tpl.companyId, userId: req.auth!.sub, action: "recurring.run_now", entityType: "Invoice", entityId: invoice.id, metadata: { recurringId: tpl.id } });
  res.status(201).json({ invoiceId: invoice.id });
});

// Hilfsendpunkt für das Formular: erster Termin = heute + ein Intervall
recurringRouter.get("/suggest-date", (req, res) => {
  const unit = unitSchema.catch("MONTH").parse(req.query.unit);
  const count = Math.max(1, Math.min(52, Number(req.query.count) || 1));
  res.json({ date: addInterval(new Date(), unit as IntervalUnit, count) });
});
