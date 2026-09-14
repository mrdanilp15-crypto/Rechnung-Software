import fs from "fs";
import path from "path";
import type { Invoice, InvoiceItem, Customer, Company } from "@prisma/client";
import { renderDocumentPdf } from "../pdf/documentTemplate";
import { env } from "../../config/env";
import { prisma } from "../../db/prisma";

type InvoiceWithRelations = Invoice & { items: InvoiceItem[]; customer: Customer; company: Company };

/** Gemeinsam von GET /:id/pdf und POST /:id/send-email genutzt, damit das PDF nicht an
 * zwei Stellen unterschiedlich zusammengebaut wird. */
export async function generateAndStoreInvoicePdf(invoice: InvoiceWithRelations, locale: "de" | "en"): Promise<Buffer> {
  const pdfBuffer = await renderDocumentPdf({
    docTypeLabel: { de: "Rechnung", en: "Invoice" },
    documentNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    locale,
    branding: invoice.company,
    recipient: invoice.customer,
    items: invoice.items,
    subtotalCents: invoice.subtotalCents,
    vatTotalCents: invoice.vatTotalCents,
    totalCents: invoice.totalCents,
    isSmallBusiness: invoice.isSmallBusiness,
    notes: invoice.notes,
    showPrices: true,
    showSepaQr: invoice.status !== "PAID" && invoice.status !== "CANCELLED",
  });

  const outDir = path.join(env.UPLOAD_DIR, "invoices");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${invoice.invoiceNumber}.pdf`);
  fs.writeFileSync(outPath, pdfBuffer);
  await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfPath: outPath } });

  return pdfBuffer;
}
