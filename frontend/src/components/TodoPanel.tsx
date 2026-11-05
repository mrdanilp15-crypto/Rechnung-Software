import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Panel } from "./dashboard/widgets";

/** "Heute zu tun": alles, was Aufmerksamkeit braucht, an einer Stelle (überfällig, versandbereit, Angebote nachfassen, Material knapp ...). Nur Anzeige, jeder Eintrag führt zur Lösung. */

interface Item {
  id: string;
  kind: string;
  severity: "high" | "normal" | "info";
  title: string;
  detail?: string;
  link: string;
}

const DOT: Record<Item["severity"], string> = { high: "bg-red-500", normal: "bg-amber-500", info: "bg-slate-400" };
const SHOWN = 6;

export function TodoPanel() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [all, setAll] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get("/todo").then((r) => setItems(r.data.items)).catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  const list = items ?? [];
  const shown = all ? list : list.slice(0, SHOWN);
  const high = list.filter((i) => i.severity === "high").length;

  return (
    <Panel title="Heute zu tun" className="mb-3">
      {items === null ? (
        <p className="text-sm text-slate-500">Wird geladen ...</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-slate-500">Nichts offen - alles erledigt.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-2">{list.length} {list.length === 1 ? "Punkt" : "Punkte"}{high > 0 ? `, davon ${high} dringend` : ""}</p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {shown.map((it) => (
              <li key={it.id}>
                <Link to={it.link} className="flex items-start gap-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 -mx-2 px-2 rounded-lg">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[it.severity]}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{it.title}</span>
                    {it.detail && <span className="block text-xs text-slate-500">{it.detail}</span>}
                  </span>
                  <span className="text-brand text-sm shrink-0 mt-0.5">→</span>
                </Link>
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
