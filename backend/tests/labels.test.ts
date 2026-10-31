import { describe, it, expect } from "vitest";
import { LABEL_SIZES, recipientLines, renderLabelPdf, senderLine } from "../src/modules/labels/router";

describe("Versandetikett", () => {
  it("Empfängerzeilen: Inland ohne Land, Ausland mit Land in Großbuchstaben", () => {
    expect(recipientLines({ name: "Anna Beispiel", street: "Hauptstr. 1", postalCode: "50667", city: "Köln", country: "DE" })).toEqual(["Anna Beispiel", "Hauptstr. 1", "50667 Köln"]);
    expect(recipientLines({ name: "Muster GmbH", contactName: "Max Muster", street: "Ring 5", postalCode: "1010", city: "Wien", country: "AT" })).toEqual(["Muster GmbH", "z. H. Max Muster", "Ring 5", "1010 Wien", "ÖSTERREICH"]);
    expect(recipientLines({ name: "X", city: "Y", country: "JP" }).at(-1)).toBe("JP");
  });
  it("Absenderzeile", () => {
    expect(senderLine({ name: "HegePrint", street: "Weg 2", postalCode: "12345", city: "Ort" })).toBe("HegePrint · Weg 2 · 12345 Ort");
    expect(senderLine({ name: "HegePrint" })).toBe("HegePrint");
  });
  it.each(["a6", "10x15", "62x100"] as const)("erzeugt ein PDF in Größe %s", async (size) => {
    const pdf = await renderLabelPdf({ size, sender: "HegePrint · Weg 2 · 12345 Ort", to: { name: "Anna Beispiel", street: "Hauptstr. 1", postalCode: "50667", city: "Köln" }, ref: "Rechnung RE-1" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const m = pdf.toString("latin1").match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeCloseTo(LABEL_SIZES[size].w, 0);
    expect(Number(m![2])).toBeCloseTo(LABEL_SIZES[size].h, 0);
  });
  it("sehr lange Zeilen sprengen das Etikett nicht (einseitig)", async () => {
    const pdf = await renderLabelPdf({ size: "62x100", sender: "x", to: { name: "Sehr Langer Firmenname Gesellschaft mit beschränkter Haftung & Co. KG", street: "Eine sehr lange Straße 123456", postalCode: "12345", city: "Ort" } });
    expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
  });
});
