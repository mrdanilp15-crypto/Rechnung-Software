import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";

export const productsRouter = Router();
productsRouter.use(requireAuth);

productsRouter.get("/", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const products = await prisma.product.findMany({
    where: {
      companyId: req.auth!.companyId,
      isArchived: false,
      ...(q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }] } : {}),
    },
    include: { materials: { include: { material: true } } },
    orderBy: { name: "asc" },
  });
  res.json(products);
});

const materialUsageSchema = z.object({
  materialId: z.string(),
  quantityPerUnit: z.number().positive(),
});

const productSchema = z.object({
  sku: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  unit: z.string().default("Stk."),
  unitPriceCents: z.number().int().min(0),
  vatRateBps: z.number().int().min(0).max(10000).default(1900),
  // Materialverbrauch pro verkaufter Einheit dieses Produkts (siehe modules/materials) -
  // wird beim Erstellen einer Rechnung genutzt, um den Materialbestand automatisch zu
  // reduzieren. Optional: ein Produkt ohne Materialverbrauch bleibt ohne Bestandsabzug.
  materials: z.array(materialUsageSchema).optional(),
});

productsRouter.post("/", async (req, res) => {
  const body = productSchema.parse(req.body);
  const { materials, ...productData } = body;
  const product = await prisma.product.create({
    data: {
      ...productData,
      companyId: req.auth!.companyId,
      materials: materials ? { create: materials } : undefined,
    },
    include: { materials: { include: { material: true } } },
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "product.create", entityType: "Product", entityId: product.id });
  res.status(201).json(product);
});

productsRouter.patch("/:id", async (req, res) => {
  const body = productSchema.partial().parse(req.body);
  const { materials, ...productData } = body;
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Produkt nicht gefunden");
  const updated = await prisma.product.update({
    where: { id: existing.id },
    data: {
      ...productData,
      // Rezept immer komplett ersetzen, wenn mitgeschickt - einfacher und weniger
      // fehleranfällig als einzelne Zeilen abzugleichen (analog zu Positionslisten bei
      // Rechnungen/Angeboten).
      ...(materials ? { materials: { deleteMany: {}, create: materials } } : {}),
    },
    include: { materials: { include: { material: true } } },
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "product.update", entityType: "Product", entityId: existing.id, metadata: body });
  res.json(updated);
});

productsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Produkt nicht gefunden");
  await prisma.product.update({ where: { id: existing.id }, data: { isArchived: true } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "product.archive", entityType: "Product", entityId: existing.id });
  res.status(204).send();
});
