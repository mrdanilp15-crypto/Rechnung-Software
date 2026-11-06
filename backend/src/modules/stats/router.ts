import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { bestsellers, byMonth, materialConsumption } from "./aggregate";
import { computeFailStats } from "../printers/failStats";

/** Statistiken eines Jahres: Umsatz und Ausgaben je Monat mit Vorjahr, Bestseller, Kunden, Drucker, Materialverbrauch. */
export const statsRouter = Router();
statsRouter.use(requireAuth);

statsRouter.get("/overview", async (req, res) => {
  const companyId = req.auth!.companyId;
  const year = Math.min(2100, Math.max(2000, Number(req.query.year) || new Date().getFullYear()));
  const from = new Date(year - 1, 0, 1);
  const to = new Date(year + 1, 0, 1);
  const yStart = new Date(year, 0, 1);
  // Umsatz = tatsächlich bezahlte Rechnungen, nach Zahlungsdatum (Zufluss wie in der EÜR und bei den Ausgaben).
  // Ausgestellte, noch unbezahlte Rechnungen zählen nicht als Umsatz, sondern werden getrennt als "offen" ausgewiesen.
  const paid = { companyId, isCancellationDocument: false, status: "PAID" as const, paidAt: { gte: from, lt: to } };

  const [paidRows, openInvoices, expenses, items, jobs, newCustomers] = await Promise.all([
    prisma.invoice.findMany({ where: paid, select: { paidAt: true, subtotalCents: true, customerId: true, customer: { select: { name: true } } } }),
    prisma.invoice.findMany({ where: { companyId, isCancellationDocument: false, status: { in: ["SENT", "OVERDUE"] } }, select: { subtotalCents: true } }),
    prisma.expense.findMany({ where: { companyId, date: { gte: from, lt: to } }, select: { date: true, amountCents: true } }),
    prisma.invoiceItem.findMany({ where: { invoice: { ...paid, paidAt: { gte: yStart, lt: to } } }, select: { description: true, quantity: true, lineTotalCents: true } }),
    prisma.printerJob.findMany({ where: { companyId, endedAt: { gte: yStart, lt: to } }, select: { printerId: true, result: true, minutes: true, materialUsage: true, printer: { select: { name: true } } } }),
    prisma.customer.count({ where: { companyId, createdAt: { gte: yStart, lt: to } } }),
  ]);

  const invoices = paidRows.filter((i): i is typeof i & { paidAt: Date } => i.paidAt !== null);
  const cur = invoices.filter((i) => i.paidAt >= yStart);
  const prev = invoices.filter((i) => i.paidAt < yStart);
  const rev = byMonth(cur, (i) => i.paidAt, (i) => i.subtotalCents);
  const revPrev = byMonth(prev, (i) => i.paidAt, (i) => i.subtotalCents);
  const exp = byMonth(expenses.filter((e) => e.date >= yStart), (e) => e.date, (e) => e.amountCents);
  const expPrev = byMonth(expenses.filter((e) => e.date < yStart), (e) => e.date, (e) => e.amountCents);

  const customers = new Map<string, { name: string; revenueCents: number; invoices: number }>();
  for (const i of cur) {
    const e = customers.get(i.customerId) ?? { name: i.customer.name, revenueCents: 0, invoices: 0 };
    e.revenueCents += i.subtotalCents;
    e.invoices += 1;
    customers.set(i.customerId, e);
  }

  const byPrinter = new Map<string, { name: string; jobs: typeof jobs }>();
  for (const j of jobs) {
    const e = byPrinter.get(j.printerId) ?? { name: j.printer.name, jobs: [] };
    e.jobs.push(j);
    byPrinter.set(j.printerId, e);
  }

  const total = (a: number[]) => a.reduce((s, v) => s + v, 0);
  res.json({
    year,
    months: { revenue: rev, revenuePrev: revPrev, expenses: exp, expensesPrev: expPrev },
    totals: { revenueCents: total(rev), revenuePrevCents: total(revPrev), expenseCents: total(exp), expensePrevCents: total(expPrev), invoiceCount: cur.length, newCustomers, openCents: total(openInvoices.map((i) => i.subtotalCents)), openCount: openInvoices.length },
    bestsellers: bestsellers(items),
    customers: [...customers.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 10),
    printers: [...byPrinter.entries()].map(([id, e]) => ({ id, name: e.name, ...computeFailStats(e.jobs) })).sort((a, b) => b.hoursGood + b.hoursWasted - (a.hoursGood + a.hoursWasted)),
    materials: materialConsumption(jobs),
  });
});
