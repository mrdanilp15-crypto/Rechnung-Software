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

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
const upload = multer({
  dest: env.UPLOAD_DIR,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
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
  res.json(expenses);
});

const expenseSchema = z.object({
  date: z.coerce.date().optional(),
  vendor: z.string().min(1),
  category: z.string().default("Sonstiges"),
  amountCents: z.number().int().positive(),
  vatRateBps: z.number().int().min(0).max(10000).default(1900),
  description: z.string().optional(),
});

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

  const expense = await prisma.expense.create({
    data: { ...body, companyId: req.auth!.companyId, receiptPath },
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "expense.create", entityType: "Expense", entityId: expense.id });
  res.status(201).json(expense);
});

expensesRouter.patch("/:id", async (req, res) => {
  const existing = await prisma.expense.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Ausgabe nicht gefunden");
  const body = expenseSchema.partial().parse(req.body);
  const updated = await prisma.expense.update({ where: { id: existing.id }, data: body });
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

  const paidInvoices = await prisma.invoice.findMany({
    where: { companyId, status: "PAID", paidAt: { gte: yearStart, lt: yearEnd } },
    select: { invoiceNumber: true, paidAt: true, totalCents: true, customer: { select: { name: true } } },
  });
  const expenses = await prisma.expense.findMany({
    where: { companyId, date: { gte: yearStart, lt: yearEnd } },
  });

  const incomeCents = paidInvoices.reduce((sum, i) => sum + i.totalCents, 0);
  const expenseCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);

  const expensesByCategory: Record<string, number> = {};
  for (const e of expenses) expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + e.amountCents;

  return {
    year,
    incomeCents,
    expenseCents,
    surplusCents: incomeCents - expenseCents,
    expensesByCategory,
    paidInvoices,
    expenses,
  };
}

expensesRouter.get("/euer/summary", async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const summary = await computeEuer(req.auth!.companyId, year);
  const { paidInvoices, expenses, ...rest } = summary;
  res.json(rest);
});

expensesRouter.get("/euer/export", async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const { paidInvoices, expenses } = await computeEuer(req.auth!.companyId, year);

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
  ].sort((a, b) => a.datum.localeCompare(b.datum));

  const parser = new CsvParser();
  const csv = parser.parse(rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="euer-${year}.csv"`);
  res.send(csv);
});
