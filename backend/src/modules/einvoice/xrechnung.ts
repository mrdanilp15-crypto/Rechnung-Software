import type { Company, Customer, Invoice, InvoiceItem } from "@prisma/client";
import { VAT_NOTICES } from "../tax/calculator";

/**
 * Erzeugt eine XRechnung (UBL 2.1 Invoice, konform zum CIUS "XRechnung 3.0" auf Basis
 * von EN 16931) aus einer bestehenden Rechnung. Deckt die für den hier abgebildeten
 * Regelfall (inländische Rechnung, Kleinunternehmerregelung, innergemeinschaftliche
 * Lieferung/Reverse-Charge, Ausfuhrlieferung) nötigen Pflichtfelder ab.
 *
 * Geprüft mit dem offiziellen KoSIT-Validator 1.6.3 + XRechnung-Prüfkonfiguration 3.0.2:
 * Regelrechnung (19%/7%), Kleinunternehmer, innergemeinschaftliche Lieferung, Reverse-Charge,
 * Ausfuhr, nicht steuerbare Leistung und Storno (CreditNote) werden ohne Fehler akzeptiert.
 * Bei Änderungen an diesem Generator die Prüfung wiederholen. Bei öffentlichen Auftraggebern
 * zusätzlich unbedingt die vom Auftraggeber mitgeteilte Leitweg-ID beim Kunden hinterlegen (BT-10).
 */

export type InvoiceForXRechnung = Invoice & {
  items: InvoiceItem[];
  customer: Customer;
  company: Company;
  correctsInvoice?: { invoiceNumber: string | null } | null;
};

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

// UN/ECE Rec. 20 - gängige Einheiten; alles Unbekannte wird als "Stück" (C62) übermittelt.
const UNIT_CODES: Record<string, string> = {
  "stk": "C62", "stk.": "C62", "stück": "C62", "st": "C62", "st.": "C62", "x": "C62", "pauschal": "C62", "psch": "C62", "psch.": "C62",
  "kg": "KGM", "g": "GRM", "t": "TNE", "mg": "MGM",
  "m": "MTR", "cm": "CMT", "mm": "MMT", "km": "KMT",
  "m²": "MTK", "m2": "MTK", "qm": "MTK", "m³": "MTQ", "m3": "MTQ",
  "l": "LTR", "ml": "MLT",
  "h": "HUR", "std": "HUR", "std.": "HUR", "stunde": "HUR", "stunden": "HUR", "min": "MIN",
  "tag": "DAY", "tage": "DAY", "monat": "MON", "monate": "MON", "jahr": "ANN",
  "pkg": "XPK", "paket": "XPK", "set": "SET",
};

export function unitCodeFor(unit: string): string {
  return UNIT_CODES[unit.trim().toLowerCase()] ?? "C62";
}

interface TaxCategory {
  id: "S" | "E" | "AE" | "K" | "G" | "O";
  exemptionReason: string | null;
  exemptionReasonCode: string | null;
}

/**
 * UNCL5305-Steuerkategorie + Befreiungsgrund je nach USt.-Behandlung - gilt einheitlich für
 * die gesamte Rechnung, da Kleinunternehmerregelung/innergemeinschaftliche Lieferung/
 * Reverse-Charge/Ausfuhr beim Erstellen bereits auf ALLE Positionen einheitlich angewendet
 * werden (siehe modules/invoices/build.ts). Nur im Regelfall können innerhalb einer Rechnung
 * mehrere Steuersätze (19%/7%) vorkommen - dafür wird je Satz ein eigenes TaxSubtotal erzeugt.
 */
function taxCategoryFor(invoice: InvoiceForXRechnung): TaxCategory {
  if (invoice.isSmallBusiness) {
    return { id: "E", exemptionReason: "Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).", exemptionReasonCode: null };
  }
  switch (invoice.vatNoticeKey) {
    case "INTRA_COMMUNITY_SUPPLY":
      return { id: "K", exemptionReason: VAT_NOTICES.INTRA_COMMUNITY_SUPPLY.de, exemptionReasonCode: "vatex-eu-ic" };
    case "REVERSE_CHARGE":
      return { id: "AE", exemptionReason: VAT_NOTICES.REVERSE_CHARGE.de, exemptionReasonCode: "vatex-eu-ae" };
    case "EXPORT":
      return { id: "G", exemptionReason: VAT_NOTICES.EXPORT.de, exemptionReasonCode: "vatex-eu-g" };
    case "NOT_TAXABLE_ABROAD":
      return { id: "O", exemptionReason: VAT_NOTICES.NOT_TAXABLE_ABROAD.de, exemptionReasonCode: "vatex-eu-o" };
    default:
      return { id: "S", exemptionReason: null, exemptionReasonCode: null };
  }
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

/**
 * Pflichtangaben der XRechnung (EN16931 BR-62/63, XRechnung BR-DE-1/2/5/6/7), die in den
 * Stammdaten stehen müssen - fehlt etwas, wird der Export mit einer verständlichen Meldung
 * abgelehnt, statt eine formal ungültige Datei auszuliefern oder Werte zu erfinden.
 */
export function getXRechnungBlockers(invoice: Pick<InvoiceForXRechnung, "company" | "customer">): string[] {
  const { company, customer } = invoice;
  const missing: string[] = [];
  if (!company.street || !company.postalCode || !company.city) missing.push("vollständige Firmenanschrift (Straße, PLZ, Ort)");
  if (!company.vatId && !company.taxId) missing.push("Steuernummer oder USt-IdNr. der Firma");
  if (!company.phone) missing.push("Telefonnummer der Firma (Pflichtfeld Ansprechpartner, BR-DE-6)");
  if (!company.email) missing.push("E-Mail-Adresse der Firma (Pflichtfeld Ansprechpartner/elektronische Adresse, BR-DE-7/BR-62)");
  if (!company.iban) missing.push("IBAN der Firma (Zahlungsinformationen sind in der XRechnung Pflicht, BR-DE-1)");
  if (!customer.email) missing.push(`E-Mail-Adresse des Kunden "${customer.name}" (elektronische Adresse des Käufers, BR-63)`);
  if (!customer.street || !customer.postalCode || !customer.city) missing.push(`vollständige Anschrift des Kunden "${customer.name}"`);
  return missing;
}

export function buildXRechnungXml(invoice: InvoiceForXRechnung): string {
  if (!invoice.invoiceNumber) throw new Error("XRechnung kann nur für eine bereits finalisierte Rechnung (mit Nummer) erzeugt werden");
  const { company, customer } = invoice;
  const taxCategory = taxCategoryFor(invoice);
  const rateGroups = groupByVatRate(invoice.items);
  const isCreditNote = invoice.isCancellationDocument;
  // Korrekturbelege (Storno) werden als eigenes UBL-Dokument "CreditNote" (Typcode 381) ausgegeben -
  // die Code-Liste des Elements InvoiceTypeCode erlaubt 381 nicht (BR-CL-01). Beträge sind dabei positiv.
  const root = isCreditNote ? "CreditNote" : "Invoice";
  const lineTag = isCreditNote ? "CreditNoteLine" : "InvoiceLine";
  const qtyTag = isCreditNote ? "CreditedQuantity" : "InvoicedQuantity";
  // Kategorie "O" (nicht steuerbar) darf weder Steuersatz noch USt-IdNr. enthalten (BR-O-2/-5).
  const isNotSubject = taxCategory.id === "O";
  // BR-DE-14 verlangt den Steuersatz auf Ebene der Steuer-Aufschlüsselung auch bei Kategorie "O";
  // auf Positionsebene darf er dort dagegen nicht stehen (BR-O-05) - siehe Aufruf bei den Positionen.
  const percentXml = (bps: number, indent: string) => `${indent}<cbc:Percent>${(bps / 100).toFixed(2)}</cbc:Percent>
`;

  const taxSchemes = (vatId: string | null | undefined, taxId?: string | null) => {
    const entries: string[] = [];
    if (vatId && !isNotSubject) entries.push(`      <cac:PartyTaxScheme>\n        <cbc:CompanyID>${esc(vatId)}</cbc:CompanyID>\n        <cac:TaxScheme>\n          <cbc:ID>VAT</cbc:ID>\n        </cac:TaxScheme>\n      </cac:PartyTaxScheme>\n`);
    if (taxId) entries.push(`      <cac:PartyTaxScheme>\n        <cbc:CompanyID>${esc(taxId)}</cbc:CompanyID>\n        <cac:TaxScheme>\n          <cbc:ID>FC</cbc:ID>\n        </cac:TaxScheme>\n      </cac:PartyTaxScheme>\n`);
    return entries.join("");
  };

  const lines = invoice.items
    .map(
      (item, idx) => `  <cac:${lineTag}>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:${qtyTag} unitCode="${unitCodeFor(item.unit)}">${Math.abs(item.quantity)}</cbc:${qtyTag}>
    <cbc:LineExtensionAmount currencyID="EUR">${euros(Math.abs(item.lineTotalCents))}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${esc(item.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${taxCategory.id}</cbc:ID>
${isNotSubject ? "" : percentXml(item.vatRateBps, "        ")}        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="EUR">${euros(item.unitPriceCents)}</cbc:PriceAmount>
    </cac:Price>
  </cac:${lineTag}>`
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
      <cbc:ID>${esc(company.iban.replace(/\s+/g, ""))}</cbc:ID>
      <cbc:Name>${esc(company.name)}</cbc:Name>
${company.bic ? `      <cac:FinancialInstitutionBranch>\n        <cbc:ID>${esc(company.bic)}</cbc:ID>\n      </cac:FinancialInstitutionBranch>\n` : ""}    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>\n`
    : "";

  const exemptionXml =
    (taxCategory.exemptionReasonCode ? `\n        <cbc:TaxExemptionReasonCode>${taxCategory.exemptionReasonCode}</cbc:TaxExemptionReasonCode>` : "") +
    (taxCategory.exemptionReason ? `\n        <cbc:TaxExemptionReason>${esc(taxCategory.exemptionReason)}</cbc:TaxExemptionReason>` : "");

  // BT-72 Leistungsdatum (Pflichtangabe §14 Abs. 4 Nr. 6 UStG) + Lieferland (BT-80, bei
  // innergemeinschaftlicher Lieferung zwingend, BR-IC-12).
  const deliveryDate = invoice.deliveryDate ?? invoice.issueDate;

  // BT-25 verweist auf die NUMMER der korrigierten Rechnung (nicht auf eine interne ID).
  const billingReference = invoice.correctsInvoice?.invoiceNumber
    ? `  <cac:BillingReference>\n    <cac:InvoiceDocumentReference>\n      <cbc:ID>${esc(invoice.correctsInvoice.invoiceNumber)}</cbc:ID>\n    </cac:InvoiceDocumentReference>\n  </cac:BillingReference>\n`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(invoice.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${isoDate(invoice.issueDate)}</cbc:IssueDate>
${invoice.dueDate && !isCreditNote ? `  <cbc:DueDate>${isoDate(invoice.dueDate)}</cbc:DueDate>\n` : ""}  ${isCreditNote ? "<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>" : "<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>"}
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${esc(buyerReference)}</cbc:BuyerReference>
${billingReference}  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="EM">${esc(company.email)}</cbc:EndpointID>
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
${taxSchemes(company.vatId, company.taxId)}      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(company.name)}</cbc:RegistrationName>
${company.registerNumber ? `        <cbc:CompanyID>${esc(company.registerNumber)}</cbc:CompanyID>\n` : ""}      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Name>${esc(company.managingDirector || company.name)}</cbc:Name>
        <cbc:Telephone>${esc(company.phone)}</cbc:Telephone>
        <cbc:ElectronicMail>${esc(company.email)}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="EM">${esc(customer.email)}</cbc:EndpointID>
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
${taxSchemes(customer.vatId)}      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(customer.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:Delivery>
    <cbc:ActualDeliveryDate>${isoDate(deliveryDate)}</cbc:ActualDeliveryDate>
    <cac:DeliveryLocation>
      <cac:Address>
        <cbc:StreetName>${esc(customer.street)}</cbc:StreetName>
        <cbc:CityName>${esc(customer.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(customer.postalCode)}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>${esc(customer.country)}</cbc:IdentificationCode>
        </cac:Country>
      </cac:Address>
    </cac:DeliveryLocation>
  </cac:Delivery>
${paymentMeans}  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${euros(Math.abs(invoice.vatTotalCents))}</cbc:TaxAmount>
${rateGroups
  .map(
    (g) => `    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${euros(g.netCents)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${euros(g.vatCents)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${taxCategory.id}</cbc:ID>
${percentXml(g.rateBps, "        ")}${exemptionXml ? exemptionXml.replace(/^\n/, "") + "\n" : ""}        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
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
</${root}>
`;
}
