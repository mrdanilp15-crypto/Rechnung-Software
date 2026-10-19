import { describe, expect, it } from "vitest";
import { computeDunning } from "../src/modules/dunning/calc";

const base = {
  principalCents: 10000,
  dueDate: new Date("2026-01-01"),
  asOf: new Date("2026-01-31"), // 30 Tage überfällig
  baseInterestRatePercent: 1.27,
  fee2Cents: 500,
  fee3Cents: 1000,
  deadlineDays: 7,
};

describe("computeDunning", () => {
  it("Stufe 1 (Zahlungserinnerung) ist gebühren- und zinsfrei", () => {
    const r = computeDunning({ ...base, level: 1, isBusiness: false });
    expect(r.feeCents).toBe(0);
    expect(r.interestCents).toBe(0);
    expect(r.flatFeeCents).toBe(0);
    expect(r.totalCents).toBe(10000);
    expect(r.daysOverdue).toBe(30);
    expect(r.newDueDate.toISOString().slice(0, 10)).toBe("2026-02-07");
  });

  it("Verbraucher: Basiszins + 5 Prozentpunkte, keine Pauschale", () => {
    const r = computeDunning({ ...base, level: 2, isBusiness: false });
    expect(r.interestRateBps).toBe(627);
    expect(r.interestCents).toBe(Math.round(10000 * 0.0627 * (30 / 365)));
    expect(r.flatFeeCents).toBe(0);
    expect(r.feeCents).toBe(500);
    expect(r.totalCents).toBe(10000 + 500 + r.interestCents);
  });

  it("Unternehmer: Basiszins + 9 Prozentpunkte und 40 EUR Pauschale einmalig", () => {
    const r2 = computeDunning({ ...base, level: 2, isBusiness: true });
    expect(r2.interestRateBps).toBe(1027);
    expect(r2.flatFeeCents).toBe(4000);
    const r3 = computeDunning({ ...base, level: 3, isBusiness: true, previous: { feeCents: r2.feeCents, flatFeeCents: r2.flatFeeCents } });
    expect(r3.flatFeeCents).toBe(4000); // bleibt bestehen, wird nicht erneut aufgeschlagen
    expect(r3.feeCents).toBe(500 + 1000); // Gebühren kumulativ
    expect(r3.totalCents).toBe(10000 + 1500 + r3.interestCents + 4000);
  });

  it("noch nicht überfällig: keine Zinsen", () => {
    const r = computeDunning({ ...base, level: 2, isBusiness: false, asOf: new Date("2025-12-30") });
    expect(r.daysOverdue).toBe(0);
    expect(r.interestCents).toBe(0);
  });
});
