import { describe, it, expect } from "vitest";
import { BUILTIN_SHIPPED, EXAMPLE_TEMPLATES, dropEmptyShippingLines, placeholderValues, renderText, trackingLink } from "../src/modules/templates/render";

const doc = (over: Partial<Parameters<typeof placeholderValues>[0]> = {}) =>
  placeholderValues({ number: "RE-2026-0007", issueDate: new Date("2026-11-04T12:00:00Z"), due: new Date("2026-11-18T12:00:00Z"), totalCents: 11900, customer: { name: "Muster GmbH", contactName: "Frau Muster" }, ...over }, "HegePrint");

describe("E-Mail-Vorlagen", () => {
  it("füllt die Platzhalter eines Belegs", () => {
    const out = renderText("Hallo {ansprechpartner}, {kunde}: Rechnung {nummer} vom {datum} über {betrag}, fällig {faellig}. {firma}", doc());
    // Intl setzt vor das Euro-Zeichen ein geschütztes Leerzeichen
    expect(out.replace(/ /g, " ")).toBe("Hallo Frau Muster, Muster GmbH: Rechnung RE-2026-0007 vom 04.11.2026 über 119,00 €, fällig 18.11.2026. HegePrint");
  });
  it("nimmt ohne Ansprechpartner den Kundennamen und lässt unbekannte Platzhalter sichtbar stehen", () => {
    const out = renderText("Hallo {ansprechpartner} {unbekannt}", doc({ customer: { name: "Muster GmbH", contactName: null } }));
    expect(out).toBe("Hallo Muster GmbH {unbekannt}");
  });
  it("lässt ein fehlendes Datum samt 'bis zum' weg", () => {
    expect(renderText("Bitte zahlen bis zum {faellig}.", doc({ due: null }))).toBe("Bitte zahlen.");
  });
  it("baut Sendungslinks für bekannte Versanddienste und keine für Abholung", () => {
    expect(trackingLink("DHL", "00340434161094042557")).toContain("piececode=00340434161094042557");
    expect(trackingLink("DPD", "01234567890123")).toBe("https://tracking.dpd.de/status/de_DE/parcel/01234567890123");
    expect(trackingLink("GLS", "ABC123")).toContain("match=ABC123");
    expect(trackingLink("ABHOLUNG", "123")).toBe("");
    expect(trackingLink("DHL", "  ")).toBe("");
    expect(trackingLink(null, "123")).toBe("");
  });
  it("maskiert die Sendungsnummer im Link", () => {
    expect(trackingLink("DHL", "a b&c")).toContain("a%20b%26c");
  });
  it("füllt den Versandbescheid mit Dienst, Nummer und Link", () => {
    const v = doc({ carrier: "DPD", trackingNumber: "01234567890123" });
    const text = dropEmptyShippingLines(renderText(BUILTIN_SHIPPED.body, v));
    expect(text).toContain("Versanddienst: DPD");
    expect(text).toContain("Sendungsnummer: 01234567890123");
    expect(text).toContain("https://tracking.dpd.de/status/de_DE/parcel/01234567890123");
    expect(renderText(BUILTIN_SHIPPED.subject, v)).toBe("Ihre Bestellung RE-2026-0007 ist unterwegs");
  });
  it("entfernt leere Versandzeilen (z.B. bei Abholung ohne Nummer)", () => {
    const v = doc({ carrier: "ABHOLUNG", trackingNumber: null });
    const text = dropEmptyShippingLines(renderText(BUILTIN_SHIPPED.body, v));
    expect(text).toContain("Versanddienst: Abholung");
    expect(text).not.toMatch(/Sendungsnummer/);
    expect(text).not.toMatch(/Sendungsverfolgung/);
    expect(text).not.toMatch(/\n{3,}/);
  });
  it("hat Beispielvorlagen für alle Belegarten, jede mit genau einem Standard und bekannten Platzhaltern", () => {
    expect(new Set(EXAMPLE_TEMPLATES.map((t) => t.kind))).toEqual(new Set(["QUOTE", "ORDER_CONFIRMATION", "DELIVERY_NOTE", "INVOICE", "SHIPPED"]));
    for (const t of EXAMPLE_TEMPLATES) {
      expect(t.isDefault).toBe(true);
      const rendered = renderText(`${t.subject}\n${t.body}`, doc());
      expect(rendered).not.toMatch(/\{[a-z]+\}/i);
    }
  });
});
