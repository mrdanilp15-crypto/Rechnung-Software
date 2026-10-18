import { z } from "zod";
import type { Company, Customer } from "@prisma/client";
import { renderDocumentPdf } from "./documentTemplate";
import { resolvePdfLayout } from "./layout";
import { calculateDocumentTotals, vatBreakdownFromLineItems } from "../tax/calculator";

export type SimpleDocKind = "quote" | "confirmation" | "deliveryNote";

/** Formularstand eines Angebots / einer Auftragsbestätigung / eines Lieferscheins (unfertige Eingaben erlaubt). */
export const simplePreviewSchema = z.object({
  customerId: z.string().optional(),
  issueDate: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
  deliveryDate: z.coerce.date().optional(),
  notes: z.string().max(5000).optional(),
  introText: z.string().max(3000).optional(),
  closingText: z.string().max(3000).optional(),
  items: z
    .array(
      z.object({
        description: z.string().max(2000),
        quantity: z.number(),
        unit: z.string().max(30).default("Stk."),
        unitPriceCents: z.number().int().default(0),
        vatRateBps: z.number().int().min(0).max(10000).default(1900),
      })
    )
    .max(200),
});

const LABELS = {
  quote: { title: { de: "Angebot", en: "Quote" }, number: { de: "Angebotsnr.", en: "Quote no." } },
  confirmation: { title: { de: "Auftragsbestätigung", en: "Order Confirmation" }, number: { de: "Auftragsnr.", en: "Order no." } },
  deliveryNote: { title: { de: "Lieferschein", en: "Delivery Note" }, number: { de: "Lieferscheinnr.", en: "Delivery note no." } },
} as const;

export async function renderSimplePreview(kind: SimpleDocKind, company: Company, customer: Customer | null, body: z.infer<typeof simplePreviewSchema>): Promise<Buffer> {
  const showPrices = kind !== "deliveryNote";
  const valid = body.items.filter((i) => i.description.trim() && i.quantity > 0);
  const totals = calculateDocumentTotals(
    valid.map((i) => ({ quantity: i.quantity, unitPriceCents: i.unitPriceCents, vatRateBps: i.vatRateBps })),
    company.isSmallBusiness
  );
  const items = valid.map((i, idx) => ({
    position: idx + 1,
    description: i.description,
    quantity: i.quantity,
    unit: i.unit,
    unitPriceCents: i.unitPriceCents,
    vatRateBps: company.isSmallBusiness ? 0 : i.vatRateBps,
    lineTotalCents: Math.round(i.quantity * i.unitPriceCents),
  }));
  const locale = company.defaultLocale === "en" ? "en" : "de";
  const issueDate = (kind === "deliveryNote" ? body.deliveryDate : body.issueDate) ?? new Date();

  return renderDocumentPdf({
    docTypeLabel: LABELS[kind].title,
    numberLabel: LABELS[kind].number,
    documentNumber: "ENTWURF",
    issueDate,
    validUntil: kind === "quote" ? body.validUntil ?? null : null,
    deliveryDate: kind === "confirmation" ? body.expectedDeliveryDate ?? null : null,
    deliveryDateLabel: kind === "confirmation" ? { de: "Voraussichtl. Lieferung", en: "Expected delivery" } : undefined,
    locale,
    branding: company,
    recipient: customer ?? { name: locale === "de" ? "Kunde auswählen …" : "Select a customer …" },
    items: showPrices ? items : items.map(({ unitPriceCents, vatRateBps, lineTotalCents, ...rest }) => rest),
    subtotalCents: showPrices ? totals.subtotalCents : undefined,
    vatBreakdown: showPrices ? vatBreakdownFromLineItems(items) : undefined,
    vatTotalCents: showPrices ? totals.vatTotalCents : undefined,
    totalCents: showPrices ? totals.totalCents : undefined,
    isSmallBusiness: company.isSmallBusiness,
    notes: body.notes || null,
    showPrices,
    showSepaQr: false,
    isDraft: true,
    layout: resolvePdfLayout(company.pdfLayout),
    introText: body.introText,
    closingText: body.closingText,
  });
}
