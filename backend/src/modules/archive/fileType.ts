import path from "path";

/**
 * Dateityp-Erkennung für das Belegarchiv: Maßgeblich ist der Dateiinhalt (Signatur), nicht der vom Browser gemeldete Typ -
 * so lässt sich keine ausführbare/HTML-Datei als "PDF" einschmuggeln. Nur eine feste Liste an Formaten ist erlaubt.
 */

export interface DetectedType {
  mime: string;
  ext: string; // inkl. Punkt, kleingeschrieben
  /** darf im Browser direkt angezeigt werden (PDF, Bilder); alles andere wird nur heruntergeladen */
  inline: boolean;
  /** reiner Text (Volltext wird direkt gelesen) */
  text: boolean;
}

const OFFICE: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".zip": "application/zip",
};
const LEGACY_OFFICE: Record<string, string> = { ".doc": "application/msword", ".xls": "application/vnd.ms-excel" };
const TEXT: Record<string, string> = { ".txt": "text/plain", ".csv": "text/csv", ".xml": "application/xml" };
// 3D-Druck-Dateien (Modelle, Slicer-Projekte, G-Code): werden nur gespeichert und zum Download angeboten, nie angezeigt oder durchsucht
const MODEL_TEXT: Record<string, string> = { ".obj": "model/obj", ".step": "model/step", ".stp": "model/step", ".gcode": "text/x.gcode", ".scad": "text/plain" };
const MODEL_MIME = { ".stl": "model/stl", ".3mf": "model/3mf", ".bgcode": "application/octet-stream" } as const;
// Dateianfänge ausführbarer Programme - werden unabhängig von der Endung abgelehnt (z.B. getarnte .stl-Dateien)
const EXECUTABLE_SIGNATURES: number[][] = [[0x4d, 0x5a], [0x7f, 0x45, 0x4c, 0x46], [0x23, 0x21], [0xca, 0xfe, 0xba, 0xbe], [0xcf, 0xfa, 0xed, 0xfe]];

export const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ...Object.keys(OFFICE), ...Object.keys(LEGACY_OFFICE), ...Object.keys(TEXT), ...Object.keys(MODEL_TEXT), ...Object.keys(MODEL_MIME)];

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

export function detectFileType(head: Buffer, originalName: string): DetectedType | null {
  const ext = path.extname(originalName).toLowerCase();
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return ext === ".pdf" || !ext ? { mime: "application/pdf", ext: ".pdf", inline: true, text: false } : null;
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47])) return { mime: "image/png", ext: ".png", inline: true, text: false };
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: ".jpg", inline: true, text: false };
  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) return { mime: "image/gif", ext: ".gif", inline: true, text: false };
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: ".webp", inline: true, text: false };
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) && OFFICE[ext]) return { mime: OFFICE[ext], ext, inline: false, text: false };
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0]) && LEGACY_OFFICE[ext]) return { mime: LEGACY_OFFICE[ext], ext, inline: false, text: false };
  if (TEXT[ext] && !head.subarray(0, 4096).includes(0)) return { mime: TEXT[ext], ext, inline: false, text: true };
  if (MODEL_TEXT[ext] && !head.subarray(0, 4096).includes(0)) return { mime: MODEL_TEXT[ext], ext, inline: false, text: false };
  if (ext === ".3mf" && startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return { mime: MODEL_MIME[".3mf"], ext, inline: false, text: false };
  if (ext === ".bgcode" && startsWith(head, [0x47, 0x43, 0x44, 0x45])) return { mime: MODEL_MIME[".bgcode"], ext, inline: false, text: false };
  // STL: ASCII ("solid ...") oder binär (80 Byte Kopf) - binär hat keine feste Signatur, daher nur ohne Programm-Signatur zulassen
  if (ext === ".stl" && !EXECUTABLE_SIGNATURES.some((sig) => startsWith(head, sig)) && !startsWith(head, [0x50, 0x4b]) && !startsWith(head, [0x25, 0x50, 0x44, 0x46])) return { mime: MODEL_MIME[".stl"], ext, inline: false, text: false };
  return null;
}

/** Dateiname für Anzeige/Download: keine Pfade, keine Steuer- und Sonderzeichen, begrenzte Länge. */
export function safeFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/")).replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim();
  return (base || "datei").slice(0, 150);
}

/** Tags: Komma/Semikolon getrennt, klein geschrieben (damit die Suche unabhängig von der Schreibweise trifft), ohne Doppelte. */
export function parseTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.map(String) : String(input ?? "").split(/[,;]/);
  const out: string[] = [];
  for (const t of raw) {
    const tag = t.trim().toLowerCase().slice(0, 30);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 10);
}

/** Kurzer Textausschnitt um den ersten Treffer eines Suchworts. */
export function snippetFor(text: string | null | undefined, words: string[]): string | null {
  if (!text || words.length === 0) return null;
  const lower = text.toLowerCase();
  for (const w of words) {
    const i = lower.indexOf(w.toLowerCase());
    if (i >= 0) {
      const start = Math.max(0, i - 50);
      const end = Math.min(text.length, i + w.length + 80);
      return (start > 0 ? "… " : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? " …" : "");
    }
  }
  return null;
}
