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
  const issued = { companyId, isCancellationDocument: false, status: { in: ["SENT", "PAID", "OVERDUE"] }, issueDate: { gte: from, lt: to } };

  const [invoices, expenses, items, jobs, newCustomers] = await Promise.all([
    prisma.invoice.findMany({ where: issued, select: { issueDate: true, subtotalCents: true, customerId: true, customer: { select: { name: true } } } }),
    prisma.expense.findMany({ where: { companyId, date: { gte: from, lt: to } }, select: { date: true, amountCents: true } }),
    prisma.invoiceItem.findMany({ where: { invoice: { ...issued, issueDate: { gte: yStart, lt: to } } }, select: { description: true, quantity: true, lineTotalCents: true } }),
    prisma.printerJob.findMany({ where: { companyId, endedAt: { gte: yStart, lt: to } }, select: { printerId: true, result: true, minutes: true, materialUsage: true, printer: { select: { name: true } } } }),
    prisma.customer.count({ where: { companyId, createdAt: { gte: yStart, lt: to } } }),
  ]);

  const cur = invoices.filter((i) => i.issueDate >= yStart);
  const prev = invoices.filter((i) => i.issueDate < yStart);
  const rev = byMonth(cur, (i) => i.issueDate, (i) => i.subtotalCents);
  const revPrev = byMonth(prev, (i) => i.issueDate, (i) => i.subtotalCents);
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
    totals: { revenueCents: total(rev), revenuePrevCents: total(revPrev), expenseCents: total(exp), expensePrevCents: total(expPrev), invoiceCount: cur.length, newCustomers },
    bestsellers: bestsellers(items),
    customers: [...customers.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 10),
    printers: [...byPrinter.entries()].map(([id, e]) => ({ id, name: e.name, ...computeFailStats(e.jobs) })).sort((a, b) => b.hoursGood + b.hoursWasted - (a.hoursGood + a.hoursWasted)),
    materials: materialConsumption(jobs),
  });
});
