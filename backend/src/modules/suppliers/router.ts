import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";

/** Lieferanten (Händler/Hersteller) mit Ausgabensummen - Grundlage für "Wo kaufe ich wie viel ein". */

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

suppliersRouter.get("/", async (req, res) => {
  const companyId = req.auth!.companyId;
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const [suppliers, totals, yearTotals, materialCounts] = await Promise.all([
    prisma.supplier.findMany({ where: { companyId, isArchived: false }, orderBy: { name: "asc" } }),
    prisma.expense.groupBy({ by: ["supplierId"], where: { companyId, supplierId: { not: null } }, _sum: { amountCents: true }, _count: { _all: true }, _max: { date: true } }),
    prisma.expense.groupBy({ by: ["supplierId"], where: { companyId, supplierId: { not: null }, date: { gte: yearStart } }, _sum: { amountCents: true } }),
    prisma.material.groupBy({ by: ["supplierId"], where: { companyId, supplierId: { not: null }, isArchived: false }, _count: { _all: true } }),
  ]);
  const totalBy = new Map(totals.map((t) => [t.supplierId, t]));
  const yearBy = new Map(yearTotals.map((t) => [t.supplierId, t._sum.amountCents ?? 0]));
  const matBy = new Map(materialCounts.map((m) => [m.supplierId, m._count._all]));
  res.json(
    suppliers.map((s) => ({
      ...s,
      totalSpentCents: totalBy.get(s.id)?._sum.amountCents ?? 0,
      yearSpentCents: yearBy.get(s.id) ?? 0,
      expenseCount: totalBy.get(s.id)?._count._all ?? 0,
      lastPurchase: totalBy.get(s.id)?._max.date ?? null,
      materialCount: matBy.get(s.id) ?? 0,
    }))
  );
});

const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
const supplierSchema = z.object({
  name: z.string().trim().min(1).max(150),
  contactName: optionalText(150),
  email: z.string().trim().email().max(200).nullish().or(z.literal("")).transform((v) => v || null),
  phone: optionalText(60),
  website: optionalText(200),
  street: optionalText(150),
  postalCode: optionalText(20),
  city: optionalText(100),
  country: optionalText(60),
  customerNumber: optionalText(80),
  notes: optionalText(2000),
});

suppliersRouter.post("/", async (req, res) => {
  const body = supplierSchema.parse(req.body);
  const companyId = req.auth!.companyId;
  const dup = await prisma.supplier.findFirst({ where: { companyId, isArchived: false, name: { equals: body.name, mode: "insensitive" } }, select: { id: true } });
  if (dup) throw new HttpError(409, "Einen Lieferanten mit diesem Namen gibt es schon.");
  const supplier = await prisma.supplier.create({ data: { ...body, companyId } });
  // Bereits erfasste Ausgaben mit demselben Händlernamen gleich zuordnen
  const linked = await prisma.expense.updateMany({ where: { companyId, supplierId: null, vendor: { equals: body.name, mode: "insensitive" } }, data: { supplierId: supplier.id } });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "supplier.create", entityType: "Supplier", entityId: supplier.id, metadata: { name: supplier.name } });
  res.status(201).json({ ...supplier, linkedExpenses: linked.count });
});

suppliersRouter.patch("/:id", async (req, res) => {
  const body = supplierSchema.parse(req.body);
  const companyId = req.auth!.companyId;
  const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, companyId } });
  if (!existing) throw new HttpError(404, "Lieferant nicht gefunden");
  const dup = await prisma.supplier.findFirst({ where: { companyId, isArchived: false, id: { not: existing.id }, name: { equals: body.name, mode: "insensitive" } }, select: { id: true } });
  if (dup) throw new HttpError(409, "Einen Lieferanten mit diesem Namen gibt es schon.");
  const supplier = await prisma.supplier.update({ where: { id: existing.id }, data: body });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "supplier.update", entityType: "Supplier", entityId: supplier.id });
  res.json(supplier);
});

// Archivieren statt löschen: die Zuordnung bisheriger Ausgaben bleibt erhalten
suppliersRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Lieferant nicht gefunden");
  await prisma.supplier.update({ where: { id: existing.id }, data: { isArchived: true } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "supplier.archive", entityType: "Supplier", entityId: existing.id });
  res.status(204).send();
});
