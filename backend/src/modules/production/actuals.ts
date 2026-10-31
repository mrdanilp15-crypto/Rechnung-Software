/**
 * Ist-Kosten aus den Drucken eines Auftrags: gemessenes Material (zum Einkaufspreis bei der Abbuchung) und Maschinenkosten
 * (Strom, Abschreibung, Verschleiß je Betriebsstunde). Arbeit, Verpackung und Gemeinkosten sind nicht messbar und bleiben im Vergleich außen vor.
 * Die Formeln entsprechen der Kalkulation (frontend/src/lib/cost.ts), damit Soll und Ist vergleichbar sind.
 */

export interface PrinterRates {
  powerWatts: number;
  purchasePriceCents: number;
  lifetimeHours: number;
  usedHoursBefore: number;
  wearCentsPerHour: number;
}

export interface MachineCost {
  electricity: number;
  depreciation: number;
  wear: number;
  total: number;
}

export function machineCost(minutes: number | null, printer: PrinterRates | null, electricityCentsPerKwh: number): MachineCost {
  const hours = Math.max(0, minutes ?? 0) / 60;
  if (!printer || hours === 0) return { electricity: 0, depreciation: 0, wear: 0, total: 0 };
  const remaining = printer.lifetimeHours - Math.max(0, printer.usedHoursBefore);
  const electricity = hours * (printer.powerWatts / 1000) * electricityCentsPerKwh;
  const depreciation = remaining > 0 ? (hours * printer.purchasePriceCents) / remaining : 0;
  const wear = hours * printer.wearCentsPerHour;
  return { electricity, depreciation, wear, total: electricity + depreciation + wear };
}

export interface UsageLine {
  materialId: string;
  name: string;
  grams: number;
  cents?: number;
}
export interface MaterialPrice {
  unit: string;
  costPerUnitCents: number;
}

/** Verbrauch eines Drucks mit Kosten in Cent; ältere Einträge ohne gespeicherten Betrag werden mit dem aktuellen Lagerpreis bewertet. */
export function usageWithCosts(usage: unknown, prices: Map<string, MaterialPrice>): { materialId: string; name: string; grams: number; cents: number; estimated: boolean }[] {
  if (!Array.isArray(usage)) return [];
  return (usage as UsageLine[]).map((u) => {
    if (typeof u.cents === "number") return { materialId: u.materialId, name: u.name, grams: u.grams, cents: u.cents, estimated: false };
    const price = prices.get(u.materialId);
    const unit = price?.unit.trim().toLowerCase();
    const amount = unit === "g" || unit === "gramm" ? u.grams : unit === "kg" ? u.grams / 1000 : null;
    return { materialId: u.materialId, name: u.name, grams: u.grams, cents: amount !== null && price ? amount * price.costPerUnitCents : 0, estimated: true };
  });
}

/** Produktname einer Auftragsposition (erste Zeile, ohne Groß-/Kleinschreibung) zum Abgleich mit dem Katalog. */
export function itemProductKey(description: string): string {
  return description.split("\n")[0].trim().toLowerCase();
}
