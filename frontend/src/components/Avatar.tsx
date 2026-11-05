import { useState } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * Profilbild eines Mitarbeiters: eigenes Foto, ein Symbol auf Farbe oder die Initialen auf einer (aus dem Namen abgeleiteten) Farbe.
 */

export interface AvatarInfo {
  photo: boolean;
  preset: string | null;
  color: string | null;
  v: number;
}

export const AVATAR_COLORS = ["#ea580c", "#dc2626", "#d97706", "#65a30d", "#059669", "#0891b2", "#2563eb", "#7c3aed", "#c026d3", "#e11d48", "#475569", "#0f766e"];
export const AVATAR_PRESETS: IconName[] = ["printer", "cube", "filament", "wrench", "calculator", "clock", "chart", "board", "document", "money", "scale", "bell"];

const SIZES = { xs: "w-5 h-5 text-[9px]", sm: "w-7 h-7 text-[11px]", md: "w-9 h-9 text-xs", lg: "w-16 h-16 text-xl", xl: "w-24 h-24 text-3xl" } as const;
const ICON_SIZES = { xs: "w-3 h-3", sm: "w-4 h-4", md: "w-5 h-5", lg: "w-8 h-8", xl: "w-12 h-12" } as const;

export const initialsOf = (name?: string | null) =>
  (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

/** Stabile Farbe aus dem Namen, wenn keine gewählt wurde. */
function colorFor(name: string, color: string | null): string {
  if (color) return color;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

export function Avatar({ id, name, avatar, size = "md", className = "" }: { id: string; name: string; avatar?: AvatarInfo | null; size?: keyof typeof SIZES; className?: string }) {
  const [broken, setBroken] = useState(false);
  const base = `${SIZES[size]} rounded-full shrink-0 inline-flex items-center justify-center font-semibold text-white overflow-hidden ${className}`;
  if (avatar?.photo && !broken) {
    return <img src={`/api/users/${id}/avatar?v=${avatar.v}`} alt={name} title={name} onError={() => setBroken(true)} className={`${base} object-cover bg-slate-200`} />;
  }
  const bg = colorFor(name, avatar?.color ?? null);
  const preset = avatar?.preset && (AVATAR_PRESETS as string[]).includes(avatar.preset) ? (avatar.preset as IconName) : null;
  return (
    <span className={base} style={{ background: bg }} title={name} aria-label={name}>
      {preset ? <Icon name={preset} className={ICON_SIZES[size]} /> : initialsOf(name)}
    </span>
  );
}
