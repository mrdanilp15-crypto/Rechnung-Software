import { describe, it, expect } from "vitest";
import { nextRevision } from "../src/modules/products/files";

describe("Produktdateien: Versionen", () => {
  it("beginnt bei 1 und zählt über die höchste vorhandene Revision weiter", () => {
    expect(nextRevision([])).toBe(1);
    expect(nextRevision([1, 2, 3])).toBe(4);
    // auch nach dem Lösen einer mittleren Version werden Nummern nicht wiederverwendet
    expect(nextRevision([1, 3])).toBe(4);
  });
});
