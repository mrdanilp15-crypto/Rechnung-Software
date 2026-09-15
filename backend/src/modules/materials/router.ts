import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";

export const materialsRouter = Router();
materialsRouter.use(requireAuth);

materialsRouter.get("/", async (req, res) => {
  const materials = await prisma.material.findMany({
    where: { companyId: req.auth!.companyId, isArchived: false },
    orderBy: { name: "asc" },
  });
  res.json(materials);
});

const materialSchema = z.object({
  name: z.string().min(1),
  unit: z.string().default("g"),
  // Anfangsbestand bzw. Korrektur (z.B. Inventur) - im Unterschied zu POST /:id/restock
  // wird hierbei KEINE Ausgabe angelegt, da kein tatsächlicher Neukauf stattfindet.
  stockQuantity: z.number().min(0).optional(),
});

materialsRouter.post("/", async (req, res) => {
  const body = materialSchema.parse(req.body);
  const material = await prisma.material.create({ data: { ...body, companyId: req.auth!.companyId } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "material.create", entityType: "Material", entityId: material.id });
  res.status(201).json(material);
});

materialsRouter.patch("/:id", async (req, res) => {
  const body = materialSchema.partial().parse(req.body);
  const existing = await prisma.material.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Material nicht gefunden");
  const updated = await prisma.material.update({ where: { id: existing.id }, data: body });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "material.update", entityType: "Material", entityId: existing.id, metadata: body });
  res.json(updated);
});

materialsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.material.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Material nicht gefunden");
  await prisma.material.update({ where: { id: existing.id }, data: { isArchived: true } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "material.archive", entityType: "Material", entityId: existing.id });
  res.status(204).send();
});

const restockSchema = z.object({
  quantity: z.number().positive(),
  totalCostCents: z.number().int().min(0),
  vendor: z.string().optional(),
});

// Nachbestellung: erhöht den Bestand, aktualisiert den zuletzt gezahlten Preis pro Einheit
// und legt automatisch eine passende Ausgabe an (Kategorie "Material") - so muss der Einkauf
// nicht zusätzlich manuell unter "Ausgaben" erfasst werden.
materialsRouter.post("/:id/restock", async (req, res) => {
  const body = restockSchema.parse(req.body);
  const material = await prisma.material.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!material) throw new HttpError(404, "Material nicht gefunden");

  const costPerUnitCents = Math.round(body.totalCostCents / body.quantity);

  const [updated] = await prisma.$transaction([
    prisma.material.update({
      where: { id: material.id },
      data: { stockQuantity: { increment: body.quantity }, costPerUnitCents },
    }),
    prisma.expense.create({
      data: {
        companyId: req.auth!.companyId,
        vendor: body.vendor || material.name,
        category: "Material",
        amountCents: body.totalCostCents,
        description: `Nachbestellung: ${body.quantity} ${material.unit} ${material.name}`,
      },
    }),
  ]);

  await writeAuditLog({
    req,
    companyId: req.auth!.companyId,
    userId: req.auth!.sub,
    action: "material.restock",
    entityType: "Material",
    entityId: material.id,
    metadata: { quantity: body.quantity, totalCostCents: body.totalCostCents },
  });
  res.json(updated);
});
