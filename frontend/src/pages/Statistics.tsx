import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Kpi, Panel, eur, eurShort } from "../components/dashboard/widgets";

import { HelpTip } from "../components/HelpTip";
/** Statistiken: Umsatz mit Vorjahresvergleich, Bestseller, Kunden, Druckerauslastung und Materialverbrauch. */

interface Overview {
  year: number;
  months: { revenue: number[]; revenuePrev: number[]; expenses: number[]; expensesPrev: number[] };
  totals: { revenueCents: number; revenuePrevCents: number; expenseCents: number; expensePrevCents: number; invoiceCount: number; newCustomers: number; openCents: number; openCount: number };
  bestsellers: { name: string; quantity: number; revenueCents: number }[];
  customers: { name: string; revenueCents: number; invoices: number }[];
  printers: { id: string; name: string; jobs: number; finished: number; failed: number; cancelled: number; hoursGood: number; hoursWasted: number; percentByCount: number | null }[];
  materials: { materialId: string; name: string; grams: number; cents: number }[];
}

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const nf = (n: number, d = 1) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: d }).format(n);
const delta = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

/** Gruppierte Balken je Monat: aktuelles Jahr kräftig, Vorjahr blass. */
function CompareChart({ cur, prev, year }: { cur: number[]; prev: number[]; year: number }) {
  const W = 640, H = 190, L = 44, B = 22;
  const max = Math.max(1, ...cur, ...prev);
  const slot = (W - L - 6) / 12;
  const bw = (slot - 8) / 2;
  const y = (v: number) => 6 + (1 - v / max) * (H - 6 - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Umsatz je Monat ${year} im Vergleich zu ${year - 1}`}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - 4} y1={y(max * f)} y2={y(max * f)} className="stroke-slate-200 dark:stroke-slate-700" strokeDasharray="3 4" />
          <text x={L - 6} y={y(max * f) + 3} textAnchor="end" className="fill-slate-500" fontSize="10">{eurShort(max * f)}</text>
        </g>
      ))}
      {cur.map((v, i) => {
        const x = L + i * slot + 4;
        return (
          <g key={i}>
            <title>{`${MONTHS[i]}: ${year} ${eurShort(v)}, ${year - 1} ${eurShort(prev[i])}`}</title>
            <rect x={x} y={y(prev[i])} width={bw} height={Math.max(0, H - B - y(prev[i]))} rx={2} className="fill-brand/35" />
            <rect x={x + bw + 1} y={y(v)} width={bw} height={Math.max(0, H - B - y(v))} rx={2} className="fill-brand" />
            <text x={x + bw} y={H - 6} textAnchor="middle" className="fill-slate-500" fontSize="10">{MONTHS[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Zeilen mit Balken (Anteil am größten Wert). */
function BarList({ rows }: { rows: { label: string; value: number; text: string; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-slate-500">Noch keine Daten in diesem Jahr.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.label + i}>
          <div className="flex justify-between gap-3 text-sm"><span className="truncate"><span className="text-slate-400 mr-1.5">{i + 1}.</span>{r.label}</span><span className="shrink-0 font-medium">{r.text}</span></div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-1"><div className="h-full bg-brand" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></div>
          {r.sub && <p className="text-xs text-slate-500 mt-0.5">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

export default function Statistics() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [d, setD] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setD(null);
    api.get("/stats/overview", { params: { year } }).then((r) => setD(r.data)).catch((e) => setError(e?.response?.data?.error ?? "Statistik konnte nicht geladen werden."));
  }, [year]);

  const t = d?.totals;
  const dRev = t ? delta(t.revenueCents, t.revenuePrevCents) : null;
  const result = t ? t.revenueCents - t.expenseCents : 0;
  const resultPrev = t ? t.revenuePrevCents - t.expensePrevCents : 0;
  const dRes = t && resultPrev > 0 ? delta(result, resultPrev) : null;

  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Statistiken<HelpTip topic="stats" className="ml-2" /></h1>
          <p className="text-sm text-slate-500 mt-1">Umsatz, Bestseller, Kunden, Drucker und Materialverbrauch</p>
        </div>
        <label className="text-sm text-slate-500 flex items-center gap-2">Jahr
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
            {[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="text-red-600 mb-3">{error}</p>}
      {!d || !t ? <p className="text-slate-500">Wird geladen ...</p> : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
            <Kpi icon="money" tone="violet" label={`Umsatz ${year} (bezahlt, netto)`} value={eur(t.revenueCents)} sub={dRev === null ? `Vorjahr ${eur(t.revenuePrevCents)}` : `${dRev >= 0 ? "+" : ""}${dRev} % zum Vorjahr`} subTone={dRev === null ? "muted" : dRev >= 0 ? "good" : "bad"} />
            <Kpi icon="receipt" tone="amber" label="Ausgaben" value={eur(t.expenseCents)} sub={`Vorjahr ${eur(t.expensePrevCents)}`} />
            <Kpi icon="scale" tone="green" label="Ergebnis vor Steuern" value={eur(result)} sub={dRes === null ? `Vorjahr ${eur(resultPrev)}` : `${dRes >= 0 ? "+" : ""}${dRes} % zum Vorjahr`} subTone={dRes === null ? "muted" : dRes >= 0 ? "good" : "bad"} />
            <Kpi icon="document" tone="brand" label="Bezahlte Rechnungen" value={t.invoiceCount} sub={t.openCount > 0 ? `Noch offen: ${eur(t.openCents)} (${t.openCount})` : `${t.newCustomers} neue Kunden`} />
          </div>

          <Panel className="mb-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="text-base font-semibold tracking-tight">Umsatz je Monat</h2>
              <span className="flex items-center gap-4 text-xs text-slate-500"><span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand" />{year}</span><span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand/35" />{year - 1}</span></span>
            </div>
            <CompareChart cur={d.months.revenue} prev={d.months.revenuePrev} year={year} />
            <p className="text-xs text-slate-500 mt-1">Netto-Umsatz aus bezahlten Rechnungen nach Zahlungsdatum (wie in der EÜR). Offene Rechnungen, Entwürfe, Aufträge und Korrekturbelege zählen nicht mit; was noch offen ist, steht oben bei den Rechnungen.</p>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <Panel title="Bestseller">
              <BarList rows={d.bestsellers.map((b) => ({ label: b.name, value: b.quantity, text: `${nf(b.quantity)} Stk.`, sub: `${eur(b.revenueCents)} netto` }))} />
              <p className="text-xs text-slate-500 mt-3">Nach verkaufter Menge laut Rechnungspositionen; gleiche Namen (erste Zeile) werden zusammengefasst.</p>
            </Panel>
            <Panel title="Beste Kunden">
              <BarList rows={d.customers.map((c) => ({ label: c.name, value: c.revenueCents, text: eur(c.revenueCents), sub: `${c.invoices} Rechnung${c.invoices === 1 ? "" : "en"}` }))} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Panel title="Drucker">
              {d.printers.length === 0 ? <p className="text-sm text-slate-500">Noch keine erkannten Drucke in diesem Jahr (nur Drucker mit Live-Verbindung).</p> : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1">Drucker</th><th className="pb-1 text-right">Stunden</th><th className="pb-1 text-right">Drucke</th><th className="pb-1 text-right">Fehldrucke</th></tr></thead>
                  <tbody>{d.printers.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="py-1.5 pr-2 truncate max-w-[10rem]">{p.name}</td>
                      <td className="text-right whitespace-nowrap">{nf(p.hoursGood + p.hoursWasted)} h</td>
                      <td className="text-right">{p.jobs}</td>
                      <td className={`text-right whitespace-nowrap ${(p.percentByCount ?? 0) > 15 ? "text-red-500" : ""}`}>{p.failed + p.cancelled}{p.percentByCount !== null ? ` (${nf(p.percentByCount)} %)` : ""}</td>
                    </tr>))}</tbody>
                </table></div>
              )}
              <p className="text-xs text-slate-500 mt-2">Fehldrucke = fehlgeschlagen oder abgebrochen. Stunden: Dauer der erkannten Druckaufträge.</p>
            </Panel>
            <Panel title="Materialverbrauch">
              <BarList rows={d.materials.map((m) => ({ label: m.name, value: m.grams, text: m.grams >= 1000 ? `${nf(m.grams / 1000)} kg` : `${m.grams} g`, sub: m.cents > 0 ? `Kosten ${eur(m.cents)}` : undefined }))} />
              <p className="text-xs text-slate-500 mt-3">Aus den Druckaufträgen (AMS-Messung oder Slicer-Werte); erfasst nur, was über die Drucker-Anbindung gebucht wurde.</p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
