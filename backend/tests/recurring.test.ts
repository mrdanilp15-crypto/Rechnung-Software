import { describe, expect, it } from "vitest";
import { addInterval } from "../src/modules/recurring/service";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("addInterval", () => {
  it("addiert Wochen, Monate, Quartale und Jahre", () => {
    expect(iso(addInterval(new Date(2026, 0, 15), "WEEK", 2))).toBe("2026-01-29");
    expect(iso(addInterval(new Date(2026, 0, 15), "MONTH", 1))).toBe("2026-02-15");
    expect(iso(addInterval(new Date(2026, 0, 15), "QUARTER", 1))).toBe("2026-04-15");
    expect(iso(addInterval(new Date(2026, 0, 15), "YEAR", 1))).toBe("2027-01-15");
  });
  it("kürzt auf den letzten Tag des Zielmonats statt in den Folgemonat zu springen", () => {
    expect(iso(addInterval(new Date(2026, 0, 31), "MONTH", 1))).toBe("2026-02-28");
    expect(iso(addInterval(new Date(2024, 0, 31), "MONTH", 1))).toBe("2024-02-29"); // Schaltjahr
    expect(iso(addInterval(new Date(2026, 7, 31), "QUARTER", 1))).toBe("2026-11-30");
  });
  it("Jahreswechsel", () => {
    expect(iso(addInterval(new Date(2026, 10, 30), "MONTH", 3))).toBe("2027-02-28");
  });
});
