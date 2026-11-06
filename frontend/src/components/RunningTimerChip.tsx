import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api/client";

/** Kleine Anzeige in der Kopfzeile, solange eine Arbeitszeit läuft (führt zum Auftrag bzw. zur Zeiterfassung) - damit sie nicht vergessen wird. */
export function RunningTimerChip() {
  const location = useLocation();
  const [running, setRunning] = useState<{ startedAt: string; order: { id: string; number: string | null } | null } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    const load = () => api.get("/time/running").then((r) => alive && setRunning(r.data)).catch(() => undefined);
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 60_000);
    // Start/Stopp an anderer Stelle (Auftrag, Zeiterfassung) sofort übernehmen
    window.addEventListener("timer-changed", load);
    return () => { alive = false; clearInterval(t); window.removeEventListener("timer-changed", load); };
  }, [location.pathname]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (!running) return null;
  const sec = Math.max(0, Math.floor((now - new Date(running.startedAt).getTime()) / 1000));
  const text = `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  return (
    <Link to={running.order ? `/orders/${running.order.id}` : "/time"} title={running.order ? `Zeit läuft für ${running.order.number}` : "Zeit läuft"} className="mr-1 flex items-center gap-1.5 px-2.5 h-9 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium">
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden />
      <span className="font-mono tabular-nums">{text}</span>
    </Link>
  );
}
