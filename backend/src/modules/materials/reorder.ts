/**
 * Nachbestellliste: Material unter dem Mindestbestand, je Lieferant gruppiert, mit Mengenvorschlag.
 * Vorschlag: bis auf den doppelten Mindestbestand auffüllen, aufgerundet auf sinnvolle Schritte (g: 100, kg: 0,5, sonst ganze Stück).
 */

export interface ReorderMaterial {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  stockQuantity: number;
  minStock: number;
  supplier: { id: string; name: string; email: string | null; contactName: string | null; customerNumber: string | null } | null;
}

export interface ReorderItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  stock: number;
  minStock: number;
  suggestedQty: number;
}

export interface ReorderGroup {
  supplier: ReorderMaterial["supplier"];
  items: ReorderItem[];
}

export function suggestQty(stock: number, minStock: number, unit: string): number {
  const need = Math.max(minStock * 2 - Math.max(stock, 0), minStock > 0 ? minStock : 1);
  const u = unit.trim().toLowerCase();
  const step = u === "g" || u === "gramm" ? 100 : u === "kg" ? 0.5 : 1;
  return Math.round(Math.ceil(need / step - 1e-9) * step * 1000) / 1000;
}

export function buildReorder(materials: ReorderMaterial[]): ReorderGroup[] {
  const low = materials.filter((m) => m.minStock > 0 && m.stockQuantity <= m.minStock);
  const groups = new Map<string, ReorderGroup>();
  for (const m of low.sort((a, b) => a.name.localeCompare(b.name, "de"))) {
    const key = m.supplier?.id ?? "-";
    const g = groups.get(key) ?? { supplier: m.supplier, items: [] };
    g.items.push({ id: m.id, name: m.name, sku: m.sku, unit: m.unit, stock: m.stockQuantity, minStock: m.minStock, suggestedQty: suggestQty(m.stockQuantity, m.minStock, m.unit) });
    groups.set(key, g);
  }
  // Lieferanten alphabetisch, "ohne Lieferant" zuletzt
  return [...groups.values()].sort((a, b) => (a.supplier && b.supplier ? a.supplier.name.localeCompare(b.supplier.name, "de") : a.supplier ? -1 : b.supplier ? 1 : 0));
}
