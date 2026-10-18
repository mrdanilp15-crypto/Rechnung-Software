import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";

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
      kind: "INVOICE", id: i.id, number: i.invoiceNumber, customerName: i.customer.name, date: i.issueDate.toISOString(), dueDate: i.dueDate?.toISOString() ?? null,
      totalCents: i.totalCents, status: i.status, isCancellationDocument: i.isCancellationDocument, hasNext: false,
    })),
    ...quotes.map((q): DocumentRow => ({
      kind: "QUOTE", id: q.id, number: q.quoteNumber, customerName: q.customer.name, date: q.issueDate.toISOString(), dueDate: q.validUntil?.toISOString() ?? null,
      totalCents: q.totalCents, status: q.status, isCancellationDocument: false, hasNext: quoteHasNext.has(q.id),
    })),
    ...confirmations.map((c): DocumentRow => ({
      kind: "ORDER_CONFIRMATION", id: c.id, number: c.confirmationNumber, customerName: c.customer.name, date: c.issueDate.toISOString(), dueDate: c.expectedDeliveryDate?.toISOString() ?? null,
      totalCents: c.totalCents, status: c.status, isCancellationDocument: false, hasNext: confirmationHasNext.has(c.id),
    })),
    ...notes.map((n): DocumentRow => ({
      kind: "DELIVERY_NOTE", id: n.id, number: n.noteNumber, customerName: n.customer.name, date: n.deliveryDate.toISOString(), dueDate: null,
      totalCents: null, status: n.status, isCancellationDocument: false, hasNext: false,
    })),
  ];

  // Entwürfe zuerst (dort ist noch etwas zu tun), danach nach Datum absteigend
  rows.sort((a, b) => Number(b.status === "DRAFT") - Number(a.status === "DRAFT") || b.date.localeCompare(a.date));
  res.json(rows);
});
