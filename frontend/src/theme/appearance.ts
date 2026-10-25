/**
 * Darstellung der Oberfläche: Akzentfarbe und Stil des dunklen Designs. Beides wird in den Firmen-Einstellungen gespeichert
 * (gilt auf allen Geräten) und zusätzlich im Browser zwischengespeichert, damit beim Start nichts aufblitzt.
 */

export type DarkStyle = "warm" | "cool";
export interface Appearance {
  accent: string; // #rrggbb
  darkStyle: DarkStyle;
}

export const ACCENTS: { hex: string; label: string }[] = [
  { hex: "#2563eb", label: "Blau" },
  { hex: "#0284c7", label: "HegePrint-Cyan" },
  { hex: "#c2570c", label: "Orange" },
  { hex: "#15803d", label: "Grün" },
  { hex: "#7c3aed", label: "Violett" },
  { hex: "#be185d", label: "Magenta" },
  { hex: "#0f766e", label: "Türkis" },
  { hex: "#334155", label: "Graphit" },
];

export const DEFAULT_APPEARANCE: Appearance = { accent: "#2563eb", darkStyle: "warm" };
const CACHE_KEY = "rechnung_appearance";

const HEX = /^#[0-9a-f]{6}$/i;

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
  root.style.setProperty("--brand-light", rgb(accent).join(" "));
  root.style.setProperty("--brand-dark-light", shade(accent, -0.18));
  root.style.setProperty("--brand-dm", shade(accent, 0.14));
  root.style.setProperty("--brand-dark-dm", rgb(accent).join(" "));
  root.classList.toggle("theme-warm", a.darkStyle !== "cool");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", accent);
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
    if (raw && HEX.test(raw.accent)) return { accent: raw.accent, darkStyle: raw.darkStyle === "cool" ? "cool" : "warm" };
  } catch {
    // ungültiger Eintrag - Standard
  }
  return DEFAULT_APPEARANCE;
}

/** Übernimmt Werte vom Server (Firma): anwenden und zwischenspeichern. */
export function setAppearanceFromCompany(c: { uiAccent?: string | null; uiDarkStyle?: string | null }) {
  const a: Appearance = {
    accent: c.uiAccent && HEX.test(c.uiAccent) ? c.uiAccent : DEFAULT_APPEARANCE.accent,
    darkStyle: c.uiDarkStyle === "cool" ? "cool" : "warm",
  };
  applyAppearance(a);
  cacheAppearance(a);
}
