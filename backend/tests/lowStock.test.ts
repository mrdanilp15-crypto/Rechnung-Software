import { describe, it, expect } from "vitest";
import { formatQuantity, lowStockDecisions, lowStockMessage, type StockRow } from "../src/modules/notifications/lowStock";

const row = (over: Partial<StockRow>): StockRow => ({ id: "m1", companyId: "c1", name: "PLA schwarz", unit: "g", stockQuantity: 1000, minStock: 250, lowStockNotifiedAt: null, supplierName: null, ...over });

describe("Mindestbestand", () => {
  it("meldet, wenn der Bestand die Grenze erreicht oder unterschreitet", () => {
    expect(lowStockDecisions([row({ stockQuantity: 250 })]).notify.map((r) => r.id)).toEqual(["m1"]);
    expect(lowStockDecisions([row({ stockQuantity: 120 })]).notify).toHaveLength(1);
    expect(lowStockDecisions([row({ stockQuantity: 251 })]).notify).toHaveLength(0);
  });
  it("meldet nur einmal, bis der Bestand wieder über der Grenze lag", () => {
    const notified = new Date();
    expect(lowStockDecisions([row({ stockQuantity: 100, lowStockNotifiedAt: notified })])).toEqual({ notify: [], reset: [] });
    expect(lowStockDecisions([row({ stockQuantity: 900, lowStockNotifiedAt: notified })])).toEqual({ notify: [], reset: ["m1"] });
  });
  it("ignoriert Material ohne Mindestbestand und setzt die Markierung zurück, wenn er entfernt wurde", () => {
    expect(lowStockDecisions([row({ minStock: null, stockQuantity: 0 })])).toEqual({ notify: [], reset: [] });
    expect(lowStockDecisions([row({ minStock: 0, stockQuantity: 0 })])).toEqual({ notify: [], reset: [] });
    expect(lowStockDecisions([row({ minStock: null, lowStockNotifiedAt: new Date() })]).reset).toEqual(["m1"]);
  });
  it("formuliert die Meldung mit Restmenge, Grenze und Lieferant", () => {
    const m = lowStockMessage(row({ stockQuantity: 180, supplierName: "Filamentwerk" }));
    expect(m.title).toBe("PLA schwarz: Bestand wird knapp");
    expect(m.body).toContain("nur noch 180 g");
    expect(m.body).toContain("Mindestbestand 250 g");
    expect(m.body).toContain("Lieferant: Filamentwerk");
    expect(lowStockMessage(row({ stockQuantity: -3 })).title).toBe("PLA schwarz ist aufgebraucht");
  });
  it("formatiert Mengen auf zwei Stellen", () => {
    expect(formatQuantity(1.2345, "kg")).toBe("1,23 kg");
  });
});
