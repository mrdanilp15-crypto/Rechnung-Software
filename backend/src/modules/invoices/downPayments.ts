import type { Company, Customer, Prisma, PrismaClient } from "@prisma/client";
import { HttpError } from "../../middleware/errorHandler";
import { buildInvoiceFinancials, defaultDueDate, InvoiceItemInput } from "./build";

type Db = Prisma.TransactionClient | PrismaClient;

const dateDe = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/**
 * Legt aus den Positionen eines Angebots/einer Auftragsbestätigung eine Anzahlungsrechnung (Entwurf) an: Prozentsatz
 * oder fester Nettobetrag, aufgeteilt nach den Steuersätzen der Positionen. Die Umsatzsteuer entsteht bereits mit der
 * Vereinnahmung der Anzahlung (§13 Abs. 1 Nr. 1 Buchst. a UStG), deshalb wird sie wie bei einer normalen Rechnung ausgewiesen.
 */
export async function createDownPaymentInvoice(
  db: Db,
  p: {
    company: Company;
    customer: Customer;
    sourceItems: { vatRateBps: number; lineTotalCents: number }[];
    percent?: number;
    netAmountCents?: number;
    sourceLabel: string; // z.B. "Auftragsbestätigung AB-2026-0001"
    sourceQuoteId?: string | null;
    sourceOrderConfirmationId?: string | null;
  }
) {
  const byRate = new Map<number, number>();
  for (const i of p.sourceItems) byRate.set(i.vatRateBps, (byRate.get(i.vatRateBps) ?? 0) + i.lineTotalCents);
  const totalNet = [...byRate.values()].reduce((a, b) => a + b, 0);
  if (totalNet <= 0) throw new HttpError(400, "Die Grundlage hat keinen Nettobetrag - eine Anzahlung ist nicht berechenbar.");

  let target: number;
  let label: string;
  if (p.netAmountCents !== undefined) {
    target = p.netAmountCents;
    label = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(target / 100);
  } else {
    const pct = p.percent ?? 30;
    if (!(pct > 0 && pct <= 100)) throw new HttpError(400, "Der Prozentsatz muss zwischen 0 und 100 liegen.");
    target = Math.round((totalNet * pct) / 100);
    label = `${pct.toLocaleString("de-DE")} %`;
  }
  if (target <= 0 || target > totalNet) throw new HttpError(400, "Der Anzahlungsbetrag muss größer als 0 und höchstens so hoch wie der Nettobetrag sein.");

  // Aufteilung auf die Steuersätze nach Anteil am Nettobetrag, Rundungsrest auf die letzte Gruppe
  const rates = [...byRate.entries()];
  let remaining = target;
  const items: InvoiceItemInput[] = rates.map(([rate, net], idx) => {
    const share = idx === rates.length - 1 ? remaining : Math.round((target * net) / totalNet);
    remaining -= share;
    return {
      description: `Anzahlung ${label} auf ${p.sourceLabel}${rates.length > 1 ? ` (${rate / 100} % USt.)` : ""}`,
      quantity: 1,
      unit: "",
      unitPriceCents: share,
      vatRateBps: rate,
    };
  });

  const financials = buildInvoiceFinancials(p.company, p.customer, items, "GOODS");
  const issueDate = new Date();
  return db.invoice.create({
    data: {
      companyId: p.company.id,
      customerId: p.customer.id,
      kind: "DOWN_PAYMENT",
      issueDate,
      dueDate: defaultDueDate(p.company, issueDate),
      isSmallBusiness: financials.isSmallBusiness,
      vatNoticeKey: financials.vatNoticeKey,
      sourceQuoteId: p.sourceQuoteId ?? undefined,
      sourceOrderConfirmationId: p.sourceOrderConfirmationId ?? undefined,
      introText: p.company.invoiceIntroText,
      closingText: p.company.invoiceClosingText,
      footerText: p.company.invoiceFooterText,
      subtotalCents: financials.subtotalCents,
      vatTotalCents: financials.vatTotalCents,
      totalCents: financials.totalCents,
      items: { create: financials.itemsCreate },
    },
    include: { items: true, customer: true },
  });
}

/**
 * Abzugspositionen für die Schlussrechnung: alle bereits ausgestellten, noch nicht abgezogenen Anzahlungsrechnungen zu
 * diesem Angebot bzw. dieser Auftragsbestätigung. Je Anzahlungsposition eine negative Zeile mit demselben Steuersatz -
 * dadurch sinken Entgelt und Umsatzsteuer der Schlussrechnung um genau die bereits versteuerten Beträge (§14 Abs. 5 UStG).
 */
export async function deductionLinesFor(db: Db, companyId: string, source: { quoteId?: string | null; orderConfirmationId?: string | null }) {
  const or: Prisma.InvoiceWhereInput[] = [];
  if (source.quoteId) or.push({ sourceQuoteId: source.quoteId });
  if (source.orderConfirmationId) or.push({ sourceOrderConfirmationId: source.orderConfirmationId });
  if (or.length === 0) return { items: [] as InvoiceItemInput[], downPaymentIds: [] as string[] };

  const downPayments = await db.invoice.findMany({
    where: { companyId, kind: "DOWN_PAYMENT", finalInvoiceId: null, status: { in: ["SENT", "PAID", "OVERDUE"] }, OR: or },
    include: { items: true },
    orderBy: { issueDate: "asc" },
  });
  const items: InvoiceItemInput[] = [];
  for (const dp of downPayments) {
    for (const i of dp.items) {
      items.push({
        description: `Abzüglich Anzahlung ${dp.invoiceNumber} vom ${dateDe(dp.issueDate)}`,
        quantity: 1,
        unit: "",
        unitPriceCents: -i.lineTotalCents,
        vatRateBps: i.vatRateBps,
        isDownPaymentDeduction: true,
        deductsInvoiceId: dp.id,
      });
    }
  }
  return { items, downPaymentIds: downPayments.map((d) => d.id) };
}
