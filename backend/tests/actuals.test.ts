import { describe, it, expect } from "vitest";
import { itemProductKey, machineCost, usageWithCosts, type PrinterRates } from "../src/modules/production/actuals";
import { mergeUsage } from "../src/modules/printers/bambu/amsBooking";
import { calcCost, type CostRates } from "../../frontend/src/lib/cost";

const printer: PrinterRates = { powerWatts: 120, purchasePriceCents: 60000, lifetimeHours: 5000, usedHoursBefore: 1000, wearCentsPerHour: 10 };

describe("Ist-Kosten aus Drucken", () => {
  it("rechnet Maschinenkosten je Betriebsstunde (Strom, Abschreibung auf Restlebensdauer, Verschleiß)", () => {
    const c = machineCost(120, printer, 35); // 2 Stunden
    expect(c.electricity).toBeCloseTo(2 * 0.12 * 35); // 8,4 ct
    expect(c.depreciation).toBeCloseTo((2 * 60000) / 4000); // 30 ct
    expect(c.wear).toBeCloseTo(20);
    expect(c.total).toBeCloseTo(8.4 + 30 + 20);
  });

  it("liefert dieselben Maschinenkosten wie die Kalkulation (Soll und Ist vergleichbar)", () => {
    const rates = { machineRateCentsPerHour: 0, laborRateCentsPerHour: 0, materialWastePercent: 0, targetMarginPercent: 0, electricityCentsPerKwh: 35, overheadPercent: 0, failRatePercent: 0, platformFeePercent: 0, priceRounding: "NONE", minPriceCents: 0 } as CostRates;
    const soll = calcCost([], 90, 0, rates, printer);
    const ist = machineCost(90, printer, 35);
    expect(ist.electricity).toBeCloseTo(soll.electricity);
    expect(ist.depreciation).toBeCloseTo(soll.depreciation);
    expect(ist.wear).toBeCloseTo(soll.wear);
  });

  it("ohne Drucker oder Zeit entstehen keine Maschinenkosten; bei verbrauchter Lebensdauer keine Abschreibung", () => {
    expect(machineCost(60, null, 35).total).toBe(0);
    expect(machineCost(null, printer, 35).total).toBe(0);
    expect(machineCost(60, { ...printer, usedHoursBefore: 6000 }, 35).depreciation).toBe(0);
  });

  it("nimmt gespeicherte Materialkosten und bewertet ältere Einträge mit dem Lagerpreis", () => {
    const prices = new Map([["a", { unit: "g", costPerUnitCents: 2.5 }], ["b", { unit: "kg", costPerUnitCents: 2500 }]]);
    const r = usageWithCosts(
      [{ materialId: "a", name: "A", grams: 40, cents: 90 }, { materialId: "b", name: "B", grams: 200 }, { materialId: "x", name: "Unbekannt", grams: 5 }],
      prices,
    );
    expect(r.map((x) => x.cents)).toEqual([90, 500, 0]);
    expect(r.map((x) => x.estimated)).toEqual([false, true, true]);
    expect(usageWithCosts(null, prices)).toEqual([]);
  });

  it("summiert Kosten beim Zusammenfassen des Verbrauchs", () => {
    let u = mergeUsage(null, { materialId: "a", name: "A", grams: 10, cents: 25 });
    u = mergeUsage(u, { materialId: "a", name: "A", grams: 5, cents: 12.5 });
    expect(u).toEqual([{ materialId: "a", name: "A", grams: 15, cents: 37.5 }]);
  });

  it("gleicht Positionen über die erste Zeile des Textes ab", () => {
    expect(itemProductKey("  Handyhalter Schwarz \nFarbe: matt")).toBe("handyhalter schwarz");
  });
});
