import { describe, it, expect } from "vitest";
import { DEFAULT_THEME, STEPS, THEMES, themeById } from "../../frontend/src/theme/themes";

const lum = (triple: string) => {
  const [r, g, b] = triple.split(" ").map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe("Designs der Oberfläche", () => {
  it("haben eindeutige Kennungen und ein Standarddesign", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_THEME);
    expect(themeById("gibt-es-nicht").id).toBe(DEFAULT_THEME);
  });
  it("kennen alle Farbstufen als gültige RGB-Tripel", () => {
    for (const t of THEMES) {
      for (const scale of [t.light, t.dark]) {
        for (const s of STEPS) expect(scale[s], `${t.id} ${s}`).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
        for (const s of STEPS) scale[s].split(" ").forEach((n) => expect(Number(n)).toBeLessThanOrEqual(255));
      }
      expect(t.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it("laufen von hell (50) nach dunkel (950), damit Text und Flächen in beiden Modi lesbar bleiben", () => {
    for (const t of THEMES) {
      for (const scale of [t.light, t.dark]) {
        for (let i = 1; i < STEPS.length; i++) expect(lum(scale[STEPS[i]]), `${t.id} ${STEPS[i]}`).toBeLessThan(lum(scale[STEPS[i - 1]]));
      }
    }
  });
  it("sind im dunklen Modus wirklich dunkel (Seitenhintergrund 900, Seitenleiste 950) und im hellen hell (50)", () => {
    for (const t of THEMES) {
      expect(lum(t.dark[900]), t.id).toBeLessThan(60);
      expect(lum(t.dark[950]), t.id).toBeLessThan(lum(t.dark[900]));
      expect(lum(t.light[50]), t.id).toBeGreaterThan(235);
    }
  });
  it("sind mit den gespeicherten Werten des Servers vereinbar (cool, warm und die neuen Kennungen)", () => {
    expect(THEMES.map((t) => t.id).sort()).toEqual(["aurora", "cool", "graphit", "mitternacht", "wald", "warm"]);
  });
});
