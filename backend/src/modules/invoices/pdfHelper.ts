import fs from "fs";
import path from "path";
import type { Invoice, InvoiceItem, Customer, Company } from "@prisma/client";
import { renderDocumentPdf } from "../pdf/documentTemplate";
import { vatBreakdownFromLineItems, VAT_NOTICES } from "../tax/calculator";
import { env } from "../../config/env";
import { resolvePdfLayout } from "../pdf/layout";
import { prisma } from "../../db/prisma";

type InvoiceWithRelations = Invoice & {
  items: InvoiceItem[];
  customer: Customer;
  company: Company;
  correctsInvoice?: { invoiceNumber: string | null } | null;
};

/** Gemeinsam von GET /:id/pdf und POST /:id/send-email genutzt, damit das PDF nicht an
 * zwei Stellen unterschiedlich zusammengebaut wird. */
export function buildPaymentTermsText(invoice: { isCancellationDocument: boolean; status: string; dueDate: Date | null }, locale: "de" | "en"): string | null {
  const fmt = (d: Date) => new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  if (invoice.isCancellationDocument) {
    return locale === "de"
      ? "Bereits gezahlte Beträge werden erstattet bzw. mit offenen Forderungen verrechnet."
      : "Amounts already paid will be refunded or offset against open receivables.";
  }
  if (invoice.status === "PAID") {
    return locale === "de" ? "Der Rechnungsbetrag wurde bereits beglichen - vielen Dank!" : "This invoice has already been paid - thank you!";
  }
  if (invoice.dueDate) {
    return locale === "de"
      ? `Bitte überweisen Sie den Gesamtbetrag bis zum ${fmt(invoice.dueDate)} unter Angabe der Rechnungsnummer.`
      : `Please transfer the total amount by ${fmt(invoice.dueDate)}, quoting the invoice number.`;
  }
  return null;
}

export async function generateAndStoreInvoicePdf(
  invoice: InvoiceWithRelations,
  locale: "de" | "en",
  layoutOverride?: unknown,
  // ZUGFeRD: XML wird eingebettet, das Ergebnis ersetzt NICHT die archivierte Standard-PDF (wird nicht gespeichert)
  embeddedXml?: { xml: string; filename: string; description: string; xmp: string }
): Promise<Buffer> {
  const isDraft = invoice.status === "DRAFT";
  const pdfBuffer = await renderDocumentPdf({
    docTypeLabel: invoice.isCancellationDocument
      ? { de: "Rechnungskorrektur", en: "Invoice correction" }
      : invoice.kind === "DOWN_PAYMENT"
      ? { de: "Anzahlungsrechnung", en: "Down payment invoice" }
      : invoice.kind === "FINAL"
      ? { de: "Schlussrechnung", en: "Final invoice" }
      : { de: "Rechnung", en: "Invoice" },
    numberLabel: invoice.isCancellationDocument ? { de: "Beleg-Nr.", en: "Document no." } : { de: "Rechnungsnr.", en: "Invoice no." },
    // Entwürfe haben noch keine feste Nummer (siehe Invoice.invoiceNumber-Kommentar in
    // schema.prisma) - für die Vorschau wird die interne ID gekürzt angezeigt, deutlich
    // als vorläufig gekennzeichnet durch das Wasserzeichen (isDraft).
    documentNumber: invoice.invoiceNumber ?? `ENTWURF-${invoice.id.slice(0, 8)}`,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    // Ohne ausdrücklich angegebenes Leistungsdatum gilt das Rechnungsdatum (Pflichtangabe
    // §14 Abs. 4 Nr. 6 UStG - die Angabe darf nicht fehlen, auch wenn sie dem Rechnungsdatum entspricht).
    deliveryDate: invoice.deliveryDate ?? invoice.issueDate,
    locale,
    branding: invoice.company,
    recipient: invoice.customer,
    items: invoice.items,
    subtotalCents: invoice.subtotalCents,
    vatBreakdown: vatBreakdownFromLineItems(invoice.items),
    vatTotalCents: invoice.vatTotalCents,
    totalCents: invoice.totalCents,
    isSmallBusiness: invoice.isSmallBusiness,
    vatNoticeText: invoice.vatNoticeKey && invoice.vatNoticeKey in VAT_NOTICES ? VAT_NOTICES[invoice.vatNoticeKey as keyof typeof VAT_NOTICES][locale] : null,
    notes: invoice.notes,
    paymentTermsText: buildPaymentTermsText(invoice, locale),
    showPrices: true,
    showSepaQr: !invoice.isCancellationDocument && invoice.status !== "PAID" && invoice.status !== "CANCELLED",
    isDraft,
    layout: resolvePdfLayout(invoice.company.pdfLayout, layoutOverride),
    introText: invoice.introText,
    closingText: invoice.closingText,
    correctsDocumentNumber: invoice.correctsInvoice?.invoiceNumber ?? null,
    embeddedXml,
  });

  // Entwurfs-Vorschauen werden nicht als Datei abgelegt/als pdfPath vermerkt - das
  // passiert erst für die finale, nummerierte Rechnung (siehe finalizeInvoiceNumber).
  if (isDraft || embeddedXml) return pdfBuffer;

  const outDir = path.join(env.UPLOAD_DIR, "invoices");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${invoice.invoiceNumber}.pdf`);
  fs.writeFileSync(outPath, pdfBuffer);
  await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfPath: outPath } });

  return pdfBuffer;
}
