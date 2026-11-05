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

describe("Artikelnummern: reine Zahlen und Mischformen", () => {
  it("zählt reine Zahlen ohne Präfix weiter", () => {
    expect(nextSku(["1", "2", "7"], "P-").sku).toBe("8");
  });
  it("mischt reine Zahlen nicht mit dem Standard-Präfix", () => {
    expect(nextSku(["7", "12", "P-0005"], "P-").sku).toBe("13");
  });
});

describe("Artikelnummern: Reihen je Präfix", () => {
  const rows = ["HW-1", "HW-2", "T4-1", "T4-2", "T4-3"];
  it("zählt die getippte Reihe weiter, unabhängig von anderen", () => {
    expect(nextSku(rows, "P-", 4, "HW-").sku).toBe("HW-3");
    expect(nextSku(rows, "P-", 4, "T4-").sku).toBe("T4-4");
  });
  it("findet die Reihe auch ohne Bindestrich und in anderer Schreibweise", () => {
    expect(nextSku(rows, "P-", 4, "HW").sku).toBe("HW-3");
    expect(nextSku(rows, "P-", 4, "hw-").sku).toBe("HW-3");
    expect(nextSku(rows, "P-", 4, "T").sku).toBe("T4-4");
  });
  it("leitet die Reihe auch aus einer vollständig getippten Nummer ab", () => {
    expect(nextSku(rows, "P-", 4, "HW-2").sku).toBe("HW-3");
  });
  it("beginnt eine neue Reihe bei 1 im Stil der übrigen", () => {
    expect(nextSku(rows, "P-", 4, "XY-").sku).toBe("XY-1");
    expect(nextSku([], "P-", 4, "XY-").sku).toBe("XY-1");
  });
  it("ohne getipptes Präfix gilt weiter das häufigste", () => {
    expect(nextSku(rows, "P-", 4, "").sku).toBe("T4-4");
  });
});
