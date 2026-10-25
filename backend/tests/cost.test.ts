import { describe, it, expect } from "vitest";
import { calcCost, feesAt, printerHourlyCost, roundPrice, unitPriceForQuantity, type CostRates, type PrinterCosts } from "../../frontend/src/lib/cost";
import { weightedAverageCost } from "../src/utils/materialCost";

const rates: CostRates = {
  machineRateCentsPerHour: 200,
  laborRateCentsPerHour: 3000,
  materialWastePercent: 10,
  targetMarginPercent: 50,
  electricityCentsPerKwh: 30,
  overheadPercent: 10,
  failRatePercent: 0,
  platformFeePercent: 0,
  priceRounding: "NONE",
  minPriceCents: 0,
};
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
    expect(c.recommended).toBe(0);
  });
  it("Stundenkosten eines Druckers", () => {
    const h = printerHourlyCost(printer, 30);
    expect(h.electricity).toBeCloseTo(6);
    expect(h.depreciation).toBeCloseTo(10);
    expect(h.total).toBeCloseTo(24);
  });
});

describe("Erweiterte Kalkulation", () => {
  const base = { ...rates, overheadPercent: 0, materialWastePercent: 0, targetMarginPercent: 0 };
  it("Fehldruckquote wirkt auf Maschinenkosten, nicht auf Material oder Arbeit", () => {
    const c = calcCost([{ quantityPerUnit: 100, costPerUnitCents: 2 }], 120, 60, { ...base, failRatePercent: 10 }, printer);
    expect(c.failures).toBeCloseTo((12 + 20 + 16) * 0.1);
    expect(c.material).toBeCloseTo(200);
    expect(c.labor).toBeCloseTo(3000);
  });
  it("Rüstzeit verteilt sich auf die Menge", () => {
    const one = calcCost([], 0, 0, base, null, { setupMinutes: 30, quantity: 1 });
    const ten = calcCost([], 0, 0, base, null, { setupMinutes: 30, quantity: 10 });
    expect(one.setup).toBeCloseTo(1500);
    expect(ten.setup).toBeCloseTo(150);
    expect(ten.total).toBeCloseTo(150);
  });
  it("Verpackung und zusätzlicher Materialverlust gehen in die Kosten ein", () => {
    const c = calcCost([{ quantityPerUnit: 10, costPerUnitCents: 10 }], 0, 0, { ...base, materialWastePercent: 5 }, null, { packagingCents: 80, extraMaterialPercent: 15 });
    expect(c.material).toBeCloseTo(100 * 1.2);
    expect(c.packaging).toBe(80);
    expect(c.total).toBeCloseTo(120 + 80);
  });
  it("Veredelungsposten gehen als Fremdkosten in die Selbstkosten ein und werden mit Gemeinkosten belegt", () => {
    const c = calcCost([], 0, 0, { ...base, overheadPercent: 10 }, null, { extraCostsCents: 4000 + 200 });
    expect(c.extras).toBe(4200);
    expect(c.total).toBeCloseTo(4620);
  });
  it("Plattformgebühr wird in den Preisvorschlag eingerechnet, sodass nach Gebühren der Gewinn bleibt", () => {
    const r = { ...base, targetMarginPercent: 25, platformFeePercent: 10 };
    const c = calcCost([{ quantityPerUnit: 1, costPerUnitCents: 1000 }], 0, 0, r);
    expect(c.recommendedRaw).toBeCloseTo((1000 * 1.25) / 0.9);
    // Preis - Gebühren = Kosten + 25 % Aufschlag
    expect(c.recommendedRaw - feesAt(c.recommendedRaw, r)).toBeCloseTo(1250);
  });
  it("Rundung und Mindestpreis", () => {
    expect(roundPrice(743, "NONE")).toBe(743);
    expect(roundPrice(743, "5")).toBe(745);
    expect(roundPrice(743, "10")).toBe(750);
    expect(roundPrice(743, "50")).toBe(750);
    expect(roundPrice(743, "100")).toBe(800);
    expect(roundPrice(743, "90")).toBe(790);
    expect(roundPrice(790, "90")).toBe(790);
    expect(roundPrice(791, "90")).toBe(890);
    expect(roundPrice(743, "99")).toBe(799);
    expect(roundPrice(50, "90")).toBe(90);
    const c = calcCost([{ quantityPerUnit: 1, costPerUnitCents: 100 }], 0, 0, { ...base, priceRounding: "50", minPriceCents: 500 });
    expect(c.recommendedRaw).toBeCloseTo(100);
    expect(c.recommended).toBe(500);
    expect(calcCost([{ quantityPerUnit: 1, costPerUnitCents: 100 }], 0, 0, { ...base, priceRounding: "50" }).recommended).toBe(100);
    expect(calcCost([{ quantityPerUnit: 1, costPerUnitCents: 101 }], 0, 0, { ...base, priceRounding: "50" }).recommended).toBe(150);
  });
});

describe("Staffelpreise", () => {
  const tiers = [
    { minQuantity: 10, unitPriceCents: 900 },
    { minQuantity: 50, unitPriceCents: 800 },
  ];
  it("wählt den Preis der höchsten erreichten Staffel", () => {
    expect(unitPriceForQuantity(1000, tiers, 1)).toBe(1000);
    expect(unitPriceForQuantity(1000, tiers, 9)).toBe(1000);
    expect(unitPriceForQuantity(1000, tiers, 10)).toBe(900);
    expect(unitPriceForQuantity(1000, tiers, 49)).toBe(900);
    expect(unitPriceForQuantity(1000, tiers, 50)).toBe(800);
    expect(unitPriceForQuantity(1000, null, 100)).toBe(1000);
  });
});

describe("Materialpreis beim Nachbestellen", () => {
  it("bildet den gewichteten Durchschnitt aus Rest und Lieferung", () => {
    // 500 g Rest zu 2 ct/g + 1000 g für 30 € (3 ct/g) -> (1000 + 3000) / 1500
    expect(weightedAverageCost(500, 2, 1000, 3000)).toBeCloseTo(4000 / 1500);
  });
  it("nimmt bei leerem oder negativem Bestand nur den neuen Preis", () => {
    expect(weightedAverageCost(0, 2, 1000, 3000)).toBeCloseTo(3);
    expect(weightedAverageCost(-200, 2, 1000, 3000)).toBeCloseTo(3);
  });
});
