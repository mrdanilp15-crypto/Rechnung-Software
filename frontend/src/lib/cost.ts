/**
 * Selbstkostenrechnung für 3D-Druck (alle Beträge in Cent, Bruchteile möglich).
 *
 * Material      = Σ (Menge × Preis je Einheit) × (1 + Ausschuss%)
 * Strom         = Druckstunden × kW × Strompreis (€/kWh)
 * Abschreibung  = Druckstunden × Anschaffungspreis ÷ Lebensdauer in Stunden
 * Verschleiß    = Druckstunden × Verschleiß/Wartung je Stunde
 * Arbeit        = Arbeitsstunden × Arbeitsstundensatz
 * Gemeinkosten  = (Summe der obigen) × Gemeinkosten%
 * Selbstkosten  = Summe inkl. Gemeinkosten; Preisvorschlag = Selbstkosten × (1 + Gewinnaufschlag%)
 *
 * Ist kein Drucker gewählt, gilt stattdessen der pauschale Maschinenstundensatz (Strom/Abschreibung/Verschleiß = 0).
 */

export interface PrinterCosts {
  purchasePriceCents: number;
  lifetimeHours: number;
  powerWatts: number;
  wearCentsPerHour: number;
}

export interface CostRates {
  machineRateCentsPerHour: number; // pauschal, nur ohne Drucker
  laborRateCentsPerHour: number;
  materialWastePercent: number;
  targetMarginPercent: number;
  electricityCentsPerKwh: number;
  overheadPercent: number;
}

export interface CostResult {
  material: number;
  electricity: number;
  depreciation: number;
  wear: number;
  machineFlat: number;
  labor: number;
  overhead: number;
  total: number;
  recommended: number;
}

export function calcCost(
  used: { quantityPerUnit: number; costPerUnitCents: number }[],
  printMinutes: number,
  laborMinutes: number,
  rates: CostRates,
  printer?: PrinterCosts | null
): CostResult {
  const printHours = Math.max(0, printMinutes) / 60;
  const material = used.reduce((s, m) => s + m.quantityPerUnit * m.costPerUnitCents, 0) * (1 + rates.materialWastePercent / 100);
  const electricity = printer ? printHours * (printer.powerWatts / 1000) * rates.electricityCentsPerKwh : 0;
  const depreciation = printer && printer.lifetimeHours > 0 ? printHours * (printer.purchasePriceCents / printer.lifetimeHours) : 0;
  const wear = printer ? printHours * printer.wearCentsPerHour : 0;
  const machineFlat = printer ? 0 : printHours * rates.machineRateCentsPerHour;
  const labor = (Math.max(0, laborMinutes) / 60) * rates.laborRateCentsPerHour;
  const subtotal = material + electricity + depreciation + wear + machineFlat + labor;
  const overhead = subtotal * (rates.overheadPercent / 100);
  const total = subtotal + overhead;
  return { material, electricity, depreciation, wear, machineFlat, labor, overhead, total, recommended: total * (1 + rates.targetMarginPercent / 100) };
}

/** Kosten einer Druckstunde auf diesem Drucker (ohne Material/Arbeit) - zur Anzeige in der Druckerverwaltung. */
export function printerHourlyCost(printer: PrinterCosts, electricityCentsPerKwh: number) {
  const electricity = (printer.powerWatts / 1000) * electricityCentsPerKwh;
  const depreciation = printer.lifetimeHours > 0 ? printer.purchasePriceCents / printer.lifetimeHours : 0;
  const wear = printer.wearCentsPerHour;
  return { electricity, depreciation, wear, total: electricity + depreciation + wear };
}
