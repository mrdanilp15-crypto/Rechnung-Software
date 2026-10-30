import { describe, it, expect } from "vitest";
import { computeAmsDeductions, gramsToUnit, mergeUsage, type SlotState } from "../src/modules/printers/bambu/amsBooking";
import type { Tray } from "../src/modules/printers/bambu/status";

const tray = (over: Partial<Tray> = {}): Tray => ({ slot: 0, type: "PLA", brand: "PLA Basic", color: "#000000", remainPercent: 80, rfid: true, tag: "TAG-A", amsSlot: 0, active: false, ...over });
const slot = (over: Partial<SlotState> = {}): SlotState => ({ id: "m1", slot: 0, materialId: "mat1", spoolGrams: 1000, lastRemain: 80, lastTag: "TAG-A", ...over });

describe("AMS-Abbuchung: Berechnung", () => {
  it("bucht die Differenz des Füllstands mal Spulengewicht", () => {
    const [u] = computeAmsDeductions([slot()], [tray({ remainPercent: 77 })]);
    expect(u.deductGrams).toBeCloseTo(30);
    expect(u.lastRemain).toBe(77);
  });
  it("bucht nichts, solange der Füllstand gleich bleibt", () => {
    expect(computeAmsDeductions([slot()], [tray()])).toEqual([]);
  });
  it("kleine Drucke gehen durch die Rundung nicht verloren: es wird immer gegen den zuletzt verbuchten Stand gerechnet", () => {
    let s = slot({ lastRemain: 80 });
    let total = 0;
    for (const remain of [80, 80, 79, 79, 78, 78, 77]) {
      for (const u of computeAmsDeductions([s], [tray({ remainPercent: remain })])) {
        total += u.deductGrams;
        s = { ...s, lastRemain: u.lastRemain, lastTag: u.lastTag };
      }
    }
    expect(total).toBeCloseTo(30);
  });
  it("neue Spule (andere Chip-Kennung): nur neuer Ausgangswert, keine Abbuchung", () => {
    const [u] = computeAmsDeductions([slot()], [tray({ tag: "TAG-B", remainPercent: 100 })]);
    expect(u).toMatchObject({ deductGrams: 0, lastRemain: 100, lastTag: "TAG-B", spoolChanged: true });
  });
  it("Füllstand gestiegen: nur neuer Ausgangswert", () => {
    const [u] = computeAmsDeductions([slot({ lastRemain: 40 })], [tray({ remainPercent: 90 })]);
    expect(u).toMatchObject({ deductGrams: 0, lastRemain: 90 });
  });
  it("erste Messung setzt nur den Ausgangswert", () => {
    const [u] = computeAmsDeductions([slot({ lastRemain: null, lastTag: null })], [tray({ remainPercent: 64 })]);
    expect(u).toMatchObject({ deductGrams: 0, lastRemain: 64, lastTag: "TAG-A" });
  });
  it("Spulen ohne Chip oder ohne Messwert werden nicht gebucht", () => {
    expect(computeAmsDeductions([slot()], [tray({ rfid: false, tag: null, remainPercent: 10 })])).toEqual([]);
    expect(computeAmsDeductions([slot()], [tray({ remainPercent: null })])).toEqual([]);
    expect(computeAmsDeductions([slot()], [])).toEqual([]);
  });
  it("ordnet über die AMS-Fachnummer zu und beachtet mehrere Fächer", () => {
    const updates = computeAmsDeductions(
      [slot({ id: "a", slot: 0 }), slot({ id: "b", slot: 5, materialId: "mat2", spoolGrams: 750, lastTag: "TAG-C", lastRemain: 50 })],
      [tray({ amsSlot: 0, remainPercent: 79 }), tray({ amsSlot: 5, tag: "TAG-C", remainPercent: 40 })],
    );
    expect(updates.map((u) => [u.id, Math.round(u.deductGrams * 10) / 10])).toEqual([["a", 10], ["b", 75]]);
  });
});

describe("AMS-Abbuchung: Hilfsfunktionen", () => {
  it("rechnet Gramm in g und kg um", () => {
    expect(gramsToUnit(250, "g")).toBe(250);
    expect(gramsToUnit(250, "kg")).toBe(0.25);
    expect(gramsToUnit(250, "Stück")).toBeNull();
  });
  it("addiert den Verbrauch je Material im Auftrag", () => {
    let usage = mergeUsage(null, { materialId: "m1", name: "PLA schwarz", grams: 10.456 });
    usage = mergeUsage(usage, { materialId: "m1", name: "PLA schwarz", grams: 5 });
    usage = mergeUsage(usage, { materialId: "m2", name: "PETG weiß", grams: 3 });
    expect(usage).toEqual([
      { materialId: "m1", name: "PLA schwarz", grams: 15.46 },
      { materialId: "m2", name: "PETG weiß", grams: 3 },
    ]);
  });
});
