import { describe, expect, it } from "vitest";
import { missingIssuerData } from "../src/modules/tax/compliance";

const full = { name: "HegePrint", street: "Weg 1", postalCode: "48143", city: "Münster", taxId: "337/5000/1234", vatId: null };

describe("missingIssuerData", () => {
  it("alles da: nichts fehlt", () => {
    expect(missingIssuerData(full)).toEqual([]);
  });

  it("USt-IdNr. statt Steuernummer reicht", () => {
    expect(missingIssuerData({ ...full, taxId: null, vatId: "DE123456789" })).toEqual([]);
  });

  it("meldet fehlende Steuernummer und Anschrift", () => {
    expect(missingIssuerData({ ...full, taxId: " ", city: "" })).toEqual(["vollständige Anschrift (Straße, PLZ, Ort)", "Steuernummer oder USt-IdNr."]);
  });
});
