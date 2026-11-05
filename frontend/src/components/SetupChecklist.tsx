import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";

/** Einrichtungs-Checkliste (nur Administratoren): zeigt, was für den vollen Funktionsumfang noch fehlt; verschwindet, wenn alles erledigt oder ausgeblendet ist. */

interface Step {
  id: string;
  label: string;
  done: boolean;
  to: string;
}

const KEY = "setupChecklistHidden";

export function SetupChecklist() {
  const isAdmin = useAuthStore((s) => s.user?.role) === "ADMIN";
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (!isAdmin || hidden) return;
    api.get("/system/status").then((r) => setSteps(r.data.setup)).catch(() => setSteps(null));
  }, [isAdmin, hidden]);

  if (!isAdmin || hidden || !steps) return null;
  const open = steps.filter((s) => !s.done);
  if (open.length === 0) return null;

  function hide() {
    try { localStorage.setItem(KEY, "1"); } catch { /* ohne Speicher: nur für diese Sitzung */ }
    setHidden(true);
  }

  return (
    <div className="mb-3 rounded-xl border border-brand/30 bg-brand/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Einrichtung: {steps.length - open.length} von {steps.length} erledigt</h2>
          <p className="text-xs text-slate-500 mt-0.5">Damit alle Funktionen laufen, fehlt noch:</p>
        </div>
        <button type="button" onClick={hide} className="text-xs text-slate-500 hover:underline shrink-0">Ausblenden</button>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-brand" style={{ width: `${((steps.length - open.length) / steps.length) * 100}%` }} /></div>
      <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {open.map((s) => (
          <li key={s.id}><Link to={s.to} className="text-brand hover:underline">{s.label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
