import { describe, expect, it } from "vitest";
import { determineVatTreatment } from "../src/modules/tax/euVat";
import { buildInvoiceFinancials } from "../src/modules/invoices/build";
import { buildXRechnungXml, getXRechnungBlockers, unitCodeFor } from "../src/modules/einvoice/xrechnung";
import { renderDocumentPdf } from "../src/modules/pdf/documentTemplate";

const company = { isSmallBusiness: false, country: "DE" };
const euBusiness = { type: "GEWERBLICH", country: "FR", vatId: "FR12345678901" };

describe("determineVatTreatment", () => {
  it("Warenlieferung an EU-Unternehmer = steuerfreie innergemeinschaftliche Lieferung (NICHT Reverse-Charge)", () => {
    expect(determineVatTreatment("DE", euBusiness, "GOODS")).toEqual({ forceZeroVat: true, noticeKey: "INTRA_COMMUNITY_SUPPLY" });
  });
  it("Dienstleistung an EU-Unternehmer = Reverse-Charge", () => {
    expect(determineVatTreatment("DE", euBusiness, "SERVICE")).toEqual({ forceZeroVat: true, noticeKey: "REVERSE_CHARGE" });
  });
  it("EU-Unternehmer ohne USt-IdNr. und EU-Privatkunden bleiben steuerpflichtig", () => {
    expect(determineVatTreatment("DE", { ...euBusiness, vatId: null }, "GOODS").forceZeroVat).toBe(false);
    expect(determineVatTreatment("DE", { type: "PRIVAT", country: "FR", vatId: null }, "GOODS").forceZeroVat).toBe(false);
  });
  it("Drittland: Waren = Ausfuhr, Dienstleistung B2B = nicht steuerbar, Dienstleistung B2C = steuerpflichtig", () => {
    expect(determineVatTreatment("DE", { type: "PRIVAT", country: "US" }, "GOODS").noticeKey).toBe("EXPORT");
    expect(determineVatTreatment("DE", { type: "GEWERBLICH", country: "US" }, "SERVICE").noticeKey).toBe("NOT_TAXABLE_ABROAD");
    expect(determineVatTreatment("DE", { type: "PRIVAT", country: "US" }, "SERVICE").forceZeroVat).toBe(false);
  });
  it("Inlandskunden werden nie befreit", () => {
    expect(determineVatTreatment("DE", { type: "GEWERBLICH", country: "DE", vatId: "DE123456789" }, "GOODS").forceZeroVat).toBe(false);
  });
});

describe("buildInvoiceFinancials", () => {
  const items = [{ description: "Teil", quantity: 2, unit: "Stk.", unitPriceCents: 1000, vatRateBps: 1900 }];
  it("setzt bei innergemeinschaftlicher Lieferung alle Positionen auf 0% und den Hinweisschlüssel", () => {
    const f = buildInvoiceFinancials(company, euBusiness, items, "GOODS");
    expect(f.vatNoticeKey).toBe("INTRA_COMMUNITY_SUPPLY");
    expect(f.vatTotalCents).toBe(0);
    expect(f.totalCents).toBe(2000);
    expect(f.itemsCreate[0].vatRateBps).toBe(0);
  });
  it("Kleinunternehmer: keine USt., kein Auslandshinweis", () => {
    const f = buildInvoiceFinancials({ isSmallBusiness: true, country: "DE" }, euBusiness, items);
    expect(f.vatTotalCents).toBe(0);
    expect(f.vatNoticeKey).toBeNull();
    expect(f.isSmallBusiness).toBe(true);
  });
  it("Regelfall: 19% USt.", () => {
    const f = buildInvoiceFinancials(company, { type: "PRIVAT", country: "DE", vatId: null }, items);
    expect(f.vatTotalCents).toBe(380);
    expect(f.totalCents).toBe(2380);
  });
});

describe("XRechnung", () => {
  const base: any = {
    id: "11111111-1111-1111-1111-111111111111",
    invoiceNumber: "RE-2026-0001",
    issueDate: new Date("2026-03-01"),
    dueDate: new Date("2026-03-15"),
    deliveryDate: null,
    isSmallBusiness: false,
    vatNoticeKey: null,
    isCancellationDocument: false,
    correctsInvoiceId: null,
    correctsInvoice: null,
    subtotalCents: 10000 + 10000,
    vatTotalCents: 1900 + 700,
    totalCents: 22600,
    company: { name: "Muster GmbH", street: "Str. 1", postalCode: "10115", city: "Berlin", country: "DE", vatId: "DE123456789", taxId: "12/345/67890", iban: "DE89370400440532013000", bic: "COBADEFFXXX", phone: "+49 30 1", email: "a@muster.de", managingDirector: "Max", registerNumber: "HRB 1" },
    customer: { name: "Kunde AG", street: "Weg 2", postalCode: "80331", city: "München", country: "DE", email: "k@kunde.de", vatId: null, leitwegId: null },
    items: [
      { description: "A", quantity: 1, unit: "Stk.", unitPriceCents: 10000, vatRateBps: 1900, lineTotalCents: 10000 },
      { description: "B", quantity: 2, unit: "kg", unitPriceCents: 5000, vatRateBps: 700, lineTotalCents: 10000 },
    ],
  };

  it("erzeugt je Steuersatz ein TaxSubtotal und Einheitencodes", () => {
    const xml = buildXRechnungXml(base);
    expect(xml.match(/<cac:TaxSubtotal>/g)).toHaveLength(2);
    expect(xml).toContain('unitCode="KGM"');
    expect(xml).toContain("<cbc:ActualDeliveryDate>2026-03-01</cbc:ActualDeliveryDate>");
    expect(xml).toContain("<cbc:Telephone>+49 30 1</cbc:Telephone>");
  });
  it("verweist bei Korrekturbelegen auf die Rechnungsnummer, nicht auf die interne ID", () => {
    const xml = buildXRechnungXml({ ...base, isCancellationDocument: true, correctsInvoiceId: "uuid-xyz", correctsInvoice: { invoiceNumber: "RE-2026-0000" } });
    expect(xml).toContain("<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>");
    expect(xml).toContain("<cbc:ID>RE-2026-0000</cbc:ID>");
    expect(xml).not.toContain("uuid-xyz");
  });
  it("innergemeinschaftliche Lieferung: Kategorie K mit Befreiungscode", () => {
    const xml = buildXRechnungXml({ ...base, vatNoticeKey: "INTRA_COMMUNITY_SUPPLY", vatTotalCents: 0, items: base.items.map((i: any) => ({ ...i, vatRateBps: 0 })) });
    expect(xml).toContain("<cbc:ID>K</cbc:ID>");
    expect(xml).toContain("vatex-eu-ic");
  });
  it("meldet fehlende Pflichtangaben statt eine ungültige Datei zu liefern", () => {
    const blockers = getXRechnungBlockers({ company: { ...base.company, phone: null, email: null, iban: null }, customer: { ...base.customer, email: null } } as any);
    expect(blockers.length).toBe(4);
  });
  it("kennt gängige Einheiten", () => {
    expect(unitCodeFor("Std.")).toBe("HUR");
    expect(unitCodeFor("irgendwas")).toBe("C62");
  });
});

describe("PDF-Erzeugung", () => {
  const baseInput = {
    docTypeLabel: { de: "Rechnung", en: "Invoice" },
    documentNumber: "RE-2026-0001",
    issueDate: new Date("2026-03-01"),
    locale: "de" as const,
    branding: { name: "Muster GmbH", street: "Str. 1", postalCode: "10115", city: "Berlin", iban: "DE89370400440532013000", primaryColor: "kein-gueltiger-wert" },
    recipient: { name: "Łukasz Kowalski Sp. z o.o.", vatId: "PL1234567890" },
    items: [{ position: 1, description: "Sehr langer Text ".repeat(60), quantity: 0.017, unit: "kg", unitPriceCents: 2499, vatRateBps: 1900, lineTotalCents: 42 }],
    subtotalCents: 42,
    vatBreakdown: { 1900: 8 },
    vatTotalCents: 8,
    totalCents: 50,
    showPrices: true,
    showSepaQr: true,
  };

  it("liefert ein gültiges PDF auch bei ungültiger Firmenfarbe, Sonderzeichen und sehr langem Text", async () => {
    const pdf = await renderDocumentPdf(baseInput);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it("erzeugt für Entwürfe, Kleinunternehmer und Lieferscheine ohne Fehler ein PDF", async () => {
    for (const variant of [{ isDraft: true }, { isSmallBusiness: true }, { showPrices: false, showSepaQr: false }]) {
      const pdf = await renderDocumentPdf({ ...baseInput, ...variant });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    }
  });

  it("bricht viele Positionen auf mehrere Seiten um", async () => {
    const items = Array.from({ length: 80 }, (_, i) => ({ ...baseInput.items[0], position: i + 1, description: `Position ${i + 1}` }));
    const pdf = await renderDocumentPdf({ ...baseInput, items });
    const pageCount = (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    expect(pageCount).toBeGreaterThanOrEqual(2);
  });
});
