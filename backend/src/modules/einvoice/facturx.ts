import { VAT_NOTICES } from "../tax/calculator";
import { unitCodeFor, type InvoiceForXRechnung } from "./xrechnung";

/**
 * ZUGFeRD / Factur-X: erzeugt die strukturierte Rechnung im Format UN/CEFACT Cross Industry Invoice (CII) im
 * Profil EN 16931 ("COMFORT"). Sie wird in ein PDF/A-3 eingebettet (siehe pdf/documentTemplate.ts, Option
 * `embeddedFile`) - das Ergebnis ist ein "Hybrid": für Menschen ein gewohntes PDF, für Software eine vollständige E-Rechnung.
 *
 * Inhaltlich identisch zur XRechnung (xrechnung.ts), nur in der CII-Syntax. Mit `guideline: "xrechnung"` entsteht dieselbe Datei
 * mit der Kennung der XRechnung - nur für die Prüfung mit dem KoSIT-Validator genutzt, der ZUGFeRD-Profile nicht kennt.
 */

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const dt = (d: Date) => `<udt:DateTimeString format="102">${ymd(d)}</udt:DateTimeString>`;
const euros = (cents: number) => (cents / 100).toFixed(2);

type TaxCat = { id: string; reason: string | null; reasonCode: string | null };

function taxCategory(invoice: InvoiceForXRechnung): TaxCat {
  if (invoice.isSmallBusiness) return { id: "E", reason: "Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).", reasonCode: null };
  switch (invoice.vatNoticeKey) {
    case "INTRA_COMMUNITY_SUPPLY": return { id: "K", reason: VAT_NOTICES.INTRA_COMMUNITY_SUPPLY.de, reasonCode: "vatex-eu-ic" };
    case "REVERSE_CHARGE": return { id: "AE", reason: VAT_NOTICES.REVERSE_CHARGE.de, reasonCode: "vatex-eu-ae" };
    case "EXPORT": return { id: "G", reason: VAT_NOTICES.EXPORT.de, reasonCode: "vatex-eu-g" };
    case "NOT_TAXABLE_ABROAD": return { id: "O", reason: VAT_NOTICES.NOT_TAXABLE_ABROAD.de, reasonCode: "vatex-eu-o" };
    default: return { id: "S", reason: null, reasonCode: null };
  }
}

interface PartyData {
  name: string;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country: string;
  email?: string | null;
  vatId?: string | null;
  taxId?: string | null;
}

export function buildFacturXml(invoice: InvoiceForXRechnung, guideline: "en16931" | "xrechnung" = "en16931"): string {
  if (!invoice.invoiceNumber) throw new Error("ZUGFeRD kann nur für eine bereits finalisierte Rechnung (mit Nummer) erzeugt werden");
  const { company, customer } = invoice;
  const cat = taxCategory(invoice);
  const isNotSubject = cat.id === "O";
  const isCredit = invoice.isCancellationDocument;
  const typeCode = isCredit ? 381 : invoice.kind === "DOWN_PAYMENT" ? 326 : 380;

  // Abzugspositionen einer Schlussrechnung -> "bereits gezahlter Betrag" (BT-113), siehe xrechnung.ts
  const regular = invoice.items.filter((i) => !i.isDownPaymentDeduction);
  const groups = new Map<number, { net: number; vat: number }>();
  for (const item of regular) {
    const net = Math.abs(item.lineTotalCents);
    const g = groups.get(item.vatRateBps) ?? { net: 0, vat: 0 };
    g.net += net;
    g.vat += Math.round((net * item.vatRateBps) / 10000);
    groups.set(item.vatRateBps, g);
  }
  const net = [...groups.values()].reduce((s, g) => s + g.net, 0);
  const vat = [...groups.values()].reduce((s, g) => s + g.vat, 0);
  const gross = net + vat;
  const payable = Math.abs(invoice.totalCents);
  const prepaid = invoice.items.some((i) => i.isDownPaymentDeduction) ? Math.max(0, gross - payable) : 0;

  const pct = (bps: number) => `<ram:RateApplicablePercent>${(bps / 100).toFixed(2)}</ram:RateApplicablePercent>`;

  const lines = regular
    .map(
      (item, idx) => `    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${idx + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${esc(item.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${euros(item.unitPriceCents)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${unitCodeFor(item.unit)}">${Math.abs(item.quantity)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${cat.id}</ram:CategoryCode>
${isNotSubject ? "" : `          ${pct(item.vatRateBps)}\n`}        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${euros(Math.abs(item.lineTotalCents))}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`
    )
    .join("\n");

  // Reihenfolge laut CII-Schema: Name, (Kontakt), Anschrift, elektronische Adresse, Steuerregistrierungen
  const party = (p: PartyData, contact = "") =>
    `        <ram:Name>${esc(p.name)}</ram:Name>
${contact}        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(p.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${esc(p.street)}</ram:LineOne>
          <ram:CityName>${esc(p.city)}</ram:CityName>
          <ram:CountryID>${esc(p.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
${p.email ? `        <ram:URIUniversalCommunication>\n          <ram:URIID schemeID="EM">${esc(p.email)}</ram:URIID>\n        </ram:URIUniversalCommunication>\n` : ""}${p.vatId && !isNotSubject ? `        <ram:SpecifiedTaxRegistration>\n          <ram:ID schemeID="VA">${esc(p.vatId)}</ram:ID>\n        </ram:SpecifiedTaxRegistration>\n` : ""}${p.taxId ? `        <ram:SpecifiedTaxRegistration>\n          <ram:ID schemeID="FC">${esc(p.taxId)}</ram:ID>\n        </ram:SpecifiedTaxRegistration>\n` : ""}`;

  const sellerLegal = company.registerNumber ? `        <ram:SpecifiedLegalOrganization>
          <ram:ID>${esc(company.registerNumber)}</ram:ID>
        </ram:SpecifiedLegalOrganization>
` : "";
  const sellerContact = sellerLegal + `        <ram:DefinedTradeContact>
          <ram:PersonName>${esc(company.managingDirector || company.name)}</ram:PersonName>
          <ram:TelephoneUniversalCommunication>
            <ram:CompleteNumber>${esc(company.phone)}</ram:CompleteNumber>
          </ram:TelephoneUniversalCommunication>
          <ram:EmailURIUniversalCommunication>
            <ram:URIID>${esc(company.email)}</ram:URIID>
          </ram:EmailURIUniversalCommunication>
        </ram:DefinedTradeContact>
`;

  const buyerReference = customer.leitwegId || invoice.invoiceNumber;
  const deliveryDate = invoice.deliveryDate ?? invoice.issueDate;

  const paymentMeans = company.iban
    ? `      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${esc(company.iban.replace(/\s+/g, ""))}</ram:IBANID>
          <ram:AccountName>${esc(company.name)}</ram:AccountName>
        </ram:PayeePartyCreditorFinancialAccount>
${company.bic ? `        <ram:PayeeSpecifiedCreditorFinancialInstitution>\n          <ram:BICID>${esc(company.bic)}</ram:BICID>\n        </ram:PayeeSpecifiedCreditorFinancialInstitution>\n` : ""}      </ram:SpecifiedTradeSettlementPaymentMeans>\n`
    : "";

  const taxLines = [...groups.entries()]
    .map(
      ([bps, g]) => `      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${euros(g.vat)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
${cat.reason ? `        <ram:ExemptionReason>${esc(cat.reason)}</ram:ExemptionReason>\n` : ""}        <ram:BasisAmount>${euros(g.net)}</ram:BasisAmount>
        <ram:CategoryCode>${cat.id}</ram:CategoryCode>
${cat.reasonCode ? `        <ram:ExemptionReasonCode>${cat.reasonCode}</ram:ExemptionReasonCode>\n` : ""}        ${pct(bps)}
      </ram:ApplicableTradeTax>`
    )
    .join("\n");

  const referenced = [invoice.correctsInvoice?.invoiceNumber, ...(invoice.precedingInvoiceNumbers ?? [])].filter((n): n is string => !!n);
  const referencedXml = referenced
    .map((n) => `      <ram:InvoiceReferencedDocument>\n        <ram:IssuerAssignedID>${esc(n)}</ram:IssuerAssignedID>\n      </ram:InvoiceReferencedDocument>`)
    .join("\n");

  const guidelineId = guideline === "xrechnung" ? "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0" : "urn:cen.eu:en16931:2017";
  const processXml =
    guideline === "xrechnung"
      ? "    <ram:BusinessProcessSpecifiedDocumentContextParameter>\n      <ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID>\n    </ram:BusinessProcessSpecifiedDocumentContextParameter>\n"
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
                          xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
${processXml}    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${guidelineId}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(invoice.invoiceNumber)}</ram:ID>
    <ram:TypeCode>${typeCode}</ram:TypeCode>
    <ram:IssueDateTime>
      ${dt(invoice.issueDate)}
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
${lines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${esc(buyerReference)}</ram:BuyerReference>
      <ram:SellerTradeParty>
${party({ ...company, taxId: company.taxId }, sellerContact)}      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
${party({ ...customer, taxId: null })}      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ShipToTradeParty>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(customer.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${esc(customer.street)}</ram:LineOne>
          <ram:CityName>${esc(customer.city)}</ram:CityName>
          <ram:CountryID>${esc(customer.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:ShipToTradeParty>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          ${dt(deliveryDate)}
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
${paymentMeans}${taxLines}
${invoice.dueDate && !isCredit ? `      <ram:SpecifiedTradePaymentTerms>\n        <ram:DueDateDateTime>\n          ${dt(invoice.dueDate)}\n        </ram:DueDateDateTime>\n      </ram:SpecifiedTradePaymentTerms>\n` : ""}      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${euros(net)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${euros(net)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${euros(vat)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${euros(gross)}</ram:GrandTotalAmount>
${prepaid > 0 ? `        <ram:TotalPrepaidAmount>${euros(prepaid)}</ram:TotalPrepaidAmount>\n` : ""}        <ram:DuePayableAmount>${euros(payable)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
${referencedXml ? referencedXml + "\n" : ""}    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

/** XMP-Erweiterung, die ein ZUGFeRD-/Factur-X-PDF als solches kennzeichnet (PDF/A-3 verlangt die Beschreibung des eigenen Schemas). */
export const FACTURX_XMP = `
        <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
            <pdfaExtension:schemas>
                <rdf:Bag>
                    <rdf:li rdf:parseType="Resource">
                        <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
                        <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
                        <pdfaSchema:prefix>fx</pdfaSchema:prefix>
                        <pdfaSchema:property>
                            <rdf:Seq>
                                <rdf:li rdf:parseType="Resource">
                                    <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                                    <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                                    <pdfaProperty:category>external</pdfaProperty:category>
                                    <pdfaProperty:description>Name of the embedded XML invoice file</pdfaProperty:description>
                                </rdf:li>
                                <rdf:li rdf:parseType="Resource">
                                    <pdfaProperty:name>DocumentType</pdfaProperty:name>
                                    <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                                    <pdfaProperty:category>external</pdfaProperty:category>
                                    <pdfaProperty:description>INVOICE</pdfaProperty:description>
                                </rdf:li>
                                <rdf:li rdf:parseType="Resource">
                                    <pdfaProperty:name>Version</pdfaProperty:name>
                                    <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                                    <pdfaProperty:category>external</pdfaProperty:category>
                                    <pdfaProperty:description>The actual version of the Factur-X XML schema</pdfaProperty:description>
                                </rdf:li>
                                <rdf:li rdf:parseType="Resource">
                                    <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                                    <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                                    <pdfaProperty:category>external</pdfaProperty:category>
                                    <pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description>
                                </rdf:li>
                            </rdf:Seq>
                        </pdfaSchema:property>
                    </rdf:li>
                </rdf:Bag>
            </pdfaExtension:schemas>
        </rdf:Description>
        <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
            <fx:DocumentType>INVOICE</fx:DocumentType>
            <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
            <fx:Version>1.0</fx:Version>
            <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
        </rdf:Description>
`;
