import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { bookValueAtYearEnd, depreciationForYear, depreciationSchedule } from "./depreciation";

/**
 * Anlageverzeichnis: Anschaffungen (Drucker, Werkzeug, Computer ...), die nicht sofort in voller Höhe, sondern über mehrere Jahre
 * abgeschrieben werden (AfA) - oder als geringwertiges Wirtschaftsgut (GWG) im Anschaffungsjahr. Die EÜR (modules/expenses) nutzt
 * diese Werte statt der vollen Anschaffungsausgabe.
 */

export const assetsRouter = Router();
assetsRouter.use(requireAuth);

/** GWG-Grenze (netto je Wirtschaftsgut) laut § 6 Abs. 2 EStG - nur als Hinweis für die Oberfläche, Änderungen des Gesetzgebers bitte prüfen. */
export const GWG_LIMIT_NET_CENTS = 80000;

function present(a: { id: string; name: string; purchaseDate: Date; costCents: number; method: string; usefulLifeYears: number | null; expenseId: string | null; notes: string | null }, year: number) {
  const input = { purchaseDate: a.purchaseDate, costCents: a.costCents, method: a.method as "GWG" | "LINEAR", usefulLifeYears: a.usefulLifeYears };
  return {
    ...a,
    afaThisYear: depreciationForYear(input, year)?.amountCents ?? 0,
    bookValueEndOfYear: a.purchaseDate.getFullYear() > year ? a.costCents : bookValueAtYearEnd(input, year),
    schedule: depreciationSchedule(input).map((s) => ({ year: s.year, amountCents: s.amountCents })),
  };
}

assetsRouter.get("/", async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const assets = await prisma.asset.findMany({ where: { companyId: req.auth!.companyId }, orderBy: { purchaseDate: "desc" } });
  res.json({ year, gwgLimitNetCents: GWG_LIMIT_NET_CENTS, items: assets.map((a) => present(a, year)) });
});

const assetSchema = z.object({
  name: z.string().trim().min(1).max(150),
  purchaseDate: z.coerce.date(),
  costCents: z.number().int().min(1).max(10_000_000_000),
  method: z.enum(["GWG", "LINEAR"]),
  usefulLifeYears: z.number().int().min(1).max(50).nullish(),
  expenseId: z.string().nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

async function checkExpense(companyId: string, expenseId: string | null | undefined, selfId?: string) {
  if (!expenseId) return null;
  const e = await prisma.expense.findFirst({ where: { id: expenseId, companyId }, select: { id: true } });
  if (!e) throw new HttpError(400, "Die verknüpfte Ausgabe wurde nicht gefunden.");
  const other = await prisma.asset.findFirst({ where: { expenseId, ...(selfId ? { id: { not: selfId } } : {}) }, select: { name: true } });
  if (other) throw new HttpError(409, `Diese Ausgabe gehört bereits zur Anlage "${other.name}".`);
  return e.id;
}

function validateMethod(body: { method: string; usefulLifeYears?: number | null }) {
  if (body.method === "LINEAR" && !body.usefulLifeYears) throw new HttpError(400, "Bei linearer Abschreibung bitte die Nutzungsdauer in Jahren angeben.");
}

assetsRouter.post("/", async (req, res) => {
  const body = assetSchema.parse(req.body);
  validateMethod(body);
  const companyId = req.auth!.companyId;
  const expenseId = await checkExpense(companyId, body.expenseId);
  const asset = await prisma.asset.create({
    data: { companyId, name: body.name, purchaseDate: body.purchaseDate, costCents: body.costCents, method: body.method, usefulLifeYears: body.method === "GWG" ? null : body.usefulLifeYears, expenseId, notes: body.notes || null },
  });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "asset.create", entityType: "Asset", entityId: asset.id, metadata: { name: asset.name, costCents: asset.costCents, method: asset.method } });
  res.status(201).json(present(asset, new Date().getFullYear()));
});

assetsRouter.patch("/:id", async (req, res) => {
  const companyId = req.auth!.companyId;
  const existing = await prisma.asset.findFirst({ where: { id: req.params.id, companyId } });
  if (!existing) throw new HttpError(404, "Anlage nicht gefunden");
  const body = assetSchema.parse(req.body);
  validateMethod(body);
  const expenseId = await checkExpense(companyId, body.expenseId, existing.id);
  const asset = await prisma.asset.update({
    where: { id: existing.id },
    data: { name: body.name, purchaseDate: body.purchaseDate, costCents: body.costCents, method: body.method, usefulLifeYears: body.method === "GWG" ? null : body.usefulLifeYears, expenseId, notes: body.notes || null },
  });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "asset.update", entityType: "Asset", entityId: asset.id });
  res.json(present(asset, new Date().getFullYear()));
});

assetsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.asset.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Anlage nicht gefunden");
  await prisma.asset.delete({ where: { id: existing.id } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "asset.delete", entityType: "Asset", entityId: existing.id, metadata: { name: existing.name } });
  res.status(204).send();
});
