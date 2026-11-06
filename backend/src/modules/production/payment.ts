/**
 * Zahlstatus eines Auftrags aus seinen Rechnungen (Produktionsboard). Reine Logik ohne Datenbankzugriff (testbar).
 *
 * NONE    keine Rechnung zum Auftrag
 * DRAFT   Rechnung vorhanden, aber noch Entwurf (nicht fertiggestellt)
 * OPEN    Rechnung ausgestellt, noch nichts bezahlt
 * PARTIAL Teilweise bezahlt (Anzahlung bezahlt, Rest noch offen oder noch nicht abgerechnet)
 * PAID    alles Ausgestellte ist bezahlt
 */
export type PaymentState = "NONE" | "DRAFT" | "OPEN" | "PARTIAL" | "PAID";

export interface PaymentInvoice {
  id: string;
  invoiceNumber: string | null;
  status: string;
  totalCents: number;
  isCancellationDocument: boolean;
  /** STANDARD | DOWN_PAYMENT | FINAL */
  kind?: string | null;
}

export interface PaymentSummary {
  state: PaymentState;
  /** Summe der ausgestellten, noch nicht bezahlten Rechnungen */
  openCents: number;
  /** Die Rechnung, um die es geht (zuerst eine offene, sonst die letzte), zum Verlinken */
  invoice: { id: string; number: string | null } | null;
}

export function paymentSummary(invoices: PaymentInvoice[]): PaymentSummary {
  const real = invoices.filter((i) => !i.isCancellationDocument && i.status !== "CANCELLED");
  if (real.length === 0) return { state: "NONE", openCents: 0, invoice: null };

  const issued = real.filter((i) => i.status !== "DRAFT");
  const pick = (i: PaymentInvoice | undefined) => (i ? { id: i.id, number: i.invoiceNumber } : null);
  if (issued.length === 0) return { state: "DRAFT", openCents: 0, invoice: pick(real[real.length - 1]) };

  const paid = issued.filter((i) => i.status === "PAID");
  const open = issued.filter((i) => i.status !== "PAID");
  const openCents = open.reduce((s, i) => s + i.totalCents, 0);

  if (open.length > 0) return { state: paid.length > 0 ? "PARTIAL" : "OPEN", openCents, invoice: pick(open[0]) };
  // Alles Ausgestellte ist bezahlt - war es aber nur eine Anzahlung (noch keine Schluss-/Standardrechnung), ist der Auftrag erst angezahlt
  const onlyDownPayments = issued.every((i) => i.kind === "DOWN_PAYMENT");
  return { state: onlyDownPayments ? "PARTIAL" : "PAID", openCents: 0, invoice: pick(issued[issued.length - 1]) };
}
