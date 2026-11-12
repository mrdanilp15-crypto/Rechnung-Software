import { describe, expect, it } from "vitest";
import { hasMapAddress, mapsRouteUrl, mapsSearchUrl, parseAddressBlock } from "../../frontend/src/lib/address";
import { centsToField, eurToCents, fromGross, fromNet, fromVat } from "../../frontend/src/lib/tax";

describe("Adresse aus eingefügtem Text", () => {
  it("einzeilig: Straße, PLZ Ort", () => {
    expect(parseAddressBlock("Musterstraße 12, 12345 Musterstadt")).toEqual({ street: "Musterstraße 12", postalCode: "12345", city: "Musterstadt" });
  });
  it("mehrzeilig mit Name und Land: Name wird nicht zur Straße", () => {
    expect(parseAddressBlock("Max Mustermann\nMusterstraße 12\n12345 Musterstadt\nÖsterreich")).toEqual({ street: "Musterstraße 12", postalCode: "12345", city: "Musterstadt", country: "AT" });
  });
  it("ein Name vor der PLZ wird nicht als Straße genommen", () => {
    expect(parseAddressBlock("Max Mustermann, 12345 Musterstadt")).toEqual({ postalCode: "12345", city: "Musterstadt" });
  });
  it("Länderkürzel vor der PLZ und vierstellige PLZ", () => {
    expect(parseAddressBlock("Bahnhofstr. 3\nCH-8001 Zürich")).toMatchObject({ street: "Bahnhofstr. 3", postalCode: "8001", city: "Zürich", country: "CH" });
    expect(parseAddressBlock("D-48143 Münster")).toMatchObject({ postalCode: "48143", city: "Münster", country: "DE" });
  });
  it("ohne PLZ: nur eine Zeile mit Hausnummer als Straße, sonst nichts", () => {
    expect(parseAddressBlock("Hauptstraße 5")).toEqual({ street: "Hauptstraße 5" });
    expect(parseAddressBlock("hallo")).toBeNull();
    expect(parseAddressBlock("   ")).toBeNull();
  });
  it("Google-Maps-Links enthalten die Adresse kodiert", () => {
    const a = { street: "Alter Steinweg 5", postalCode: "48143", city: "Münster", country: "DE" };
    expect(mapsSearchUrl(a)).toBe("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Alter Steinweg 5, 48143 Münster, Deutschland"));
    expect(mapsRouteUrl({ ...a, country: "AT" })).toContain("destination=" + encodeURIComponent("Alter Steinweg 5, 48143 Münster, AT"));
    expect(hasMapAddress(a)).toBe(true);
    expect(hasMapAddress({ street: "", city: "X" })).toBe(false);
  });
});

describe("Brutto, Netto und Steuer umrechnen", () => {
  it("aus Brutto: 119,00 € bei 19 % = 100,00 netto + 19,00 Steuer", () => {
    expect(fromGross(11900, 1900)).toEqual({ grossCents: 11900, netCents: 10000, vatCents: 1900 });
  });
  it("aus Brutto mit 7 % und Rundung: 10,00 € = 9,35 netto + 0,65 Steuer", () => {
    expect(fromGross(1000, 700)).toEqual({ grossCents: 1000, netCents: 935, vatCents: 65 });
  });
  it("aus Netto: 100,00 € bei 19 % = 119,00 brutto", () => {
    expect(fromNet(10000, 1900)).toEqual({ netCents: 10000, vatCents: 1900, grossCents: 11900 });
  });
  it("aus dem Steuerbetrag: 19,00 € Steuer bei 19 % = 100,00 netto, 119,00 brutto", () => {
    expect(fromVat(1900, 1900)).toEqual({ vatCents: 1900, netCents: 10000, grossCents: 11900 });
  });
  it("ohne Steuersatz: Brutto = Netto, kein Steuerbetrag", () => {
    expect(fromGross(5000, 0)).toEqual({ grossCents: 5000, netCents: 5000, vatCents: 0 });
    expect(fromNet(5000, 0)).toEqual({ netCents: 5000, vatCents: 0, grossCents: 5000 });
    expect(fromVat(500, 0)).toEqual({ vatCents: 0, netCents: 0, grossCents: 0 });
  });
  it("Brutto und Netto ergeben immer wieder dieselbe Summe (Netto + Steuer = Brutto)", () => {
    for (const rate of [700, 1900]) for (let g = 1; g <= 2000; g += 37) {
      const s = fromGross(g, rate);
      expect(s.netCents + s.vatCents).toBe(g);
    }
  });
  it("Eingabe mit Komma oder Punkt, Ausgabe fürs Feld", () => {
    expect(eurToCents("12,34")).toBe(1234);
    expect(eurToCents("12.5")).toBe(1250);
    expect(eurToCents("abc")).toBe(0);
    expect(centsToField(1234)).toBe("12.34");
  });
});
