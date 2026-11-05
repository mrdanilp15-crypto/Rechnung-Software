import { describe, it, expect } from "vitest";
import { checkQuoteLink } from "../src/modules/orderConfirmations/link";

const order = { customerId: "c1", sourceQuoteId: null, voided: false };
const quote = { customerId: "c1", status: "SENT", alreadyHasOrder: false };

describe("Auftrag mit Angebot verknüpfen", () => {
  it("erlaubt gleichen Kunden und markiert ein offenes Angebot als angenommen", () => {
    expect(checkQuoteLink(order, quote)).toEqual({ ok: true, markAccepted: true });
    expect(checkQuoteLink(order, { ...quote, status: "EXPIRED" })).toEqual({ ok: true, markAccepted: true });
    expect(checkQuoteLink(order, { ...quote, status: "ACCEPTED" })).toEqual({ ok: true, markAccepted: false });
  });
  it("lehnt verschiedene Kunden ab", () => {
    expect(checkQuoteLink(order, { ...quote, customerId: "c2" })).toMatchObject({ ok: false, status: 400 });
  });
  it("lehnt Entwürfe und abgelehnte Angebote ab", () => {
    expect(checkQuoteLink(order, { ...quote, status: "DRAFT" })).toMatchObject({ ok: false });
    expect(checkQuoteLink(order, { ...quote, status: "DECLINED" })).toMatchObject({ ok: false });
  });
  it("verhindert Doppelverknüpfung in beide Richtungen", () => {
    expect(checkQuoteLink({ ...order, sourceQuoteId: "q9" }, quote)).toMatchObject({ ok: false, status: 409 });
    expect(checkQuoteLink(order, { ...quote, alreadyHasOrder: true })).toMatchObject({ ok: false, status: 409 });
  });
  it("lehnt ungültige Aufträge ab", () => {
    expect(checkQuoteLink({ ...order, voided: true }, quote)).toMatchObject({ ok: false, status: 409 });
  });
});
