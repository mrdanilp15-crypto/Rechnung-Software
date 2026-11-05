/** Reine Auswertungen für die Statistikseite (ohne Datenbankzugriff, damit sie testbar sind). */

export interface ItemRow {
  description: string;
  quantity: number;
  lineTotalCents: number;
}
export interface Bestseller {
  name: string;
  quantity: number;
  revenueCents: number;
}

/** Bestseller nach verkaufter Menge; Positionen mit gleichem Namen (erste Textzeile) werden zusammengefasst. */
export function bestsellers(items: ItemRow[], limit = 10): Bestseller[] {
  const map = new Map<string, Bestseller>();
  for (const it of items) {
    const name = it.description.split(String.fromCharCode(10))[0].trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const e = map.get(key) ?? { name, quantity: 0, revenueCents: 0 };
    e.quantity += it.quantity;
    e.revenueCents += it.lineTotalCents;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.revenueCents - a.revenueCents).slice(0, limit);
}

export interface UsageJob {
  materialUsage: unknown;
}
export interface MaterialUse {
  materialId: string;
  name: string;
  grams: number;
  cents: number;
}

/** Materialverbrauch aus den Druckaufträgen (materialUsage je Auftrag), je Material summiert. */
export function materialConsumption(jobs: UsageJob[], limit = 10): MaterialUse[] {
  const map = new Map<string, MaterialUse>();
  for (const j of jobs) {
    if (!Array.isArray(j.materialUsage)) continue;
    for (const u of j.materialUsage as { materialId?: string; name?: string; grams?: number; cents?: number }[]) {
      if (!u?.materialId) continue;
      const e = map.get(u.materialId) ?? { materialId: u.materialId, name: u.name ?? "Material", grams: 0, cents: 0 };
      e.grams += u.grams ?? 0;
      e.cents += u.cents ?? 0;
      map.set(u.materialId, e);
    }
  }
  return [...map.values()].map((m) => ({ ...m, grams: Math.round(m.grams), cents: Math.round(m.cents) })).sort((a, b) => b.grams - a.grams).slice(0, limit);
}

/** Zwölf Monatswerte (Index 0 = Januar) aus Datum und Betrag. */
export function byMonth<T>(rows: T[], date: (r: T) => Date, cents: (r: T) => number): number[] {
  const out = Array<number>(12).fill(0);
  for (const r of rows) out[date(r).getMonth()] += cents(r);
  return out;
}
