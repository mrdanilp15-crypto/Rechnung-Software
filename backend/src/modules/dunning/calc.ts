/**
 * Berechnung einer Zahlungserinnerung/Mahnung.
 *
 * Rechtsgrundlagen (zur Orientierung, keine Rechtsberatung):
 *  - Verzug: Ist die Zahlung nach einem kalendermäßig bestimmten Datum fällig (hier: das Fälligkeitsdatum auf der
 *    Rechnung), tritt Verzug ohne Mahnung mit Ablauf dieses Tages ein (§286 Abs. 2 Nr. 1 BGB).
 *  - Verzugszinsen: 5 Prozentpunkte über dem Basiszinssatz bei Verbrauchern, 9 Prozentpunkte bei Geschäften zwischen
 *    Unternehmern (§288 Abs. 1 und 2 BGB).
 *  - Verzugskostenpauschale 40 EUR nur gegenüber Unternehmern, einmal je Forderung (§288 Abs. 5 BGB).
 *  - Mahngebühren sind nur als Ersatz tatsächlich entstandener Kosten (Auslagen) zulässig - die Beträge je Stufe sind
 *    deshalb in den Einstellungen frei wählbar; Stufe 1 (Zahlungserinnerung) bleibt gebührenfrei.
 */

export const FLAT_FEE_B2B_CENTS = 4000;

export interface DunningInput {
  principalCents: number;
  dueDate: Date;
  asOf: Date;
  level: 1 | 2 | 3;
  isBusiness: boolean;
  baseInterestRatePercent: number;
  fee2Cents: number;
  fee3Cents: number;
  deadlineDays: number;
  /** Beträge der zuletzt erzeugten Mahnung (kumulativ) - Gebühren und Pauschale früherer Stufen bleiben bestehen */
  previous?: { feeCents: number; flatFeeCents: number } | null;
}

export interface DunningResult {
  level: 1 | 2 | 3;
  principalCents: number;
  feeCents: number;
  interestCents: number;
  flatFeeCents: number;
  totalCents: number;
  interestRateBps: number;
  daysOverdue: number;
  newDueDate: Date;
}

export function computeDunning(input: DunningInput): DunningResult {
  const dayMs = 86_400_000;
  const daysOverdue = Math.max(0, Math.floor((input.asOf.getTime() - input.dueDate.getTime()) / dayMs));
  const annualPercent = input.baseInterestRatePercent + (input.isBusiness ? 9 : 5);
  const interestRateBps = Math.round(annualPercent * 100);

  const levelFee = input.level === 2 ? input.fee2Cents : input.level === 3 ? input.fee3Cents : 0;
  const feeCents = (input.previous?.feeCents ?? 0) + levelFee;
  const flatFeeCents = input.previous?.flatFeeCents ? input.previous.flatFeeCents : input.level >= 2 && input.isBusiness ? FLAT_FEE_B2B_CENTS : 0;
  // Zinsen erst ab Stufe 2 geltend machen - die Zahlungserinnerung bleibt ein freundlicher Hinweis
  const interestCents = input.level >= 2 && annualPercent > 0 ? Math.round(((input.principalCents * annualPercent) / 100) * (daysOverdue / 365)) : 0;

  return {
    level: input.level,
    principalCents: input.principalCents,
    feeCents,
    interestCents,
    flatFeeCents,
    totalCents: input.principalCents + feeCents + interestCents + flatFeeCents,
    interestRateBps,
    daysOverdue,
    newDueDate: new Date(input.asOf.getTime() + input.deadlineDays * dayMs),
  };
}

export const LEVEL_LABEL: Record<number, { de: string; en: string }> = {
  1: { de: "Zahlungserinnerung", en: "Payment reminder" },
  2: { de: "1. Mahnung", en: "First reminder" },
  3: { de: "2. Mahnung (letzte Mahnung)", en: "Final reminder" },
};
