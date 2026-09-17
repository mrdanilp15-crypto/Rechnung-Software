/**
 * Zentrale Steuerlogik. Wird von Rechnungen, Angeboten und Auftragsbestätigungen
 * gleichermaßen genutzt, damit Berechnungslogik nicht dupliziert wird.
 *
 * Kleinunternehmerregelung (§19 UStG): Wenn die Firma (oder zum Belegzeitpunkt der
 * jeweilige Beleg) als Kleinunternehmer markiert ist, wird keine Umsatzsteuer
 * ausgewiesen (vatRate = 0) und stattdessen ein gesetzlich vorgeschriebener Hinweistext
 * auf dem PDF ausgegeben (siehe modules/pdf/documentTemplate.ts).
 */

export interface LineItemInput {
  quantity: number;
  unitPriceCents: number;
  vatRateBps: number; // Basispunkte, z.B. 1900 = 19,00%
}

export interface CalculatedLineItem extends LineItemInput {
  lineTotalCents: number; // Netto-Zeilensumme
}

export interface DocumentTotals {
  subtotalCents: number; // Netto-Summe
  vatBreakdown: Record<number, number>; // vatRateBps -> USt-Betrag in Cent
  vatTotalCents: number;
  totalCents: number; // Brutto-Summe
}

export function roundToCents(value: number): number {
  return Math.round(value);
}

export function calculateLineTotal(item: LineItemInput): CalculatedLineItem {
  const lineTotalCents = roundToCents(item.quantity * item.unitPriceCents);
  return { ...item, lineTotalCents };
}

export function calculateDocumentTotals(items: LineItemInput[], isSmallBusiness: boolean): DocumentTotals {
  const vatBreakdown: Record<number, number> = {};
  let subtotalCents = 0;

  for (const raw of items) {
    const effectiveVatRateBps = isSmallBusiness ? 0 : raw.vatRateBps;
    const line = calculateLineTotal({ ...raw, vatRateBps: effectiveVatRateBps });
    subtotalCents += line.lineTotalCents;
    const vatForLine = roundToCents((line.lineTotalCents * effectiveVatRateBps) / 10000);
    vatBreakdown[effectiveVatRateBps] = (vatBreakdown[effectiveVatRateBps] ?? 0) + vatForLine;
  }

  const vatTotalCents = Object.values(vatBreakdown).reduce((a, b) => a + b, 0);

  return {
    subtotalCents,
    vatBreakdown,
    vatTotalCents,
    totalCents: subtotalCents + vatTotalCents,
  };
}

/**
 * Berechnet die Aufschlüsselung nach Steuersätzen (§14 Abs. 4 Nr. 8 UStG verlangt das
 * "nach Steuersätzen ... aufgeschlüsselte Entgelt") aus bereits gespeicherten
 * Beleg-Positionen (z.B. beim PDF-Erzeugen einer bestehenden Rechnung) - im Unterschied
 * zu calculateDocumentTotals(), das beim Erstellen/Ändern eines Belegs aus rohen
 * Eingabe-Positionen rechnet. Beide müssen bei gleichen Positionen dasselbe Ergebnis liefern.
 */
export function vatBreakdownFromLineItems(items: { vatRateBps: number; lineTotalCents: number }[]): Record<number, number> {
  const breakdown: Record<number, number> = {};
  for (const item of items) {
    const vatForLine = roundToCents((item.lineTotalCents * item.vatRateBps) / 10000);
    breakdown[item.vatRateBps] = (breakdown[item.vatRateBps] ?? 0) + vatForLine;
  }
  return breakdown;
}

export function formatCents(cents: number, currency = "EUR", locale = "de-DE"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

export const SMALL_BUSINESS_NOTICE_DE =
  "Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).";
export const SMALL_BUSINESS_NOTICE_EN =
  "No VAT is charged in accordance with §19 of the German VAT Act (small business regulation).";
