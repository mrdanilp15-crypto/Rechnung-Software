import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { zonedMidnight } from "../timetracking/calc";
import { BookingLine, DatevSettings, buildDatevText, buildExpenseBooking, buildInvoiceBookings, defaultSettings, isAccount, toAnsi } from "./datev";

/** DATEV-Export (Buchungsstapel) für Steuerberater: Einstellungen, Vorschau und Download. Nur Administratoren und Buchhaltung. */

export const datevRouter = Router();
datevRouter.use(requireRole("ADMIN", "BUCHHALTUNG"));

const KEY = "datevSettings";

async function loadSettings(companyId: string): Promise<DatevSettings> {
  const row = await prisma.setting.findUnique({ where: { companyId_key: { companyId, key: KEY } } });
  const base = defaultSettings("03");
  if (!row) return base;
  try {
    const saved = JSON.parse(row.value) as Partial<DatevSettings>;
    const skrBase = defaultSettings(saved.skr === "04" ? "04" : "03");
    return { ...skrBase, ...saved, expenseAccounts: { ...skrBase.expenseAccounts, ...(saved.expenseAccounts ?? {}) } };
  } catch {
    return base;
  }
}

const accountField = z.string().trim().refine(isAccount, "Konto: 4 bis 8 Ziffern");
const settingsSchema = z.object({
  skr: z.enum(["03", "04"]),
  consultantNumber: z.string().trim().regex(/^\d{0,7}$/, "Beraternummer: bis zu 7 Ziffern"),
  clientNumber: z.string().trim().regex(/^\d{0,5}$/, "Mandantennummer: bis zu 5 Ziffern"),
  accountLength: z.number().int().min(4).max(8),
  bank: accountField,
  revenueSmallBusiness: accountField,
  revenue19: accountField,
  revenue7: accountField,
  revenueTaxFree: accountField,
  expenseAccounts: z.record(z.string().trim().min(1).max(60), accountField),
  expenseDefault: accountField,
});

datevRouter.get("/settings", async (req, res) => {
  res.json({ settings: await loadSettings(req.auth!.companyId), defaults: { "03": defaultSettings("03"), "04": defaultSettings("04") } });
});

datevRouter.put("/settings", async (req, res) => {
  if (req.auth!.role !== "ADMIN") throw new HttpError(403, "Nur ein Administrator darf die DATEV-Einstellungen ändern.");
  const body = settingsSchema.parse(req.body);
  await prisma.setting.upsert({
    where: { companyId_key: { companyId: req.auth!.companyId, key: KEY } },
    create: { companyId: req.auth!.companyId, key: KEY, value: JSON.stringify(body) },
    update: { value: JSON.stringify(body) },
  });
  res.json(body);
});

/** Zeitraum aus ?year=2026&period=year|q1..q4|m1..m12 in deutscher Zeit */
function period(query: Record<string, unknown>): { from: Date; to: Date; label: string; slug: string } {
  const year = Number(query.year) || new Date().getFullYear();
  const p = String(query.period ?? "year").toLowerCase();
  const q = /^q([1-4])$/.exec(p);
  const m = /^m(1[0-2]|[1-9])$/.exec(p);
  if (q) {
    const i = Number(q[1]) - 1;
    return { from: zonedMidnight(year, i * 3 + 1, 1), to: i === 3 ? zonedMidnight(year + 1, 1, 1) : zonedMidnight(year, i * 3 + 4, 1), label: `${q[1]}. Quartal ${year}`, slug: `${year}-Q${q[1]}` };
  }
  if (m) {
    const mo = Number(m[1]);
    return { from: zonedMidnight(year, mo, 1), to: mo === 12 ? zonedMidnight(year + 1, 1, 1) : zonedMidnight(year, mo + 1, 1), label: `${String(mo).padStart(2, "0")}/${year}`, slug: `${year}-${String(mo).padStart(2, "0")}` };
  }
  return { from: zonedMidnight(year, 1, 1), to: zonedMidnight(year + 1, 1, 1), label: String(year), slug: String(year) };
}

async function collect(companyId: string, query: Record<string, unknown>) {
  const range = period(query);
  const settings = await loadSettings(companyId);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { isSmallBusiness: true } });
  const paid = await prisma.invoice.findMany({
    where: { companyId, status: "PAID", paidAt: { gte: range.from, lt: range.to } },
    include: { items: true, customer: { select: { name: true } } },
    orderBy: { paidAt: "asc" },
    take: 10_000,
  });
  const open = await prisma.invoice.count({ where: { companyId, status: { in: ["SENT", "OVERDUE"] }, issueDate: { gte: range.from, lt: range.to } } });
  const expenses = await prisma.expense.findMany({ where: { companyId, date: { gte: range.from, lt: range.to } }, orderBy: { date: "asc" }, take: 20_000 });

  const lines: BookingLine[] = [];
  const warnings: string[] = [];
  let income = 0;
  for (const inv of paid) {
    const r = buildInvoiceBookings({ invoiceNumber: inv.invoiceNumber, customerName: inv.customer.name, paidAt: inv.paidAt!, totalCents: inv.totalCents, isSmallBusiness: inv.isSmallBusiness, vatNoticeKey: inv.vatNoticeKey, items: inv.items }, settings);
    lines.push(...r.lines);
    warnings.push(...r.warnings);
    income += inv.totalCents;
  }
  let spent = 0;
  expenses.forEach((e, i) => {
    const ref = `A${String(i + 1).padStart(4, "0")}`;
    const r = buildExpenseBooking(e, ref, settings, company.isSmallBusiness);
    lines.push(...r.lines);
    warnings.push(...r.warnings);
    spent += e.amountCents;
  });
  // chronologisch (innerhalb eines Tages Einnahmen vor Ausgaben)
  lines.sort((a, b) => a.date.getTime() - b.date.getTime());

  if (!settings.consultantNumber || !settings.clientNumber) warnings.unshift("Berater- und Mandantennummer fehlen noch (Angaben vom Steuerberater) - ohne sie lässt sich die Datei nicht in DATEV importieren.");
  if (open > 0) warnings.push(`${open} Rechnung(en) dieses Zeitraums sind noch nicht bezahlt und nicht enthalten (Einnahmen werden zum Zahlungsdatum gebucht).`);
  warnings.push("Abschreibungen (AfA/GWG) sind nicht enthalten - die bucht der Steuerberater anhand des Anlageverzeichnisses.");
  return { range, settings, lines, warnings: [...new Set(warnings)], counts: { invoices: paid.length, expenses: expenses.length, lines: lines.length }, income, spent };
}

datevRouter.get("/preview", async (req, res) => {
  const c = await collect(req.auth!.companyId, req.query);
  res.json({
    period: c.range.label,
    counts: c.counts,
    incomeCents: c.income,
    expenseCents: c.spent,
    warnings: c.warnings,
    sample: c.lines.slice(0, 15).map((l) => ({ amountCents: l.amountCents, side: l.side, account: l.account, counter: l.counter, buKey: l.buKey, date: l.date, ref: l.ref, text: l.text })),
  });
});

datevRouter.get("/export", async (req, res) => {
  const companyId = req.auth!.companyId;
  const c = await collect(companyId, req.query);
  if (c.lines.length === 0) throw new HttpError(404, `Für ${c.range.label} gibt es keine bezahlten Rechnungen oder Ausgaben zum Exportieren.`);
  const file = toAnsi(buildDatevText(c.lines, c.settings, c.range, c.range.label));
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "accounting.datev_export", entityType: "Company", entityId: companyId, metadata: { period: c.range.label, lines: c.lines.length } });
  res.setHeader("Content-Type", "text/csv; charset=windows-1252");
  res.setHeader("Content-Disposition", `attachment; filename="EXTF_Buchungsstapel_${c.range.slug}.csv"`);
  res.send(file);
});
