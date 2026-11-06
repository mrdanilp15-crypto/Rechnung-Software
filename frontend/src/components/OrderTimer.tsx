import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "./Toast";

/**
 * Zeit direkt am Auftrag erfassen: ein Klick startet die Arbeitszeit für diesen Auftrag, ein Klick beendet sie. Läuft schon eine Zeit für etwas anderes,
 * wechselt "Hierher wechseln" in einem Klick (die andere wird beendet). Die erfasste Zeit steht im Auftrag und in der Zeiterfassung.
 */

interface Running {
  id: string;
  startedAt: string;
  activity: string;
  order: { id: string; number: string | null; customerName: string } | null;
}
interface Activity { key: string; label: string }

const clock = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const input = "px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm";

export function OrderTimer({ orderId, orderNumber, onChanged }: { orderId: string; orderNumber: string | null; onChanged?: () => void }) {
  const showToast = useToast();
  const [running, setRunning] = useState<Running | null | undefined>(undefined);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activity, setActivity] = useState("PRODUKTION");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const loadRunning = useCallback(() => {
    api.get("/time/running").then((r) => setRunning(r.data)).catch(() => setRunning(null));
  }, []);
  useEffect(() => {
    loadRunning();
    api.get("/time/meta").then((r) => setActivities(r.data.activities ?? [])).catch(() => undefined);
  }, [loadRunning, orderId]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function call(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try {
      await fn();
      showToast(ok, "success");
      loadRunning();
      window.dispatchEvent(new Event("timer-changed"));
      onChanged?.();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "Das hat nicht geklappt", "error");
    } finally {
      setBusy(false);
    }
  }
  const start = () => call(async () => { await api.post("/time/start", { activity, orderConfirmationId: orderId }); }, "Zeit läuft");
  const stop = () => call(async () => { await api.post("/time/stop"); }, "Zeit gespeichert");
  const switchHere = () => call(async () => { await api.post("/time/stop"); await api.post("/time/start", { activity, orderConfirmationId: orderId }); }, "Zeit läuft jetzt für diesen Auftrag");

  if (running === undefined) return null;
  const here = running?.order?.id === orderId;
  const elapsed = running ? Math.max(0, Math.floor((now - new Date(running.startedAt).getTime()) / 1000)) : 0;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white dark:bg-slate-800 shadow px-4 py-3 mb-4 text-sm">
      {running && here ? (
        <>
          <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" aria-hidden />Zeit läuft für diesen Auftrag</span>
          <span className="font-mono tabular-nums text-lg">{clock(elapsed)}</span>
          <button type="button" disabled={busy} onClick={stop} className="ml-auto px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-60">■ Stopp</button>
        </>
      ) : running ? (
        <>
          <span className="text-slate-600 dark:text-slate-300">
            Es läuft gerade eine Zeit{running.order ? <> für <Link to={`/orders/${running.order.id}`} className="text-brand hover:underline">{running.order.number}</Link></> : " (ohne Auftrag)"} - <span className="font-mono tabular-nums">{clock(elapsed)}</span>
          </span>
          <button type="button" disabled={busy} onClick={switchHere} className="ml-auto px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white font-medium disabled:opacity-60" title="Beendet die laufende Zeit und startet sie für diesen Auftrag">Hierher wechseln</button>
        </>
      ) : (
        <>
          <span className="text-slate-600 dark:text-slate-300">Arbeitszeit für {orderNumber ?? "diesen Auftrag"}</span>
          <select value={activity} onChange={(e) => setActivity(e.target.value)} className={input} aria-label="Tätigkeit">
            {(activities.length ? activities : [{ key: "PRODUKTION", label: "Produktion" }]).map((a) => <option key={a.key} value={a.key}>{a.label.split(" (")[0]}</option>)}
          </select>
          <button type="button" disabled={busy} onClick={start} className="ml-auto px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white font-medium disabled:opacity-60">▶ Zeit starten</button>
        </>
      )}
    </div>
  );
}
