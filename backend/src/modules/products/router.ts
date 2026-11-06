import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { productFilesRouter } from "./files";
import { findDuplicate, nextSku } from "../../utils/sku";
import { aggregateParts, partSchema } from "./parts";

export const productsRouter = Router();
productsRouter.use(requireAuth);
productsRouter.use("/:id/files", productFilesRouter);

// Nächste freie Artikelnummer (aus den vorhandenen abgeleitet)
productsRouter.get("/next-sku", async (req, res) => {
  const rows = await prisma.product.findMany({ where: { companyId: req.auth!.companyId, isArchived: false }, select: { sku: true } });
  res.json(nextSku(rows.map((r) => r.sku), "P-"));
});

// Live-Prüfung beim Tippen: ist die Nummer schon vergeben (gelöschte/archivierte Artikel zählen nicht)?
productsRouter.get("/sku-check", async (req, res) => {
  const sku = String(req.query.sku ?? "");
  const rows = await prisma.product.findMany({ where: { companyId: req.auth!.companyId, isArchived: false }, select: { id: true, sku: true, name: true } });
  const dup = sku.trim() ? findDuplicate(rows, sku, req.query.exceptId ? String(req.query.exceptId) : undefined) : undefined;
  res.json({ taken: dup ? dup.name : null, next: nextSku(rows.map((r) => r.sku), "P-", 4, sku).sku });
});

/** Artikelnummer darf in der Firma nur einmal vorkommen (Groß-/Kleinschreibung egal); sonst Fehler mit Vorschlag. */
async function assertSkuFree(companyId: string, sku: string | undefined, selfId?: string) {
  if (!sku || !sku.trim()) return;
  const rows = await prisma.product.findMany({ where: { companyId, isArchived: false }, select: { id: true, sku: true, name: true } });
  const dup = findDuplicate(rows, sku, selfId);
  if (dup) throw new HttpError(409, `Die Artikelnummer ${sku.trim()} ist schon vergeben (${dup.name}). Nächste freie: ${nextSku(rows.map((r) => r.sku), "P-", 4, sku).sku}`);
}

productsRouter.get("/", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const products = await prisma.product.findMany({
    where: {
      companyId: req.auth!.companyId,
      isArchived: false,
      ...(q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }] } : {}),
    },
    include: { materials: { include: { material: true } }, parts: { orderBy: { position: "asc" } } },
    orderBy: { name: "asc" },
  });
  res.json(products);
});

const materialUsageSchema = z.object({
  materialId: z.string(),
  quantityPerUnit: z.number().positive(),
  costOverrideCents: z.number().min(0).nullish(),
});

const productSchema = z.object({
  sku: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  unit: z.string().default("Stk."),
  unitPriceCents: z.number().int().min(0),
  vatRateBps: z.number().int().min(0).max(10000).default(1900),
  printTimeMinutes: z.number().min(0).max(100000).optional(),
  laborMinutes: z.number().min(0).max(100000).optional(),
  printerId: z.string().nullish(),
  setupMinutes: z.number().min(0).max(100000).optional(),
  packagingCents: z.number().int().min(0).max(100_000_000).optional(),
  extraMaterialPercent: z.number().min(0).max(500).optional(),
  // Staffelpreise: netto je Einheit ab der jeweiligen Menge (aufsteigend, Menge mindestens 2)
  piecesPerPlate: z.number().int().min(1).max(10000).optional(),
  imageDocumentId: z.string().nullish(),
  // Bauteile (mehrere 3MF je Produkt): ersetzen Druckzeit und Rezept durch die Summe, siehe parts.ts
  parts: z.array(partSchema).max(20).optional(),
  // Fertigteil-Lager (der Bestand selbst wird nur über /:id/stock gebucht)
  trackStock: z.boolean().optional(),
  stockMin: z.number().min(0).max(1_000_000).nullish(),
  // Zukaufteile/Veredelung je Einheit: amountCents ist der Betrag je verkaufter Einheit (damit rechnet alles); quantity und unitCents merken nur, wie er zustande kam (z.B. 4 Schrauben je 0,05 EUR)
  extraCosts: z.array(z.object({ label: z.string().trim().min(1).max(60), amountCents: z.number().int().min(0).max(100_000_000), quantity: z.number().positive().max(100_000).optional(), unitCents: z.number().int().min(0).max(100_000_000).optional() })).max(30).nullish(),
  priceTiers: z
    .array(z.object({ minQuantity: z.number().min(2).max(1_000_000), unitPriceCents: z.number().int().min(0) }))
    .max(10)
    .nullish(),
  // Materialverbrauch pro verkaufter Einheit dieses Produkts (siehe modules/materials) -
  // wird beim Erstellen einer Rechnung genutzt, um den Materialbestand automatisch zu
  // reduzieren. Optional: ein Produkt ohne Materialverbrauch bleibt ohne Bestandsabzug.
  materials: z.array(materialUsageSchema).optional(),
});

// Ein Drucker darf nur aus der eigenen Firma stammen
/**
 * Hat ein Produkt Bauteile, gilt deren Summe: Druckzeit je Produkt und Rezept werden daraus berechnet (der Preis pro Material, den man beim Produkt
 * eingetragen hat, bleibt erhalten). Gibt null zurück, wenn es keine Bauteile gibt.
 */
async function derivedFromParts(companyId: string, parts: z.infer<typeof partSchema>[], keepOverrides: Map<string, number | null>, purchased: PurchasedRow[] = []) {
  if (parts.length === 0) return null;
  const ids = [...new Set(parts.flatMap((p) => p.materials.map((m) => m.materialId)))];
  if (ids.length > 0 && (await prisma.material.count({ where: { id: { in: ids }, companyId } })) !== ids.length) throw new HttpError(400, "Ein Material der Bauteile wurde nicht gefunden.");
  const agg = aggregateParts(parts);
  const printed = agg.materials.map((m) => ({ materialId: m.materialId, quantityPerUnit: m.quantity, costOverrideCents: keepOverrides.get(m.materialId) ?? null }));
  // Zukaufteile (Schrauben, Magnete ...) gehören nicht zu den gedruckten Bauteilen und bleiben im Rezept erhalten
  const recipe = [...printed, ...purchased.filter((p) => !printed.some((x) => x.materialId === p.materialId))];
  return { printTimeMinutes: agg.printMinutes, recipe };
}

/** Rezeptzeilen, die Zukaufteile (Materialart PART) sind: Menge gilt je verkaufter Einheit, nicht je Druckplatte. */
interface PurchasedRow { materialId: string; quantityPerUnit: number; costOverrideCents: number | null }
async function purchasedRows(companyId: string, rows: { materialId: string; quantityPerUnit: number; costOverrideCents?: number | null }[]): Promise<PurchasedRow[]> {
  if (rows.length === 0) return [];
  const hits = await prisma.material.findMany({ where: { id: { in: rows.map((r) => r.materialId) }, companyId, kind: "PART" }, select: { id: true } });
  const set = new Set(hits.map((h) => h.id));
  return rows.filter((r) => set.has(r.materialId)).map((r) => ({ materialId: r.materialId, quantityPerUnit: r.quantityPerUnit, costOverrideCents: r.costOverrideCents ?? null }));
}
const partsForDb = (parts: z.infer<typeof partSchema>[]) => parts.map((p, i) => ({ name: p.name, position: i, documentId: p.documentId ?? null, fileName: p.fileName ?? null, quantityPerProduct: p.quantityPerProduct, piecesPerPlate: p.piecesPerPlate, printMinutes: p.printMinutes, materials: p.materials }));

async function validPrinterId(companyId: string, printerId: string) {
  const p = await prisma.printer.findFirst({ where: { id: printerId, companyId, isArchived: false }, select: { id: true } });
  if (!p) throw new HttpError(400, "Drucker nicht gefunden");
  return p.id;
}

async function validImage(companyId: string, id: string | null | undefined) {
  if (!id) return null;
  const d = await prisma.archiveDocument.findFirst({ where: { id, companyId }, select: { id: true, mimeType: true } });
  if (!d || !d.mimeType.startsWith("image/")) throw new HttpError(400, "Als Produktbild geht nur ein Bild aus dem Belegarchiv.");
  return d.id;
}

// Staffelpreise sortiert speichern; leere Liste/null löscht sie (bei Json-Feldern braucht Prisma dafür DbNull)
function tiersForDb(tiers: { minQuantity: number; unitPriceCents: number }[] | null | undefined) {
  if (tiers === undefined) return undefined;
  if (!tiers || tiers.length === 0) return Prisma.DbNull;
  return [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
}

// Weitere Kosten je Stück: leere Liste/null löscht sie
function extraCostsForDb(list: { label: string; amountCents: number; quantity?: number; unitCents?: number }[] | null | undefined) {
  if (list === undefined) return undefined;
  if (!list || list.length === 0) return Prisma.DbNull;
  return list;
}

productsRouter.post("/", async (req, res) => {
  const body = productSchema.parse(req.body);
  const { materials, priceTiers, extraCosts, parts, ...productData } = body;
  await assertSkuFree(req.auth!.companyId, productData.sku);
  const derived = await derivedFromParts(req.auth!.companyId, parts ?? [], new Map((materials ?? []).map((m) => [m.materialId, m.costOverrideCents ?? null])), await purchasedRows(req.auth!.companyId, materials ?? []));
  const product = await prisma.product.create({
    data: {
      ...productData,
      imageDocumentId: await validImage(req.auth!.companyId, productData.imageDocumentId),
      priceTiers: tiersForDb(priceTiers),
      extraCosts: extraCostsForDb(extraCosts),
      companyId: req.auth!.companyId,
      ...(productData.printerId ? { printerId: await validPrinterId(req.auth!.companyId, productData.printerId) } : { printerId: null }),
      ...(derived ? { printTimeMinutes: derived.printTimeMinutes, piecesPerPlate: 1 } : {}),
      materials: derived ? { create: derived.recipe } : materials ? { create: materials } : undefined,
      parts: parts && parts.length > 0 ? { create: partsForDb(parts) } : undefined,
    },
    include: { materials: { include: { material: true } }, parts: { orderBy: { position: "asc" } } },
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "product.create", entityType: "Product", entityId: product.id });
  res.status(201).json(product);
});

productsRouter.patch("/:id", async (req, res) => {
  const body = productSchema.partial().parse(req.body);
  const { materials, priceTiers, extraCosts, parts, ...productData } = body;
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId }, include: { materials: true } });
  if (!existing) throw new HttpError(404, "Produkt nicht gefunden");
  await assertSkuFree(req.auth!.companyId, productData.sku, existing.id);
  // Preise je Material, die schon beim Produkt stehen, bleiben erhalten, wenn das Rezept aus den Bauteilen neu berechnet wird
  const overrides = new Map<string, number | null>(existing.materials.map((m) => [m.materialId, m.costOverrideCents ?? null]));
  for (const m of materials ?? []) overrides.set(m.materialId, m.costOverrideCents ?? null);
  const derived = parts !== undefined ? await derivedFromParts(req.auth!.companyId, parts, overrides, await purchasedRows(req.auth!.companyId, materials ?? existing.materials)) : null;
  const updated = await prisma.product.update({
    where: { id: existing.id },
    data: {
      ...productData,
      ...(productData.imageDocumentId !== undefined ? { imageDocumentId: await validImage(req.auth!.companyId, productData.imageDocumentId) } : {}),
      priceTiers: tiersForDb(priceTiers),
      extraCosts: extraCostsForDb(extraCosts),
      ...(productData.printerId !== undefined ? { printerId: productData.printerId ? await validPrinterId(req.auth!.companyId, productData.printerId) : null } : {}),
      // Rezept immer komplett ersetzen, wenn mitgeschickt - einfacher und weniger
      // fehleranfällig als einzelne Zeilen abzugleichen (analog zu Positionslisten bei
      // Rechnungen/Angeboten).
      ...(derived ? { printTimeMinutes: derived.printTimeMinutes, piecesPerPlate: 1, materials: { deleteMany: {}, create: derived.recipe } } : materials ? { materials: { deleteMany: {}, create: materials } } : {}),
      // Bauteile komplett ersetzen (leere Liste = alle entfernen; Druckzeit und Rezept bleiben dann, wie sie zuletzt berechnet wurden)
      ...(parts !== undefined ? { parts: { deleteMany: {}, ...(parts.length > 0 ? { create: partsForDb(parts) } : {}) } } : {}),
    },
    include: { materials: { include: { material: true } }, parts: { orderBy: { position: "asc" } } },
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "product.update", entityType: "Product", entityId: existing.id, metadata: body });
  res.json(updated);
});

// Bestand von Fertigteilen buchen: Zugang (z.B. fertig gedruckt, + Menge), Abgang (- Menge) oder Inventur (Bestand ist genau ...)
const stockSchema = z.object({ mode: z.enum(["add", "set"]), quantity: z.number().min(-1_000_000).max(1_000_000), note: z.string().trim().max(200).optional() });

productsRouter.post("/:id/stock", async (req, res) => {
  const body = stockSchema.parse(req.body);
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Produkt nicht gefunden");
  if (!existing.trackStock) throw new HttpError(400, "Für dieses Produkt ist keine Lagerführung eingeschaltet (beim Produkt unter Bearbeiten aktivierbar).");
  const next = body.mode === "set" ? body.quantity : existing.stockQuantity + body.quantity;
  const updated = await prisma.product.update({ where: { id: existing.id }, data: { stockQuantity: Math.round(next * 1000) / 1000 }, select: { id: true, stockQuantity: true } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: body.mode === "set" ? "product.stock.count" : "product.stock.move", entityType: "Product", entityId: existing.id, metadata: { from: existing.stockQuantity, to: updated.stockQuantity, note: body.note ?? null } });
  res.json(updated);
});

productsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Produkt nicht gefunden");
  await prisma.product.update({ where: { id: existing.id }, data: { isArchived: true } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "product.archive", entityType: "Product", entityId: existing.id });
  res.status(204).send();
});
