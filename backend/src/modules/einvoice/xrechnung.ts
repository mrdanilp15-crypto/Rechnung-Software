import type { Company, Customer, Invoice, InvoiceItem } from "@prisma/client";

/**
 * Erzeugt eine XRechnung (UBL 2.1 Invoice, konform zum CIUS "XRechnung 3.0" auf Basis
 * von EN 16931) aus einer bestehenden Rechnung. Deckt die für den hier abgebildeten
 * Regelfall (inländische Rechnung, Kleinunternehmerregelung, innergemeinschaftlicher
 * Reverse-Charge, Ausfuhrlieferung) nötigen Pflichtfelder ab.
 *
 * WICHTIG - bitte vor dem produktiven Einsatz beachten:
 * Diese Implementierung wurde nach der öffentlich dokumentierten EN16931-/XRechnung-
 * Spezifikation erstellt, aber NICHT gegen den offiziellen KoSIT-Validator geprüft (dafür
 * fehlt in dieser Entwicklungsumgebung der Zugriff auf das Prüf-Tool). Vor dem ersten
 * Versand einer echten XRechnung an einen (insbesondere öffentlichen) Auftraggeber
 * unbedingt eine Beispieldatei über https://xrechnung.iso.gv.at oder den KoSIT-
 * Validator prüfen. Bei öffentlichen Auftraggebern zusätzlich unbedingt die vom
 * Auftraggeber mitgeteilte Leitweg-ID beim Kunden hinterlegen (Pflichtfeld BT-10).
 */

type InvoiceForXRechnung = Invoice & { items: InvoiceItem[]; customer: Customer; company: Company };

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function euros(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * UNCL5305-Steuerkategorie + Freitext-Befreiungsgrund je nach USt.-Behandlung - gilt
 * einheitlich für die gesamte Rechnung, da Kleinunternehmerregelung/Reverse-Charge/
 * Ausfuhr beim Erstellen bereits auf ALLE Positionen einheitlich angewendet werden
 * (siehe modules/invoices/router.ts, forceZeroVat). Nur im normalen Regelfall (keine
 * dieser Sonderregeln) können innerhalb einer Rechnung mehrere unterschiedliche
 * Steuersätze (19%/7%) vorkommen - dafür wird unten je Satz ein eigenes TaxSubtotal
 * erzeugt, alle mit Kategorie "S" (Regelsteuersatz), nur der Prozentsatz unterscheidet sich.
 */
function taxCategoryId(invoice: InvoiceForXRechnung): { id: string; exemptionReason: string | null } {
  if (invoice.isSmallBusiness) {
    return { id: "E", exemptionReason: "Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung)." };
  }
  if (invoice.vatNoticeKey === "REVERSE_CHARGE") {
    return { id: "AE", exemptionReason: "Steuerschuldnerschaft des Leistungsempfängers gem. §13b UStG." };
  }
  if (invoice.vatNoticeKey === "EXPORT") {
    return { id: "G", exemptionReason: "Steuerfreie Ausfuhrlieferung gem. §4 Nr. 1a UStG." };
  }
  return { id: "S", exemptionReason: null };
}

/** Gruppiert Positionen nach USt.-Satz - je Gruppe eine eigene Netto-/USt.-Summe für
 * ein eigenes TaxSubtotal (EN16931 verlangt eine Aufschlüsselung je Steuersatz, nicht
 * nur eine einzelne Gesamtsumme). Beträge werden absolut ausgegeben (siehe Kommentar
 * bei buildXRechnungXml zu Korrekturbelegen). */
function groupByVatRate(items: InvoiceItem[]): { rateBps: number; netCents: number; vatCents: number }[] {
  const groups = new Map<number, { netCents: number; vatCents: number }>();
  for (const item of items) {
    const net = Math.abs(item.lineTotalCents);
    const vat = Math.round((net * item.vatRateBps) / 10000);
    const existing = groups.get(item.vatRateBps) ?? { netCents: 0, vatCents: 0 };
    groups.set(item.vatRateBps, { netCents: existing.netCents + net, vatCents: existing.vatCents + vat });
  }
  return [...groups.entries()].map(([rateBps, sums]) => ({ rateBps, ...sums }));
}

export function buildXRechnungXml(invoice: InvoiceForXRechnung): string {
  if (!invoice.invoiceNumber) throw new Error("XRechnung kann nur für eine bereits finalisierte Rechnung (mit Nummer) erzeugt werden");
  const { company, customer } = invoice;
  const taxCategory = taxCategoryId(invoice);
  const rateGroups = groupByVatRate(invoice.items);
  const sellerTaxId = company.vatId || company.taxId || "";
  const isCreditNote = invoice.isCancellationDocument;
  const invoiceTypeCode = isCreditNote ? 381 : 380; // 380 = Rechnung, 381 = Gutschrift/Korrekturrechnung

  const lines = invoice.items
    .map(
      (item, idx) => `  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${Math.abs(item.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">${euros(Math.abs(item.lineTotalCents))}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(item.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${taxCategory.id}</cbc:ID>
        <cbc:Percent>${(item.vatRateBps / 100).toFixed(2)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="EUR">${euros(item.unitPriceCents)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`
    )
    .join("\n");

  // BT-10 Buyer Reference ist in XRechnung ein Pflichtfeld - bei öffentlichen Auftrag-
  // gebern MUSS hier die vom Auftraggeber mitgeteilte Leitweg-ID stehen. Ohne
  // hinterlegte Leitweg-ID wird ersatzweise die eigene Rechnungsnummer verwendet, damit
  // das Feld nicht leer bleibt - das ersetzt aber keine echte Leitweg-ID, falls der
  // Empfänger eine benötigt (unbedingt vorher beim Kunden erfragen).
  const buyerReference = customer.leitwegId || invoice.invoiceNumber;

  const paymentMeans = company.iban
    ? `  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(company.iban)}</cbc:ID>
      <cbc:Name>${esc(company.name)}</cbc:Name>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>\n`
    : "";

  const exemptionReasonXml = taxCategory.exemptionReason
    ? `\n        <cbc:TaxExemptionReason>${esc(taxCategory.exemptionReason)}</cbc:TaxExemptionReason>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(invoice.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${isoDate(invoice.issueDate)}</cbc:IssueDate>
${invoice.dueDate ? `  <cbc:DueDate>${isoDate(invoice.dueDate)}</cbc:DueDate>\n` : ""}  <cbc:InvoiceTypeCode>${invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${esc(buyerReference)}</cbc:BuyerReference>
${invoice.correctsInvoiceId ? `  <cac:BillingReference>\n    <cac:InvoiceDocumentReference>\n      <cbc:ID>${esc(invoice.correctsInvoiceId)}</cbc:ID>\n    </cac:InvoiceDocumentReference>\n  </cac:BillingReference>\n` : ""}  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${esc(company.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(company.street)}</cbc:StreetName>
        <cbc:CityName>${esc(company.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(company.postalCode)}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>${esc(company.country)}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(sellerTaxId)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(company.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${esc(customer.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(customer.street)}</cbc:StreetName>
        <cbc:CityName>${esc(customer.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(customer.postalCode)}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>${esc(customer.country)}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
${customer.vatId ? `      <cac:PartyTaxScheme>\n        <cbc:CompanyID>${esc(customer.vatId)}</cbc:CompanyID>\n        <cac:TaxScheme>\n          <cbc:ID>VAT</cbc:ID>\n        </cac:TaxScheme>\n      </cac:PartyTaxScheme>\n` : ""}      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(customer.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
${paymentMeans}  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${euros(Math.abs(invoice.vatTotalCents))}</cbc:TaxAmount>
${rateGroups
  .map(
    (g) => `    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${euros(g.netCents)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${euros(g.vatCents)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${taxCategory.id}</cbc:ID>
        <cbc:Percent>${(g.rateBps / 100).toFixed(2)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>${exemptionReasonXml}
      </cac:TaxCategory>
    </cac:TaxSubtotal>`
  )
  .join("\n")}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${euros(Math.abs(invoice.subtotalCents))}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${euros(Math.abs(invoice.subtotalCents))}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${euros(Math.abs(invoice.totalCents))}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${euros(Math.abs(invoice.totalCents))}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
</Invoice>
`;
}
