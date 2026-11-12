/** Brutto, Netto und Steuerbetrag ineinander umrechnen (Cent, kaufmännisch gerundet). Reine Funktionen (testbar). */

export interface TaxSplit {
  grossCents: number;
  netCents: number;
  vatCents: number;
}

/** "12,34" oder "12.34" -> Cent (ungültig = 0) */
export function eurToCents(text: string): number {
  const n = parseFloat(String(text).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Cent -> Text für ein Zahlenfeld, z.B. 1234 -> "12.34" */
export const centsToField = (cents: number) => (cents / 100).toFixed(2);

/** Aus dem Bruttobetrag: Steuer = Brutto * Satz / (100 % + Satz) */
export function fromGross(grossCents: number, rateBps: number): TaxSplit {
  const vatCents = Math.round((grossCents * rateBps) / (10000 + rateBps));
  return { grossCents, vatCents, netCents: grossCents - vatCents };
}

/** Aus dem Nettobetrag: Steuer = Netto * Satz */
export function fromNet(netCents: number, rateBps: number): TaxSplit {
  const vatCents = Math.round((netCents * rateBps) / 10000);
  return { netCents, vatCents, grossCents: netCents + vatCents };
}

/** Aus dem Steuerbetrag: Netto = Steuer / Satz. Ohne Steuersatz (0 %) gibt es keinen Steuerbetrag, Netto bleibt dann 0. */
export function fromVat(vatCents: number, rateBps: number): TaxSplit {
  if (rateBps <= 0) return { vatCents: 0, netCents: 0, grossCents: 0 };
  const netCents = Math.round((vatCents * 10000) / rateBps);
  return { vatCents, netCents, grossCents: netCents + vatCents };
}
