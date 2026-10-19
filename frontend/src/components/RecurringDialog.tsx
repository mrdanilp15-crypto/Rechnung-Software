import { useEffect, useState } from "react";
import { api } from "../api/client";

const UNITS = [
  { value: "WEEK", one: "Woche", many: "Wochen" },
  { value: "MONTH", one: "Monat", many: "Monate" },
  { value: "QUARTER", one: "Quartal", many: "Quartale" },
  { value: "YEAR", one: "Jahr", many: "Jahre" },
] as const;

const inputClass = "px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm";

/**
 * Richtet aus einer bestehenden Rechnung eine wiederkehrende Rechnung ein: zu jedem Termin entsteht automatisch ein
 * ENTWURF mit denselben Positionen, den Sie prüfen und dann fertigstellen - es wird nie etwas automatisch versendet.
 */
export function RecurringDialog({ invoiceId, defaultName, onClose, onCreated }: { invoiceId: string; defaultName: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState(defaultName);
  const [count, setCount] = useState(1);
  const [unit, setUnit] = useState<(typeof UNITS)[number]["value"]>("MONTH");
  const [firstRun, setFirstRun] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Vorschlag für den ersten Termin: heute + ein Intervall
  useEffect(() => {
    api.get("/recurring/suggest-date", { params: { unit, count } }).then((res) => setFirstRun(String(res.data.date).slice(0, 10))).catch(() => undefined);
  }, [unit, count]);

  async function submit() {
    if (!firstRun) return setError("Bitte den ersten Termin wählen.");
    setBusy(true);
    setError(null);
    try {
      await api.post("/recurring", { fromInvoiceId: invoiceId, name: name.trim() || undefined, intervalUnit: unit, intervalCount: count, firstRunDate: firstRun, endDate: endDate || undefined });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.error || "Konnte nicht eingerichtet werden.");
    } finally {
      setBusy(false);
    }
  }

  const unitLabel = UNITS.find((u) => u.value === unit)!;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4" onMouseDown={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-5 space-y-4" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="font-medium">Wiederkehrende Rechnung einrichten</h2>
        <p className="text-sm text-slate-500">Zu jedem Termin legt die Software automatisch einen Entwurf mit denselben Positionen an. Sie prüfen ihn und stellen ihn fertig - es wird nichts automatisch versendet.</p>
        <label className="block text-sm">
          Bezeichnung
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} mt-1 w-full`} />
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span>Alle</span>
          <input type="number" min={1} max={52} value={count} onChange={(e) => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))} className={`${inputClass} w-20`} />
          <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} className={inputClass}>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>{count === 1 ? u.one : u.many}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Erster Entwurf am
            <input type="date" value={firstRun} onChange={(e) => setFirstRun(e.target.value)} className={`${inputClass} mt-1 w-full`} />
          </label>
          <label className="block text-sm">
            Endet am (optional)
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputClass} mt-1 w-full`} />
          </label>
        </div>
        <p className="text-xs text-slate-500">Alle {count} {count === 1 ? unitLabel.one : unitLabel.many}, beginnend am {firstRun ? new Intl.DateTimeFormat("de-DE").format(new Date(firstRun)) : "..."}.</p>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm">Abbrechen</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded bg-brand hover:bg-brand-dark text-white text-sm disabled:opacity-60">{busy ? "Wird eingerichtet ..." : "Einrichten"}</button>
        </div>
      </div>
    </div>
  );
}
