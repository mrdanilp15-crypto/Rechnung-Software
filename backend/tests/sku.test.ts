import { describe, it, expect } from "vitest";
import { findDuplicate, nextSku } from "../src/utils/sku";

describe("Artikelnummern", () => {
  it("beginnt ohne vorhandene Nummern mit dem Standard", () => {
    expect(nextSku([], "P-").sku).toBe("P-0001");
    expect(nextSku([null, "", "  "], "M-").sku).toBe("M-0001");
  });
  it("zählt die höchste vorhandene Nummer hoch und behält Präfix und Stellenzahl", () => {
    expect(nextSku(["P-0001", "P-0002", "P-0007"], "X-").sku).toBe("P-0008");
    expect(nextSku(["HP-001", "HP-002"], "P-").sku).toBe("HP-003");
  });
  it("nimmt das häufigste Präfix, wenn gemischt", () => {
    expect(nextSku(["A-1", "B-5", "B-6", "B-7"], "P-").sku).toBe("B-8");
  });
  it("ignoriert Groß-/Kleinschreibung und vergibt nie eine schon benutzte Nummer", () => {
    expect(nextSku(["p-0001", "P-0002"], "P-").sku).toBe("p-0003");
  });
  it("lässt Nummern ohne Zahl am Ende außer Acht", () => {
    expect(nextSku(["SONDER", "P-0010"], "P-").sku).toBe("P-0011");
  });
  it("erkennt Dubletten, aber nicht den Artikel selbst", () => {
    const rows = [{ id: "1", sku: "P-0001" }, { id: "2", sku: "p-0002" }, { id: "3", sku: null }];
    expect(findDuplicate(rows, " P-0002 ")?.id).toBe("2");
    expect(findDuplicate(rows, "P-0002", "2")).toBeUndefined();
    expect(findDuplicate(rows, "P-9999")).toBeUndefined();
  });
});
