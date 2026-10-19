import type { Company, Customer } from "@prisma/client";
import { calculateDocumentTotals } from "../tax/calculator";
import { determineVatTreatment, type SupplyType } from "../tax/euVat";

export interface InvoiceItemInput {
  productId?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  vatRateBps: number;
  isDownPaymentDeduction?: boolean;
  deductsInvoiceId?: string | null;
}

/**
 * Einzige Stelle, an der aus Rohpositionen die steuerlich relevanten Rechnungswerte
 * berechnet werden (Summen, USt.-Behandlung, Hinweisschlüssel). Wird von POST/PATCH /invoices
 * UND von der Angebots→Rechnungs-Umwandlung genutzt - zuvor übernahm die Umwandlung die
 * Beträge 1:1 aus dem Angebot und umging dadurch Reverse-Charge/Ausfuhr/Kleinunternehmer.
 *
 * Reverse-Charge (innergemeinschaftliche B2B-Leistung) bzw. steuerfreie Ausfuhrlieferung
 * (Nicht-EU) erzwingen ebenfalls 0% USt., unabhängig von der Kleinunternehmerregelung -
 * siehe tax/euVat.ts. Kleinunternehmer haben ohnehin nie USt.
 */
export function buildInvoiceFinancials(company: Pick<Company, "isSmallBusiness" | "country">, customer: Pick<Customer, "type" | "country" | "vatId">, items: InvoiceItemInput[], supplyType: SupplyType = "GOODS") {
  const vatTreatment = company.isSmallBusiness ? { forceZeroVat: false, noticeKey: null } : determineVatTreatment(company.country, customer, supplyType);
  const forceZeroVat = company.isSmallBusiness || vatTreatment.forceZeroVat;
  const totals = calculateDocumentTotals(items, forceZeroVat);
  return {
    isSmallBusiness: company.isSmallBusiness,
    vatNoticeKey: vatTreatment.noticeKey,
    subtotalCents: totals.subtotalCents,
    vatTotalCents: totals.vatTotalCents,
    totalCents: totals.totalCents,
    itemsCreate: items.map((item, idx) => ({
      position: idx + 1,
      productId: item.productId ?? undefined,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      vatRateBps: forceZeroVat ? 0 : item.vatRateBps,
      lineTotalCents: Math.round(item.quantity * item.unitPriceCents),
      isDownPaymentDeduction: item.isDownPaymentDeduction ?? false,
      deductsInvoiceId: item.deductsInvoiceId ?? undefined,
    })),
  };
}

/** Fälligkeitsdatum aus dem Standard-Zahlungsziel der Firma (leer, wenn dort 0 Tage stehen). */
export function defaultDueDate(company: Pick<Company, "paymentTermDays">, issueDate: Date): Date | undefined {
  if (!company.paymentTermDays || company.paymentTermDays <= 0) return undefined;
  return new Date(issueDate.getTime() + company.paymentTermDays * 86_400_000);
}
