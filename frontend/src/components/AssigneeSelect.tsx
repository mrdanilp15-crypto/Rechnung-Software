import { Avatar } from "./Avatar";
import { useDirectory } from "../hooks/useDirectory";

/**
 * Zuständigen Mitarbeiter wählen. Klein (compact): nur das Profilbild, ein Klick öffnet die Auswahl (z.B. direkt auf der Karte);
 * sonst Bild plus Auswahlfeld. Ohne Zuständigen zeigt es einen leeren Kreis mit Plus.
 */
export function AssigneeSelect({ value, current, onChange, compact = false, className = "" }: { value: string | null; current?: { id: string; name: string; avatar: import("./Avatar").AvatarInfo | null } | null; onChange: (id: string | null) => void; compact?: boolean; className?: string }) {
  const staff = useDirectory();
  const selected = staff.find((s) => s.id === value);
  const name = selected?.name ?? current?.name ?? "";
  const avatar = selected?.avatar ?? current?.avatar ?? null;

  const options = (
    <>
      <option value="">Niemand zuständig</option>
      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      {value && !selected && <option value={value}>{name || "Ehemaliger Benutzer"}</option>}
    </>
  );

  const face = value ? <Avatar id={value} name={name} avatar={avatar} size={compact ? "sm" : "md"} /> : (
    <span className={`${compact ? "w-7 h-7" : "w-9 h-9"} rounded-full border border-dashed border-slate-400 text-slate-400 inline-flex items-center justify-center text-sm shrink-0`} title="Niemand zuständig">+</span>
  );

  if (compact) {
    return (
      <span className={`relative inline-flex ${className}`} title={value ? `Zuständig: ${name}` : "Zuständigen wählen"}>
        {face}
        <select aria-label="Zuständiger Mitarbeiter" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full">{options}</select>
      </span>
    );
  }
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-slate-500 ${className}`}>
      Zuständig
      {face}
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100">{options}</select>
    </label>
  );
}
