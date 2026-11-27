import { describe, expect, it } from "vitest";
import { formatNumber } from "../src/modules/shared/numbering";

describe("formatNumber", () => {
  it("Belege mit Jahr und vierstelliger Nummer", () => {
    expect(formatNumber("INVOICE", 2026, 1)).toBe("RE-2026-0001");
    expect(formatNumber("ORDER_CONFIRMATION", 2026, 12)).toBe("AB-2026-0012");
  });

  it("Kunden ohne Jahr, damit sie nicht wie Belegnummern aussehen", () => {
    expect(formatNumber("CUSTOMER", 0, 1001)).toBe("K-1001");
    expect(formatNumber("CUSTOMER", 0, 1001)).not.toMatch(/\d{4}-\d{4}/);
  });
});
