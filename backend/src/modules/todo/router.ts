import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { printerHours, taskStatus } from "../maintenance/service";
import { buildTodo } from "./build";

/** "Heute zu tun" (Startseite): sammelt alles, was Aufmerksamkeit braucht. Nur lesend. */
export const todoRouter = Router();
todoRouter.use(requireAuth);

const DAY = 86_400_000;

todoRouter.get("/", async (req, res) => {
  const companyId = req.auth!.companyId;
  const now = new Date();

  const [overdue, quotes, orders, draftCounts, materials, tasks, unassignedPrints] = await Promise.all([
    prisma.invoice.findMany({ where: { companyId, status: "OVERDUE", isCancellationDocument: false }, include: { customer: { select: { name: true } } }, orderBy: { dueDate: "asc" } }),
    prisma.quote.findMany({ where: { companyId, status: "SENT" }, include: { customer: { select: { name: true } } }, orderBy: { issueDate: "asc" } }),
    prisma.orderConfirmation.findMany({
      where: { companyId, voidedAt: null, status: { not: "DRAFT" }, OR: [{ productionStatus: { not: "SHIPPED" } }, { shippedAt: { gte: new Date(now.getTime() - 60 * DAY) } }] },
      include: { customer: { select: { name: true } } },
    }),
    Promise.all(
      [prisma.invoice, prisma.quote, prisma.orderConfirmation, prisma.deliveryNote].map((m: any) => m.count({ where: { companyId, status: "DRAFT", updatedAt: { lt: new Date(now.getTime() - 3 * DAY) } } }) as Promise<number>)
    ),
    prisma.material.findMany({ where: { companyId, isArchived: false, minStock: { gt: 0 } }, select: { name: true, stockQuantity: true, minStock: true } }),
    prisma.maintenanceTask.findMany({ where: { companyId, printer: { isArchived: false } }, include: { printer: { select: { name: true } } } }),
    prisma.printerJob.count({ where: { companyId, orderConfirmationId: null, result: "FINISHED", endedAt: { gte: new Date(now.getTime() - 3 * DAY) } } }),
  ]);

  // Folgebelege: zu welchen Angeboten gibt es schon einen Auftrag/eine Rechnung, zu welchen Aufträgen schon eine Rechnung?
  const quoteIds = quotes.map((q) => q.id);
  const orderIds = orders.map((o) => o.id);
  const [ocFromQuote, invFromQuote, invFromOrder] = await Promise.all([
    quoteIds.length ? prisma.orderConfirmation.findMany({ where: { companyId, sourceQuoteId: { in: quoteIds } }, select: { sourceQuoteId: true } }) : [],
    quoteIds.length ? prisma.invoice.findMany({ where: { companyId, sourceQuoteId: { in: quoteIds } }, select: { sourceQuoteId: true } }) : [],
    orderIds.length ? prisma.invoice.findMany({ where: { companyId, sourceOrderConfirmationId: { in: orderIds }, status: { not: "CANCELLED" }, isCancellationDocument: false }, select: { sourceOrderConfirmationId: true } }) : [],
  ]);
  const quotesWithFollowUp = new Set([...ocFromQuote, ...invFromQuote].map((x) => x.sourceQuoteId));
  const ordersWithInvoice = new Set(invFromOrder.map((x) => x.sourceOrderConfirmationId));

  const hours = tasks.length > 0 ? await printerHours(companyId) : new Map<string, number>();
  const maintenanceDue = tasks.filter((t) => taskStatus(t, hours.get(t.printerId) ?? 0, now).due).map((t) => `${t.printer.name} · ${t.name}`);

  const items = buildTodo({
    now,
    overdueInvoices: overdue.map((i) => ({ id: i.id, number: i.invoiceNumber, customer: i.customer.name, totalCents: i.totalCents, dueDate: i.dueDate })),
    openQuotes: quotes.map((q) => ({ id: q.id, number: q.quoteNumber, customer: q.customer.name, issueDate: q.issueDate, emailSentAt: q.emailSentAt, validUntil: q.validUntil, hasFollowUp: quotesWithFollowUp.has(q.id) })),
    orders: orders.map((o) => ({ id: o.id, number: o.confirmationNumber, customer: o.customer.name, productionStatus: o.productionStatus, expectedDeliveryDate: o.expectedDeliveryDate, shippedAt: o.shippedAt, hasInvoice: ordersWithInvoice.has(o.id) })),
    oldDrafts: draftCounts.reduce((a, b) => a + b, 0),
    lowStock: materials.filter((m) => m.minStock !== null && m.stockQuantity <= m.minStock).map((m) => m.name),
    maintenanceDue,
    unassignedPrints,
  });
  res.json({ items });
});
