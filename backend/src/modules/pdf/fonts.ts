import fs from "fs";
import path from "path";

export interface PdfFonts {
  regular: string; // Pfad zur TTF-Datei bzw. Name der pdfkit-Standardschrift
  bold: string;
  /** true, wenn echte Schriftdateien gefunden wurden (Voraussetzung für PDF/A). */
  embedded: boolean;
}

const FALLBACK: PdfFonts = { regular: "Helvetica", bold: "Helvetica-Bold", embedded: false };

// Reihenfolge: eigene Schriften im Repo, dann die im Docker-Image installierten Liberation-/
// DejaVu-Schriften (Alpine: `apk add font-liberation`), dann übliche Systempfade.
// Liberation Sans ist metrisch identisch zu Arial/Helvetica, deckt aber Latin-Erweiterungen,
// Kyrillisch und Griechisch ab - Kundennamen mit z.B. "Ł", "ő" oder "İ" werden damit korrekt
// dargestellt statt als Platzhalterzeichen.
const CANDIDATES: [string, string][] = [
  [path.resolve(process.cwd(), "assets/fonts/LiberationSans-Regular.ttf"), path.resolve(process.cwd(), "assets/fonts/LiberationSans-Bold.ttf")],
  ["/usr/share/fonts/liberation/LiberationSans-Regular.ttf", "/usr/share/fonts/liberation/LiberationSans-Bold.ttf"],
  ["/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf", "/usr/share/fonts/liberation-sans/LiberationSans-Bold.ttf"],
  ["/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"],
  ["/usr/share/fonts/TTF/LiberationSans-Regular.ttf", "/usr/share/fonts/TTF/LiberationSans-Bold.ttf"],
  ["/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"],
  ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
  ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"],
  ["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"],
];

let cached: PdfFonts | null = null;

export function resolvePdfFonts(): PdfFonts {
  if (cached) return cached;
  for (const [regular, bold] of CANDIDATES) {
    if (fs.existsSync(regular) && fs.existsSync(bold)) {
      cached = { regular, bold, embedded: true };
      return cached;
    }
  }
  cached = FALLBACK;
  return cached;
}
