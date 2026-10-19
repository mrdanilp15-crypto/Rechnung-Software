import { z } from "zod";
import type { Company, Customer } from "@prisma/client";
import { renderDocumentPdf } from "../pdf/documentTemplate";
import { resolvePdfLayout } from "../pdf/layout";
import { vatBreakdownFromLineItems, VAT_NOTICES } from "../tax/calculator";
import { buildInvoiceFinancials, defaultDueDate } from "./build";
import { buildPaymentTermsText } from "./pdfHelper";

/** Formularstand des Rechnungseditors - bewusst großzügig: unfertige Eingaben (leere Beschreibung,
 * Menge 0, noch kein Kunde) sind beim Tippen normal und dürfen die Vorschau nicht abbrechen. */
export const previewSchema = z.object({
  customerId: z.string().optional(),
  kind: z.enum(["STANDARD", "DOWN_PAYMENT", "FINAL"]).optional(),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  deliveryDate: z.coerce.date().optional(),
  notes: z.string().max(5000).optional(),
  supplyType: z.enum(["GOODS", "SERVICE"]).optional(),
  introText: z.string().max(3000).optional(),
  closingText: z.string().max(3000).optional(),
  items: z
    .array(
      z.object({
        description: z.string().max(2000),
        quantity: z.number(),
        unit: z.string().max(30).default("Stk."),
        unitPriceCents: z.number().int(),
        vatRateBps: z.number().int().min(0).max(10000),
        isDownPaymentDeduction: z.boolean().optional(),
        deductsInvoiceId: z.string().optional(),
      })
    )
    .max(200),
});

/** Rendert den aktuellen, noch nicht gespeicherten Formularstand als Entwurfs-PDF (Live-Vorschau). */
export async function renderInvoicePreview(company: Company, customer: Customer | null, body: z.infer<typeof previewSchema>): Promise<Buffer> {
  const validItems = body.items.filter((i) => i.description.trim() && i.quantity > 0);
  const financials = buildInvoiceFinancials(
    company,
    customer ?? { type: "PRIVAT", country: company.country, vatId: null },
    validItems,
    body.supplyType ?? "GOODS"
  );
  const issueDate = body.issueDate ?? new Date();
  const dueDate = body.dueDate ?? defaultDueDate(company, issueDate) ?? null;
  const items = financials.itemsCreate.map((i) => ({
    position: i.position,
    description: i.description,
    quantity: i.quantity,
    unit: i.unit,
    unitPriceCents: i.unitPriceCents,
    vatRateBps: i.vatRateBps,
    lineTotalCents: i.lineTotalCents,
  }));
  const locale = company.defaultLocale === "en" ? "en" : "de";

  return renderDocumentPdf({
    docTypeLabel: body.kind === "DOWN_PAYMENT" ? { de: "Anzahlungsrechnung", en: "Down payment invoice" } : body.kind === "FINAL" ? { de: "Schlussrechnung", en: "Final invoice" } : { de: "Rechnung", en: "Invoice" },
    numberLabel: { de: "Rechnungsnr.", en: "Invoice no." },
    documentNumber: "ENTWURF",
    issueDate,
    dueDate,
    deliveryDate: body.deliveryDate ?? issueDate,
    locale,
    branding: company,
    recipient: customer ?? { name: locale === "de" ? "Kunde auswählen …" : "Select a customer …" },
    items,
    subtotalCents: financials.subtotalCents,
    vatBreakdown: vatBreakdownFromLineItems(items),
    vatTotalCents: financials.vatTotalCents,
    totalCents: financials.totalCents,
    isSmallBusiness: financials.isSmallBusiness,
    vatNoticeText: financials.vatNoticeKey && financials.vatNoticeKey in VAT_NOTICES ? VAT_NOTICES[financials.vatNoticeKey as keyof typeof VAT_NOTICES][locale] : null,
    notes: body.notes || null,
    paymentTermsText: buildPaymentTermsText({ isCancellationDocument: false, status: "DRAFT", dueDate }, locale),
    showPrices: true,
    showSepaQr: false,
    isDraft: true,
    layout: resolvePdfLayout(company.pdfLayout),
    introText: body.introText,
    closingText: body.closingText,
  });
}
