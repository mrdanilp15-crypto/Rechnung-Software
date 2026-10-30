import { describe, it, expect } from "vitest";
import { extractAmounts, extractDates, guessCategory, parseReceiptText } from "../src/modules/expenses/receiptParser";

const TODAY = new Date("2026-10-30T12:00:00Z");

const BAUMARKT = `
BAUHAUS Fachcentrum
Musterstraße 12
50667 Köln
Tel: 0221 123456

Kassenbon
Sandpapier Set 10 Stk       4,99 A
Holzleim 250g               3,49 A
Schrauben 4x40 200 Stk      6,95 A
Zwischensumme              15,43
SUMME EUR                  15,43
Bar                        20,00
Rückgeld                    4,57
MwSt 19%  Netto 12,97  MwSt 2,46
Datum: 12.10.2026  14:35
Vielen Dank für Ihren Einkauf
`;

const RECHNUNG = `
Filament Profis GmbH
Hauptstraße 5, 80331 München
www.filamentprofis.de

Rechnung
Rechnungsnummer: RE-2026-4711
Rechnungsdatum: 05.10.2026
Zahlbar bis: 19.10.2026

Pos Beschreibung              Menge  Preis
1   PETG schwarz 1kg            4    21,90
2   PLA weiß 1kg                2    19,90

Nettobetrag                          127,40
Umsatzsteuer 19 %                     24,21
Gesamtbetrag                         151,61
`;

describe("Belegerkennung: Beträge und Daten", () => {
  it("liest deutsche und englische Beträge, aber keine Datumsteile", () => {
    expect(extractAmounts("Gesamt 1.234,56 €")).toEqual([123456]);
    expect(extractAmounts("Total 12.50 EUR")).toEqual([1250]);
    expect(extractAmounts("Datum 05.10.26 14.35")).toEqual([]);
    expect(extractAmounts("Datum 05.10.2026")).toEqual([]);
  });
  it("behebt O statt 0 in Zahlen", () => {
    expect(extractAmounts("SUMME 1O,5O")).toEqual([1050]);
    expect(extractDates("Datum 12.1O.2O26", TODAY)).toEqual(["2026-10-12"]);
  });
  it("liest verschiedene Datumsformate und verwirft unmögliche", () => {
    expect(extractDates("05.10.2026", TODAY)).toEqual(["2026-10-05"]);
    expect(extractDates("5.10.26", TODAY)).toEqual(["2026-10-05"]);
    expect(extractDates("2026-10-05", TODAY)).toEqual(["2026-10-05"]);
    expect(extractDates("5. Oktober 2026", TODAY)).toEqual(["2026-10-05"]);
    expect(extractDates("31.02.2026", TODAY)).toEqual([]);
    expect(extractDates("05.10.1999", TODAY)).toEqual([]);
  });
});

describe("Belegerkennung: Kassenbon", () => {
  const r = parseReceiptText(BAUMARKT, { today: TODAY });
  it("nimmt die Summe, nicht Bargeld oder Rückgeld", () => {
    expect(r.amountCents).toBe(1543);
    expect(r.amountConfidence).toBe("high");
  });
  it("erkennt Datum, Steuersatz und Netto/Steuer", () => {
    expect(r.date).toBe("2026-10-12");
    expect(r.vatRateBps).toBe(1900);
    expect(r.netCents).toBe(1297);
    expect(r.vatCents).toBe(246);
  });
  it("erkennt Händler und Kategorie Material", () => {
    expect(r.vendor).toBe("BAUHAUS Fachcentrum");
    expect(r.category).toBe("Material");
  });
  it("nennt Alternativen zum Nachbessern", () => {
    expect(r.amountCandidates.map((a) => a.cents)).toEqual(expect.arrayContaining([1543, 2000, 457]));
  });
});

describe("Belegerkennung: Rechnung", () => {
  const r = parseReceiptText(RECHNUNG, { today: TODAY });
  it("nimmt Gesamtbetrag brutto", () => {
    expect(r.amountCents).toBe(15161);
    expect(r.vatRateBps).toBe(1900);
    expect(r.vatConfidence).toBe("high");
    expect(r.netCents).toBe(12740);
  });
  it("nimmt das Rechnungsdatum, nicht die Fälligkeit", () => {
    expect(r.date).toBe("2026-10-05");
  });
  it("erkennt Firma und Rechnungsnummer", () => {
    expect(r.vendor).toBe("Filament Profis GmbH");
    expect(r.invoiceNumber).toBe("RE-2026-4711");
    expect(r.category).toBe("Material");
  });
  it("bevorzugt bekannte Händler aus der Datenbank", () => {
    const known = parseReceiptText(RECHNUNG, { today: TODAY, knownVendors: ["Filament Profis"] });
    expect(known.vendor).toBe("Filament Profis");
    expect(known.vendorConfidence).toBe("high");
  });
});

describe("Belegerkennung: Sonderfälle", () => {
  it("Betrag in der Zeile nach dem Stichwort (Tabellenlayout)", () => {
    const r = parseReceiptText("Shop XY\nGesamtbetrag\n42,00 EUR\n", { today: TODAY });
    expect(r.amountCents).toBe(4200);
  });
  it("7 % Steuersatz über die Gegenprobe", () => {
    const r = parseReceiptText("Buchhandlung Lesefreude\nNetto 18,69\nSteuer 1,31\nSumme 20,00\n", { today: TODAY });
    expect(r.amountCents).toBe(2000);
    expect(r.vatRateBps).toBe(700);
    expect(r.vatConfidence).toBe("high");
  });
  it("ohne erkennbaren Steuersatz: Hinweis statt Raten", () => {
    const r = parseReceiptText("Laden\nSumme 10,00\n01.10.2026\n", { today: TODAY });
    expect(r.vatRateBps).toBeNull();
    expect(r.warnings.join(" ")).toMatch(/Steuersatz nicht erkannt/);
  });
  it("Kleinunternehmer-Hinweis ergibt 0 %", () => {
    const r = parseReceiptText("Laden\nGesamt 10,00\nGemäß § 19 UStG wird keine Umsatzsteuer berechnet.\n", { today: TODAY });
    expect(r.vatRateBps).toBe(0);
  });
  it("mehrere Steuersätze werden gemeldet", () => {
    const r = parseReceiptText("Markt\nA 7% 5,00\nB 19% 10,00\nSumme 15,00\n", { today: TODAY });
    expect(r.warnings.join(" ")).toMatch(/Mehrere Steuersätze/);
  });
  it("Summenzeilen sind kein Händlername", () => {
    const r = parseReceiptText("Gesamtbetrag EUR 561,23\nMwSt 19% 9,78\nDatum 03.10.2026\n", { today: TODAY });
    expect(r.vendor).toBeNull();
  });
  it("leerer Text liefert nichts statt Unsinn", () => {
    const r = parseReceiptText("", { today: TODAY });
    expect(r.amountCents).toBeNull();
    expect(r.date).toBeNull();
    expect(r.vendor).toBeNull();
    expect(r.warnings.join(" ")).toMatch(/fast kein Text/);
  });
  it("Kategorien", () => {
    expect(guessCategory("super e10 tankstelle aral")).toBe("Fahrtkosten");
    expect(guessCategory("adobe lizenz abonnement")).toBe("Software");
    expect(guessCategory("raummiete oktober")).toBe("Miete");
    expect(guessCategory("blumen und kuchen")).toBeNull();
  });
});
