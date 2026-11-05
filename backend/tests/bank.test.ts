import { describe, it, expect } from "vitest";
import { bankFingerprint, parseAmount, parseBankRow, parseBookingDate } from "../src/modules/bank/parse";
import { autoMatch, nameMatch, numberInPurpose, suggestMatches, type OpenInvoice } from "../src/modules/bank/match";

describe("Kontoauszug einlesen", () => {
  it("liest deutsche und englische Beträge", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("-12,5")).toBe(-12.5);
    expect(parseAmount("21.42")).toBe(21.42);
    expect(parseAmount("119,00 €")).toBe(119);
    expect(parseAmount("")).toBeNaN();
  });
  it("liest Datum als TT.MM.JJJJ, TT.MM.JJ und JJJJ-MM-TT, ohne Tagessprung", () => {
    expect(parseBookingDate("05.11.2026")?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(parseBookingDate("5.11.26")?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(parseBookingDate("2026-11-05")?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(parseBookingDate("2026-11-05T00:00:00")?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(parseBookingDate("31.02.2026")).toBeNull();
    expect(parseBookingDate("morgen")).toBeNull();
  });
  it("erkennt die Spaltennamen verschiedener Banken", () => {
    const sparkasse = parseBankRow({ Buchungstag: "05.11.26", Valutadatum: "05.11.26", Buchungstext: "GUTSCHRIFT", Verwendungszweck: "RE-2026-0007 Danke", "Beguenstigter/Zahlungspflichtiger": "Max Muster", Betrag: "119,00" });
    expect(sparkasse).toMatchObject({ ok: true, amountCents: 11900, purpose: "RE-2026-0007 Danke", counterparty: "Max Muster" });
    const eigen = parseBankRow({ bookingDate: "2026-11-05", amount: "10.5", purpose: "x", counterparty: "y" });
    expect(eigen).toMatchObject({ ok: true, amountCents: 1050 });
  });
  it("meldet unlesbare Zeilen verständlich", () => {
    expect(parseBankRow({ Betrag: "1" })).toMatchObject({ ok: false });
    expect(parseBankRow({ Buchungstag: "gestern", Betrag: "1" })).toMatchObject({ ok: false, error: expect.stringContaining("nicht lesbar") });
  });
  it("derselbe Umsatz ergibt denselben Fingerabdruck, auch bei anderer Schreibweise", () => {
    const d = new Date("2026-11-05T12:00:00Z");
    expect(bankFingerprint(d, 11900, "RE-1 Danke!", "Max  Muster")).toBe(bankFingerprint(d, 11900, "re 1 danke", "max muster"));
    expect(bankFingerprint(d, 11900, "a", "b")).not.toBe(bankFingerprint(d, 11901, "a", "b"));
  });
});

const inv = (id: string, number: string, cents: number, customer: string): OpenInvoice => ({ id, number, totalCents: cents, customer });

describe("Zahlungen zuordnen", () => {
  it("findet die Rechnungsnummer trotz anderer Trenner", () => {
    expect(numberInPurpose("RE-2026-0007", "Zahlung RE20260007 Danke")).toBe(true);
    expect(numberInPurpose("RE-2026-0007", "re 2026 0007")).toBe(true);
    expect(numberInPurpose("RE-2026-0007", "RE-2026-0008")).toBe(false);
    expect(numberInPurpose(null, "x")).toBe(false);
  });
  it("Automatik nur bei Betrag UND Nummer und nur bei genau einem Treffer", () => {
    const list = [inv("1", "RE-1-0001", 10000, "A"), inv("2", "RE-1-0002", 10000, "B")];
    expect(autoMatch({ amountCents: 10000, purpose: "RE-1-0002" }, list)?.id).toBe("2");
    expect(autoMatch({ amountCents: 9999, purpose: "RE-1-0002" }, list)).toBeUndefined();
    expect(autoMatch({ amountCents: 10000, purpose: "ohne Nummer" }, list)).toBeUndefined();
    expect(autoMatch({ amountCents: -10000, purpose: "RE-1-0002" }, list)).toBeUndefined();
  });
  it("Namensvergleich ignoriert Rechtsformen und zu kurze Teile", () => {
    expect(nameMatch("Max Muster", "MUSTER MAX")).toBe(2);
    expect(nameMatch("Muster GmbH", "Muster Handels GmbH")).toBe(2);
    expect(nameMatch("Max Muster", "Anna Muster")).toBe(1);
    expect(nameMatch("Max Muster", "Peter Schmidt")).toBe(0);
  });
  it("schlägt bei fehlender Rechnungsnummer anhand von Betrag und Name vor", () => {
    const list = [inv("1", "RE-1", 11900, "Max Muster"), inv("2", "RE-2", 5000, "Anna Beispiel")];
    const s = suggestMatches({ amountCents: 11900, purpose: "Überweisung", counterparty: "Max Muster" }, list);
    expect(s[0].invoiceId).toBe("1");
    expect(s[0].reason).toContain("Betrag stimmt");
    expect(s[0].reason).toContain("Name passt");
    expect(s[0].diffCents).toBe(0);
  });
  it("erkennt Teilzahlung/Skonto über die Rechnungsnummer und zeigt die Differenz", () => {
    const s = suggestMatches({ amountCents: 11500, purpose: "RE-1 abzgl. Skonto", counterparty: "Max Muster" }, [inv("1", "RE-1", 11900, "Max Muster")]);
    expect(s[0].invoiceId).toBe("1");
    expect(s[0].diffCents).toBe(-400);
    expect(s[0].reason).toContain("Skonto");
  });
  it("macht keinen Vorschlag ohne Anhaltspunkt und nicht für Abbuchungen", () => {
    expect(suggestMatches({ amountCents: 777, purpose: "Miete", counterparty: "Vermieter" }, [inv("1", "RE-1", 11900, "Max Muster")])).toEqual([]);
    expect(suggestMatches({ amountCents: -11900, purpose: "RE-1", counterparty: "Max Muster" }, [inv("1", "RE-1", 11900, "Max Muster")])).toEqual([]);
  });
  it("Betrag allein reicht nur, wenn es die einzige Rechnung mit diesem Betrag ist", () => {
    const one = suggestMatches({ amountCents: 5000, purpose: "", counterparty: "" }, [inv("1", "RE-1", 5000, "A")]);
    expect(one).toHaveLength(1);
    const two = suggestMatches({ amountCents: 5000, purpose: "", counterparty: "" }, [inv("1", "RE-1", 5000, "A"), inv("2", "RE-2", 5000, "B")]);
    expect(two.every((x) => x.score >= 50)).toBe(true);
    expect(two[0].reason).not.toContain("einzige");
  });
});
