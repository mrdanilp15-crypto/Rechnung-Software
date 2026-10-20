/**
 * Gleitender Durchschnittspreis beim Nachbestellen: vorhandene Reste behalten ihren alten Preis, die neue Lieferung ihren neuen -
 * der Preis je Einheit ist der gewichtete Mittelwert. Negativer Bestand (mehr verbraucht als gebucht) zählt als 0, sonst würde
 * der Preis verfälscht. Ohne Restbestand gilt einfach der Preis der neuen Lieferung.
 */
export function weightedAverageCost(oldStock: number, oldCostPerUnit: number, addedQuantity: number, addedTotalCostCents: number): number {
  const remaining = Math.max(0, oldStock);
  const totalQuantity = remaining + addedQuantity;
  if (totalQuantity <= 0) return oldCostPerUnit;
  return (remaining * oldCostPerUnit + addedTotalCostCents) / totalQuantity;
}
