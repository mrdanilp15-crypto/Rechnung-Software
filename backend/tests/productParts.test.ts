import { describe, it, expect } from "vitest";
import { aggregateParts, partSchema } from "../src/modules/products/parts";

describe("Bauteile: Summe für die Kalkulation", () => {
  it("addiert Druckzeit und Material der Bauteile (Tankdeckel mit Scharnier und Deckel)", () => {
    const r = aggregateParts([
      { quantityPerProduct: 1, piecesPerPlate: 1, printMinutes: 45, materials: [{ materialId: "pla", quantity: 12 }] },
      { quantityPerProduct: 1, piecesPerPlate: 1, printMinutes: 120, materials: [{ materialId: "pla", quantity: 40 }, { materialId: "petg", quantity: 5 }] },
    ]);
    expect(r.printMinutes).toBe(165);
    expect(r.materials).toEqual([{ materialId: "pla", quantity: 52 }, { materialId: "petg", quantity: 5 }]);
  });
  it("teilt durch die Teile pro Platte und multipliziert mit der Anzahl je Produkt", () => {
    // 6 Scharniere pro Platte (60 min, 30 g), pro Produkt werden 2 gebraucht
    const r = aggregateParts([{ quantityPerProduct: 2, piecesPerPlate: 6, printMinutes: 60, materials: [{ materialId: "pla", quantity: 30 }] }]);
    expect(r.printMinutes).toBe(20);
    expect(r.materials).toEqual([{ materialId: "pla", quantity: 10 }]);
  });
  it("ohne Bauteile ist alles null, Material mit 0 fällt weg", () => {
    expect(aggregateParts([])).toEqual({ printMinutes: 0, materials: [] });
    expect(aggregateParts([{ quantityPerProduct: 1, piecesPerPlate: 1, printMinutes: 10, materials: [{ materialId: "x", quantity: 0 }] }]).materials).toEqual([]);
  });
  it("schützt vor 0 Teilen pro Platte", () => {
    expect(aggregateParts([{ quantityPerProduct: 1, piecesPerPlate: 0, printMinutes: 10, materials: [] }]).printMinutes).toBe(10);
  });
});

describe("Bauteile: Eingabeprüfung", () => {
  const ok = { name: "Scharnier", quantityPerProduct: 1, piecesPerPlate: 1, printMinutes: 45, materials: [] };
  it("nimmt gültige Bauteile an", () => {
    expect(partSchema.safeParse(ok).success).toBe(true);
  });
  it("lehnt leere Namen, Anzahl 0 und negative Zeiten ab", () => {
    expect(partSchema.safeParse({ ...ok, name: " " }).success).toBe(false);
    expect(partSchema.safeParse({ ...ok, quantityPerProduct: 0 }).success).toBe(false);
    expect(partSchema.safeParse({ ...ok, printMinutes: -1 }).success).toBe(false);
    expect(partSchema.safeParse({ ...ok, piecesPerPlate: 0 }).success).toBe(false);
  });
});
