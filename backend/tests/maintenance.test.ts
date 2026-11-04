import { describe, it, expect } from "vitest";
import { PRESETS, dueMessage, taskStatus } from "../src/modules/maintenance/service";

const day = 86_400_000;
const task = (over: Partial<Parameters<typeof taskStatus>[0]> = {}) => ({ intervalHours: 200 as number | null, intervalDays: null as number | null, lastDoneHours: 100, lastDoneAt: new Date("2026-10-01T00:00:00Z"), ...over });
const now = new Date("2026-11-01T00:00:00Z");

describe("Wartungsplan", () => {
  it("rechnet die Restzeit nach Betriebsstunden", () => {
    const s = taskStatus(task(), 250, now);
    expect(s.hoursSince).toBe(150);
    expect(s.remainingHours).toBe(50);
    expect(s.due).toBe(false);
    expect(s.progress).toBeCloseTo(0.75);
  });
  it("ist bei erreichtem Stundenintervall fällig, auch bei Überschreitung", () => {
    expect(taskStatus(task(), 300, now).due).toBe(true);
    const over = taskStatus(task(), 340, now);
    expect(over.due).toBe(true);
    expect(over.remainingHours).toBe(-40);
    expect(over.progress).toBeGreaterThan(1);
  });
  it("kennt ein Intervall in Tagen und nimmt das frühere von beiden", () => {
    const t = task({ intervalHours: 500, intervalDays: 30 });
    const s = taskStatus(t, 110, new Date(t.lastDoneAt.getTime() + 31 * day));
    expect(s.due).toBe(true);
    expect(s.remainingHours).toBe(490);
    expect(s.remainingDays).toBeLessThan(0);
    expect(taskStatus(t, 110, new Date(t.lastDoneAt.getTime() + 10 * day)).due).toBe(false);
  });
  it("zählt nie negative Stunden (z.B. wenn der Stand korrigiert wurde)", () => {
    expect(taskStatus(task({ lastDoneHours: 500 }), 100, now).hoursSince).toBe(0);
  });
  it("formuliert die Meldung mit Stunden und Tagen", () => {
    const t = task({ intervalHours: 200, intervalDays: 90 });
    const m = dueMessage("P1S", "Düse prüfen", t, taskStatus(t, 320, new Date(t.lastDoneAt.getTime() + 100 * day)));
    expect(m.title).toBe("P1S: Wartung fällig - Düse prüfen");
    expect(m.body).toContain("220 h Betrieb");
    expect(m.body).toContain("Intervall 200 h");
    expect(m.body).toContain("100 Tage");
  });
  it("hat Richtwerte mit mindestens einem Intervall", () => {
    expect(PRESETS.length).toBeGreaterThan(5);
    for (const p of PRESETS) expect(!!p.intervalHours || !!p.intervalDays).toBe(true);
  });
});
