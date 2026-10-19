import { describe, it, expect } from "vitest";
import { calcCost, printerHourlyCost, type CostRates, type PrinterCosts } from "../../frontend/src/lib/cost";

const rates: CostRates = { machineRateCentsPerHour: 200, laborRateCentsPerHour: 3000, materialWastePercent: 10, targetMarginPercent: 50, electricityCentsPerKwh: 30, overheadPercent: 10 };
const printer: PrinterCosts = { purchasePriceCents: 60000, lifetimeHours: 6000, powerWatts: 200, wearCentsPerHour: 8 };

describe("Selbstkosten 3D-Druck", () => {
  it("berechnet Strom, Abschreibung, Verschleiß, Material und Arbeit je Posten", () => {
    // 2 h Druck, 100 g Material zu 2,5 ct/g, 10 min Arbeit
    const c = calcCost([{ quantityPerUnit: 100, costPerUnitCents: 2.5 }], 120, 10, rates, printer);
    expect(c.material).toBeCloseTo(275); // 250 + 10 % Ausschuss
    expect(c.electricity).toBeCloseTo(12); // 2 h × 0,2 kW × 30 ct
    expect(c.depreciation).toBeCloseTo(20); // 2 h × (60000 / 6000)
    expect(c.wear).toBeCloseTo(16); // 2 h × 8 ct
    expect(c.labor).toBeCloseTo(500); // 1/6 h × 3000 ct
    expect(c.machineFlat).toBe(0);
    expect(c.overhead).toBeCloseTo((275 + 12 + 20 + 16 + 500) * 0.1);
    expect(c.total).toBeCloseTo((275 + 12 + 20 + 16 + 500) * 1.1);
    expect(c.recommended).toBeCloseTo(c.total * 1.5);
  });
  it("nutzt ohne Drucker den pauschalen Maschinenstundensatz", () => {
    const c = calcCost([], 60, 0, rates, null);
    expect(c.machineFlat).toBeCloseTo(200);
    expect(c.electricity + c.depreciation + c.wear).toBe(0);
  });
  it("bleibt bei Lebensdauer 0 oder negativen Zeiten stabil", () => {
    const c = calcCost([], -5, -5, rates, { ...printer, lifetimeHours: 0 });
    expect(c.total).toBe(0);
  });
  it("Stundenkosten eines Druckers", () => {
    const h = printerHourlyCost(printer, 30);
    expect(h.electricity).toBeCloseTo(6);
    expect(h.depreciation).toBeCloseTo(10);
    expect(h.total).toBeCloseTo(24);
  });
});
