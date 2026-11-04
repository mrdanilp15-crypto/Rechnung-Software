import { describe, it, expect } from "vitest";
import { computeFailStats, type FailJob } from "../src/modules/printers/failStats";

const job = (result: string | null, minutes: number | null, printerId = "p1"): FailJob => ({ printerId, result, minutes });

describe("Echte Fehldruckquote", () => {
  it("zählt fehlgeschlagene und abgebrochene Drucke als Fehldrucke", () => {
    const s = computeFailStats([job("FINISHED", 120), job("FINISHED", 60), job("FAILED", 30), job("CANCELLED", 30)]);
    expect(s).toMatchObject({ jobs: 4, finished: 2, failed: 1, cancelled: 1, percentByCount: 50 });
  });
  it("rechnet die Quote nach Zeit und den passenden Kalkulationszuschlag (verschwendete durch gute Zeit)", () => {
    // 180 min gut, 60 min verschwendet: 25 % der Zeit, aber 33,3 % Zuschlag auf die guten Stunden
    const s = computeFailStats([job("FINISHED", 180), job("FAILED", 60)]);
    expect(s.hoursGood).toBe(3);
    expect(s.hoursWasted).toBe(1);
    expect(s.percentByHours).toBe(25);
    expect(s.recommendedPercent).toBe(33.3);
  });
  it("lässt Drucke ohne erkanntes Ende außen vor", () => {
    const s = computeFailStats([job("FINISHED", 60), job("UNKNOWN", 600), job(null, 90)]);
    expect(s.jobs).toBe(1);
    expect(s.unknown).toBe(2);
    expect(s.percentByHours).toBe(0);
  });
  it("liefert ohne Daten keine Zahlen und kennzeichnet wenig Daten", () => {
    const empty = computeFailStats([]);
    expect(empty).toMatchObject({ jobs: 0, percentByCount: null, percentByHours: null, recommendedPercent: null, enoughData: false });
    expect(computeFailStats(Array.from({ length: 9 }, () => job("FINISHED", 30))).enoughData).toBe(false);
    expect(computeFailStats(Array.from({ length: 10 }, () => job("FINISHED", 30))).enoughData).toBe(true);
  });
  it("hat ohne gute Druckzeit keinen Zuschlag (nur Fehldrucke)", () => {
    expect(computeFailStats([job("FAILED", 60)]).recommendedPercent).toBeNull();
  });
});
