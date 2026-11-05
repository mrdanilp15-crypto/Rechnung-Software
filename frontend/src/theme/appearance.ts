/**
 * Darstellung der Oberfläche: Design (Farbwelt), Akzentfarbe und Programmname. Alles wird in den Firmen-Einstellungen gespeichert
 * (gilt auf allen Geräten) und zusätzlich im Browser zwischengespeichert, damit beim Start nichts aufblitzt.
 * Das Design setzt CSS-Variablen (siehe themes.ts und index.css); die Seiten selbst bleiben unverändert.
 */

import { DEFAULT_THEME, STEPS, THEMES, themeById, type ThemeId } from "./themes";

export interface Appearance {
  accent: string; // #rrggbb
  theme: ThemeId;
  appName: string;
}

export const ACCENTS: { hex: string; label: string }[] = [
  { hex: "#2563eb", label: "Blau" },
  { hex: "#0284c7", label: "Cyan" },
  { hex: "#c2570c", label: "Orange" },
  { hex: "#15803d", label: "Grün" },
  { hex: "#7c3aed", label: "Violett" },
  { hex: "#be185d", label: "Magenta" },
  { hex: "#0f766e", label: "Türkis" },
  { hex: "#334155", label: "Graphit" },
];

export const DEFAULT_APP_NAME = "Rechnungssoftware";
export const DEFAULT_APPEARANCE: Appearance = { accent: "#2563eb", theme: DEFAULT_THEME, appName: DEFAULT_APP_NAME };
const CACHE_KEY = "rechnung_appearance";

const HEX = /^#[0-9a-f]{6}$/i;
const cleanName = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : DEFAULT_APP_NAME);
const cleanTheme = (v: unknown): ThemeId => (THEMES.some((t) => t.id === v) ? (v as ThemeId) : DEFAULT_THEME);

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Mischt eine Farbe mit Weiß (t > 0) oder Schwarz (t < 0); Ergebnis als "r g b" für CSS-Variablen. */
function shade(hex: string, t: number): string {
  const target = t >= 0 ? 255 : 0;
  const k = Math.abs(t);
  return rgb(hex).map((c) => Math.round(c + (target - c) * k)).join(" ");
}

export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  const accent = HEX.test(a.accent) ? a.accent : DEFAULT_APPEARANCE.accent;
  const theme = themeById(a.theme);
  root.style.setProperty("--brand-light", rgb(accent).join(" "));
  root.style.setProperty("--brand-dark-light", shade(accent, -0.18));
  root.style.setProperty("--brand-dm", shade(accent, 0.14));
  root.style.setProperty("--brand-dark-dm", rgb(accent).join(" "));
  for (const s of STEPS) {
    root.style.setProperty(`--t-light-${s}`, theme.light[s]);
    root.style.setProperty(`--t-dark-${s}`, theme.dark[s]);
  }
  root.style.setProperty("--radius-lg", theme.radius.lg);
  root.style.setProperty("--radius-xl", theme.radius.xl);
  root.style.setProperty("--card-glow", theme.glow || "0 0 #0000");
  root.style.setProperty("--page-glow", theme.pageGlow || "none");
  root.dataset.theme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", accent);
  document.title = cleanName(a.appName);
  // Seitenleiste und Anmeldeseite aktualisieren den Programmnamen darüber
  window.dispatchEvent(new CustomEvent("appearance-changed", { detail: a }));
}

export function cacheAppearance(a: Appearance) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(a));
  } catch {
    // Speicher gesperrt - dann gilt der Stand vom Server
  }
}

export function cachedAppearance(): Appearance {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    if (raw && HEX.test(raw.accent)) {
      // ältere Speicherstände kennen nur "darkStyle" (warm/cool)
      const theme = cleanTheme(raw.theme ?? (raw.darkStyle === "cool" ? "cool" : "warm"));
      return { accent: raw.accent, theme, appName: cleanName(raw.appName) };
    }
  } catch {
    // ungültiger Eintrag - Standard
  }
  return DEFAULT_APPEARANCE;
}

/** Übernimmt Werte vom Server (Firma): anwenden und zwischenspeichern. */
export function setAppearanceFromCompany(c: { uiAccent?: string | null; uiDarkStyle?: string | null; uiAppName?: string | null }) {
  const a: Appearance = {
    accent: c.uiAccent && HEX.test(c.uiAccent) ? c.uiAccent : DEFAULT_APPEARANCE.accent,
    theme: cleanTheme(c.uiDarkStyle),
    appName: cleanName(c.uiAppName),
  };
  applyAppearance(a);
  cacheAppearance(a);
}

/** Programmname für Anzeigen (Seitenleiste, Anmeldeseite): aus dem Zwischenspeicher, wird bei Änderung aktualisiert. */
export function currentAppName(): string {
  return cachedAppearance().appName;
}
