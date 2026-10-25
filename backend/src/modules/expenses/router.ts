import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { Parser as CsvParser } from "json2csv";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { env } from "../../config/env";
import { importExpenseReceipt } from "../archive/service";
import { depreciationForYear } from "../assets/depreciation";
import { logger } from "../../utils/logger";

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
const upload = multer({
  dest: env.UPLOAD_DIR,
  limits: { fileSize: env.ARCHIVE_MAX_UPLOAD_MB * 1024 * 1024 }, // Handyfotos von Belegen sind oft größer als 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

expensesRouter.get("/", async (req, res) => {
  const { year } = req.query as Record<string, string | undefined>;
  const where: Record<string, unknown> = { companyId: req.auth!.companyId };
  if (year) {
    where.date = { gte: new Date(Number(year), 0, 1), lt: new Date(Number(year) + 1, 0, 1) };
  }
  const expenses = await prisma.expense.findMany({ where, orderBy: { date: "desc" } });
  const linked = new Set((await prisma.asset.findMany({ where: { companyId: req.auth!.companyId, expenseId: { not: null } }, select: { expenseId: true } })).map((a) => a.expenseId));
  res.json(expenses.map((e) => ({ ...e, inAssetRegister: linked.has(e.id) })));
});

const expenseSchema = z.object({
  date: z.coerce.date().optional(),
  vendor: z.string().min(1),
  category: z.string().default("Sonstiges"),
  amountCents: z.number().int().positive(),
  vatRateBps: z.number().int().min(0).max(10000).default(1900),
  description: z.string().optional(),
  supplierId: z.string().nullish(),
});

// Lieferant der Ausgabe: ausdrücklich gewählt oder - bei gleichem Namen wie ein Lieferant - automatisch verknüpft
async function resolveSupplierId(companyId: string, vendor: string | undefined, supplierId: string | null | undefined): Promise<string | null | undefined> {
  if (supplierId) {
    const s = await prisma.supplier.findFirst({ where: { id: supplierId, companyId }, select: { id: true } });
    if (!s) throw new HttpError(400, "Lieferant nicht gefunden");
    return s.id;
  }
  if (supplierId === null) return null;
  if (!vendor) return undefined;
  const byName = await prisma.supplier.findFirst({ where: { companyId, isArchived: false, name: { equals: vendor.trim(), mode: "insensitive" } }, select: { id: true } });
  return byName?.id;
}

expensesRouter.post("/", upload.single("receipt"), async (req, res) => {
  const body = expenseSchema.parse({
    ...req.body,
    amountCents: req.body.amountCents ? Number(req.body.amountCents) : undefined,
    vatRateBps: req.body.vatRateBps !== undefined ? Number(req.body.vatRateBps) : undefined,
  });

  let receiptPath: string | undefined;
  if (req.file) {
    const ext = path.extname(req.file.originalname) || ".jpg";
    const finalPath = path.join(env.UPLOAD_DIR, "receipts", `${Date.now()}-${req.file.filename}${ext}`);
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    fs.renameSync(req.file.path, finalPath);
    receiptPath = finalPath;
  }

  const supplierId = await resolveSupplierId(req.auth!.companyId, body.vendor, body.supplierId);
  const expense = await prisma.expense.create({
    data: { ...body, supplierId: supplierId ?? null, companyId: req.auth!.companyId, receiptPath },
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "expense.create", entityType: "Expense", entityId: expense.id });
  // Beleg zusätzlich im Belegarchiv ablegen (durchsuchbar); ein Fehler dabei darf das Anlegen der Ausgabe nicht verhindern
  if (receiptPath) await importExpenseReceipt(expense).catch((err) => logger.warn({ err: (err as Error).message, expenseId: expense.id }, "Beleg konnte nicht ins Archiv übernommen werden"));
  res.status(201).json(expense);
});

expensesRouter.patch("/:id", async (req, res) => {
  const existing = await prisma.expense.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Ausgabe nicht gefunden");
  const body = expenseSchema.partial().parse(req.body);
  const supplierId = await resolveSupplierId(req.auth!.companyId, body.vendor, body.supplierId);
  const updated = await prisma.expense.update({ where: { id: existing.id }, data: { ...body, ...(supplierId !== undefined ? { supplierId } : {}) } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "expense.update", entityType: "Expense", entityId: existing.id });
  res.json(updated);
});

expensesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.expense.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Ausgabe nicht gefunden");
  if (existing.receiptPath && fs.existsSync(existing.receiptPath)) fs.rmSync(existing.receiptPath);
  await prisma.expense.delete({ where: { id: existing.id } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "expense.delete", entityType: "Expense", entityId: existing.id });
  res.status(204).send();
});

expensesRouter.get("/:id/receipt", async (req, res) => {
  const expense = await prisma.expense.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!expense?.receiptPath || !fs.existsSync(expense.receiptPath)) throw new HttpError(404, "Kein Beleg hinterlegt");
  res.sendFile(path.resolve(expense.receiptPath));
});

// ---------- Einnahmen-Überschuss-Rechnung (EÜR) ----------
// Zufluss-/Abflussprinzip: Einnahmen zählen zum Zeitpunkt des Zahlungseingangs (paidAt),
// nicht zum Rechnungsdatum. Ausgaben zählen zum eingetragenen Belegdatum.

async function computeEuer(companyId: string, year: number) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);

  // Eine im Jahr X bezahlte Rechnung bleibt Einnahme des Jahres X, auch wenn sie später storniert
  // wird (Status CANCELLED, paidAt bleibt erhalten) - die Rückzahlung wird als negative
  // Einnahme im Jahr der Gutschrift verbucht. Andernfalls würde ein Storno 2026 die bereits
  // abgegebene Steuererklärung 2025 rückwirkend verändern.
  const paidOriginals = await prisma.invoice.findMany({
    where: { companyId, isCancellationDocument: false, status: { in: ["PAID", "CANCELLED"] }, paidAt: { gte: yearStart, lt: yearEnd } },
    select: { invoiceNumber: true, paidAt: true, totalCents: true, customer: { select: { name: true } } },
  });
  const refunds = await prisma.invoice.findMany({
    where: { companyId, isCancellationDocument: true, issueDate: { gte: yearStart, lt: yearEnd }, correctsInvoice: { paidAt: { not: null } } },
    select: { invoiceNumber: true, issueDate: true, totalCents: true, customer: { select: { name: true } } },
  });
  const paidInvoices = [
    ...paidOriginals,
    ...refunds.map((r) => ({ invoiceNumber: r.invoiceNumber, paidAt: r.issueDate as Date | null, totalCents: r.totalCents, customer: r.customer })),
  ];
  // Anlagegüter: Statt der vollen Anschaffungsausgabe zählt die Abschreibung (AfA) des Jahres bzw. bei GWG der Sofortabzug.
  // Ausgaben, die mit einer Anlage verknüpft sind, werden deshalb hier nicht noch einmal gezählt.
  const assets = await prisma.asset.findMany({ where: { companyId } });
  const linkedExpenseIds = assets.map((a) => a.expenseId).filter((id): id is string => !!id);
  const expenses = await prisma.expense.findMany({
    where: { companyId, date: { gte: yearStart, lt: yearEnd }, ...(linkedExpenseIds.length ? { id: { notIn: linkedExpenseIds } } : {}) },
  });
  const afaItems = assets
    .map((a) => ({ asset: a, afa: depreciationForYear({ purchaseDate: a.purchaseDate, costCents: a.costCents, method: a.method as "GWG" | "LINEAR", usefulLifeYears: a.usefulLifeYears }, year) }))
    .filter((x) => x.afa && x.afa.amountCents > 0)
    .map((x) => ({ name: x.asset.name, method: x.asset.method, purchaseDate: x.asset.purchaseDate, amountCents: x.afa!.amountCents, months: x.afa!.months }));

  const incomeCents = paidInvoices.reduce((sum, i) => sum + i.totalCents, 0);
  const afaCents = afaItems.reduce((sum, a) => sum + a.amountCents, 0);
  const expenseCents = expenses.reduce((sum, e) => sum + e.amountCents, 0) + afaCents;

  const expensesByCategory: Record<string, number> = {};
  for (const e of expenses) expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + e.amountCents;
  if (afaCents > 0) expensesByCategory["Abschreibung (AfA/GWG)"] = afaCents;

  // Monatsverlauf für das Diagramm: Einnahmen nach Zahlungseingang, Ausgaben nach Belegdatum
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, incomeCents: 0, expenseCents: 0 }));
  for (const inv of paidInvoices) if (inv.paidAt) months[inv.paidAt.getMonth()].incomeCents += inv.totalCents;
  for (const e of expenses) months[e.date.getMonth()].expenseCents += e.amountCents;
  // AfA gleichmäßig auf die Monate verteilen, in denen das Gut im Jahr genutzt wird (GWG: Anschaffungsmonat)
  for (const a of afaItems) {
    if (a.method === "GWG") {
      months[a.purchaseDate.getMonth()].expenseCents += a.amountCents;
    } else {
      const first = a.purchaseDate.getFullYear() === year ? a.purchaseDate.getMonth() : 0;
      const active = 12 - first;
      for (let m = first; m < 12; m++) months[m].expenseCents += Math.round(a.amountCents / active);
    }
  }

  return {
    year,
    months,
    incomeCents,
    expenseCents,
    surplusCents: incomeCents - expenseCents,
    expensesByCategory,
    afaCents,
    paidInvoices,
    expenses,
    afaItems,
  };
}

expensesRouter.get("/euer/summary", async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const summary = await computeEuer(req.auth!.companyId, year);
  const { paidInvoices, expenses, afaItems, ...rest } = summary;
  // Noch nicht bezahlte Rechnungen (Forderungen) - gehören nicht zur EÜR, sind aber für die Liquidität wichtig
  const open = await prisma.invoice.aggregate({
    where: { companyId: req.auth!.companyId, isCancellationDocument: false, status: { in: ["SENT", "OVERDUE"] } },
    _sum: { totalCents: true },
    _count: { _all: true },
  });
  res.json({ ...rest, openReceivablesCents: open._sum.totalCents ?? 0, openReceivablesCount: open._count._all });
});

expensesRouter.get("/euer/export", async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const { paidInvoices, expenses, afaItems } = await computeEuer(req.auth!.companyId, year);

  const rows = [
    ...paidInvoices.map((i) => ({
      typ: "Einnahme",
      datum: i.paidAt?.toISOString().slice(0, 10) ?? "",
      beschreibung: `Rechnung ${i.invoiceNumber} - ${i.customer.name}`,
      kategorie: "Umsatzerlös",
      betragEur: (i.totalCents / 100).toFixed(2),
    })),
    ...expenses.map((e) => ({
      typ: "Ausgabe",
      datum: e.date.toISOString().slice(0, 10),
      beschreibung: `${e.vendor}${e.description ? " - " + e.description : ""}`,
      kategorie: e.category,
      betragEur: (-e.amountCents / 100).toFixed(2),
    })),
    ...afaItems.map((a) => ({
      typ: "Ausgabe",
      datum: `${year}-12-31`,
      beschreibung: `${a.method === "GWG" ? "GWG-Sofortabzug" : "Abschreibung (AfA)"}: ${a.name} (angeschafft ${a.purchaseDate.toISOString().slice(0, 10)})`,
      kategorie: "Abschreibung (AfA/GWG)",
      betragEur: (-a.amountCents / 100).toFixed(2),
    })),
  ].sort((a, b) => a.datum.localeCompare(b.datum));

  const parser = new CsvParser();
  const csv = parser.parse(rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="euer-${year}.csv"`);
  res.send(csv);
});
