import { describe, it, expect } from "vitest";
import { clockTime, dayKey, decimalHours, durationMinutes, hm, laborCents, monthRange, summarize, zonedMidnight } from "../src/modules/timetracking/calc";

describe("Zeiterfassung: Rechnen", () => {
  it("rundet die Dauer auf Minuten, mindestens 1", () => {
    expect(durationMinutes(new Date("2026-11-02T10:00:00Z"), new Date("2026-11-02T10:00:10Z"))).toBe(1);
    expect(durationMinutes(new Date("2026-11-02T10:00:00Z"), new Date("2026-11-02T11:30:20Z"))).toBe(90);
  });
  it("legt Monatsgrenzen in deutsche Zeit (Winterzeit +1 h, Sommerzeit +2 h)", () => {
    expect(monthRange("2026-11")).toEqual({ from: new Date("2026-10-31T23:00:00Z"), to: new Date("2026-11-30T23:00:00Z") });
    expect(monthRange("2026-07")).toEqual({ from: new Date("2026-06-30T22:00:00Z"), to: new Date("2026-07-31T22:00:00Z") });
    // Jahreswechsel
    expect(monthRange("2026-12")!.to).toEqual(new Date("2026-12-31T23:00:00Z"));
  });
  it("kennt den Wechsel auf die Sommerzeit mitten im Zeitraum", () => {
    // 29.03.2026 ist der Tag der Umstellung: Mitternacht ist noch Winterzeit, der Folgetag schon Sommerzeit
    expect(zonedMidnight(2026, 3, 29)).toEqual(new Date("2026-03-28T23:00:00Z"));
    expect(zonedMidnight(2026, 3, 30)).toEqual(new Date("2026-03-29T22:00:00Z"));
  });
  it("lehnt ungültige Monate ab", () => {
    expect(monthRange("2026-13")).toBeNull();
    expect(monthRange("26-11")).toBeNull();
    expect(monthRange("")).toBeNull();
  });
  it("ordnet Zeiten nach deutschem Kalendertag zu (00:30 Uhr am 1. gehört in den neuen Monat)", () => {
    const t = new Date("2026-10-31T23:30:00Z"); // 00:30 Uhr deutscher Zeit am 1.11.
    expect(dayKey(t)).toBe("2026-11-01");
    expect(clockTime(t)).toBe("00:30");
    const r = monthRange("2026-11")!;
    expect(t >= r.from && t < r.to).toBe(true);
  });
  it("formatiert Dauern als h:mm und als Dezimalstunden", () => {
    expect(hm(90)).toBe("1:30");
    expect(hm(5)).toBe("0:05");
    expect(decimalHours(90)).toBe("1,50");
    expect(decimalHours(20)).toBe("0,33");
  });
  it("summiert nach Tag, Tätigkeit und Auftrag und ignoriert laufende Einträge", () => {
    const s = summarize([
      { startedAt: new Date("2026-11-02T08:00:00Z"), minutes: 60, activity: "NACHARBEIT", orderConfirmationId: "o1" },
      { startedAt: new Date("2026-11-02T12:00:00Z"), minutes: 30, activity: "VERPACKUNG", orderConfirmationId: "o1" },
      { startedAt: new Date("2026-11-03T08:00:00Z"), minutes: 45, activity: "NACHARBEIT", orderConfirmationId: null },
      { startedAt: new Date("2026-11-03T09:00:00Z"), minutes: null, activity: "DESIGN" },
    ]);
    expect(s.totalMinutes).toBe(135);
    expect(s.days).toEqual([{ day: "2026-11-02", minutes: 90 }, { day: "2026-11-03", minutes: 45 }]);
    expect(s.activities).toEqual([{ activity: "NACHARBEIT", minutes: 105 }, { activity: "VERPACKUNG", minutes: 30 }]);
    expect(s.orders).toEqual([{ orderId: "o1", minutes: 90 }]);
  });
  it("rechnet Arbeitskosten aus Minuten und Stundensatz", () => {
    expect(laborCents(90, 3000)).toBe(4500);
    expect(laborCents(-5, 3000)).toBe(0);
  });
});
