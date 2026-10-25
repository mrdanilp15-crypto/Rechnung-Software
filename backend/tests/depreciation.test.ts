import { describe, it, expect } from "vitest";
import { bookValueAtYearEnd, depreciationForYear, depreciationSchedule } from "../src/modules/assets/depreciation";

const d = (y: number, m: number, day = 15) => new Date(y, m - 1, day);

describe("Abschreibung (AfA)", () => {
  it("GWG: volle Kosten im Anschaffungsjahr", () => {
    const a = { purchaseDate: d(2026, 5), costCents: 59900, method: "GWG" as const };
    expect(depreciationForYear(a, 2026)?.amountCents).toBe(59900);
    expect(depreciationForYear(a, 2027)).toBeNull();
    expect(bookValueAtYearEnd(a, 2026)).toBe(0);
  });
  it("linear ab Januar: gleiche Jahresbeträge, Summe exakt", () => {
    const a = { purchaseDate: d(2026, 1), costCents: 100000, method: "LINEAR" as const, usefulLifeYears: 3 };
    const s = depreciationSchedule(a);
    expect(s.map((x) => x.year)).toEqual([2026, 2027, 2028]);
    expect(s.map((x) => x.amountCents)).toEqual([33333, 33334, 33333]);
    expect(s.reduce((sum, x) => sum + x.amountCents, 0)).toBe(100000);
  });
  it("linear unterjährig: im Anschaffungsjahr zeitanteilig, Rest im Folgejahr nach Ablauf", () => {
    const a = { purchaseDate: d(2026, 7, 1), costCents: 120000, method: "LINEAR" as const, usefulLifeYears: 3 };
    const s = depreciationSchedule(a);
    expect(s.map((x) => [x.year, x.amountCents])).toEqual([[2026, 20000], [2027, 40000], [2028, 40000], [2029, 20000]]);
    expect(bookValueAtYearEnd(a, 2026)).toBe(100000);
    expect(bookValueAtYearEnd(a, 2029)).toBe(0);
  });
  it("Dezember-Kauf: nur ein Monat im ersten Jahr", () => {
    const a = { purchaseDate: d(2026, 12), costCents: 36000, method: "LINEAR" as const, usefulLifeYears: 3 };
    expect(depreciationForYear(a, 2026)?.amountCents).toBe(1000);
    expect(depreciationSchedule(a).reduce((sum, x) => sum + x.amountCents, 0)).toBe(36000);
  });
  it("linear ohne Nutzungsdauer verhält sich wie Sofortabschreibung", () => {
    const a = { purchaseDate: d(2026, 3), costCents: 5000, method: "LINEAR" as const, usefulLifeYears: null };
    expect(depreciationSchedule(a)).toEqual([{ year: 2026, amountCents: 5000, months: 1 }]);
  });
});
