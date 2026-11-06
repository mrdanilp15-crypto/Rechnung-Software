/**
 * Bauteile eines Produkts (z.B. Tankdeckel = Scharnier + Deckel, je eine 3MF): Summe für die Kalkulation. Gleiche Rechnung wie im Backend
 * (modules/products/parts.ts), dort ist sie maßgeblich - hier dient sie der Live-Anzeige im Formular.
 *
 *   Zeit je Produkt     = Summe aus  Anzahl je Produkt * Druckzeit je Platte / Teile pro Platte
 *   Material je Produkt = Summe aus  Anzahl je Produkt * Menge je Platte    / Teile pro Platte   (je Material)
 */

export interface PartRow {
  key: string;
  name: string;
  /** Anzahl dieses Bauteils je Produkt */
  qty: string;
  /** Teile dieses Bauteils auf einer Druckplatte */
  pieces: string;
  /** Druckzeit je Platte in Minuten */
  minutes: string;
  documentId: string | null;
  fileName: string | null;
  /** Menge je Platte in der Einheit des Materials */
  materials: { materialId: string; quantity: string }[];
}

let seq = 0;
export const newPartKey = () => `part-${Date.now()}-${++seq}`;

const num = (s: string) => {
  const n = parseFloat(String(s).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export function aggregateRows(rows: PartRow[]): { printMinutes: number; materials: { materialId: string; quantity: number }[] } {
  let minutes = 0;
  const by = new Map<string, number>();
  for (const p of rows) {
    const share = (num(p.qty) || 1) / Math.max(1, Math.round(num(p.pieces)) || 1);
    minutes += num(p.minutes) * share;
    for (const m of p.materials) if (m.materialId) by.set(m.materialId, (by.get(m.materialId) ?? 0) + num(m.quantity) * share);
  }
  return { printMinutes: round(minutes, 3), materials: [...by.entries()].map(([materialId, quantity]) => ({ materialId, quantity: round(quantity, 4) })).filter((m) => m.quantity > 0) };
}
