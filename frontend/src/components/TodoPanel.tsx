import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Panel } from "./dashboard/widgets";
import { useToast } from "./Toast";
import { useAuthStore } from "../store/authStore";
import { useDirectory } from "../hooks/useDirectory";
import { Icon, type IconName } from "./Icon";

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

// Symbol und Farbe je Art; Dringendes ist immer rot
const KIND_ICON: Record<string, [IconName, string]> = {
  overdue: ["alertCircle", "bg-rose-50 text-rose-600"],
  "long-open-invoices": ["clock", "bg-amber-50 text-amber-700"],
  "no-invoice": ["receipt", "bg-rose-50 text-rose-600"],
  "ready-to-ship": ["truck", "bg-violet-50 text-violet-600"],
  "suggest-in-production": ["printer", "bg-violet-50 text-violet-600"],
  "suggest-ready": ["truck", "bg-violet-50 text-violet-600"],
  "suggest-assign-print": ["printer", "bg-violet-50 text-violet-600"],
  "unassigned-prints": ["printer", "bg-violet-50 text-violet-600"],
  "delivery-late": ["clock", "bg-rose-50 text-rose-600"],
  "delivery-soon": ["clock", "bg-amber-50 text-amber-700"],
  "quote-expired": ["document", "bg-blue-50 text-blue-600"],
  "quote-follow-up": ["mail", "bg-blue-50 text-blue-600"],
  maintenance: ["wrench", "bg-slate-100 text-slate-500"],
  "low-stock": ["filament", "bg-pink-50 text-pink-600"],
  "low-product-stock": ["cube", "bg-pink-50 text-pink-600"],
  "unmatched-payments": ["money", "bg-emerald-50 text-emerald-600"],
  "old-drafts": ["pencil", "bg-slate-100 text-slate-500"],
};
function iconFor(it: Item): [IconName, string] {
  const [icon, tone] = KIND_ICON[it.kind] ?? ["alert", "bg-amber-50 text-amber-700"];
  return [icon, it.severity === "high" ? "bg-rose-50 text-rose-600" : tone];
}
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
          <ul className="space-y-0.5">
            {shown.map((it) => {
              const [icon, tone] = iconFor(it);
              return (
                <li key={it.id} className="flex items-center gap-2">
                  <Link to={it.link} className="flex-1 min-w-0 flex items-center gap-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 -mx-2 px-2 rounded-xl">
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}><Icon name={icon} className="w-[18px] h-[18px]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug">{it.title}</span>
                      {it.detail && <span className="block text-xs text-slate-500 truncate">{it.detail}</span>}
                    </span>
                    {!it.action && <Icon name="chevronRight" className="w-4 h-4 text-slate-300 shrink-0" />}
                  </Link>
                  {(it.action || it.secondaryAction) && (
                    <div className="shrink-0 flex flex-wrap justify-end gap-1.5">
                      {it.secondaryAction && <button type="button" disabled={busy === it.id} onClick={() => run(it, "secondaryAction")} className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-medium disabled:opacity-50">{it.secondaryAction.label}</button>}
                      {it.action && <button type="button" disabled={busy === it.id} onClick={() => run(it)} className="px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-700 text-white text-xs font-medium disabled:opacity-50">{busy === it.id ? "..." : it.action.label}</button>}
                    </div>
                  )}
                </li>
              );
            })}
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
