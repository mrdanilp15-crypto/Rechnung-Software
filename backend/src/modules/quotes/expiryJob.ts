import { prisma } from "../../db/prisma";
import { logger } from "../../utils/logger";
import { emitEvent } from "../plugins/hooks";

/**
 * Versendete Angebote, deren Gültigkeit abgelaufen ist, werden auf "Abgelaufen" gesetzt (einen Tag Kulanz nach dem Datum).
 * Angebote, aus denen schon ein Auftrag oder eine Rechnung entstanden ist, bleiben unberührt. Ein abgelaufenes Angebot lässt sich weiter in
 * einen Auftrag umwandeln oder als abgelehnt markieren - es wird nichts gelöscht oder versendet.
 */
export async function markExpiredQuotes(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 3_600_000);
  const candidates = await prisma.quote.findMany({ where: { status: "SENT", validUntil: { lt: cutoff } }, select: { id: true, companyId: true, quoteNumber: true, customer: { select: { name: true } } } });
  if (candidates.length === 0) return 0;
  const ids = candidates.map((c) => c.id);
  const [orders, invoices] = await Promise.all([
    prisma.orderConfirmation.findMany({ where: { sourceQuoteId: { in: ids } }, select: { sourceQuoteId: true } }),
    prisma.invoice.findMany({ where: { sourceQuoteId: { in: ids } }, select: { sourceQuoteId: true } }),
  ]);
  const used = new Set([...orders, ...invoices].map((x) => x.sourceQuoteId));
  const expire = ids.filter((id) => !used.has(id));
  if (expire.length === 0) return 0;
  const res = await prisma.quote.updateMany({ where: { id: { in: expire }, status: "SENT" }, data: { status: "EXPIRED" } });
  if (res.count > 0) logger.info({ count: res.count }, "Angebote als abgelaufen markiert");
  for (const q of candidates.filter((c) => expire.includes(c.id))) {
    void emitEvent("quote.expired", { companyId: q.companyId, quote: { id: q.id, number: q.quoteNumber, customer: q.customer.name } }).catch(() => undefined);
  }
  return res.count;
}
