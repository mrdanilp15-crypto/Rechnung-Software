/**
 * Belegkette eines Vorgangs: Angebot -> Auftrag -> Lieferschein -> Rechnung. Reine Logik ohne Datenbankzugriff (testbar); der Endpunkt holt die
 * zusammengehörenden Belege und übergibt sie hier. Neben der Kette liefert sie die als Nächstes sinnvollen Schritte.
 */

export type DocKind = "QUOTE" | "ORDER_CONFIRMATION" | "DELIVERY_NOTE" | "INVOICE";

export interface ChainNode {
  kind: DocKind;
  id: string;
  number: string | null;
  status: string;
  date: Date;
  totalCents: number | null;
  emailSentAt: Date | null;
  isCancellationDocument?: boolean;
  /** STANDARD | DOWN_PAYMENT | FINAL (nur Rechnungen) */
  invoiceKind?: string;
}

export interface ChainInput {
  quote: ChainNode | null;
  orders: ChainNode[];
  deliveryNotes: ChainNode[];
  invoices: ChainNode[];
}

export interface NextAction {
  id: "order-from-quote" | "invoice-from-quote" | "down-payment-from-quote" | "delivery-note-from-order" | "invoice-from-order" | "down-payment-from-order";
  label: string;
  hint: string;
  from: { kind: "QUOTE" | "ORDER_CONFIRMATION"; id: string };
}

export interface Chain extends ChainInput {
  next: NextAction[];
}

const done = (n: ChainNode) => n.status !== "DRAFT" && n.status !== "CANCELLED" && !n.isCancellationDocument;
const realInvoices = (list: ChainNode[]) => list.filter((i) => !i.isCancellationDocument && i.status !== "CANCELLED");

export function buildNextActions(c: ChainInput): NextAction[] {
  const out: NextAction[] = [];
  const invoices = realInvoices(c.invoices);
  const q = c.quote;
  const activeOrders = c.orders.filter((o) => o.status !== "CANCELLED");

  if (q && done(q) && q.status !== "DECLINED" && activeOrders.length === 0 && invoices.length === 0) {
    out.push({ id: "order-from-quote", label: "Auftrag anlegen", hint: "Alle Positionen aus dem Angebot übernehmen", from: { kind: "QUOTE", id: q.id } });
    out.push({ id: "invoice-from-quote", label: "Gleich Rechnung schreiben", hint: "Ohne Auftrag direkt abrechnen", from: { kind: "QUOTE", id: q.id } });
  }
  // Der Auftrag führt weiter: Lieferschein (einmal) und Rechnung (solange noch keine Rechnung existiert)
  const order = activeOrders.find((o) => o.status !== "DRAFT") ?? null;
  if (order) {
    if (c.deliveryNotes.filter((n) => n.status !== "CANCELLED").length === 0) {
      out.push({ id: "delivery-note-from-order", label: "Lieferschein anlegen", hint: "Begleitschein ohne Preise für die Sendung", from: { kind: "ORDER_CONFIRMATION", id: order.id } });
    }
    if (invoices.length === 0) {
      out.push({ id: "invoice-from-order", label: "Rechnung schreiben", hint: "Alle Positionen aus dem Auftrag übernehmen", from: { kind: "ORDER_CONFIRMATION", id: order.id } });
      out.push({ id: "down-payment-from-order", label: "Anzahlungsrechnung", hint: "Nur einen Teil des Betrags vorab berechnen", from: { kind: "ORDER_CONFIRMATION", id: order.id } });
    }
  }
  return out;
}

export function buildChain(c: ChainInput): Chain {
  const byDate = (a: ChainNode, b: ChainNode) => a.date.getTime() - b.date.getTime();
  const sorted: ChainInput = { quote: c.quote, orders: [...c.orders].sort(byDate), deliveryNotes: [...c.deliveryNotes].sort(byDate), invoices: [...c.invoices].sort(byDate) };
  return { ...sorted, next: buildNextActions(sorted) };
}

/** Aus welchen Belegen besteht der Vorgang? Beginnt bei einem beliebigen Beleg und leitet Angebot und Auftrag aus dessen Verknüpfungen ab. */
export function resolveRoots(start: { kind: DocKind; id: string; sourceQuoteId?: string | null; sourceOrderId?: string | null }): { quoteId: string | null; orderId: string | null } {
  switch (start.kind) {
    case "QUOTE":
      return { quoteId: start.id, orderId: null };
    case "ORDER_CONFIRMATION":
      return { quoteId: start.sourceQuoteId ?? null, orderId: start.id };
    case "DELIVERY_NOTE":
      return { quoteId: null, orderId: start.sourceOrderId ?? null };
    case "INVOICE":
      return { quoteId: start.sourceQuoteId ?? null, orderId: start.sourceOrderId ?? null };
  }
}
