import fs from "fs";
import path from "path";
import type { Invoice, InvoiceItem, Customer, Company } from "@prisma/client";
import { renderDocumentPdf } from "../pdf/documentTemplate";
import { vatBreakdownFromLineItems, VAT_NOTICES } from "../tax/calculator";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";

type InvoiceWithRelations = Invoice & {
  items: InvoiceItem[];
  customer: Customer;
  company: Company;
  correctsInvoice?: { invoiceNumber: string | null } | null;
};

/** Gemeinsam von GET /:id/pdf und POST /:id/send-email genutzt, damit das PDF nicht an
 * zwei Stellen unterschiedlich zusammengebaut wird. */
export async function generateAndStoreInvoicePdf(invoice: InvoiceWithRelations, locale: "de" | "en"): Promise<Buffer> {
  const isDraft = invoice.status === "DRAFT";
  const pdfBuffer = await renderDocumentPdf({
    docTypeLabel: invoice.isCancellationDocument
      ? { de: "Rechnungskorrektur", en: "Invoice correction" }
      : { de: "Rechnung", en: "Invoice" },
    // Entwürfe haben noch keine feste Nummer (siehe Invoice.invoiceNumber-Kommentar in
    // schema.prisma) - für die Vorschau wird die interne ID gekürzt angezeigt, deutlich
    // als vorläufig gekennzeichnet durch das Wasserzeichen (isDraft).
    documentNumber: invoice.invoiceNumber ?? `ENTWURF-${invoice.id.slice(0, 8)}`,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    deliveryDate: invoice.deliveryDate,
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
    showPrices: true,
    showSepaQr: !invoice.isCancellationDocument && invoice.status !== "PAID" && invoice.status !== "CANCELLED",
    isDraft,
    correctsDocumentNumber: invoice.correctsInvoice?.invoiceNumber ?? null,
  });

  // Entwurfs-Vorschauen werden nicht als Datei abgelegt/als pdfPath vermerkt - das
  // passiert erst für die finale, nummerierte Rechnung (siehe finalizeInvoiceNumber).
  if (isDraft) return pdfBuffer;

  const outDir = path.join(env.UPLOAD_DIR, "invoices");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${invoice.invoiceNumber}.pdf`);
  fs.writeFileSync(outPath, pdfBuffer);
  await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfPath: outPath } });

  return pdfBuffer;
}
