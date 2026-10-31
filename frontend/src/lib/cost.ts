/**
 * Selbstkostenrechnung für 3D-Druck (alle Beträge in Cent, Bruchteile möglich), je Einheit des Produkts.
 *
 * Material      = Σ (Menge × Preis je Einheit) × (1 + Ausschuss% + Zusatzverlust% des Produkts)
 * Strom         = Druckstunden × kW × Strompreis (€/kWh)
 * Abschreibung  = Druckstunden × Anschaffungspreis ÷ Lebensdauer in Stunden
 * Verschleiß    = Druckstunden × Verschleiß/Wartung je Stunde
 * Fehldrucke    = (Strom + Abschreibung + Verschleiß bzw. pauschale Maschine) × Fehldruckquote%
 * Arbeit        = (Arbeitsminuten + Rüstzeit ÷ Menge) ÷ 60 × Arbeitsstundensatz
 * Verpackung    = Verpackung/Versand je Einheit
 * Weitere Kosten = Summe der Nachbearbeitungs-/Veredelungsposten je Einheit (z.B. Lackieren, Klarlack, Magnete)
 * Gemeinkosten  = (Summe der obigen) × Gemeinkosten%
 * Selbstkosten  = Summe inkl. Gemeinkosten
 * Preisvorschlag = Selbstkosten × (1 + Gewinnaufschlag%) ÷ (1 − Plattformgebühr%), danach gerundet und mindestens Mindestpreis
 *
 * Ist kein Drucker gewählt, gilt stattdessen der pauschale Maschinenstundensatz (Strom/Abschreibung/Verschleiß = 0).
 */

/** Abschreibung je Druckstunde: Kaufpreis geteilt durch die Restlebensdauer (Lebensdauer minus vorher bereits gelaufene Stunden). */
export function depreciationPerHour(p: PrinterCosts): number {
  const remaining = p.lifetimeHours - Math.max(0, p.usedHoursBefore ?? 0);
  return remaining > 0 ? p.purchasePriceCents / remaining : 0;
}

export interface PrinterCosts {
  purchasePriceCents: number;
  lifetimeHours: number;
  usedHoursBefore?: number; // vor der Erfassung schon gelaufene Stunden
  powerWatts: number;
  wearCentsPerHour: number;
}

export type PriceRounding = "NONE" | "5" | "10" | "50" | "100" | "90" | "99";

export interface CostRates {
  machineRateCentsPerHour: number; // pauschal, nur ohne Drucker
  laborRateCentsPerHour: number;
  materialWastePercent: number;
  targetMarginPercent: number;
  electricityCentsPerKwh: number;
  overheadPercent: number;
  failRatePercent: number;
  platformFeePercent: number;
  priceRounding: PriceRounding;
  minPriceCents: number;
}

/** Produktbezogene Zusatzwerte der Kalkulation. */
export interface CostExtras {
  setupMinutes?: number; // einmal je Auftrag
  packagingCents?: number; // je Einheit
  extraCostsCents?: number; // Veredelung/Nachbearbeitung je Einheit (Summe aller Posten)
  extraMaterialPercent?: number; // zusätzlicher Materialverlust (z.B. Spülmaterial bei Mehrfarbdruck)
  quantity?: number; // Auftragsmenge, auf die sich die Rüstzeit verteilt (Standard 1)
}

export interface CostResult {
  material: number;
  electricity: number;
  depreciation: number;
  wear: number;
  machineFlat: number;
  failures: number;
  labor: number;
  setup: number; // Anteil der Rüstzeit je Einheit (in labor enthalten, nur zur Anzeige)
  packaging: number;
  extras: number; // Veredelung/Nachbearbeitung
  overhead: number;
  total: number;
  /** Preisvorschlag vor Rundung */
  recommendedRaw: number;
  /** Preisvorschlag gerundet (netto je Einheit) */
  recommended: number;
}

/** Rundet einen Preis (Cent) auf: Schritte von 5/10/50/100 Cent oder auf ,90 bzw. ,99. */
export function roundPrice(cents: number, mode: PriceRounding): number {
  if (!(cents > 0) || mode === "NONE") return cents;
  if (mode === "90" || mode === "99") {
    const end = Number(mode);
    const euros = Math.ceil((cents - end) / 100 - 1e-9);
    return Math.max(0, euros) * 100 + end;
  }
  const step = Number(mode);
  return Math.ceil(cents / step - 1e-9) * step;
}

export function calcCost(
  used: { quantityPerUnit: number; costPerUnitCents: number }[],
  printMinutes: number,
  laborMinutes: number,
  rates: CostRates,
  printer?: PrinterCosts | null,
  extras_: CostExtras = {}
): CostResult {
  const printHours = Math.max(0, printMinutes) / 60;
  const quantity = Math.max(1, extras_.quantity ?? 1);
  const material = used.reduce((s, m) => s + m.quantityPerUnit * m.costPerUnitCents, 0) * (1 + (rates.materialWastePercent + (extras_.extraMaterialPercent ?? 0)) / 100);
  const electricity = printer ? printHours * (printer.powerWatts / 1000) * rates.electricityCentsPerKwh : 0;
  const depreciation = printer ? printHours * depreciationPerHour(printer) : 0;
  const wear = printer ? printHours * printer.wearCentsPerHour : 0;
  const machineFlat = printer ? 0 : printHours * rates.machineRateCentsPerHour;
  const failures = (electricity + depreciation + wear + machineFlat) * (rates.failRatePercent / 100);
  const setup = ((Math.max(0, extras_.setupMinutes ?? 0) / 60) * rates.laborRateCentsPerHour) / quantity;
  const labor = (Math.max(0, laborMinutes) / 60) * rates.laborRateCentsPerHour + setup;
  const packaging = Math.max(0, extras_.packagingCents ?? 0);
  const extras = Math.max(0, extras_.extraCostsCents ?? 0);
  const subtotal = material + electricity + depreciation + wear + machineFlat + failures + labor + packaging + extras;
  const overhead = subtotal * (rates.overheadPercent / 100);
  const total = subtotal + overhead;
  const feeFactor = 1 - Math.min(rates.platformFeePercent, 90) / 100;
  const recommendedRaw = (total * (1 + rates.targetMarginPercent / 100)) / feeFactor;
  const recommended = total > 0 ? Math.max(roundPrice(recommendedRaw, rates.priceRounding), rates.minPriceCents) : 0;
  return { material, electricity, depreciation, wear, machineFlat, failures, labor, setup, packaging, extras, overhead, total, recommendedRaw, recommended };
}

/** Gebühren (Plattform/Zahlung), die bei diesem Verkaufspreis anfallen. */
export function feesAt(priceCents: number, rates: CostRates): number {
  return priceCents * (Math.min(rates.platformFeePercent, 90) / 100);
}

/** Kosten einer Druckstunde auf diesem Drucker (ohne Material/Arbeit) - zur Anzeige in der Druckerverwaltung. */
export function printerHourlyCost(printer: PrinterCosts, electricityCentsPerKwh: number) {
  const electricity = (printer.powerWatts / 1000) * electricityCentsPerKwh;
  const depreciation = depreciationPerHour(printer);
  const wear = printer.wearCentsPerHour;
  return { electricity, depreciation, wear, total: electricity + depreciation + wear };
}

export interface PriceTier {
  minQuantity: number;
  unitPriceCents: number;
}

/** Stückpreis bei einer Menge: Staffelpreis mit der höchsten passenden Mindestmenge, sonst der Grundpreis. */
export function unitPriceForQuantity(basePriceCents: number, tiers: PriceTier[] | null | undefined, quantity: number): number {
  if (!tiers?.length) return basePriceCents;
  const hit = [...tiers].filter((t) => quantity >= t.minQuantity).sort((a, b) => b.minQuantity - a.minQuantity)[0];
  return hit ? hit.unitPriceCents : basePriceCents;
}
