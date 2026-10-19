import { describe, it, expect } from "vitest";
import { buildFacturXml } from "../src/modules/einvoice/facturx";

const company: any = { name: "Muster GmbH", street: "Weg 1", postalCode: "12345", city: "Berlin", country: "DE", vatId: "DE123456789", taxId: null, iban: "DE89 3704 0044 0532 0130 00", bic: "COBADEFFXXX", phone: "030 1", email: "a@b.de", managingDirector: "Max", registerNumber: "HRB 1" };
const customer: any = { name: "Kunde & Söhne", street: "Str 2", postalCode: "80331", city: "München", country: "DE", email: "k@k.de", vatId: null, leitwegId: null };
const item = (o: any = {}): any => ({ description: "Gehäuse", quantity: 2, unit: "Stk.", unitPriceCents: 5000, vatRateBps: 1900, lineTotalCents: 10000, isDownPaymentDeduction: false, ...o });
const base = (o: any = {}): any => ({ invoiceNumber: "RE-1", issueDate: new Date("2026-10-11"), dueDate: new Date("2026-10-25"), deliveryDate: null, isSmallBusiness: false, vatNoticeKey: null, isCancellationDocument: false, kind: "STANDARD", correctsInvoice: null, company, customer, items: [item()], totalCents: 11900, ...o });

describe("ZUGFeRD/Factur-X CII", () => {
  it("erzeugt EN-16931-Profil mit Summen, Datum und maskierten Sonderzeichen", () => {
    const xml = buildFacturXml(base());
    expect(xml).toContain("<ram:ID>urn:cen.eu:en16931:2017</ram:ID>");
    expect(xml).toContain("<ram:TypeCode>380</ram:TypeCode>");
    expect(xml).toContain('format="102">20261011<');
    expect(xml).toContain("<ram:GrandTotalAmount>119.00</ram:GrandTotalAmount>");
    expect(xml).toContain("<ram:DuePayableAmount>119.00</ram:DuePayableAmount>");
    expect(xml).toContain("Kunde &amp; Söhne");
    expect(xml).toContain("<ram:IBANID>DE89370400440532013000</ram:IBANID>");
  });
  it("Korrekturbeleg = 381 mit positiven Beträgen und Verweis auf die Originalrechnung", () => {
    const xml = buildFacturXml(base({ isCancellationDocument: true, correctsInvoice: { invoiceNumber: "RE-0" }, items: [item({ quantity: -2, lineTotalCents: -10000 })], totalCents: -11900 }));
    expect(xml).toContain("<ram:TypeCode>381</ram:TypeCode>");
    expect(xml).toContain("<ram:DuePayableAmount>119.00</ram:DuePayableAmount>");
    expect(xml).toContain("<ram:IssuerAssignedID>RE-0</ram:IssuerAssignedID>");
  });
  it("Schlussrechnung: Anzahlung als bereits gezahlter Betrag, Anzahlungsrechnung = 326", () => {
    const final = buildFacturXml(base({ kind: "FINAL", items: [item(), item({ description: "Abzug", quantity: 1, unitPriceCents: -5000, lineTotalCents: -5000, isDownPaymentDeduction: true })], totalCents: 5950, precedingInvoiceNumbers: ["RE-0"] }));
    expect(final).toContain("<ram:TotalPrepaidAmount>59.50</ram:TotalPrepaidAmount>");
    expect(final).toContain("<ram:DuePayableAmount>59.50</ram:DuePayableAmount>");
    expect(final).not.toContain("Abzug");
    expect(buildFacturXml(base({ kind: "DOWN_PAYMENT" }))).toContain("<ram:TypeCode>326</ram:TypeCode>");
  });
  it("Kleinunternehmer: Kategorie E mit Befreiungsgrund", () => {
    const xml = buildFacturXml(base({ isSmallBusiness: true, items: [item({ vatRateBps: 0 })], totalCents: 10000 }));
    expect(xml).toContain("<ram:CategoryCode>E</ram:CategoryCode>");
    expect(xml).toContain("§19 UStG");
  });
  it("verweigert Entwürfe ohne Nummer", () => {
    expect(() => buildFacturXml(base({ invoiceNumber: null }))).toThrow();
  });
});
