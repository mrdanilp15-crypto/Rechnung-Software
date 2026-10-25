import { DragEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Icon } from "../components/Icon";
import { InfoBox } from "../components/InfoBox";
import { StatusChip } from "../components/StatusChip";
import { useToast } from "../components/Toast";
import { EtsyImport } from "../components/EtsyImport";

type ProductionStatus = "CREATED" | "IN_PRODUCTION" | "READY_TO_SHIP" | "SHIPPED";
interface Order {
  id: string;
  number: string;
  customerName: string;
  documentStatus: string;
  productionStatus: ProductionStatus;
  expectedDeliveryDate: string | null;
  totalCents: number;
  notes: string | null;
  shippedAt: string | null;
  itemCount: number;
  itemSummary: string[];
  printMinutes: number;
}

const COLUMNS: { key: ProductionStatus; label: string; dot: string; hint: string }[] = [
  { key: "CREATED", label: "Erstellt", dot: "bg-slate-400", hint: "Angenommen, noch nicht gedruckt" },
  { key: "IN_PRODUCTION", label: "In Produktion", dot: "bg-amber-500", hint: "Wird gerade gedruckt oder nachbearbeitet" },
  { key: "READY_TO_SHIP", label: "Versandbereit", dot: "bg-blue-500", hint: "Fertig verpackt, wartet auf Versand" },
  { key: "SHIPPED", label: "Versendet", dot: "bg-green-500", hint: "Unterwegs zum Kunden" },
];

const money = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const date = (iso: string) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(new Date(iso));
const hours = (min: number) => `${(min / 60).toFixed(1).replace(".", ",")} h`;

/** Produktionsboard: Aufträge per Ziehen oder Pfeil-Knopf durch Erstellt, In Produktion, Versandbereit und Versendet bewegen. */
export default function Production() {
  const showToast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllShipped, setShowAllShipped] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<ProductionStatus | null>(null);

  const load = useCallback(() => {
    api
      .get("/production", { params: { includeShipped: showAllShipped ? 1 : 0 } })
      .then((r) => setOrders(r.data.items))
      .finally(() => setLoading(false));
  }, [showAllShipped]);
  useEffect(load, [load]);

  async function move(order: Order, status: ProductionStatus) {
    if (order.productionStatus === status) return;
    const before = orders;
    setOrders((cur) => cur.map((o) => (o.id === order.id ? { ...o, productionStatus: status, shippedAt: status === "SHIPPED" ? new Date().toISOString() : null } : o)));
    try {
      await api.patch(`/production/${order.id}`, { productionStatus: status });
      if (status === "SHIPPED") showToast(`${order.number} als versendet markiert`, "success");
    } catch (err: any) {
      setOrders(before);
      showToast(err.response?.data?.error || "Status konnte nicht geändert werden", "error");
    }
  }

  async function editNote(order: Order) {
    const text = window.prompt(`Notiz zu ${order.number} (z.B. Farbe, Sonderwunsch, Sendungsnummer):`, order.notes ?? "");
    if (text === null) return;
    try {
      await api.patch(`/production/${order.id}`, { productionNote: text });
      setOrders((cur) => cur.map((o) => (o.id === order.id ? { ...o, notes: text.trim() || null } : o)));
    } catch (err: any) {
      showToast(err.response?.data?.error || "Notiz konnte nicht gespeichert werden", "error");
    }
  }

  function onDrop(e: DragEvent, status: ProductionStatus) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    const order = orders.find((o) => o.id === id);
    setDragId(null);
    setOverColumn(null);
    if (order) move(order, status);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produktion</h1>
          <p className="text-sm text-slate-500">Aufträge von der Annahme bis zum Versand</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-500">
            <input type="checkbox" checked={showAllShipped} onChange={(e) => setShowAllShipped(e.target.checked)} />
            auch ältere versendete
          </label>
          <button type="button" onClick={() => setShowImport((v) => !v)} className="px-4 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">{showImport ? "Import schließen" : "Etsy-Import"}</button>
          <Link to="/order-confirmations/new" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm font-medium">+ Neuer Auftrag</Link>
        </div>
      </div>

      {showImport && <EtsyImport onImported={() => { setShowImport(false); load(); }} />}

      <InfoBox title="So funktioniert das Produktionsboard">
        <p>Jede <strong>Auftragsbestätigung</strong> erscheint hier automatisch als Karte (Belege → Neuer Beleg → Auftragsbestätigung, oder aus einem Angebot heraus). Ziehen Sie eine Karte in die nächste Spalte oder nutzen Sie die Pfeile <strong>← →</strong> - das geht auch am Handy.</p>
        <p><strong>Erstellt</strong> = angenommen, <strong>In Produktion</strong> = wird gedruckt/nachbearbeitet, <strong>Versandbereit</strong> = verpackt, <strong>Versendet</strong> = unterwegs. Versendete Aufträge verschwinden nach 14 Tagen vom Board (über "auch ältere versendete" sehen Sie alle).</p>
        <p>Die <strong>Druckzeit</strong> auf der Karte ist eine Schätzung: Sie wird berechnet, wenn der Positionstext genau dem Namen eines Produkts mit hinterlegter Druckzeit entspricht (Katalog → Produkte). Der Produktionsstatus hat nichts mit dem Belegstatus zu tun - er ändert weder Rechnung noch Materialbestand.</p>
      </InfoBox>

      {loading ? (
        <p className="text-sm text-slate-500">Wird geladen ...</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 snap-x lg:grid lg:grid-cols-4 lg:overflow-visible">
          {COLUMNS.map((col, colIndex) => {
            const items = orders.filter((o) => o.productionStatus === col.key);
            const minutes = items.reduce((s, o) => s + o.printMinutes, 0);
            return (
              <section
                key={col.key}
                onDragOver={(e) => { e.preventDefault(); setOverColumn(col.key); }}
                onDragLeave={() => setOverColumn((c) => (c === col.key ? null : c))}
                onDrop={(e) => onDrop(e, col.key)}
                className={`snap-start shrink-0 w-[85%] sm:w-72 lg:w-auto rounded-xl p-2 transition-colors ${overColumn === col.key ? "bg-brand/10 ring-2 ring-brand/40" : "bg-slate-100/70 dark:bg-slate-900/50"}`}
                aria-label={col.label}
              >
                <header className="flex items-center justify-between px-2 py-2" title={col.hint}>
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    {col.label}
                  </span>
                  <span className="text-xs text-slate-500">{items.length}{minutes > 0 ? ` · ${hours(minutes)}` : ""}</span>
                </header>
                <div className="space-y-2 min-h-[4rem]">
                  {items.map((o) => {
                    const overdue = o.expectedDeliveryDate && col.key !== "SHIPPED" && new Date(o.expectedDeliveryDate) < today;
                    return (
                      <article
                        key={o.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; setDragId(o.id); }}
                        onDragEnd={() => { setDragId(null); setOverColumn(null); }}
                        className={`bg-white dark:bg-slate-800 rounded-lg shadow p-3 text-sm cursor-grab active:cursor-grabbing ${dragId === o.id ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{o.number}</div>
                            <div className="text-xs text-slate-500 truncate">{o.customerName}</div>
                          </div>
                          <span className="font-medium shrink-0">{money(o.totalCents)}</span>
                        </div>
                        <ul className="mt-2 text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                          {o.itemSummary.map((line, i) => <li key={i} className="truncate">{line}</li>)}
                          {o.itemCount > o.itemSummary.length && <li className="text-slate-400">+ {o.itemCount - o.itemSummary.length} weitere</li>}
                        </ul>
                        {o.notes && <p className="mt-2 text-xs rounded bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 px-2 py-1">{o.notes}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {o.printMinutes > 0 && <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" title="Geschätzte Druckzeit"><Icon name="clock" className="w-3 h-3" />{hours(o.printMinutes)}</span>}
                          {o.expectedDeliveryDate && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${overdue ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`} title="Gewünschtes Lieferdatum">
                              bis {date(o.expectedDeliveryDate)}
                            </span>
                          )}
                          {o.documentStatus === "DRAFT" && <StatusChip status="DRAFT" />}
                          {o.shippedAt && col.key === "SHIPPED" && <span className="text-xs text-slate-500">versendet {date(o.shippedAt)}</span>}
                        </div>
                        <div className="mt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-2">
                          <div className="flex gap-1">
                            <button type="button" disabled={colIndex === 0} onClick={() => move(o, COLUMNS[colIndex - 1].key)} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 disabled:opacity-30" aria-label="Eine Spalte zurück">←</button>
                            <button type="button" disabled={colIndex === COLUMNS.length - 1} onClick={() => move(o, COLUMNS[colIndex + 1].key)} className="w-8 h-8 rounded-lg bg-brand text-white disabled:opacity-30" aria-label="Eine Spalte weiter">→</button>
                          </div>
                          <div className="flex gap-3 text-xs">
                            <button type="button" onClick={() => editNote(o)} className="text-brand hover:underline">Notiz</button>
                            <Link to={o.documentStatus === "DRAFT" ? `/order-confirmations/${o.id}/edit` : "/documents?type=ORDER_CONFIRMATION"} className="text-brand hover:underline">Beleg</Link>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {items.length === 0 && <p className="text-xs text-slate-400 text-center py-4">{col.hint}</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
