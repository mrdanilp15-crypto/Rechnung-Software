import { describe, it, expect } from "vitest";
import { matchJobFile, nameKey, normalizeUsage, planUsageChange } from "../src/modules/printers/jobUsage";

const mats = new Map([
  ["pla", { name: "PLA schwarz", unit: "g", costPerUnitCents: 2.5 }],
  ["petg", { name: "PETG weiß", unit: "kg", costPerUnitCents: 2400 }],
  ["stk", { name: "Magnete", unit: "Stk.", costPerUnitCents: 10 }],
]);

describe("Materialverbrauch korrigieren", () => {
  it("fasst gleiche Materialien zusammen und entfernt leere Zeilen", () => {
    expect(normalizeUsage([{ materialId: "pla", grams: 5 }, { materialId: "pla", grams: 7.126 }, { materialId: "petg", grams: 0 }])).toEqual([{ materialId: "pla", grams: 12.13 }]);
  });
  it("neuer Verbrauch ohne bisherige Buchung zieht alles vom Bestand ab und berechnet die Kosten", () => {
    const { entries, deltas } = planUsageChange(null, [{ materialId: "pla", grams: 12 }], mats);
    expect(entries).toEqual([{ materialId: "pla", name: "PLA schwarz", grams: 12, cents: 30 }]);
    expect(deltas).toEqual([{ materialId: "pla", amount: 12, skipped: false }]);
  });
  it("bucht nur den Unterschied zur bisherigen Messung", () => {
    const old = [{ materialId: "pla", name: "PLA schwarz", grams: 20, cents: 50 }];
    const { entries, deltas } = planUsageChange(old, [{ materialId: "pla", grams: 12 }], mats);
    expect(deltas).toEqual([{ materialId: "pla", amount: -8, skipped: false }]); // 8 g zurück in den Bestand
    expect(entries[0].cents).toBe(30);
  });
  it("tauscht das Material: altes wird gutgeschrieben, neues abgebucht (kg-Umrechnung)", () => {
    const old = [{ materialId: "pla", name: "PLA schwarz", grams: 10, cents: 25 }];
    const { entries, deltas } = planUsageChange(old, [{ materialId: "petg", grams: 10 }], mats);
    expect(deltas).toContainEqual({ materialId: "pla", amount: -10, skipped: false });
    expect(deltas).toContainEqual({ materialId: "petg", amount: 0.01, skipped: false });
    expect(entries).toEqual([{ materialId: "petg", name: "PETG weiß", grams: 10, cents: 24 }]);
  });
  it("unveränderte Menge behält den damaligen Preis und löst keine Bestandsbuchung aus", () => {
    const old = [{ materialId: "pla", name: "PLA schwarz", grams: 12, cents: 99 }];
    const { entries, deltas } = planUsageChange(old, [{ materialId: "pla", grams: 12 }], mats);
    expect(deltas).toEqual([]);
    expect(entries[0].cents).toBe(99);
  });
  it("Einheit ohne g/kg: Bestand bleibt unberührt, wird aber gemeldet", () => {
    const { deltas } = planUsageChange(null, [{ materialId: "stk", grams: 4 }], mats);
    expect(deltas).toEqual([{ materialId: "stk", amount: 0, skipped: true }]);
  });
  it("Material komplett entfernen schreibt den Bestand gut", () => {
    const old = [{ materialId: "pla", name: "PLA schwarz", grams: 15, cents: 37.5 }];
    const { entries, deltas } = planUsageChange(old, [], mats);
    expect(entries).toEqual([]);
    expect(deltas).toEqual([{ materialId: "pla", amount: -15, skipped: false }]);
  });
});

describe("3MF zum Druck finden", () => {
  const docs = [
    { fileName: "Handyhalter_v2.gcode.3mf", title: "Halter" },
    { fileName: "Vase.3mf", title: "Vase groß" },
    { fileName: "ab.3mf", title: "ab" },
  ];
  it("vergleicht ohne Endung, Groß-/Kleinschreibung und Sonderzeichen", () => {
    expect(nameKey("Handyhalter_v2.gcode.3mf")).toBe("handyhalterv2");
    expect(matchJobFile("handyhalter v2", docs)?.fileName).toBe("Handyhalter_v2.gcode.3mf");
    expect(matchJobFile("Vase", docs)?.fileName).toBe("Vase.3mf");
  });
  it("findet auch über den Titel und bei enthaltenem Namen", () => {
    expect(matchJobFile("Vase groß", docs)?.fileName).toBe("Vase.3mf");
    expect(matchJobFile("Handyhalter_v2_plate_1", docs)?.fileName).toBe("Handyhalter_v2.gcode.3mf");
  });
  it("rät nichts bei kurzen oder fehlenden Namen", () => {
    expect(matchJobFile(null, docs)).toBeNull();
    expect(matchJobFile("xyz", docs)).toBeNull();
    expect(matchJobFile("Lampe", docs)).toBeNull();
  });
});
