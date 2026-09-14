import { describe, expect, it } from "vitest";
import { calculateDocumentTotals } from "../src/modules/tax/calculator";

describe("calculateDocumentTotals", () => {
  it("berechnet Netto/USt./Brutto korrekt bei 19% USt.", () => {
    const totals = calculateDocumentTotals(
      [{ quantity: 2, unitPriceCents: 1000, vatRateBps: 1900 }],
      false
    );
    expect(totals.subtotalCents).toBe(2000);
    expect(totals.vatTotalCents).toBe(380);
    expect(totals.totalCents).toBe(2380);
  });

  it("weist bei Kleinunternehmerregelung keine USt. aus, unabhängig vom Positions-Satz", () => {
    const totals = calculateDocumentTotals(
      [{ quantity: 1, unitPriceCents: 10000, vatRateBps: 1900 }],
      true
    );
    expect(totals.vatTotalCents).toBe(0);
    expect(totals.totalCents).toBe(10000);
  });

  it("summiert mehrere USt.-Sätze getrennt (Split-Rate-Rechnung)", () => {
    const totals = calculateDocumentTotals(
      [
        { quantity: 1, unitPriceCents: 10000, vatRateBps: 1900 },
        { quantity: 1, unitPriceCents: 10000, vatRateBps: 700 },
      ],
      false
    );
    expect(totals.vatBreakdown[1900]).toBe(1900);
    expect(totals.vatBreakdown[700]).toBe(700);
    expect(totals.vatTotalCents).toBe(2600);
    expect(totals.totalCents).toBe(22600);
  });

  it("rundet korrekt bei krummen Mengen (z.B. Gramm-Preise im 3D-Druck)", () => {
    const totals = calculateDocumentTotals([{ quantity: 33.3, unitPriceCents: 15, vatRateBps: 1900 }], false);
    expect(totals.subtotalCents).toBe(Math.round(33.3 * 15));
  });
});
