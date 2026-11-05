import { describe, it, expect } from "vitest";
import { buildChain, buildNextActions, resolveRoots, type ChainNode } from "../src/modules/documents/chain";

const d = (day: number) => new Date(Date.UTC(2026, 10, day));
const node = (kind: ChainNode["kind"], id: string, status: string, day = 1, extra: Partial<ChainNode> = {}): ChainNode => ({ kind, id, number: id, status, date: d(day), totalCents: 1000, emailSentAt: null, ...extra });
const ids = (a: { id: string }[]) => a.map((x) => x.id);

describe("Belegkette: nächste Schritte", () => {
  it("angenommenes Angebot ohne Auftrag: Auftrag anlegen oder gleich Rechnung", () => {
    const n = buildNextActions({ quote: node("QUOTE", "AN", "ACCEPTED"), orders: [], deliveryNotes: [], invoices: [] });
    expect(ids(n)).toEqual(["order-from-quote", "invoice-from-quote"]);
  });
  it("kein Vorschlag bei Entwurf oder abgelehntem Angebot", () => {
    expect(buildNextActions({ quote: node("QUOTE", "AN", "DRAFT"), orders: [], deliveryNotes: [], invoices: [] })).toEqual([]);
    expect(buildNextActions({ quote: node("QUOTE", "AN", "DECLINED"), orders: [], deliveryNotes: [], invoices: [] })).toEqual([]);
  });
  it("Auftrag ohne alles: Lieferschein, Rechnung und Anzahlung", () => {
    const n = buildNextActions({ quote: null, orders: [node("ORDER_CONFIRMATION", "AB", "SENT")], deliveryNotes: [], invoices: [] });
    expect(ids(n)).toEqual(["delivery-note-from-order", "invoice-from-order", "down-payment-from-order"]);
  });
  it("mit Lieferschein bleibt die Rechnung der nächste Schritt (der Fall aus der Praxis)", () => {
    const n = buildNextActions({ quote: null, orders: [node("ORDER_CONFIRMATION", "AB", "SENT")], deliveryNotes: [node("DELIVERY_NOTE", "LS", "DRAFT")], invoices: [] });
    expect(ids(n)).toEqual(["invoice-from-order", "down-payment-from-order"]);
  });
  it("mit Rechnung ist nichts mehr offen; Storno-Rechnungen zählen nicht als Rechnung", () => {
    const base = { quote: null, orders: [node("ORDER_CONFIRMATION", "AB", "SENT")], deliveryNotes: [node("DELIVERY_NOTE", "LS", "SENT")] };
    expect(buildNextActions({ ...base, invoices: [node("INVOICE", "RE", "SENT")] })).toEqual([]);
    expect(ids(buildNextActions({ ...base, invoices: [node("INVOICE", "ST", "SENT", 2, { isCancellationDocument: true })] }))).toContain("invoice-from-order");
  });
  it("Auftrag im Entwurf bietet noch keine Folgebelege an", () => {
    expect(buildNextActions({ quote: null, orders: [node("ORDER_CONFIRMATION", "AB", "DRAFT")], deliveryNotes: [], invoices: [] })).toEqual([]);
  });
  it("Angebot mit vorhandenem Auftrag schlägt keinen zweiten vor", () => {
    expect(buildNextActions({ quote: node("QUOTE", "AN", "ACCEPTED"), orders: [node("ORDER_CONFIRMATION", "AB", "SENT")], deliveryNotes: [], invoices: [] }).map((x) => x.id)).not.toContain("order-from-quote");
  });
});

describe("Belegkette: Aufbau", () => {
  it("sortiert die Belege nach Datum", () => {
    const c = buildChain({ quote: null, orders: [], deliveryNotes: [], invoices: [node("INVOICE", "B", "SENT", 5), node("INVOICE", "A", "SENT", 2)] });
    expect(ids(c.invoices)).toEqual(["A", "B"]);
  });
  it("findet Angebot und Auftrag ausgehend von jedem Beleg", () => {
    expect(resolveRoots({ kind: "QUOTE", id: "q" })).toEqual({ quoteId: "q", orderId: null });
    expect(resolveRoots({ kind: "ORDER_CONFIRMATION", id: "o", sourceQuoteId: "q" })).toEqual({ quoteId: "q", orderId: "o" });
    expect(resolveRoots({ kind: "DELIVERY_NOTE", id: "n", sourceOrderId: "o" })).toEqual({ quoteId: null, orderId: "o" });
    expect(resolveRoots({ kind: "INVOICE", id: "i", sourceQuoteId: "q", sourceOrderId: "o" })).toEqual({ quoteId: "q", orderId: "o" });
    expect(resolveRoots({ kind: "INVOICE", id: "i" })).toEqual({ quoteId: null, orderId: null });
  });
});
