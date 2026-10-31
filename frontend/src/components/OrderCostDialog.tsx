import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ratesFromCompany, sollParts, type CostProduct, type CostRates, type PrinterCosts } from "../lib/cost";

/**
 * Auftragskosten: Was haben die dem Auftrag zugeordneten Drucke wirklich gekostet (Material zum Einkaufspreis, Maschine je Betriebsstunde),
 * im Vergleich zur Kalkulation der Produkte in den Positionen. Arbeit, Verpackung und Gemeinkosten sind nicht messbar und stehen nicht darin.
 */

interface Usage { name: string; grams: number; cents: number; estimated: boolean }
interface Job {
  id: string;
  name: string | null;
  printerName: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
  result: string | null;
  usage: Usage[];
  materialCents: number;
  machine: { total: number };
}
interface Costs {
  order: { number: string; customerName: string; netCents: number; items: { description: string; quantity: number; unitPriceCents: number }[] };
  jobs: Job[];
  totals: { jobCount: number; minutes: number; grams: number; materialCents: number; machine: { electricity: number; depreciation: number; wear: number; total: number } };
}
interface Product extends CostProduct {
  id: string;
  name: string;
  printerId?: string | null;
}
type Printer = PrinterCosts & { id: string };

const euro = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const hours = (min: number) => `${(min / 60).toFixed(1).replace(".", ",")} h`;
const resultLabel: Record<string, string> = { FINISHED: "fertig", FAILED: "fehlgeschlagen", CANCELLED: "abgebrochen", UNKNOWN: "unklar" };
const key = (s: string) => s.split("\n")[0].trim().toLowerCase();

function Diff({ soll, ist }: { soll: number | null; ist: number }) {
  if (soll === null || soll <= 0) return <span className="text-slate-400">-</span>;
  const pct = Math.round(((ist - soll) / soll) * 100);
  return <span className={pct > 10 ? "text-red-600" : pct < -10 ? "text-green-600" : "text-slate-500"}>{pct > 0 ? "+" : ""}{pct} %</span>;
}

export function OrderCostDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [data, setData] = useState<Costs | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [rates, setRates] = useState<CostRates | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/production/${orderId}/costs`).then((r) => setData(r.data)).catch((e) => setError(e?.response?.data?.error ?? "Kosten konnten nicht geladen werden."));
    api.get("/products").then((r) => setProducts(r.data)).catch(() => undefined);
    api.get("/printers").then((r) => setPrinters(r.data)).catch(() => undefined);
    api.get("/companies/me").then((r) => setRates(ratesFromCompany(r.data))).catch(() => undefined);
  }, [orderId]);

  // Soll aus der Kalkulation für alle Positionen, die einem Produkt aus dem Katalog entsprechen
  const acc = { material: 0, machine: 0, minutes: 0 };
  let matched = 0;
  const unmatched: string[] = [];
  if (data && rates) {
    const byName = new Map(products.map((p) => [key(p.name), p]));
    for (const it of data.order.items) {
      const p = byName.get(key(it.description));
      if (!p) {
        unmatched.push(it.description.split("\n")[0]);
        continue;
      }
      const s = sollParts(p, printers.find((x) => x.id === p.printerId), rates, it.quantity);
      acc.material += s.material;
      acc.machine += s.machine;
      acc.minutes += s.minutes;
      matched += 1;
    }
  }
  const soll = matched > 0 ? acc : null;

  const t = data?.totals;
  const istCost = t ? t.materialCents + t.machine.total : 0;
  const net = data?.order.netCents ?? 0;
  const row = "grid grid-cols-[1fr_5.5rem_5.5rem_3.5rem] gap-2 py-1.5 items-baseline";

  return (
    <div className="fixed inset-0 z-[55] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-label="Auftragskosten">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold flex-1">Kosten {data ? `· ${data.order.number}` : ""}</h2>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800" aria-label="Schließen">✕</button>
        </div>
        <div className="p-4 overflow-y-auto space-y-4 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          {!data && !error && <p className="text-slate-500">Wird geladen ...</p>}
          {data && t && (
            <>
              {t.jobCount === 0 ? (
                <p className="rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 p-3">Diesem Auftrag ist noch kein Druck zugeordnet. Beim Senden eines Drucks unter "Für Auftrag" wählen oder in der Druckerkarte im Druckverlauf einen Auftrag zuordnen.</p>
              ) : (
                <>
                  <div>
                    <div className={`${row} text-xs text-slate-500 border-b border-slate-200 dark:border-slate-700`}>
                      <span>{data.order.customerName}</span>
                      <span className="text-right">Soll</span>
                      <span className="text-right">Ist</span>
                      <span className="text-right">Abw.</span>
                    </div>
                    <div className={row}><span>Druckzeit</span><span className="text-right text-slate-500">{soll ? hours(soll.minutes) : "-"}</span><span className="text-right">{hours(t.minutes)}</span><span className="text-right"><Diff soll={soll?.minutes ?? null} ist={t.minutes} /></span></div>
                    <div className={row}><span>Material{t.grams > 0 ? ` (${Math.round(t.grams)} g)` : ""}</span><span className="text-right text-slate-500">{soll ? euro(soll.material) : "-"}</span><span className="text-right">{euro(t.materialCents)}</span><span className="text-right"><Diff soll={soll?.material ?? null} ist={t.materialCents} /></span></div>
                    <div className={row}><span title="Strom, Abschreibung und Verschleiß des Druckers">Maschine</span><span className="text-right text-slate-500">{soll ? euro(soll.machine) : "-"}</span><span className="text-right">{euro(t.machine.total)}</span><span className="text-right"><Diff soll={soll?.machine ?? null} ist={t.machine.total} /></span></div>
                    <div className={`${row} border-t border-slate-200 dark:border-slate-700 font-medium`}><span>Messbare Kosten</span><span className="text-right text-slate-500">{soll ? euro(soll.material + soll.machine) : "-"}</span><span className="text-right">{euro(istCost)}</span><span className="text-right font-normal"><Diff soll={soll ? soll.material + soll.machine : null} ist={istCost} /></span></div>
                  </div>

                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 space-y-1">
                    <div className="flex justify-between"><span>Auftragswert (netto)</span><span>{euro(net)}</span></div>
                    <div className="flex justify-between"><span>abzüglich Material und Maschine</span><span>- {euro(istCost)}</span></div>
                    <div className="flex justify-between font-medium border-t border-slate-200 dark:border-slate-700 pt-1"><span>Bleibt vor Arbeit, Verpackung, Gemeinkosten</span><span className={net - istCost < 0 ? "text-red-600" : ""}>{euro(net - istCost)}</span></div>
                  </div>

                  {unmatched.length > 0 && <p className="text-xs text-slate-500">Für {unmatched.map((u) => `"${u}"`).join(", ")} gibt es kein Produkt mit gleichem Namen im Katalog - der Soll-Wert enthält diese Position nicht.</p>}
                  {!soll && <p className="text-xs text-slate-500">Keine Position entspricht einem Produkt im Katalog, deshalb gibt es keinen Soll-Wert zum Vergleichen.</p>}

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Zugeordnete Drucke</h3>
                    <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-xs">
                      {data.jobs.map((j) => (
                        <li key={j.id} className="py-1.5 flex flex-wrap justify-between gap-x-3">
                          <span className="truncate">{j.name ?? "Druckauftrag"} <span className="text-slate-500">· {j.printerName}</span></span>
                          <span className="text-slate-500">{j.endedAt ? `${hours(j.minutes ?? 0)} · ${resultLabel[j.result ?? "UNKNOWN"] ?? j.result}` : "läuft"} · {euro(j.materialCents + j.machine.total)}</span>
                          {j.usage.length > 0 && <span className="w-full text-slate-500">{j.usage.map((u) => `${u.name} ${Math.round(u.grams)} g${u.estimated ? " (geschätzt)" : ""}`).join(", ")}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
              <p className="text-xs text-slate-500">Material zum Einkaufspreis bei der Abbuchung, Maschine je Betriebsstunde des Druckers (Strom, Abschreibung, Verschleiß). Fehldrucke zählen mit, weil sie echtes Geld kosten. Im Soll steckt der Ausschuss-Zuschlag aus der Kalkulation; Ist-Werte stammen aus dem Slicer bzw. der AMS-Messung und lassen den Spülanteil beim Farbwechsel aus.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
