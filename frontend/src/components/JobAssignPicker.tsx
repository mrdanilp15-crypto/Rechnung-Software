import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * Vorhandenen Druck einem Auftrag zuordnen: die letzten Drucke ohne Auftrag aus allen Druckern (auch aus Bambu Studio oder am Drucker gestartet).
 * Drucke, deren Name zu einer Position des Auftrags passt, stehen oben. Zeit und Material gehen danach in die Kosten des Auftrags ein.
 */

interface Job {
  id: string;
  name: string | null;
  printerName: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
  result: string | null;
  materialUsage: { name: string; grams: number }[] | null;
}

const key = (s: string) => s.toLowerCase().replace(/\.gcode\.3mf$|\.3mf$|\.gcode$/g, "").replace(/[^a-z0-9äöüß]+/g, "");
function matches(jobName: string | null, items: string[]): boolean {
  if (!jobName) return false;
  const k = key(jobName);
  return k.length >= 4 && items.some((it) => { const i = key(it); return i.length >= 4 && (i === k || i.includes(k) || k.includes(i)); });
}
const when = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
const RESULT: Record<string, string> = { FINISHED: "fertig", FAILED: "fehlgeschlagen", CANCELLED: "abgebrochen", UNKNOWN: "beendet" };

export function JobAssignPicker({ orderId, itemNames, onAssigned, onClose }: { orderId: string; itemNames: string[]; onAssigned: (jobId: string) => void; onClose: () => void }) {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.get("/printers/jobs/unassigned").then((r) => setJobs(r.data)).catch(() => { setJobs([]); setError("Druckverlauf konnte nicht geladen werden."); });
  }, []);

  async function assign(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api.patch(`/printers/jobs/${id}`, { orderConfirmationId: orderId });
      setJobs((l) => (l ?? []).filter((j) => j.id !== id));
      onAssigned(id);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Zuordnen hat nicht geklappt.");
    } finally {
      setBusy(null);
    }
  }

  const sorted = [...(jobs ?? [])].sort((a, b) => Number(matches(b.name, itemNames)) - Number(matches(a.name, itemNames)));
  return (
    <div className="mb-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-slate-500 flex-1">Vorhandenen Druck zuordnen (letzte 90 Tage, noch ohne Auftrag)</p>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:underline">Schließen</button>
      </div>
      {jobs === null && <p className="text-sm text-slate-500">Wird geladen ...</p>}
      {jobs && jobs.length === 0 && <p className="text-sm text-slate-500">Keine Drucke ohne Auftrag gefunden. Drucke erscheinen hier, sobald der Drucker verbunden ist und sie erkannt hat.</p>}
      <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {sorted.map((j) => (
          <li key={j.id} className="py-2 flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-medium break-words">{j.name ?? "Druckauftrag"}{matches(j.name, itemNames) && <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">passt zum Auftrag</span>}</span>
              <span className="block text-xs text-slate-500 break-words">
                {j.printerName} · {when(j.startedAt)} · {j.endedAt ? `${hm(j.minutes ?? 0)} · ${RESULT[j.result ?? "UNKNOWN"] ?? j.result}` : "läuft noch"}
                {j.materialUsage && j.materialUsage.length > 0 ? ` · ${j.materialUsage.map((u) => `${u.name} ${Math.round(u.grams)} g`).join(", ")}` : ""}
              </span>
            </span>
            <button type="button" disabled={busy === j.id} onClick={() => assign(j.id)} className="shrink-0 px-3 py-1 rounded-lg bg-brand text-white text-xs font-medium disabled:opacity-50">Zuordnen</button>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
