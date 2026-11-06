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

  const [overdue, quotes, orders, draftCounts, materials, tasks, unassignedPrints, trackedProducts, unmatchedPayments] = await Promise.all([
    prisma.invoice.findMany({ where: { companyId, status: "OVERDUE", isCancellationDocument: false }, include: { customer: { select: { name: true } } }, orderBy: { dueDate: "asc" } }),
    prisma.quote.findMany({ where: { companyId, status: { in: ["SENT", "EXPIRED"] } }, include: { customer: { select: { name: true } } }, orderBy: { issueDate: "asc" } }),
    prisma.orderConfirmation.findMany({
      where: { companyId, voidedAt: null, status: { not: "DRAFT" }, OR: [{ productionStatus: { not: "SHIPPED" } }, { shippedAt: { gte: new Date(now.getTime() - 60 * DAY) } }] },
      include: { customer: { select: { name: true } }, items: { select: { description: true }, orderBy: { position: "asc" } } },
    }),
    Promise.all(
      [prisma.invoice, prisma.quote, prisma.orderConfirmation, prisma.deliveryNote].map((m: any) => m.count({ where: { companyId, status: "DRAFT", updatedAt: { lt: new Date(now.getTime() - 3 * DAY) } } }) as Promise<number>)
    ),
    prisma.material.findMany({ where: { companyId, isArchived: false, minStock: { gt: 0 } }, select: { name: true, stockQuantity: true, minStock: true } }),
    prisma.maintenanceTask.findMany({ where: { companyId, printer: { isArchived: false } }, include: { printer: { select: { name: true } } } }),
    prisma.printerJob.findMany({ where: { companyId, orderConfirmationId: null, result: "FINISHED", endedAt: { gte: new Date(now.getTime() - 3 * DAY) } }, orderBy: { endedAt: "desc" }, take: 20, select: { id: true, name: true, printer: { select: { name: true } } } }),
    prisma.product.findMany({ where: { companyId, isArchived: false, trackStock: true, stockMin: { not: null } }, select: { id: true, name: true, unit: true, stockQuantity: true, stockMin: true } }),
    prisma.bankTransaction.count({ where: { companyId, amountCents: { gt: 0 }, matchedInvoiceId: null, ignored: false } }),
  ]);

  // Folgebelege: zu welchen Angeboten gibt es schon einen Auftrag/eine Rechnung, zu welchen Aufträgen schon eine Rechnung?
  const quoteIds = quotes.map((q) => q.id);
  const orderIds = orders.map((o) => o.id);
  const [ocFromQuote, invFromQuote, invFromOrder, jobGroups] = await Promise.all([
    quoteIds.length ? prisma.orderConfirmation.findMany({ where: { companyId, sourceQuoteId: { in: quoteIds } }, select: { sourceQuoteId: true } }) : [],
    quoteIds.length ? prisma.invoice.findMany({ where: { companyId, sourceQuoteId: { in: quoteIds } }, select: { sourceQuoteId: true } }) : [],
    orderIds.length ? prisma.invoice.findMany({ where: { companyId, sourceOrderConfirmationId: { in: orderIds }, status: { not: "CANCELLED" }, isCancellationDocument: false }, select: { sourceOrderConfirmationId: true } }) : [],
    orderIds.length ? prisma.printerJob.groupBy({ by: ["orderConfirmationId", "endedAt"], where: { companyId, orderConfirmationId: { in: orderIds } }, _count: { _all: true } }) : [],
  ]);
  const quotesWithFollowUp = new Set([...ocFromQuote, ...invFromQuote].map((x) => x.sourceQuoteId));
  const ordersWithInvoice = new Set(invFromOrder.map((x) => x.sourceOrderConfirmationId));

  // laufende (ohne Ende) und beendete Drucke je Auftrag
  const running = new Map<string, number>();
  const finished = new Map<string, number>();
  for (const g of jobGroups) {
    const id = g.orderConfirmationId as string;
    const target = g.endedAt === null ? running : finished;
    target.set(id, (target.get(id) ?? 0) + g._count._all);
  }

  const hours = tasks.length > 0 ? await printerHours(companyId) : new Map<string, number>();
  const maintenanceDue = tasks.filter((t) => taskStatus(t, hours.get(t.printerId) ?? 0, now).due).map((t) => `${t.printer.name} · ${t.name}`);

  const items = buildTodo({
    now,
    overdueInvoices: overdue.map((i) => ({ id: i.id, number: i.invoiceNumber, customer: i.customer.name, totalCents: i.totalCents, dueDate: i.dueDate, assigneeId: i.assigneeId })),
    openQuotes: quotes.map((q) => ({ id: q.id, number: q.quoteNumber, customer: q.customer.name, issueDate: q.issueDate, emailSentAt: q.emailSentAt, validUntil: q.validUntil, hasFollowUp: quotesWithFollowUp.has(q.id), assigneeId: q.assigneeId })),
    orders: orders.map((o) => ({ id: o.id, number: o.confirmationNumber, customer: o.customer.name, productionStatus: o.productionStatus, expectedDeliveryDate: o.expectedDeliveryDate, shippedAt: o.shippedAt, hasInvoice: ordersWithInvoice.has(o.id), assigneeId: o.assigneeId, itemNames: o.items.map((x) => x.description.split("\n")[0]), runningJobs: running.get(o.id) ?? 0, finishedJobs: finished.get(o.id) ?? 0 })),
    oldDrafts: draftCounts.reduce((a, b) => a + b, 0),
    lowStock: materials.filter((m) => m.minStock !== null && m.stockQuantity <= m.minStock).map((m) => m.name),
    maintenanceDue,
    unmatchedPayments,
    lowProducts: trackedProducts.filter((p) => p.stockMin !== null && p.stockQuantity <= p.stockMin).map((p) => ({ id: p.id, name: p.name, stock: p.stockQuantity, min: p.stockMin as number, unit: p.unit })),
    unassignedJobs: unassignedPrints.map((j) => ({ id: j.id, name: j.name, printerName: j.printer.name })),
  });
  res.json({ items });
});
