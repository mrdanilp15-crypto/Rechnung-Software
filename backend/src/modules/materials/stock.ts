import { Prisma } from "@prisma/client";

/**
 * Passt den Materialbestand anhand der Rezepte (ProductMaterial) der Positionen einer
 * Rechnung an. sign=-1 beim Erstellen/Ändern (neuen Verbrauch abziehen), sign=1 beim
 * Löschen bzw. vor dem Ändern eines Entwurfs (alten Verbrauch zurückbuchen - siehe
 * PATCH /invoices/:id, das erst die alten Positionen gutschreibt und dann die neuen
 * abzieht, damit der Bestand nach jeder Bearbeitung wieder korrekt ist). Nutzt immer den
 * AKTUELLEN Rezeptstand - wurde das Rezept eines Produkts nach dem Erstellen der Rechnung
 * geändert, wird entsprechend der neuen Rezeptur zurückgebucht, nicht der zum
 * Erstellzeitpunkt gültigen.
 */
async function adjustMaterialStock(
  tx: Prisma.TransactionClient,
  items: { productId?: string | null; quantity: number }[],
  sign: 1 | -1
) {
  const productIds = [...new Set(items.filter((i) => i.productId).map((i) => i.productId as string))];
  if (productIds.length === 0) return;

  const recipes = await tx.productMaterial.findMany({ where: { productId: { in: productIds } } });
  if (recipes.length === 0) return;

  const deltaByMaterial = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    for (const recipe of recipes) {
      if (recipe.productId !== item.productId) continue;
      const delta = sign * recipe.quantityPerUnit * item.quantity;
      deltaByMaterial.set(recipe.materialId, (deltaByMaterial.get(recipe.materialId) ?? 0) + delta);
    }
  }

  for (const [materialId, delta] of deltaByMaterial) {
    await tx.material.update({ where: { id: materialId }, data: { stockQuantity: { increment: delta } } });
  }
}

export function deductMaterialStock(tx: Prisma.TransactionClient, items: { productId?: string | null; quantity: number }[]) {
  return adjustMaterialStock(tx, items, -1);
}

export function restoreMaterialStock(tx: Prisma.TransactionClient, items: { productId?: string | null; quantity: number }[]) {
  return adjustMaterialStock(tx, items, 1);
}
