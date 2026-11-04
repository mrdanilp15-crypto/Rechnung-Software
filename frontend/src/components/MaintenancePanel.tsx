import { useEffect, useState } from "react";
import { api } from "../api/client";

/** Wartungsplan eines Druckers: Aufgaben mit Intervall in Betriebsstunden und/oder Tagen, Restzeit, "Erledigt". Anlegen/Ändern nur für Administratoren. */

export interface MaintenanceTaskRow {
  id: string;
  printerId: string;
  name: string;
  intervalHours: number | null;
  intervalDays: number | null;
  notes: string | null;
  lastDoneAt: string;
  hoursSince: number;
  daysSince: number;
  remainingHours: number | null;
  remainingDays: number | null;
  due: boolean;
  progress: number;
}
interface Preset {
  name: string;
  intervalHours: number | null;
  intervalDays: number | null;
}

const nf = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n);
const input = "px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";

/** Restzeit als Text: "noch 120 h", "noch 20 Tage", bei Fälligkeit "fällig (seit 15 h)" */
export function remainingText(t: MaintenanceTaskRow): string {
  const parts: string[] = [];
  if (t.remainingHours !== null) parts.push(t.remainingHours > 0 ? `noch ${nf(t.remainingHours)} h` : `${nf(-t.remainingHours)} h überfällig`);
  if (t.remainingDays !== null) parts.push(t.remainingDays > 0 ? `noch ${t.remainingDays} Tage` : `${-t.remainingDays} Tage überfällig`);
  return parts.join(" · ");
}

export function MaintenancePanel({ printerId, tasks, isAdmin, onChange }: { printerId: string; tasks: MaintenanceTaskRow[]; isAdmin: boolean; onChange: () => void }) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", hours: "", days: "", notes: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (adding && presets.length === 0) api.get("/maintenance/presets").then((r) => setPresets(r.data)).catch(() => undefined);
  }, [adding, presets.length]);

  const fail = (e: any, fallback: string) => setError(e?.response?.data?.error ?? fallback);

  async function done(t: MaintenanceTaskRow) {
    setError(null);
    try {
      await api.post(`/maintenance/${t.id}/done`);
      onChange();
    } catch (e) {
      fail(e, "Das hat nicht geklappt.");
    }
  }
  async function remove(t: MaintenanceTaskRow) {
    if (!window.confirm(`Wartungsaufgabe "${t.name}" löschen?`)) return;
    try {
      await api.delete(`/maintenance/${t.id}`);
      onChange();
    } catch (e) {
      fail(e, "Löschen hat nicht geklappt.");
    }
  }
  async function save() {
    setError(null);
    const payload = { name: form.name, intervalHours: parseFloat(form.hours.replace(",", ".")) || null, intervalDays: parseInt(form.days, 10) || null, notes: form.notes || null };
    try {
      if (form.id) await api.patch(`/maintenance/${form.id}`, payload);
      else await api.post("/maintenance", { printerId, ...payload });
      setAdding(false);
      setForm({ id: "", name: "", hours: "", days: "", notes: "" });
      onChange();
    } catch (e) {
      fail(e, "Speichern hat nicht geklappt.");
    }
  }
  function edit(t: MaintenanceTaskRow) {
    setForm({ id: t.id, name: t.name, hours: t.intervalHours ? String(t.intervalHours) : "", days: t.intervalDays ? String(t.intervalDays) : "", notes: t.notes ?? "" });
    setAdding(true);
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">Wartung</span>
        {isAdmin && <button type="button" onClick={() => { setForm({ id: "", name: "", hours: "", days: "", notes: "" }); setAdding((v) => !v); }} className="text-brand hover:underline">{adding ? "Abbrechen" : "+ Aufgabe"}</button>}
      </div>

      {tasks.length === 0 && !adding && <p className="text-slate-500">Noch keine Wartungsaufgaben.{isAdmin ? " Mit \"+ Aufgabe\" legst du z.B. \"Düse prüfen\" nach 300 Betriebsstunden an." : ""}</p>}

      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`font-medium ${t.due ? "text-red-600" : ""}`}>{t.name}</span>
              <span className={t.due ? "text-red-600" : "text-slate-500"}>{t.due ? "fällig" : remainingText(t)}</span>
              <span className="ml-auto flex gap-3">
                <button type="button" onClick={() => done(t)} className="text-brand hover:underline">Erledigt</button>
                {isAdmin && <button type="button" onClick={() => edit(t)} className="text-slate-500 hover:underline">Ändern</button>}
                {isAdmin && <button type="button" onClick={() => remove(t)} className="text-red-600 hover:underline">Löschen</button>}
              </span>
            </div>
            <div className="h-1.5 rounded bg-slate-200 dark:bg-slate-700 mt-1 overflow-hidden" title={t.due ? remainingText(t) : `${Math.round(t.progress * 100)} % des Intervalls`}>
              <div className={`h-full ${t.due ? "bg-red-500" : t.progress > 0.8 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${Math.min(100, Math.round(t.progress * 100))}%` }} />
            </div>
            {t.due && <p className="text-slate-500 mt-0.5">{remainingText(t)}</p>}
            {t.notes && <p className="text-slate-500 mt-0.5">{t.notes}</p>}
          </li>
        ))}
      </ul>

      {adding && (
        <div className="rounded bg-slate-50 dark:bg-slate-900/40 p-2 space-y-2">
          {!form.id && presets.length > 0 && (
            <select value="" onChange={(e) => { const p = presets[Number(e.target.value)]; if (p) setForm((f) => ({ ...f, name: p.name, hours: p.intervalHours ? String(p.intervalHours) : "", days: p.intervalDays ? String(p.intervalDays) : "" })); }} className={`${input} w-full`}>
              <option value="">Richtwert übernehmen ...</option>
              {presets.map((p, i) => <option key={p.name} value={i}>{p.name} ({[p.intervalHours ? `${p.intervalHours} h` : "", p.intervalDays ? `${p.intervalDays} Tage` : ""].filter(Boolean).join(" / ")})</option>)}
            </select>
          )}
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Aufgabe, z.B. Düse prüfen" className={`${input} w-full`} />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder="alle ... Betriebsstunden" inputMode="decimal" className={input} />
            <input value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} placeholder="oder alle ... Tage" inputMode="numeric" className={input} />
          </div>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notiz (optional), z.B. Ersatzteil" className={`${input} w-full`} />
          <p className="text-slate-500">Mindestens ein Intervall. Die Richtwerte sind Anhaltspunkte - bitte nach dem Handbuch deines Druckers anpassen. Die Zählung beginnt jetzt.</p>
          <button type="button" onClick={save} disabled={!form.name.trim() || (!form.hours.trim() && !form.days.trim())} className="px-3 py-1.5 rounded bg-brand text-white disabled:opacity-50">Speichern</button>
        </div>
      )}
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
