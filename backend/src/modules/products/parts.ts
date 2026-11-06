import { z } from "zod";

/**
 * Bauteile eines Produkts (z.B. Tankdeckel = Scharnier + Deckel, je eine eigene 3MF). Jedes Bauteil hat Druckzeit und Material je Druckplatte,
 * die Anzahl der Teile pro Platte und die Anzahl je Produkt. Reine Rechenlogik (testbar); die Summe ersetzt Druckzeit und Rezept des Produkts.
 *
 *   Zeit je Produkt     = Summe aus  Anzahl je Produkt * Druckzeit je Platte / Teile pro Platte
 *   Material je Produkt = Summe aus  Anzahl je Produkt * Menge je Platte    / Teile pro Platte   (je Material)
 */

export const partSchema = z.object({
  name: z.string().trim().min(1).max(80),
  documentId: z.string().nullish(),
  fileName: z.string().max(200).nullish(),
  quantityPerProduct: z.number().positive().max(10_000),
  piecesPerPlate: z.number().int().min(1).max(10_000),
  printMinutes: z.number().min(0).max(100_000),
  materials: z.array(z.object({ materialId: z.string().min(1), quantity: z.number().min(0).max(10_000_000) })).max(20),
});
export type PartInput = z.infer<typeof partSchema>;

export interface PartMath {
  quantityPerProduct: number;
  piecesPerPlate: number;
  printMinutes: number;
  materials: { materialId: string; quantity: number }[];
}

const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export function aggregateParts(parts: PartMath[]): { printMinutes: number; materials: { materialId: string; quantity: number }[] } {
  let minutes = 0;
  const byMaterial = new Map<string, number>();
  for (const p of parts) {
    const share = p.quantityPerProduct / Math.max(1, p.piecesPerPlate);
    minutes += p.printMinutes * share;
    for (const m of p.materials) byMaterial.set(m.materialId, (byMaterial.get(m.materialId) ?? 0) + m.quantity * share);
  }
  return {
    printMinutes: round(minutes, 3),
    materials: [...byMaterial.entries()].map(([materialId, quantity]) => ({ materialId, quantity: round(quantity, 4) })).filter((m) => m.quantity > 0),
  };
}
