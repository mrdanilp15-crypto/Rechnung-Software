import { gramsToUnit, type UsageEntry } from "./bambu/amsBooking";

/**
 * Materialverbrauch eines Drucks von Hand festlegen/korrigieren (z.B. bei Drucken aus Bambu Studio, bei denen die AMS-Messung nur
 * ganze Prozent kennt oder das Fach keinem Material zugeordnet ist). Der Unterschied zum bisher Gebuchten geht in den Materialbestand.
 */

export interface UsageInput {
  materialId: string;
  grams: number;
}

export interface MaterialInfo {
  name: string;
  unit: string;
  costPerUnitCents: number;
}

export interface StockDelta {
  materialId: string;
  /** In der Einheit des Materials; positiv = mehr verbraucht als bisher gebucht (Bestand sinkt) */
  amount: number;
  /** Einheit ist weder g noch kg: Bestand lässt sich nicht umrechnen und bleibt unverändert */
  skipped: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Gleiche Materialien zusammenfassen, Mengen auf 2 Nachkommastellen, leere Zeilen entfernen. */
export function normalizeUsage(list: UsageInput[]): UsageInput[] {
  const sums = new Map<string, number>();
  for (const u of list) sums.set(u.materialId, (sums.get(u.materialId) ?? 0) + u.grams);
  return [...sums.entries()].map(([materialId, grams]) => ({ materialId, grams: round2(grams) })).filter((u) => u.grams > 0);
}

export function planUsageChange(oldUsage: unknown, next: UsageInput[], materials: Map<string, MaterialInfo>): { entries: UsageEntry[]; deltas: StockDelta[] } {
  const old = Array.isArray(oldUsage) ? (oldUsage as UsageEntry[]) : [];
  const oldGrams = new Map<string, number>();
  for (const o of old) oldGrams.set(o.materialId, (oldGrams.get(o.materialId) ?? 0) + o.grams);
  const wanted = normalizeUsage(next);
  const ids = new Set([...oldGrams.keys(), ...wanted.map((w) => w.materialId)]);

  const deltas: StockDelta[] = [];
  for (const id of ids) {
    const grams = (wanted.find((w) => w.materialId === id)?.grams ?? 0) - (oldGrams.get(id) ?? 0);
    if (Math.abs(grams) < 0.005) continue;
    const m = materials.get(id);
    const amount = m ? gramsToUnit(grams, m.unit) : null;
    deltas.push({ materialId: id, amount: amount === null ? 0 : round2(amount * 1000) / 1000, skipped: amount === null });
  }

  const entries: UsageEntry[] = wanted.map((w) => {
    const m = materials.get(w.materialId);
    const prev = old.find((o) => o.materialId === w.materialId);
    const entry: UsageEntry = { materialId: w.materialId, name: m?.name ?? prev?.name ?? "Material", grams: w.grams };
    if (prev && typeof prev.cents === "number" && Math.abs(prev.grams - w.grams) < 0.005) {
      entry.cents = prev.cents; // unverändert: Einkaufspreis von damals behalten
    } else if (m) {
      const amount = gramsToUnit(w.grams, m.unit);
      if (amount !== null) entry.cents = round2(amount * m.costPerUnitCents);
    }
    return entry;
  });
  return { entries, deltas };
}

/** Name ohne Endung und Sonderzeichen, klein - zum Vergleich von Druckname und Dateiname. */
export function nameKey(s: string): string {
  return s.toLowerCase().replace(/\.gcode\.3mf$|\.3mf$|\.gcode$/g, "").replace(/[^a-z0-9äöüß]+/g, "");
}

/** Passende 3MF im Archiv zum Namen eines Druckauftrags: erst genau, dann Titel, dann enthalten (mindestens 4 Zeichen). */
export function matchJobFile<T extends { fileName: string; title: string }>(jobName: string | null, docs: T[]): T | null {
  if (!jobName) return null;
  const k = nameKey(jobName);
  if (k.length < 2) return null;
  const exact = docs.find((d) => nameKey(d.fileName) === k) ?? docs.find((d) => nameKey(d.title) === k);
  if (exact) return exact;
  if (k.length < 4) return null;
  return docs.find((d) => { const f = nameKey(d.fileName); return f.length >= 4 && (f.includes(k) || k.includes(f)); }) ?? null;
}
