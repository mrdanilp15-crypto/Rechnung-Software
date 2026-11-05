import { describe, it, expect } from "vitest";
import { buildReorder, suggestQty, type ReorderMaterial } from "../src/modules/materials/reorder";

describe("Nachbestellung", () => {
  it("schlägt vor, bis auf den doppelten Mindestbestand aufzufüllen, in sinnvollen Schritten", () => {
    expect(suggestQty(300, 500, "g")).toBe(700); // Ziel 1000, fehlen 700
    expect(suggestQty(250, 500, "g")).toBe(800); // 750 -> aufgerundet auf 100
    expect(suggestQty(0.2, 1, "kg")).toBe(2); // Ziel 2, fehlen 1,8 -> 2
    expect(suggestQty(1, 3, "Stk.")).toBe(5);
  });
  it("bestellt mindestens den Mindestbestand, auch bei negativem Bestand", () => {
    expect(suggestQty(-50, 500, "g")).toBe(1000);
  });
  const m = (id: string, name: string, stock: number, min: number, supplier: ReorderMaterial["supplier"]): ReorderMaterial => ({ id, name, sku: null, unit: "g", stockQuantity: stock, minStock: min, supplier });
  const s1 = { id: "s1", name: "Filamentwerk", email: "a@b.de", contactName: null, customerNumber: "K-1" };
  const s2 = { id: "s2", name: "Anbieter B", email: null, contactName: null, customerNumber: null };
  it("gruppiert je Lieferant, alphabetisch, ohne Lieferant zuletzt, und lässt Material über dem Mindestbestand weg", () => {
    const g = buildReorder([m("1", "PLA weiß", 100, 500, s2), m("2", "PETG", 50, 200, null), m("3", "PLA schwarz", 100, 500, s1), m("4", "ABS", 900, 500, s1), m("5", "TPU", 10, 0, s1)]);
    expect(g.map((x) => x.supplier?.name ?? "ohne")).toEqual(["Anbieter B", "Filamentwerk", "ohne"]);
    expect(g[1].items.map((i) => i.name)).toEqual(["PLA schwarz"]);
  });
});
