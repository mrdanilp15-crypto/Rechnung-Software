import { describe, it, expect } from "vitest";
import { countryCode, parseDate, parseEtsyCsv, parseMoneyToCents } from "../src/modules/orderImport/etsy";

const ITEMS_EN = [
  "Sale Date,Item Name,Buyer,Quantity,Price,Coupon Code,Discount Amount,Order Shipping,Currency,Order ID,Ship Name,Ship Address1,Ship Address2,Ship City,Ship State,Ship Zipcode,Ship Country,Variations",
  '10/05/2026,Vase Spirale,anna99,2,12.50,,0.00,4.90,EUR,3001,Anna Beispiel,Hauptstr. 1,,Köln,,50667,Germany,"Farbe: Schwarz"',
  "10/05/2026,Untersetzer Set,anna99,1,\"8,00\",,0.00,4.90,EUR,3001,Anna Beispiel,Hauptstr. 1,,Köln,,50667,Germany,",
  "10/06/2026,Lampe,bob,1,40.00,SOMMER10,4.00,0.00,EUR,3002,Bob Muster,Ring 5,Hinterhaus,Wien,,1010,Austria,",
].join("\n");

describe("Etsy-CSV: Hilfsfunktionen", () => {
  it("liest Geldbeträge in beiden Schreibweisen", () => {
    expect(parseMoneyToCents("12.50")).toBe(1250);
    expect(parseMoneyToCents("12,50")).toBe(1250);
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
    expect(parseMoneyToCents("1,234.56")).toBe(123456);
    expect(parseMoneyToCents("€ 8,00")).toBe(800);
    expect(parseMoneyToCents("EUR 7.5")).toBe(750);
    expect(parseMoneyToCents("")).toBe(0);
    expect(parseMoneyToCents("abc")).toBe(0);
    expect(parseMoneyToCents("-3,20")).toBe(-320);
  });
  it("liest Datumsformate (Etsy englisch: Monat/Tag/Jahr)", () => {
    expect(parseDate("10/05/2026")).toBe("2026-10-05");
    expect(parseDate("10/05/26")).toBe("2026-10-05");
    expect(parseDate("05.10.2026")).toBe("2026-10-05");
    expect(parseDate("2026-10-05 12:30")).toBe("2026-10-05");
    expect(parseDate("")).toBeNull();
    expect(parseDate("gestern")).toBeNull();
  });
  it("erkennt Länder", () => {
    expect(countryCode("Germany")).toEqual({ code: "DE", known: true });
    expect(countryCode("Österreich")).toEqual({ code: "AT", known: true });
    expect(countryCode("at")).toEqual({ code: "AT", known: true });
    expect(countryCode("Atlantis")).toEqual({ code: "DE", known: false });
  });
});

describe("Etsy-CSV: Bestellte Artikel", () => {
  const { orders } = parseEtsyCsv(ITEMS_EN);
  it("bündelt Artikelzeilen je Bestellnummer", () => {
    expect(orders.map((o) => o.orderId)).toEqual(["3001", "3002"]);
    expect(orders[0].items).toHaveLength(2);
  });
  it("übernimmt Kunde, Adresse, Datum, Varianten", () => {
    const o = orders[0];
    expect(o.buyerName).toBe("Anna Beispiel");
    expect([o.street, o.postalCode, o.city, o.country]).toEqual(["Hauptstr. 1", "50667", "Köln", "DE"]);
    expect(o.date).toBe("2026-10-05");
    expect(o.items[0]).toEqual({ description: "Vase Spirale\nFarbe: Schwarz", quantity: 2, unitPriceCents: 1250 });
    expect(o.items[1].unitPriceCents).toBe(800);
  });
  it("zählt Versand einmal je Bestellung (nicht je Artikelzeile)", () => {
    expect(orders[0].shippingCents).toBe(490);
    expect(orders[0].totalCents).toBe(2 * 1250 + 800 + 490);
  });
  it("warnt bei Gutscheinen und fremder Adresse, fasst Zusatzzeile zusammen", () => {
    expect(orders[1].warnings.some((w) => w.includes("SOMMER10"))).toBe(true);
    expect(orders[1].street).toBe("Ring 5, Hinterhaus");
    expect(orders[1].country).toBe("AT");
  });
});

describe("Etsy-CSV: weitere Formate", () => {
  it("liest deutsche Spaltennamen mit Semikolon", () => {
    const csv = "Verkaufsdatum;Artikelname;Menge;Preis;Bestellnummer;Versandname;Versandland;Währung\n05.10.2026;Halter;3;4,50;77;Max Mustermann;Deutschland;EUR";
    const { orders } = parseEtsyCsv(csv);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ orderId: "77", buyerName: "Max Mustermann", country: "DE", date: "2026-10-05" });
    expect(orders[0].items[0]).toMatchObject({ description: "Halter", quantity: 3, unitPriceCents: 450 });
  });
  it("legt bei einer Datei ohne Artikel eine Sammelposition mit Hinweis an", () => {
    const csv = "Sale Date,Order ID,Full Name,Order Value,Shipping,Currency\n10/05/2026,9,Eva Test,23.40,3.90,EUR";
    const { orders } = parseEtsyCsv(csv);
    expect(orders[0].items).toEqual([{ description: "Etsy-Bestellung 9", quantity: 1, unitPriceCents: 2340 }]);
    expect(orders[0].shippingCents).toBe(390);
    expect(orders[0].warnings.some((w) => w.includes("Sammelposition"))).toBe(true);
  });
  it("warnt bei anderer Währung und leerer Datei", () => {
    const csv = "Item Name,Quantity,Price,Order ID,Currency\nX,1,10.00,1,USD";
    expect(parseEtsyCsv(csv).orders[0].warnings.some((w) => w.includes("USD"))).toBe(true);
    expect(parseEtsyCsv("").orders).toEqual([]);
  });
});
