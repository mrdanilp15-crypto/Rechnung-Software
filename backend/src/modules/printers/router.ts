import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";

/**
 * Drucker/Maschinen mit eigenen Kostenwerten (Anschaffungspreis + Lebensdauer -> Abschreibung je Stunde, Leistung -> Strom,
 * Verschleiß je Stunde). Die Berechnung selbst steht in frontend/src/lib/cost.ts; hier werden nur die Werte verwaltet.
 */
export const printersRouter = Router();
printersRouter.use(requireAuth);

const SEEDED_KEY = "printersSeeded";

// Beim allerersten Aufruf zwei Beispiel-Drucker anlegen, damit die Kalkulation sofort etwas Sinnvolles zeigt.
// Danach nie wieder - wer alle löscht, bekommt keine neuen Beispiele.
async function seedExamplesOnce(companyId: string) {
  const seeded = await prisma.setting.findUnique({ where: { companyId_key: { companyId, key: SEEDED_KEY } } });
  if (seeded) return;
  const existing = await prisma.printer.count({ where: { companyId } });
  if (existing === 0) {
    await prisma.printer.createMany({
      data: [
        { companyId, name: "Bambu Lab P1S (Beispiel)", purchasePriceCents: 70000, lifetimeHours: 6000, powerWatts: 110, wearCentsPerHour: 8, notes: "Beispielwerte - bitte an Ihren Drucker anpassen." },
        { companyId, name: "Creality Ender-3 V3 (Beispiel)", purchasePriceCents: 25000, lifetimeHours: 4000, powerWatts: 150, wearCentsPerHour: 6, notes: "Beispielwerte - bitte an Ihren Drucker anpassen." },
      ],
    });
  }
  await prisma.setting.upsert({
    where: { companyId_key: { companyId, key: SEEDED_KEY } },
    create: { companyId, key: SEEDED_KEY, value: "true" },
    update: { value: "true" },
  });
}

printersRouter.get("/", async (req, res) => {
  await seedExamplesOnce(req.auth!.companyId);
  const printers = await prisma.printer.findMany({
    where: { companyId: req.auth!.companyId, isArchived: false },
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  res.json(printers);
});

const printerSchema = z.object({
  name: z.string().min(1).max(120),
  purchasePriceCents: z.number().int().min(0).max(100_000_000),
  lifetimeHours: z.number().positive().max(1_000_000),
  powerWatts: z.number().min(0).max(100_000),
  wearCentsPerHour: z.number().min(0).max(1_000_000),
  notes: z.string().max(1000).nullish(),
});

printersRouter.post("/", async (req, res) => {
  const body = printerSchema.parse(req.body);
  const printer = await prisma.printer.create({ data: { ...body, companyId: req.auth!.companyId } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "printer.create", entityType: "Printer", entityId: printer.id });
  res.status(201).json(printer);
});

printersRouter.patch("/:id", async (req, res) => {
  const body = printerSchema.partial().parse(req.body);
  const existing = await prisma.printer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Drucker nicht gefunden");
  const updated = await prisma.printer.update({ where: { id: existing.id }, data: body });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "printer.update", entityType: "Printer", entityId: existing.id, metadata: body });
  res.json(updated);
});

// Archivieren statt Löschen: Produkte, die diesen Drucker nutzen, behalten ihre Zuordnung nicht - sie fallen auf den
// pauschalen Maschinenstundensatz zurück (siehe Product.printerId, onDelete SetNull bei echtem Löschen).
printersRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.printer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Drucker nicht gefunden");
  await prisma.$transaction([
    prisma.product.updateMany({ where: { printerId: existing.id }, data: { printerId: null } }),
    prisma.printer.update({ where: { id: existing.id }, data: { isArchived: true } }),
  ]);
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "printer.archive", entityType: "Printer", entityId: existing.id });
  res.status(204).send();
});
