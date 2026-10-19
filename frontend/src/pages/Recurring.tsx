import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "../components/Toast";

interface Recurring {
  id: string;
  name: string;
  customerName: string;
  intervalUnit: "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  intervalCount: number;
  nextRunDate: string;
  endDate?: string | null;
  isActive: boolean;
  lastRunAt?: string | null;
  lastInvoiceId?: string | null;
  runCount: number;
  itemCount: number;
  grossCents: number;
  firstItem: string;
}

const UNIT: Record<string, [string, string]> = { WEEK: ["Woche", "Wochen"], MONTH: ["Monat", "Monate"], QUARTER: ["Quartal", "Quartale"], YEAR: ["Jahr", "Jahre"] };
const money = (c: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100);
const date = (iso?: string | null) => (iso ? new Intl.DateTimeFormat("de-DE").format(new Date(iso)) : "-");
const rhythm = (r: Recurring) => (r.intervalCount === 1 ? `jede(r) ${UNIT[r.intervalUnit][0]}` : `alle ${r.intervalCount} ${UNIT[r.intervalUnit][1]}`);

/** Wiederkehrende Rechnungen: Vorlagen, die zu jedem Termin automatisch einen Entwurf anlegen. */
export default function RecurringPage() {
  const navigate = useNavigate();
  const showToast = useToast();
  const [list, setList] = useState<Recurring[]>([]);
  const [loaded, setLoaded] = useState(false);

  function load() {
    api.get("/recurring").then((res) => {
      setList(res.data);
      setLoaded(true);
    });
  }
  useEffect(load, []);

  async function toggle(r: Recurring) {
    await api.patch(`/recurring/${r.id}`, { isActive: !r.isActive });
    load();
  }
  async function runNow(r: Recurring) {
    try {
      const { data } = await api.post(`/recurring/${r.id}/run-now`);
      showToast("Entwurf angelegt", "success");
      navigate(`/invoices/${data.invoiceId}/edit`);
    } catch (err: any) {
      showToast(err.response?.data?.error || "Konnte keinen Entwurf anlegen", "error");
    }
  }
  async function remove(r: Recurring) {
    if (!confirm(`"${r.name}" löschen? Bereits erzeugte Rechnungen bleiben erhalten.`)) return;
    await api.delete(`/recurring/${r.id}`);
    load();
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Link to="/documents" className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-sm">← Belege</Link>
        <h1 className="text-2xl font-semibold">Wiederkehrende Rechnungen</h1>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Zu jedem Termin legt die Software automatisch einen <strong>Entwurf</strong> an. Sie prüfen ihn und stellen ihn fertig - es wird nie automatisch eine Rechnung ausgestellt oder versendet.
        Neu einrichten: bei einer Rechnung im Menü (⋮) auf "Wiederkehrend einrichten" klicken.
      </p>
      <div className="space-y-3">
        {list.map((r) => (
          <div key={r.id} className={`bg-white dark:bg-slate-800 rounded-lg shadow p-4 ${r.isActive ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{r.name}</div>
                <div className="text-sm text-slate-500">
                  {r.customerName} · {rhythm(r)} · {r.itemCount} Position{r.itemCount === 1 ? "" : "en"} (z.B. {r.firstItem}) · {money(r.grossCents)} brutto
                </div>
                <div className="text-sm mt-1">
                  {r.isActive ? <>Nächster Entwurf am <strong>{date(r.nextRunDate)}</strong></> : <span className="text-slate-500">pausiert / beendet</span>}
                  {r.endDate && <span className="text-slate-500"> · endet am {date(r.endDate)}</span>}
                </div>
                <div className="text-xs text-slate-500">{r.runCount} Entwürfe bisher erzeugt{r.lastRunAt ? `, zuletzt am ${date(r.lastRunAt)}` : ""}</div>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <button onClick={() => runNow(r)} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700">Jetzt Entwurf anlegen</button>
                <button onClick={() => toggle(r)} className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-700">{r.isActive ? "Pausieren" : "Aktivieren"}</button>
                <button onClick={() => remove(r)} className="px-3 py-1.5 rounded bg-red-100 text-red-700">Löschen</button>
              </div>
            </div>
          </div>
        ))}
        {loaded && list.length === 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-8 text-center text-slate-500 text-sm">
            Noch nichts eingerichtet. Öffnen Sie unter "Belege" das Menü (⋮) einer Rechnung und wählen Sie "Wiederkehrend einrichten".
          </div>
        )}
      </div>
    </div>
  );
}
