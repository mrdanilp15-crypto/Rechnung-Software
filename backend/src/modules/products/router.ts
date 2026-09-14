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
    orderBy: { name: "asc" },
  });
  res.json(products);
});

const productSchema = z.object({
  sku: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  unit: z.string().default("Stk."),
  unitPriceCents: z.number().int().min(0),
  vatRateBps: z.number().int().min(0).max(10000).default(1900),
});

productsRouter.post("/", async (req, res) => {
  const body = productSchema.parse(req.body);
  const product = await prisma.product.create({ data: { ...body, companyId: req.auth!.companyId } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "product.create", entityType: "Product", entityId: product.id });
  res.status(201).json(product);
});

productsRouter.patch("/:id", async (req, res) => {
  const body = productSchema.partial().parse(req.body);
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Produkt nicht gefunden");
  const updated = await prisma.product.update({ where: { id: existing.id }, data: body });
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
