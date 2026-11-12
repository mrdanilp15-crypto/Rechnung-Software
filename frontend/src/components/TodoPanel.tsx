import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Panel } from "./dashboard/widgets";
import { useToast } from "./Toast";
import { useAuthStore } from "../store/authStore";
import { useDirectory } from "../hooks/useDirectory";

/** "Heute zu tun": alles, was Aufmerksamkeit braucht, an einer Stelle (überfällig, versandbereit, Angebote nachfassen, Material knapp ...). Nur Anzeige, jeder Eintrag führt zur Lösung. */

interface Item {
  id: string;
  kind: string;
  severity: "high" | "normal" | "info";
  title: string;
  detail?: string;
  link: string;
  assigneeId?: string | null;
  action?: Action;
  secondaryAction?: Action;
}
type Action = { label: string; method: "PATCH" | "POST"; url: string; body?: Record<string, unknown> };

const DOT: Record<Item["severity"], string> = { high: "bg-red-500", normal: "bg-amber-500", info: "bg-slate-400" };
const SHOWN = 6;

export function TodoPanel() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [all, setAll] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const showToast = useToast();
  // "Nur meine": Aufträge anderer Mitarbeiter ausblenden (nur sinnvoll mit mehreren Konten)
  const me = useAuthStore((s) => s.user);
  const staff = useDirectory();
  const [onlyMine, setOnlyMine] = useState(false);

  const load = () => api.get("/todo").then((r) => setItems(r.data.items)).catch(() => setFailed(true));
  useEffect(() => { void load(); }, []);

  // Vorschlag mit einem Klick bestätigen (nur Pfade der eigenen API)
  async function run(it: Item, which: "action" | "secondaryAction" = "action") {
    const a = it[which];
    if (!a || !a.url.startsWith("/") || a.url.startsWith("//")) return;
    setBusy(it.id);
    try {
      await api.request({ method: a.method, url: a.url, data: a.body });
      showToast("Erledigt", "success");
      await load();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "Das hat nicht geklappt", "error");
    } finally {
      setBusy(null);
    }
  }

  if (failed) return null;
  const list = (items ?? []).filter((i) => !onlyMine || !i.assigneeId || i.assigneeId === me?.id);
  const shown = all ? list : list.slice(0, SHOWN);
  const mineToggle = staff.length > 1 ? <label className="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Nur meine</label> : null;
  const high = list.filter((i) => i.severity === "high").length;

  return (
    <Panel title="Heute zu tun" help="today" className="mb-3">
      {items === null ? (
        <p className="text-sm text-slate-500">Wird geladen ...</p>
      ) : list.length === 0 ? (
        <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{onlyMine ? "Für dich ist nichts offen." : "Nichts offen - alles erledigt."}</p>{mineToggle}</div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs text-slate-500">{list.length} {list.length === 1 ? "Punkt" : "Punkte"}{high > 0 ? `, davon ${high} dringend` : ""}</p>
            {mineToggle}
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {shown.map((it) => (
              <li key={it.id} className="flex items-start gap-2">
                <Link to={it.link} className="flex-1 min-w-0 flex items-start gap-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 -mx-2 px-2 rounded-lg">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[it.severity]}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{it.title}</span>
                    {it.detail && <span className="block text-xs text-slate-500">{it.detail}</span>}
                  </span>
                  {!it.action && <span className="text-brand text-sm shrink-0 mt-0.5">→</span>}
                </Link>
                <div className="shrink-0 mt-1.5 flex flex-wrap justify-end gap-1.5">
                  {it.secondaryAction && <button type="button" disabled={busy === it.id} onClick={() => run(it, "secondaryAction")} className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs disabled:opacity-50">{it.secondaryAction.label}</button>}
                  {it.action && <button type="button" disabled={busy === it.id} onClick={() => run(it)} className="px-3 py-1 rounded-lg bg-brand hover:bg-brand-dark text-white text-xs font-medium disabled:opacity-50">{busy === it.id ? "..." : it.action.label}</button>}
                </div>
              </li>
            ))}
          </ul>
          {list.length > SHOWN && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-sm text-brand hover:underline">
              {all ? "Weniger anzeigen" : `Alle ${list.length} anzeigen`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}
