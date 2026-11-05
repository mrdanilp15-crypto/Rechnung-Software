/**
 * Designs der Oberfläche. Ein Design legt für das helle und das dunkle Erscheinungsbild die Grau-Stufen (slate 50-950) fest, dazu Eckenradius,
 * Kartenglanz und eine empfohlene Akzentfarbe. Die Akzentfarbe bleibt unabhängig wählbar (Einstellungen → Darstellung).
 * Die Stufen gelten so: 50-200 helle Flächen/Text im Dunkeln, 400-500 Zweittext, 600-700 Rahmen, 800 Karten, 900 Seitenhintergrund, 950 Seitenleiste.
 */

export type ThemeId = "cool" | "warm" | "graphit" | "mitternacht" | "wald" | "aurora";
export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Scale = Record<(typeof STEPS)[number], string>; // "r g b"

export interface ThemeDef {
  id: ThemeId;
  label: string;
  description: string;
  accent: string; // empfohlene Akzentfarbe
  dark: Scale;
  light: Scale;
  radius: { lg: string; xl: string };
  /** Zusatzschatten für Karten im Dunkeln (leer = nur feiner Rahmen) */
  glow: string;
  /** Hintergrundverlauf der Seite im Dunkeln (CSS-Wert für background-image) */
  pageGlow: string;
  /** Vorschau: Seitenleiste, Hintergrund, Karte */
  swatch: [string, string, string];
}

const SLATE_LIGHT: Scale = { 50: "248 250 252", 100: "241 245 249", 200: "226 232 240", 300: "203 213 225", 400: "148 163 184", 500: "100 116 139", 600: "71 85 105", 700: "51 65 85", 800: "30 41 59", 900: "15 23 42", 950: "2 6 23" };
const STONE_LIGHT: Scale = { 50: "250 249 247", 100: "245 242 238", 200: "231 226 219", 300: "214 207 197", 400: "168 158 146", 500: "120 111 101", 600: "87 80 73", 700: "68 62 57", 800: "41 37 34", 900: "28 25 23", 950: "12 10 9" };
const ZINC_LIGHT: Scale = { 50: "250 250 250", 100: "244 244 245", 200: "228 228 231", 300: "212 212 216", 400: "161 161 170", 500: "113 113 122", 600: "82 82 91", 700: "63 63 70", 800: "39 39 42", 900: "24 24 27", 950: "9 9 11" };

const GLOW = "0 10px 28px -14px rgb(0 0 0 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.04)";

export const THEMES: ThemeDef[] = [
  {
    id: "cool",
    label: "Klassisch",
    description: "Kühles Blaugrau, das Standard-Design.",
    accent: "#2563eb",
    light: SLATE_LIGHT,
    dark: SLATE_LIGHT,
    radius: { lg: "0.75rem", xl: "1rem" },
    glow: "",
    pageGlow: "",
    swatch: ["#020617", "#0f172a", "#1e293b"],
  },
  {
    id: "warm",
    label: "Werkstatt",
    description: "Warme Braun- und Steintöne, gemütlich wie eine Werkbank.",
    accent: "#c2570c",
    light: STONE_LIGHT,
    dark: { 50: "250 246 241", 100: "241 235 226", 200: "229 220 207", 300: "205 191 174", 400: "179 163 146", 500: "154 136 120", 600: "94 78 66", 700: "62 49 39", 800: "42 33 26", 900: "29 22 17", 950: "22 17 13" },
    radius: { lg: "0.75rem", xl: "1rem" },
    glow: "",
    pageGlow: "",
    swatch: ["#16110d", "#1d1611", "#2a211a"],
  },
  {
    id: "graphit",
    label: "Graphit",
    description: "Neutrales Anthrazit ohne Farbstich, dazu ein kräftiger Akzent.",
    accent: "#c2570c",
    light: ZINC_LIGHT,
    dark: { 50: "250 250 250", 100: "244 244 245", 200: "228 228 231", 300: "212 212 216", 400: "161 161 170", 500: "130 130 140", 600: "82 82 91", 700: "45 45 50", 800: "27 27 30", 900: "17 17 19", 950: "10 10 11" },
    radius: { lg: "1rem", xl: "1.25rem" },
    glow: GLOW,
    pageGlow: "radial-gradient(900px 420px at 85% -10%, rgb(255 255 255 / 0.035), transparent 60%)",
    swatch: ["#0a0a0b", "#111113", "#1b1b1e"],
  },
  {
    id: "mitternacht",
    label: "Mitternacht",
    description: "Tiefes Nachtblau mit leuchtenden Karten, nah am Vorschaubild.",
    accent: "#2563eb",
    light: SLATE_LIGHT,
    dark: { 50: "247 249 253", 100: "236 241 250", 200: "218 226 242", 300: "190 202 228", 400: "148 163 200", 500: "110 128 170", 600: "62 80 128", 700: "34 48 88", 800: "18 28 56", 900: "10 16 36", 950: "6 10 24" },
    radius: { lg: "1rem", xl: "1.25rem" },
    glow: GLOW,
    pageGlow: "radial-gradient(1000px 480px at 80% -12%, rgb(37 99 235 / 0.16), transparent 62%)",
    swatch: ["#060a18", "#0a1024", "#121c38"],
  },
  {
    id: "wald",
    label: "Wald",
    description: "Dunkles Tannengrün, ruhig und natürlich.",
    accent: "#15803d",
    light: { 50: "247 250 248", 100: "240 245 241", 200: "225 234 227", 300: "200 214 204", 400: "150 168 156", 500: "105 125 112", 600: "74 92 81", 700: "55 70 61", 800: "30 42 35", 900: "19 29 23", 950: "9 15 12" },
    dark: { 50: "247 250 248", 100: "237 244 240", 200: "218 230 223", 300: "190 208 198", 400: "150 172 160", 500: "110 138 124", 600: "70 96 84", 700: "36 56 47", 800: "20 34 28", 900: "12 22 18", 950: "8 16 13" },
    radius: { lg: "1rem", xl: "1.25rem" },
    glow: GLOW,
    pageGlow: "radial-gradient(900px 420px at 15% -10%, rgb(21 128 61 / 0.13), transparent 62%)",
    swatch: ["#08100d", "#0c1612", "#14221c"],
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Tiefes Blauviolett mit hellem Violett als Akzent.",
    accent: "#7c3aed",
    light: { 50: "250 249 253", 100: "243 241 250", 200: "230 226 243", 300: "208 201 230", 400: "160 150 192", 500: "112 103 148", 600: "82 74 112", 700: "62 55 88", 800: "36 30 58", 900: "22 17 38", 950: "10 7 20" },
    dark: { 50: "249 247 253", 100: "241 238 250", 200: "228 222 242", 300: "206 198 232", 400: "168 154 206", 500: "130 114 178", 600: "88 72 140", 700: "52 40 92", 800: "30 22 58", 900: "18 12 36", 950: "12 8 24" },
    radius: { lg: "1rem", xl: "1.25rem" },
    glow: GLOW,
    pageGlow: "radial-gradient(1000px 480px at 80% -12%, rgb(124 58 237 / 0.18), transparent 62%)",
    swatch: ["#0c0818", "#120c24", "#1e163a"],
  },
];

export const DEFAULT_THEME: ThemeId = "warm";

export const themeById = (id: string | null | undefined): ThemeDef => THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!;
