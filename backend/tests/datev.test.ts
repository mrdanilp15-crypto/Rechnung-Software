import { describe, it, expect } from "vitest";
import { belegfeld, buchungstext, buildDatevText, buildExpenseBooking, buildInvoiceBookings, defaultSettings, toAnsi, type BookingLine } from "../src/modules/accounting/datev";

const s = { ...defaultSettings("03"), consultantNumber: "29098", clientNumber: "55003" };
const paid = new Date("2026-11-05T10:00:00Z");
const inv = (over: Partial<Parameters<typeof buildInvoiceBookings>[0]> = {}) => ({ invoiceNumber: "RE-2026-0007", customerName: "Muster GmbH", paidAt: paid, totalCents: 11900, isSmallBusiness: false, vatNoticeKey: null, items: [{ vatRateBps: 1900, lineTotalCents: 10000 }], ...over });

describe("DATEV: Buchungen", () => {
  it("bucht eine Einnahme mit 19 % auf Bank an Erlöse mit Umsatzsteuerschlüssel 3", () => {
    const { lines } = buildInvoiceBookings(inv(), s);
    expect(lines).toEqual([{ amountCents: 11900, side: "S", account: "1200", counter: "8400", buKey: "3", date: paid, ref: "RE-2026-0007", text: "RE-2026-0007 Muster GmbH" }]);
  });
  it("bucht Kleinunternehmer-Einnahmen ohne Steuerschlüssel auf das Kleinunternehmer-Erlöskonto", () => {
    const { lines } = buildInvoiceBookings(inv({ isSmallBusiness: true, totalCents: 5000, items: [{ vatRateBps: 0, lineTotalCents: 5000 }] }), s);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ amountCents: 5000, account: "1200", counter: "8195", buKey: "" });
  });
  it("teilt gemischte Steuersätze auf und stimmt in der Summe mit dem Rechnungsbrutto überein", () => {
    // 100,00 netto zu 19 % und 33,33 netto zu 7 %: brutto 119,00 + 35,66 = 154,66; die Rechnung nennt 154,67 (Rundung)
    const { lines } = buildInvoiceBookings(inv({ totalCents: 15467, items: [{ vatRateBps: 1900, lineTotalCents: 10000 }, { vatRateBps: 700, lineTotalCents: 3333 }] }), s);
    expect(lines.map((l) => [l.counter, l.buKey])).toEqual(expect.arrayContaining([["8400", "3"], ["8300", "2"]]));
    expect(lines.reduce((a, l) => a + l.amountCents, 0)).toBe(15467);
  });
  it("bucht Auslandsbezug auf das steuerfreie Konto und warnt", () => {
    const r = buildInvoiceBookings(inv({ vatNoticeKey: "INTRA_COMMUNITY_SUPPLY", totalCents: 10000, items: [{ vatRateBps: 0, lineTotalCents: 10000 }] }), s);
    expect(r.lines[0].counter).toBe("8120");
    expect(r.warnings[0]).toContain("Auslandsbezug");
  });
  it("dreht Soll/Haben bei negativen Beträgen (Gutschrift)", () => {
    const { lines } = buildInvoiceBookings(inv({ isSmallBusiness: true, totalCents: -2000, items: [{ vatRateBps: 0, lineTotalCents: -2000 }] }), s);
    expect(lines[0]).toMatchObject({ amountCents: 2000, side: "H" });
  });
  it("bucht Ausgaben als Aufwand an Bank; Vorsteuerschlüssel nur bei Regelbesteuerung", () => {
    const e = { date: new Date("2026-11-03T10:00:00Z"), vendor: "Filamentwerk", category: "Material", description: "PLA 5 kg", amountCents: 11900, vatRateBps: 1900 };
    expect(buildExpenseBooking(e, "A0001", s, false).lines[0]).toMatchObject({ amountCents: 11900, side: "S", account: "3200", counter: "1200", buKey: "9", text: "Filamentwerk PLA 5 kg" });
    expect(buildExpenseBooking(e, "A0001", s, true).lines[0].buKey).toBe("");
  });
  it("nimmt für unbekannte Kategorien das Standardkonto und warnt", () => {
    const r = buildExpenseBooking({ date: paid, vendor: "X", category: "Seltsam", description: null, amountCents: 1000, vatRateBps: 0 }, "A0002", s, true);
    expect(r.lines[0].account).toBe("4980");
    expect(r.warnings[0]).toContain("Seltsam");
  });
  it("hat Vorschläge für SKR04", () => {
    const k = defaultSettings("04");
    expect(k).toMatchObject({ bank: "1800", revenue19: "4400", revenueSmallBusiness: "4180" });
  });
});

describe("DATEV: Datei", () => {
  const lines: BookingLine[] = [
    { amountCents: 11900, side: "S", account: "1200", counter: "8400", buKey: "3", date: paid, ref: "RE-2026-0007", text: "RE-2026-0007 Muster GmbH" },
    { amountCents: 2550, side: "S", account: "4980", counter: "1200", buKey: "", date: new Date("2026-10-31T23:30:00Z"), ref: "A0001", text: "Büro; \"Test\"" },
  ];
  const range = { from: new Date("2025-12-31T23:00:00Z"), to: new Date("2026-12-31T23:00:00Z") };
  const text = buildDatevText(lines, s, range, "2026", new Date("2026-11-05T12:34:56.789Z"));
  const rows = text.split("\r\n");

  it("schreibt Kopfzeile, Spaltenzeile und Buchungen mit Windows-Zeilenenden", () => {
    expect(rows).toHaveLength(5); // Kopf, Spalten, 2 Buchungen, leeres Ende
    expect(rows[0].startsWith('"EXTF";700;21;"Buchungsstapel";12;20261105123456789;')).toBe(true);
    expect(rows[0].split(";")).toHaveLength(31);
    expect(rows[1].split(";")).toHaveLength(14);
  });
  it("trägt Berater, Mandant, Geschäftsjahr, Zeitraum und Kontenrahmen in den Kopf ein", () => {
    const f = rows[0].split(";");
    expect(f[10]).toBe("29098");
    expect(f[11]).toBe("55003");
    expect(f[12]).toBe("20260101");
    expect(f[13]).toBe("4");
    expect(f[14]).toBe("20260101");
    expect(f[15]).toBe("20261231");
    expect(f[26]).toBe('"03"');
  });
  it("formatiert Buchungszeilen mit Dezimalkomma, Belegdatum TTMM in deutscher Zeit und bereinigten Texten", () => {
    expect(rows[2]).toBe('119,00;"S";"EUR";;;;1200;8400;"3";0511;"RE-2026-0007";;;"RE-2026-0007 Muster GmbH"');
    // 31.10. 23:30 UTC = 01.11. 00:30 deutscher Zeit
    expect(rows[3]).toBe('25,50;"S";"EUR";;;;4980;1200;;0111;"A0001";;;"Büro Test"');
  });
  it("bereinigt Belegfeld und Buchungstext", () => {
    expect(belegfeld("re-2026/7 Ä_ß")).toBe("RE-2026/7 AE-SS");
    expect(belegfeld("x".repeat(50))).toHaveLength(36);
    expect(buchungstext('a;b"c\nd')).toBe("a b c d");
    expect(buchungstext("y".repeat(80))).toHaveLength(60);
  });
  it("kodiert als Windows-1252 (Umlaute ein Byte) und ersetzt das Euro-Zeichen", () => {
    const b = toAnsi("Büro äöüß € – x");
    expect(b[1]).toBe(0xfc); // ü
    expect(b.includes(0xe4)).toBe(true); // ä
    expect(b.toString("latin1")).toBe("Büro äöüß EUR - x");
  });
});
