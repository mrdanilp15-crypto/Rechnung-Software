import { describe, expect, it } from "vitest";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { renderDocumentPdf } from "../src/modules/pdf/documentTemplate";

/** Die Unterschriftszeile auf dem Lieferschein erscheint nur, wenn sie in den Firmeneinstellungen eingeschaltet ist (bei Versand unterschreibt niemand). */
const base: any = {
  docTypeLabel: { de: "Lieferschein", en: "Delivery Note" },
  numberLabel: { de: "Nr", en: "No" },
  documentNumber: "LS-1",
  issueDate: new Date("2026-01-15T12:00:00Z"),
  locale: "de",
  recipient: { name: "Max Mustermann", street: "Weg 1", postalCode: "12345", city: "Ort", country: "DE" },
  items: [{ position: 1, description: "Teil", quantity: 1, unit: "Stk." }],
  showPrices: false,
};

async function text(deliveryNoteReceipt: boolean | undefined) {
  const buf = await renderDocumentPdf({ ...base, branding: { name: "Test GmbH", deliveryNoteReceipt } });
  return (await pdfParse(buf)).text as string;
}

describe("Lieferschein: Empfangsbestätigung", () => {
  it("steht nicht auf dem Lieferschein, wenn nicht eingeschaltet (Standard)", async () => {
    expect(await text(false)).not.toContain("Ware/Leistung vollständig");
    expect(await text(undefined)).not.toContain("Ware/Leistung vollständig");
  });
  it("steht darauf, wenn eingeschaltet", async () => {
    expect(await text(true)).toContain("Ware/Leistung vollständig");
  });
});
