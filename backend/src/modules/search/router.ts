import { Router } from "express";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";

export const searchRouter = Router();
searchRouter.use(requireAuth);

export interface SearchHit {
  type: "customer" | "invoice" | "quote" | "order_confirmation" | "delivery_note" | "product" | "archive";
  id: string;
  title: string;
  subtitle: string;
  /** Frontend-Pfad, der beim Auswählen geöffnet wird */
  path: string;
}

/** Globale Suche (Strg+K): Kunden, Belege und Produkte der eigenen Firma. */
searchRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json([]);
  const companyId = req.auth!.companyId;
  const contains = { contains: q, mode: "insensitive" as const };

  const [customers, invoices, quotes, confirmations, notes, products, archived] = await Promise.all([
    prisma.customer.findMany({ where: { companyId, isArchived: false, OR: [{ name: contains }, { customerNumber: contains }, { email: contains }, { city: contains }, { contactName: contains }] }, take: 6, orderBy: { name: "asc" } }),
    prisma.invoice.findMany({ where: { companyId, OR: [{ invoiceNumber: contains }, { customer: { name: contains } }] }, include: { customer: { select: { name: true } } }, take: 5, orderBy: { createdAt: "desc" } }),
    prisma.quote.findMany({ where: { companyId, OR: [{ quoteNumber: contains }, { customer: { name: contains } }] }, include: { customer: { select: { name: true } } }, take: 4, orderBy: { createdAt: "desc" } }),
    prisma.orderConfirmation.findMany({ where: { companyId, voidedAt: null, OR: [{ confirmationNumber: contains }, { customer: { name: contains } }] }, include: { customer: { select: { name: true } } }, take: 4, orderBy: { createdAt: "desc" } }),
    prisma.deliveryNote.findMany({ where: { companyId, voidedAt: null, OR: [{ noteNumber: contains }, { customer: { name: contains } }] }, include: { customer: { select: { name: true } } }, take: 4, orderBy: { createdAt: "desc" } }),
    prisma.product.findMany({ where: { companyId, isArchived: false, OR: [{ name: contains }, { sku: contains }] }, take: 5, orderBy: { name: "asc" } }),
    prisma.archiveDocument.findMany({ where: { companyId, OR: [{ title: contains }, { vendor: contains }, { fileName: contains }, { notes: contains }] }, select: { id: true, title: true, vendor: true, category: true }, take: 5, orderBy: { documentDate: "desc" } }),
  ]);

  const hits: SearchHit[] = [
    ...customers.map((c): SearchHit => ({ type: "customer", id: c.id, title: c.name, subtitle: ["Kunde", c.customerNumber, c.city].filter(Boolean).join(" · "), path: `/customers/${c.id}` })),
    ...invoices.map((i): SearchHit => ({
      type: "invoice", id: i.id, title: `${i.isCancellationDocument ? "Korrekturbeleg" : "Rechnung"} ${i.invoiceNumber ?? "(Entwurf)"}`, subtitle: i.customer.name,
      path: i.status === "DRAFT" ? `/invoices/${i.id}/edit` : `/invoices/${i.id}`,
    })),
    ...quotes.map((x): SearchHit => ({ type: "quote", id: x.id, title: `Angebot ${x.quoteNumber}`, subtitle: x.customer.name, path: x.status === "DRAFT" ? `/quotes/${x.id}/edit` : "/documents?type=QUOTE" })),
    ...confirmations.map((x): SearchHit => ({ type: "order_confirmation", id: x.id, title: `Auftrag ${x.confirmationNumber}`, subtitle: x.customer.name, path: x.status === "DRAFT" ? `/order-confirmations/${x.id}/edit` : "/documents?type=ORDER_CONFIRMATION" })),
    ...notes.map((x): SearchHit => ({ type: "delivery_note", id: x.id, title: `Lieferschein ${x.noteNumber}`, subtitle: x.customer.name, path: x.status === "DRAFT" ? `/delivery-notes/${x.id}/edit` : "/documents?type=DELIVERY_NOTE" })),
    ...products.map((p): SearchHit => ({ type: "product", id: p.id, title: p.name, subtitle: "Produkt", path: "/catalog" })),
    ...archived.map((a): SearchHit => ({ type: "archive", id: a.id, title: a.title, subtitle: ["Archiv", a.vendor].filter(Boolean).join(" · "), path: `/archive?q=${encodeURIComponent(a.title)}` })),
  ];
  res.json(hits);
});
