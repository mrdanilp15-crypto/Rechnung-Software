import { describe, it, expect } from "vitest";
import { buildPlanEntries, computePlanBookings, normalizeJobName, planFactor, type MappedSlot } from "../src/modules/printers/bambu/slicedBooking";
import type { Tray } from "../src/modules/printers/bambu/status";

const tray = (amsSlot: number, rfid: boolean): Tray => ({ amsSlot, rfid } as Tray);
const mapped: MappedSlot[] = [
  { slot: 0, materialId: "m-schwarz", materialName: "PLA schwarz", materialUnit: "g" },
  { slot: 1, materialId: "m-weiss", materialName: "PLA weiß", materialUnit: "kg" },
  { slot: 2, materialId: "m-chip", materialName: "Bambu PLA rot", materialUnit: "g" },
];

describe("Abbuchung nach Slicer-Angabe", () => {
  it("normalisiert Auftrags- und Dateinamen", () => {
    expect(normalizeJobName("Halter_V2.gcode.3mf")).toBe("halter_v2");
    expect(normalizeJobName("/sdcard/Halter_V2.gcode.3mf")).toBe("halter_v2");
    expect(normalizeJobName("Halter_V2.3mf")).toBe("halter_v2");
  });

  it("baut den Plan nur für Filamente mit Gramm und AMS-Fach (nicht externe Spule)", () => {
    const entries = buildPlanEntries(
      [
        { id: 1, type: "PLA", color: null, usedGrams: 12.5 },
        { id: 2, type: "PLA", color: null, usedGrams: 3 },
        { id: 3, type: "PLA", color: null, usedGrams: null },
        { id: 4, type: "PLA", color: null, usedGrams: 7 },
      ],
      { 1: 0, 2: 254, 3: 1, 4: 2 },
    );
    expect(entries).toEqual([{ filament: 1, slot: 0, grams: 12.5 }, { filament: 4, slot: 2, grams: 7 }]);
  });

  it("bucht bei fertigem Druck alles, bei Abbruch anteilig, bei unbekanntem Ende nichts", () => {
    expect(planFactor("FINISHED", null)).toBe(1);
    expect(planFactor("CANCELLED", 40)).toBeCloseTo(0.4);
    expect(planFactor("FAILED", 150)).toBe(1);
    expect(planFactor("FAILED", null)).toBe(0);
    expect(planFactor("UNKNOWN", 80)).toBe(0);
  });

  it("rechnet in die Einheit des Materials um und fasst gleiches Material zusammen", () => {
    const b = computePlanBookings(
      [{ filament: 1, slot: 0, grams: 10 }, { filament: 2, slot: 0, grams: 5.5 }, { filament: 3, slot: 1, grams: 200 }],
      1,
      [tray(0, false), tray(1, false)],
      mapped,
    );
    expect(b).toEqual([
      { materialId: "m-schwarz", name: "PLA schwarz", grams: 15.5, amount: 15.5, unit: "g" },
      { materialId: "m-weiss", name: "PLA weiß", grams: 200, amount: 0.2, unit: "kg" },
    ]);
  });

  it("überspringt Fächer mit Chip-Spule (bucht die AMS-Messung) und nicht zugeordnete Fächer", () => {
    const b = computePlanBookings(
      [{ filament: 1, slot: 2, grams: 30 }, { filament: 2, slot: 5, grams: 8 }, { filament: 3, slot: 0, grams: 4 }],
      1,
      [tray(0, false), tray(2, true)],
      mapped,
    );
    expect(b.map((x) => x.materialId)).toEqual(["m-schwarz"]);
  });

  it("bucht anteilig bei Abbruch und nichts bei Faktor 0", () => {
    const e = [{ filament: 1, slot: 0, grams: 50 }];
    expect(computePlanBookings(e, 0.5, [tray(0, false)], mapped)[0].grams).toBe(25);
    expect(computePlanBookings(e, 0, [tray(0, false)], mapped)).toEqual([]);
  });

  it("meldet keine umrechenbare Menge, wenn die Einheit nicht g/kg ist", () => {
    const b = computePlanBookings([{ filament: 1, slot: 0, grams: 10 }], 1, [], [{ slot: 0, materialId: "x", materialName: "Rolle", materialUnit: "Stk" }]);
    expect(b[0].amount).toBeNull();
  });
});
