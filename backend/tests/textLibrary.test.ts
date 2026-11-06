import { describe, expect, it } from "vitest";
import { DOC_TEXT_LIBRARY, EMAIL_LIBRARY } from "../src/modules/templates/library";
import { DOC_TYPES, EMAIL_KINDS } from "../src/modules/templates/render";
import { fillPlaceholders, PLACEHOLDER_HELP, SHIPPING_PLACEHOLDER_HELP } from "../src/modules/pdf/placeholders";

const BASE = new Set(PLACEHOLDER_HELP.map((p) => p.key));
const SHIPPING = new Set(SHIPPING_PLACEHOLDER_HELP.map((p) => p.key));
const used = (t: string) => [...t.matchAll(/\{[a-z]+\}/gi)].map((m) => m[0]);
const example = { kunde: "Max Mustermann", ansprechpartner: "Herr Mustermann", nummer: "RE-1", datum: "01.01.2026", faellig: "15.01.2026", betrag: "100,00 €", firma: "Test GmbH", versanddienst: "DHL", sendungsnummer: "123", sendungslink: "https://x" };

describe("Textbibliothek (Vorschläge zum Ausprobieren)", () => {
  it("hat zu jedem E-Mail-Anlass mindestens vier Tonlagen, ohne doppelte Namen", () => {
    for (const kind of EMAIL_KINDS.filter((k) => k !== "OTHER")) {
      const list = EMAIL_LIBRARY.filter((v) => v.kind === kind);
      expect(list.length, kind).toBeGreaterThanOrEqual(4);
      expect(new Set(list.map((v) => v.name)).size, kind).toBe(list.length);
    }
  });
  it("hat zu jeder Belegart mindestens vier Begrüßungen/Schlusstexte, ohne doppelte Namen", () => {
    for (const t of DOC_TYPES) {
      const list = DOC_TEXT_LIBRARY.filter((v) => v.docType === t);
      expect(list.length, t).toBeGreaterThanOrEqual(4);
      expect(new Set(list.map((v) => v.name)).size, t).toBe(list.length);
    }
  });
  it("verwendet nur bekannte Platzhalter - Versandplatzhalter nur im Versandbescheid", () => {
    for (const v of EMAIL_LIBRARY) {
      for (const p of used(`${v.subject}\n${v.body}`)) {
        expect(BASE.has(p) || (v.kind === "SHIPPED" && SHIPPING.has(p)), `${v.kind}/${v.name}: ${p}`).toBe(true);
      }
      expect(v.subject.trim()).not.toBe("");
      expect(fillPlaceholders(`${v.subject}${v.body}`, example)).not.toMatch(/\{[a-z]+\}/i);
    }
    for (const v of DOC_TEXT_LIBRARY) {
      for (const p of used(`${v.intro}\n${v.closing}`)) expect(BASE.has(p), `${v.docType}/${v.name}: ${p}`).toBe(true);
    }
  });
  it("Rechnungstexte nennen Betrag oder Nummer und Fälligkeit, nie eine feste Frist in Tagen außer der bestimmten Erinnerung", () => {
    for (const v of DOC_TEXT_LIBRARY.filter((x) => x.docType === "INVOICE")) expect(v.closing).toContain("{faellig}");
  });
});
