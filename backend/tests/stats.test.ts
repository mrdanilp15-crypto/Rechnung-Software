import { describe, it, expect } from "vitest";
import { bestsellers, byMonth, materialConsumption } from "../src/modules/stats/aggregate";

describe("Statistik-Auswertungen", () => {
  it("fasst Bestseller über die erste Textzeile zusammen und sortiert nach Menge", () => {
    const r = bestsellers([
      { description: "Handyhalter" + String.fromCharCode(10) + "Schwarz", quantity: 3, lineTotalCents: 4500 },
      { description: "handyhalter", quantity: 2, lineTotalCents: 3000 },
      { description: "Vase", quantity: 10, lineTotalCents: 8000 },
      { description: "  ", quantity: 5, lineTotalCents: 1 },
    ]);
    expect(r).toEqual([{ name: "Vase", quantity: 10, revenueCents: 8000 }, { name: "Handyhalter", quantity: 5, revenueCents: 7500 }]);
  });
  it("summiert den Materialverbrauch je Material und ignoriert Aufträge ohne Angaben", () => {
    const r = materialConsumption([
      { materialUsage: [{ materialId: "a", name: "PLA", grams: 40.4, cents: 100 }, { materialId: "b", name: "PETG", grams: 10, cents: 30 }] },
      { materialUsage: [{ materialId: "a", name: "PLA", grams: 20, cents: 50 }] },
      { materialUsage: null },
    ]);
    expect(r).toEqual([{ materialId: "a", name: "PLA", grams: 60, cents: 150 }, { materialId: "b", name: "PETG", grams: 10, cents: 30 }]);
  });
  it("verteilt Beträge auf zwölf Monate", () => {
    const m = byMonth([{ d: new Date(2026, 0, 5), c: 100 }, { d: new Date(2026, 0, 20), c: 50 }, { d: new Date(2026, 11, 31), c: 7 }], (r) => r.d, (r) => r.c);
    expect(m[0]).toBe(150);
    expect(m[11]).toBe(7);
    expect(m).toHaveLength(12);
  });
});
