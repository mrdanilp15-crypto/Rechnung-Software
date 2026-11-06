import { describe, expect, it } from "vitest";
import { paymentSummary, type PaymentInvoice } from "../src/modules/production/payment";

const inv = (id: string, status: string, totalCents: number, p: Partial<PaymentInvoice> = {}): PaymentInvoice => ({ id, invoiceNumber: `RE-${id}`, status, totalCents, isCancellationDocument: false, kind: "STANDARD", ...p });

describe("Zahlstatus eines Auftrags", () => {
  it("ohne Rechnung: NONE", () => {
    expect(paymentSummary([])).toEqual({ state: "NONE", openCents: 0, invoice: null });
  });
  it("nur Entwurf: DRAFT", () => {
    const s = paymentSummary([inv("1", "DRAFT", 10000)]);
    expect(s.state).toBe("DRAFT");
    expect(s.openCents).toBe(0);
  });
  it("ausgestellt, nicht bezahlt: OPEN mit offenem Betrag und Link auf die Rechnung", () => {
    const s = paymentSummary([inv("1", "SENT", 29284)]);
    expect(s).toEqual({ state: "OPEN", openCents: 29284, invoice: { id: "1", number: "RE-1" } });
  });
  it("überfällig zählt ebenfalls als offen", () => {
    expect(paymentSummary([inv("1", "OVERDUE", 5000)]).state).toBe("OPEN");
  });
  it("bezahlt: PAID", () => {
    expect(paymentSummary([inv("1", "PAID", 5000)])).toMatchObject({ state: "PAID", openCents: 0 });
  });
  it("nur eine bezahlte Anzahlung: PARTIAL (der Rest ist noch nicht abgerechnet)", () => {
    expect(paymentSummary([inv("1", "PAID", 3000, { kind: "DOWN_PAYMENT" })]).state).toBe("PARTIAL");
  });
  it("Anzahlung bezahlt, Schlussrechnung offen: PARTIAL mit offenem Rest", () => {
    const s = paymentSummary([inv("1", "PAID", 3000, { kind: "DOWN_PAYMENT" }), inv("2", "SENT", 7000, { kind: "FINAL" })]);
    expect(s).toMatchObject({ state: "PARTIAL", openCents: 7000, invoice: { id: "2" } });
  });
  it("Anzahlung und Schlussrechnung bezahlt: PAID", () => {
    expect(paymentSummary([inv("1", "PAID", 3000, { kind: "DOWN_PAYMENT" }), inv("2", "PAID", 7000, { kind: "FINAL" })]).state).toBe("PAID");
  });
  it("stornierte Rechnungen und Korrekturbelege zählen nicht", () => {
    expect(paymentSummary([inv("1", "CANCELLED", 5000), inv("2", "SENT", -5000, { isCancellationDocument: true })]).state).toBe("NONE");
    expect(paymentSummary([inv("1", "CANCELLED", 5000), inv("3", "PAID", 5000)]).state).toBe("PAID");
  });
});
