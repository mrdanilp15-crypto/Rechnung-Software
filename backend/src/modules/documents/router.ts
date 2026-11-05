import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { buildChain, resolveRoots, type ChainNode, type DocKind } from "./chain";

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

export type DocumentKind = "INVOICE" | "QUOTE" | "ORDER_CONFIRMATION" | "DELIVERY_NOTE";

export interface DocumentRow {
  kind: DocumentKind;
  id: string;
  number: string | null; // null = Entwurf ohne Nummer (nur Rechnungen)
  customerName: string;
  date: string;
  dueDate: string | null;
  totalCents: number | null; // Lieferscheine haben keine Beträge
  status: string; // DRAFT | SENT | PAID | OVERDUE | CANCELLED | ACCEPTED | DECLINED | EXPIRED
  isCancellationDocument: boolean;
  hasNext: boolean; // wurde daraus bereits ein Folgebeleg erstellt?
  customerId: string;
  hasSource: boolean; // stammt aus einem Vorgängerbeleg (nur Aufträge: aus einem Angebot)
  hasInvoice: boolean; // wurde daraus schon eine Rechnung erstellt (Angebote, Aufträge)?
  hasOrder: boolean; // wurde aus dem Angebot schon ein Auftrag erstellt?
  sourceQuoteId: string | null;
  sourceOrderId: string | null;
  invoiceKind?: string; // STANDARD | DOWN_PAYMENT | FINAL (nur Rechnungen)
  emailSentAt: string | null; // wann per E-Mail verschickt (null = nicht per E-Mail versendet)
}

/**
 * Alle Belegarten (Rechnungen, Angebote, Auftragsbestätigungen, Lieferscheine) in einer Liste -
 * Grundlage der Seite "Belege". Gelöschte (ungültig markierte) Lieferscheine/Auftragsbestätigungen fehlen.
 */
documentsRouter.get("/", async (req, res) => {
  const companyId = req.auth!.companyId;
  const [invoices, quotes, confirmations, notes, invoiceSources, confirmationSources, noteSources] = await Promise.all([
    prisma.invoice.findMany({ where: { companyId }, include: { customer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.quote.findMany({ where: { companyId }, include: { customer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.orderConfirmation.findMany({ where: { companyId, voidedAt: null }, include: { customer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.deliveryNote.findMany({ where: { companyId, voidedAt: null }, include: { customer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.invoice.findMany({ where: { companyId, OR: [{ sourceQuoteId: { not: null } }, { sourceOrderConfirmationId: { not: null } }] }, select: { sourceQuoteId: true, sourceOrderConfirmationId: true } }),
    prisma.orderConfirmation.findMany({ where: { companyId, sourceQuoteId: { not: null }, voidedAt: null }, select: { sourceQuoteId: true } }),
    prisma.deliveryNote.findMany({ where: { companyId, sourceOrderConfirmationId: { not: null }, voidedAt: null }, select: { sourceOrderConfirmationId: true } }),
  ]);

  const quoteHasOrder = new Set<string>(confirmationSources.map((c) => c.sourceQuoteId).filter((x): x is string => !!x));
  const quoteHasInvoice = new Set<string>(invoiceSources.map((i) => i.sourceQuoteId).filter((x): x is string => !!x));
  const confirmationHasInvoice = new Set<string>(invoiceSources.map((i) => i.sourceOrderConfirmationId).filter((x): x is string => !!x));
  const quoteHasNext = new Set<string>([
    ...invoiceSources.map((i) => i.sourceQuoteId).filter((x): x is string => !!x),
    ...confirmationSources.map((c) => c.sourceQuoteId).filter((x): x is string => !!x),
  ]);
  const confirmationHasNext = new Set<string>([
    ...invoiceSources.map((i) => i.sourceOrderConfirmationId).filter((x): x is string => !!x),
    ...noteSources.map((n) => n.sourceOrderConfirmationId).filter((x): x is string => !!x),
  ]);

  const rows: DocumentRow[] = [
    ...invoices.map((i): DocumentRow => ({
      kind: "INVOICE", customerId: i.customerId, hasSource: !!(i.sourceQuoteId || i.sourceOrderConfirmationId), hasInvoice: false, hasOrder: false, sourceQuoteId: i.sourceQuoteId, sourceOrderId: i.sourceOrderConfirmationId, id: i.id, number: i.invoiceNumber, customerName: i.customer.name, date: i.issueDate.toISOString(), dueDate: i.dueDate?.toISOString() ?? null,
      totalCents: i.totalCents, status: i.status, isCancellationDocument: i.isCancellationDocument, hasNext: !!i.finalInvoiceId, invoiceKind: i.kind, emailSentAt: i.emailSentAt?.toISOString() ?? null,
    })),
    ...quotes.map((q): DocumentRow => ({
      kind: "QUOTE", customerId: q.customerId, hasSource: false, hasInvoice: quoteHasInvoice.has(q.id), hasOrder: quoteHasOrder.has(q.id), sourceQuoteId: null, sourceOrderId: null, id: q.id, number: q.quoteNumber, customerName: q.customer.name, date: q.issueDate.toISOString(), dueDate: q.validUntil?.toISOString() ?? null,
      totalCents: q.totalCents, status: q.status, isCancellationDocument: false, hasNext: quoteHasNext.has(q.id), emailSentAt: q.emailSentAt?.toISOString() ?? null,
    })),
    ...confirmations.map((c): DocumentRow => ({
      kind: "ORDER_CONFIRMATION", customerId: c.customerId, hasSource: !!c.sourceQuoteId, hasInvoice: confirmationHasInvoice.has(c.id), hasOrder: false, sourceQuoteId: c.sourceQuoteId, sourceOrderId: null, id: c.id, number: c.confirmationNumber, customerName: c.customer.name, date: c.issueDate.toISOString(), dueDate: c.expectedDeliveryDate?.toISOString() ?? null,
      totalCents: c.totalCents, status: c.status, isCancellationDocument: false, hasNext: confirmationHasNext.has(c.id), emailSentAt: c.emailSentAt?.toISOString() ?? null,
    })),
    ...notes.map((n): DocumentRow => ({
      kind: "DELIVERY_NOTE", customerId: n.customerId, hasSource: !!n.sourceOrderConfirmationId, hasInvoice: false, hasOrder: false, sourceQuoteId: null, sourceOrderId: n.sourceOrderConfirmationId, id: n.id, number: n.noteNumber, customerName: n.customer.name, date: n.deliveryDate.toISOString(), dueDate: null,
      totalCents: null, status: n.status, isCancellationDocument: false, hasNext: false, emailSentAt: n.emailSentAt?.toISOString() ?? null,
    })),
  ];

  // Entwürfe zuerst (dort ist noch etwas zu tun), danach nach Datum absteigend
  rows.sort((a, b) => Number(b.status === "DRAFT") - Number(a.status === "DRAFT") || b.date.localeCompare(a.date));
  res.json(rows);
});

/**
 * Kennzahlen für die Startseite: Nettoumsatz der letzten 12 Monate (ausgestellte Rechnungen ohne Entwürfe;
 * stornierte Originale und ihre Korrekturbelege werden beide ausgeklammert) und die umsatzstärksten Kunden
 * des laufenden Jahres.
 */
/**
 * Tagesverlauf eines Monats für das Dashboard: Netto-Umsatz aus gestellten Rechnungen (nach Rechnungsdatum) und Ausgaben (nach Belegdatum) je Tag.
 * ?month=JJJJ-MM (Standard: aktueller Monat). Die Rechnungen zählen wie in /stats (ohne Korrekturbelege, nur versendet/bezahlt/überfällig).
 */
documentsRouter.get("/month-series", async (req, res) => {
  const companyId = req.auth!.companyId;
  const now = new Date();
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(typeof req.query.month === "string" ? req.query.month : "");
  const year = m ? Number(m[1]) : now.getFullYear();
  const mon = m ? Number(m[2]) - 1 : now.getMonth();
  const from = new Date(year, mon, 1);
  const to = new Date(year, mon + 1, 1);
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, revenueCents: 0, expenseCents: 0 }));
  const invoices = await prisma.invoice.findMany({
    where: { companyId, isCancellationDocument: false, status: { in: ["SENT", "PAID", "OVERDUE"] }, issueDate: { gte: from, lt: to } },
    select: { issueDate: true, subtotalCents: true },
  });
  for (const inv of invoices) days[inv.issueDate.getDate() - 1].revenueCents += inv.subtotalCents;
  const expenses = await prisma.expense.findMany({ where: { companyId, date: { gte: from, lt: to } }, select: { date: true, amountCents: true } });
  for (const e of expenses) days[e.date.getDate() - 1].expenseCents += e.amountCents;
  res.json({ month: `${year}-${String(mon + 1).padStart(2, "0")}`, days });
});

documentsRouter.get("/stats", async (req, res) => {
  const companyId = req.auth!.companyId;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const invoices = await prisma.invoice.findMany({
    where: { companyId, isCancellationDocument: false, status: { in: ["SENT", "PAID", "OVERDUE"] }, issueDate: { gte: start < yearStart ? start : yearStart } },
    select: { issueDate: true, subtotalCents: true, customerId: true, customer: { select: { name: true } } },
  });

  const months: { month: string; revenueCents: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    months.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, revenueCents: 0 });
  }
  const byCustomer = new Map<string, { name: string; revenueCents: number }>();
  let yearRevenueCents = 0;
  for (const inv of invoices) {
    const key = `${inv.issueDate.getFullYear()}-${String(inv.issueDate.getMonth() + 1).padStart(2, "0")}`;
    const bucket = months.find((m) => m.month === key);
    if (bucket) bucket.revenueCents += inv.subtotalCents;
    if (inv.issueDate >= yearStart) {
      yearRevenueCents += inv.subtotalCents;
      const entry = byCustomer.get(inv.customerId) ?? { name: inv.customer.name, revenueCents: 0 };
      entry.revenueCents += inv.subtotalCents;
      byCustomer.set(inv.customerId, entry);
    }
  }
  const topCustomers = [...byCustomer.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 10);
  // Ausgaben je Monat (Belegdatum, brutto) für das Diagramm "Einnahmen und Ausgaben"
  const expenses = await prisma.expense.findMany({ where: { companyId, date: { gte: start } }, select: { date: true, amountCents: true } });
  const expenseMonths = months.map((m) => ({ month: m.month, expenseCents: 0 }));
  for (const e of expenses) {
    const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = expenseMonths.find((m) => m.month === key);
    if (bucket) bucket.expenseCents += e.amountCents;
  }
  res.json({ months, expenseMonths, topCustomers, yearRevenueCents });
});

/**
 * Belegkette eines Vorgangs (Angebot -> Auftrag -> Lieferschein -> Rechnung), ausgehend von einem beliebigen Beleg, mit den als Nächstes
 * sinnvollen Schritten. Grundlage der Vorgangs-Übersicht auf der Auftrags-, Angebots- und Rechnungsseite.
 */
documentsRouter.get("/chain/:kind/:id", async (req, res) => {
  const companyId = req.auth!.companyId;
  const kind = req.params.kind as DocKind;
  const id = req.params.id;
  if (!["QUOTE", "ORDER_CONFIRMATION", "DELIVERY_NOTE", "INVOICE"].includes(kind)) throw new HttpError(400, "Unbekannte Belegart");

  let start: { sourceQuoteId?: string | null; sourceOrderId?: string | null } = {};
  if (kind === "QUOTE") {
    if (!(await prisma.quote.findFirst({ where: { id, companyId }, select: { id: true } }))) throw new HttpError(404, "Beleg nicht gefunden");
  } else if (kind === "ORDER_CONFIRMATION") {
    const o = await prisma.orderConfirmation.findFirst({ where: { id, companyId }, select: { sourceQuoteId: true } });
    if (!o) throw new HttpError(404, "Beleg nicht gefunden");
    start = { sourceQuoteId: o.sourceQuoteId };
  } else if (kind === "DELIVERY_NOTE") {
    const n = await prisma.deliveryNote.findFirst({ where: { id, companyId }, select: { sourceOrderConfirmationId: true } });
    if (!n) throw new HttpError(404, "Beleg nicht gefunden");
    start = { sourceOrderId: n.sourceOrderConfirmationId };
  } else {
    const i = await prisma.invoice.findFirst({ where: { id, companyId }, select: { sourceQuoteId: true, sourceOrderConfirmationId: true } });
    if (!i) throw new HttpError(404, "Beleg nicht gefunden");
    start = { sourceQuoteId: i.sourceQuoteId, sourceOrderId: i.sourceOrderConfirmationId };
  }

  let { quoteId, orderId } = resolveRoots({ kind, id, ...start });
  // Ein Auftrag kennt sein Angebot, auch wenn man bei Lieferschein oder Rechnung beginnt
  if (orderId && !quoteId) {
    quoteId = (await prisma.orderConfirmation.findFirst({ where: { id: orderId, companyId }, select: { sourceQuoteId: true } }))?.sourceQuoteId ?? null;
  }
  const orderRows = await prisma.orderConfirmation.findMany({ where: { companyId, voidedAt: null, OR: [...(orderId ? [{ id: orderId }] : []), ...(quoteId ? [{ sourceQuoteId: quoteId }] : [])] } });
  const orderIds = orderRows.map((o) => o.id);
  const [quote, notes, invoices] = await Promise.all([
    quoteId ? prisma.quote.findFirst({ where: { id: quoteId, companyId } }) : null,
    orderIds.length ? prisma.deliveryNote.findMany({ where: { companyId, voidedAt: null, sourceOrderConfirmationId: { in: orderIds } } }) : [],
    prisma.invoice.findMany({ where: { companyId, OR: [...(quoteId ? [{ sourceQuoteId: quoteId }] : []), ...(orderIds.length ? [{ sourceOrderConfirmationId: { in: orderIds } }] : []), ...(kind === "INVOICE" ? [{ id }] : [])] } }),
  ]);
  // Lieferschein ohne Auftrag (oder Rechnung ohne Quelle): der Beleg selbst bildet die Kette
  const lonelyNote = kind === "DELIVERY_NOTE" && !notes.some((n) => n.id === id) ? await prisma.deliveryNote.findFirst({ where: { id, companyId } }) : null;

  const toNode = (k: DocKind) => (x: { id: string; status: string; emailSentAt: Date | null; customerId?: string; totalCents?: number; isCancellationDocument?: boolean; kind?: string } & Record<string, unknown>, number: string | null, date: Date): ChainNode => ({
    kind: k, id: x.id, number, status: x.status, date, customerId: x.customerId, totalCents: typeof x.totalCents === "number" ? x.totalCents : null, emailSentAt: x.emailSentAt ?? null, isCancellationDocument: !!x.isCancellationDocument, ...(k === "INVOICE" ? { invoiceKind: String(x.kind ?? "STANDARD") } : {}),
  });
  const chain = buildChain({
    quote: quote ? toNode("QUOTE")(quote, quote.quoteNumber, quote.issueDate) : null,
    orders: orderRows.map((o) => toNode("ORDER_CONFIRMATION")(o, o.confirmationNumber, o.issueDate)),
    deliveryNotes: [...notes, ...(lonelyNote ? [lonelyNote] : [])].map((n) => toNode("DELIVERY_NOTE")({ ...n, totalCents: undefined }, n.noteNumber, n.deliveryDate)),
    invoices: invoices.map((i) => toNode("INVOICE")(i, i.invoiceNumber, i.issueDate)),
  });
  res.json(chain);
});
