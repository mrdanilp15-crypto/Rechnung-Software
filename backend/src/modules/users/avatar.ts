/**
 * Profilbilder: eigenes Foto, Symbol auf Farbe oder Initialen. Die Symbole entsprechen den Icons der Oberfläche; Farben kommen aus einer festen Palette.
 * Reine Logik (testbar); Speichern und Ausliefern übernimmt router.ts.
 */

export const AVATAR_PRESETS = ["printer", "cube", "filament", "wrench", "calculator", "clock", "chart", "board", "document", "money", "scale", "bell"] as const;
export const AVATAR_COLORS = ["#ea580c", "#dc2626", "#d97706", "#65a30d", "#059669", "#0891b2", "#2563eb", "#7c3aed", "#c026d3", "#e11d48", "#475569", "#0f766e"] as const;

export const MAX_AVATAR_BYTES = 512 * 1024;

export interface AvatarUser {
  avatarPath: string | null;
  avatarPreset: string | null;
  avatarColor: string | null;
  avatarUpdatedAt: Date | null;
}

/** Was die Oberfläche zum Darstellen braucht (kein Dateipfad nach außen). v ändert sich mit jedem neuen Bild und umgeht so den Browser-Zwischenspeicher. */
export interface AvatarInfo {
  photo: boolean;
  preset: string | null;
  color: string | null;
  v: number;
}

export function avatarOf(u: AvatarUser): AvatarInfo {
  return { photo: !!u.avatarPath, preset: u.avatarPreset, color: u.avatarColor, v: u.avatarUpdatedAt ? u.avatarUpdatedAt.getTime() : 0 };
}

export const isPreset = (v: unknown): v is (typeof AVATAR_PRESETS)[number] => typeof v === "string" && (AVATAR_PRESETS as readonly string[]).includes(v);
export const isColor = (v: unknown): v is (typeof AVATAR_COLORS)[number] => typeof v === "string" && (AVATAR_COLORS as readonly string[]).includes(v);

/** Dateityp an den ersten Bytes erkennen (nicht dem Namen oder der Angabe des Browsers glauben): nur PNG und JPEG. */
export function detectImage(buf: Buffer): "png" | "jpg" | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  return null;
}
