import { DragEvent, useCallback, useEffect, useState } from "react";
import { Avatar, type AvatarInfo } from "../components/Avatar";
import { AssigneeSelect } from "../components/AssigneeSelect";
import { useAuthStore } from "../store/authStore";
import { useDirectory } from "../hooks/useDirectory";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Icon } from "../components/Icon";
import { InfoBox } from "../components/InfoBox";
import { StatusChip } from "../components/StatusChip";
import { useToast } from "../components/Toast";
import { EtsyImport } from "../components/EtsyImport";
import { OrderCostDialog } from "../components/OrderCostDialog";
import { ShippedDialog } from "../components/ShippedDialog";

import { HelpTip } from "../components/HelpTip";
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
  carrier: string | null;
  trackingNumber: string | null;
  shippedMailAt: string | null;
  itemCount: number;
  itemSummary: string[];
  printMinutes: number;
  priority?: number;
  assignee?: { id: string; name: string; avatar: AvatarInfo | null } | null;
  prints: { count: number; minutes: number; grams: number; materialCents: number } | null;
}

const COLUMNS: { key: ProductionStatus; label: string; dot: string; hint: string }[] = [
  { key: "CREATED", label: "Erstellt", dot: "bg-slate-400", hint: "Angenommen, noch nicht gedruckt" },
  { key: "IN_PRODUCTION", label: "In Produktion", dot: "bg-amber-500", hint: "Wird gerade gedruckt oder nachbearbeitet" },
  { key: "READY_TO_SHIP", label: "Versandbereit", dot: "bg-blue-500", hint: "Fertig verpackt, wartet auf Versand" },
  { key: "SHIPPED", label: "Versendet", dot: "bg-green-500", hint: "Unterwegs zum Kunden" },
];

const CARRIER_NAMES: Record<string, string> = { DHL: "DHL", DPD: "DPD", GLS: "GLS", HERMES: "Hermes", DEUTSCHE_POST: "Deutsche Post", ABHOLUNG: "Abholung", SONSTIGE: "Versand" };
const carrierName = (key: string | null) => (key ? CARRIER_NAMES[key] ?? key : "");
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
  const [costOrderId, setCostOrderId] = useState<string | null>(null);
  const [shipDialog, setShipDialog] = useState<{ order: Order; markShipped: boolean } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // Filter nach Zuständigem: alle, meine, nicht zugeordnet oder eine bestimmte Person
  const me = useAuthStore((s) => s.user);
  const [who, setWho] = useState<string>("all");
  const staff = useDirectory();
  const [overColumn, setOverColumn] = useState<ProductionStatus | null>(null);
  const [tab, setTab] = useState<ProductionStatus>("CREATED"); // Handy: sichtbarer Status
  const [showAllInShipped, setShowAllInShipped] = useState(false);
  const matchesWho = (o: Order) => who === "all" || (who === "none" ? !o.assignee : o.assignee?.id === (who === "mine" ? me?.id : who));

  const load = useCallback(() => {
    api
      .get("/production", { params: { includeShipped: showAllShipped ? 1 : 0 } })
      .then((r) => setOrders(r.data.items))
      .finally(() => setLoading(false));
  }, [showAllShipped]);
  useEffect(load, [load]);

  async function move(order: Order, status: ProductionStatus) {
    if (order.productionStatus === status) return;
    // Beim Versenden zuerst Versanddienst/Sendungsnummer abfragen und optional den Versandbescheid senden
    if (status === "SHIPPED") {
      setShipDialog({ order, markShipped: true });
      return;
    }
    const before = orders;
    setOrders((cur) => cur.map((o) => (o.id === order.id ? { ...o, productionStatus: status, shippedAt: null } : o)));
    try {
      await api.patch(`/production/${order.id}`, { productionStatus: status });
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
          <h1 className="text-2xl font-semibold tracking-tight">Produktion<HelpTip topic="production" className="ml-2" /></h1>
          <p className="text-sm text-slate-500">Neue Anfrage? Erst ein Angebot - den Auftrag macht man daraus mit einem Klick.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-500">
            <input type="checkbox" checked={showAllShipped} onChange={(e) => setShowAllShipped(e.target.checked)} />
            auch ältere versendete
          </label>
          <button type="button" onClick={() => setShowImport((v) => !v)} className="px-4 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">{showImport ? "Import schließen" : "Etsy-Import"}</button>
          <Link to="/order-confirmations/new" title="Nur wenn der Kunde schon fest bestellt hat und kein Angebot nötig ist" className="px-4 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">Auftrag ohne Angebot</Link>
          <Link to="/quotes/new" title="Der übliche Start: Angebot erstellen, nach der Zusage daraus den Auftrag machen" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm font-medium">+ Neues Angebot</Link>
        </div>
      </div>

      {staff.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs" role="group" aria-label="Nach Zuständigem filtern">
          {([["all", "Alle"], ["mine", "Meine"], ["none", "Nicht zugeordnet"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setWho(k)} aria-pressed={who === k} className={`px-3 py-1 rounded-full border ${who === k ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900" : "border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"}`}>{l}</button>
          ))}
          {staff.filter((s) => s.id !== me?.id).map((s) => (
            <button key={s.id} type="button" onClick={() => setWho(s.id)} aria-pressed={who === s.id} title={s.name} className={`flex items-center gap-1.5 pl-1 pr-3 py-0.5 rounded-full border ${who === s.id ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900" : "border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"}`}>
              <Avatar id={s.id} name={s.name} avatar={s.avatar} size="xs" />{s.name.split(" ")[0]}
            </button>
          ))}
        </div>
      )}

      {costOrderId && <OrderCostDialog orderId={costOrderId} onClose={() => setCostOrderId(null)} />}
      {shipDialog && (
        <ShippedDialog
          orderId={shipDialog.order.id}
          number={shipDialog.order.number}
          customerName={shipDialog.order.customerName}
          markShipped={shipDialog.markShipped}
          initialCarrier={shipDialog.order.carrier}
          initialTracking={shipDialog.order.trackingNumber}
          onClose={() => { setShipDialog(null); load(); }}
          onDone={({ mailSentTo }) => {
            const n = shipDialog.order.number;
            setShipDialog(null);
            load();
            showToast(mailSentTo ? `${n} als versendet markiert, Versandmail an ${mailSentTo} gesendet` : `${n} als versendet markiert`, "success");
          }}
        />
      )}

      {showImport && <EtsyImport onImported={() => { setShowImport(false); load(); }} />}

      {loading ? (
        <p className="text-sm text-slate-500">Wird geladen ...</p>
      ) : (
        <>
        {/* Handy/Tablet: ein Status nach dem anderen über Reiter (kein seitliches Wischen und Suchen); ab Laptopbreite alle vier Spalten nebeneinander */}
        <div className="lg:hidden grid grid-cols-4 gap-1 mb-3" role="tablist" aria-label="Produktionsstatus">
          {COLUMNS.map((col) => {
            const n = orders.filter((o) => o.productionStatus === col.key && matchesWho(o)).length;
            return (
              <button key={col.key} type="button" role="tab" aria-selected={tab === col.key} onClick={() => setTab(col.key)} className={`rounded-lg px-1 py-2 text-xs font-medium border ${tab === col.key ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900" : "border-slate-300 dark:border-slate-600"}`}>
                <span className="block truncate">{col.label}</span>
                <span className="block text-base leading-tight">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="grid gap-3 lg:grid-cols-4 items-start">
          {COLUMNS.map((col, colIndex) => {
            const all = orders.filter((o) => o.productionStatus === col.key && matchesWho(o));
            // Die Spalte "Versendet" wächst am schnellsten - nur die letzten Aufträge zeigen, der Rest per Klick
            const cap = col.key === "SHIPPED" && !showAllInShipped ? 5 : all.length;
            const items = all.slice(0, cap);
            const minutes = all.reduce((s, o) => s + o.printMinutes, 0);
            return (
              <section
                key={col.key}
                onDragOver={(e) => { e.preventDefault(); setOverColumn(col.key); }}
                onDragLeave={() => setOverColumn((c) => (c === col.key ? null : c))}
                onDrop={(e) => onDrop(e, col.key)}
                className={`${col.key === tab ? "" : "hidden"} lg:block rounded-xl p-2 transition-colors ${overColumn === col.key ? "bg-brand/10 ring-2 ring-brand/40" : "bg-slate-100/70 dark:bg-slate-900/50"}`}
                aria-label={col.label}
              >
                <header className="flex items-center justify-between px-2 py-2" title={col.hint}>
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    {col.label}
                  </span>
                  <span className="text-xs text-slate-500">{items.length}{minutes > 0 ? ` · ${hours(minutes)}` : ""}</span>
                </header>
                <div className="space-y-2 min-h-[4rem] lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto lg:pr-1">
                  {items.map((o) => {
                    const overdue = o.expectedDeliveryDate && col.key !== "SHIPPED" && new Date(o.expectedDeliveryDate) < today;
                    const closeMenu = (e: { currentTarget: HTMLElement }) => e.currentTarget.closest("details")?.removeAttribute("open");
                    const firstItem = o.itemSummary[0] ?? "";
                    const more = o.itemCount > 1 ? ` +${o.itemCount - 1}` : "";
                    return (
                      <article
                        key={o.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; setDragId(o.id); }}
                        onDragEnd={() => { setDragId(null); setOverColumn(null); }}
                        className={`bg-white dark:bg-slate-800 rounded-lg shadow px-3 py-2 text-sm cursor-grab active:cursor-grabbing ${dragId === o.id ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="min-w-0 font-medium truncate"><Link to={`/orders/${o.id}`} className="hover:text-brand">{o.number}</Link>{(o.priority ?? 0) > 0 && <span className={`ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${o.priority === 2 ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-600"}`}>{o.priority === 2 ? "dringend" : "hoch"}</span>}</div>
                          <span className="font-medium shrink-0 text-xs">{money(o.totalCents)}</span>
                        </div>
                        <div className="text-xs text-slate-500 truncate" title={o.itemSummary.join(", ")}>{o.customerName}{firstItem ? ` · ${firstItem}${more}` : ""}</div>
                        {o.notes && <p className="mt-1 text-xs rounded bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 px-2 py-0.5 truncate" title={o.notes}>{o.notes}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {o.printMinutes > 0 && <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" title="Geschätzte Druckzeit"><Icon name="clock" className="w-3 h-3" />{hours(o.printMinutes)}</span>}
                          {o.prints && <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" title="Zugeordnete Drucke: Anzahl, Druckzeit, Filament">{o.prints.count} {o.prints.count === 1 ? "Druck" : "Drucke"} · {hours(o.prints.minutes)}{o.prints.grams > 0 ? ` · ${o.prints.grams} g` : ""}</span>}
                          {o.expectedDeliveryDate && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${overdue ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`} title="Gewünschtes Lieferdatum">
                              bis {date(o.expectedDeliveryDate)}
                            </span>
                          )}
                          {o.documentStatus === "DRAFT" && <StatusChip status="DRAFT" />}
                          {o.shippedAt && col.key === "SHIPPED" && <span className="text-xs text-slate-500">versendet {date(o.shippedAt)}</span>}
                          {col.key === "SHIPPED" && (o.carrier || o.trackingNumber) && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 max-w-full break-all" title="Versanddienst und Sendungsnummer">{[carrierName(o.carrier), o.trackingNumber].filter(Boolean).join(" ")}</span>}
                          {col.key === "SHIPPED" && (o.shippedMailAt
                            ? <span className="text-xs text-green-700 dark:text-green-400" title="Versandbescheid per E-Mail gesendet">✉ {date(o.shippedMailAt)}</span>
                            : <button type="button" onClick={() => setShipDialog({ order: o, markShipped: false })} className="text-xs text-brand hover:underline">Versandmail senden</button>)}
                          {/* Eine Zeile für alles Wichtige: Zuständig, Spalte zurück/weiter, Mehr-Menü */}
                          <div className="ml-auto flex items-center gap-1">
                            <AssigneeSelect compact value={o.assignee?.id ?? null} current={o.assignee} onChange={async (uid) => { try { await api.patch(`/orders/${o.id}`, { assigneeId: uid }); load(); } catch (err: any) { showToast(err?.response?.data?.error ?? "Zuständigkeit konnte nicht geändert werden", "error"); } }} />
                            <button type="button" disabled={colIndex === 0} onClick={() => move(o, COLUMNS[colIndex - 1].key)} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 disabled:opacity-30" aria-label="Eine Spalte zurück">←</button>
                            <button type="button" disabled={colIndex === COLUMNS.length - 1} onClick={() => move(o, COLUMNS[colIndex + 1].key)} className="w-8 h-8 rounded-lg bg-brand text-white disabled:opacity-30" aria-label="Eine Spalte weiter">→</button>
                            <details className="relative">
                              <summary className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center cursor-pointer list-none select-none" aria-label="Mehr" title="Details, Kosten, Notiz, Beleg">⋯</summary>
                              <div className="absolute right-0 bottom-9 z-20 w-36 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-1 text-sm">
                                <Link to={`/orders/${o.id}`} className="block px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700">Details</Link>
                                <button type="button" onClick={(e) => { closeMenu(e); setCostOrderId(o.id); }} className="block w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700">Kosten</button>
                                <button type="button" onClick={(e) => { closeMenu(e); editNote(o); }} className="block w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700">Notiz</button>
                                <Link to={o.documentStatus === "DRAFT" ? `/order-confirmations/${o.id}/edit` : "/documents?type=ORDER_CONFIRMATION"} className="block px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700">Beleg</Link>
                              </div>
                            </details>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {col.key === "SHIPPED" && all.length > 5 && (
                    <button type="button" onClick={() => setShowAllInShipped((v) => !v)} className="w-full text-xs text-brand hover:underline py-1">{showAllInShipped ? "Weniger anzeigen" : `Alle ${all.length} anzeigen`}</button>
                  )}
                  {items.length === 0 && <p className="text-xs text-slate-400 text-center py-4">{col.hint}</p>}
                </div>
              </section>
            );
          })}
        </div>
        </>
      )}

      <div className="mt-4">
        <InfoBox title="So funktioniert das Produktionsboard">
          <p>Jede <strong>Auftragsbestätigung</strong> erscheint hier automatisch als Karte (am besten aus einem Angebot heraus, oder über „Auftrag ohne Angebot“). Ziehen Sie eine Karte in die nächste Spalte oder nutzen Sie die Pfeile <strong>← →</strong> - das geht auch am Handy. Unter <strong>⋯</strong> findest du Details, Kosten, Notiz und den Beleg.</p>
          <p><strong>Erstellt</strong> = angenommen, <strong>In Produktion</strong> = wird gedruckt/nachbearbeitet, <strong>Versandbereit</strong> = verpackt, <strong>Versendet</strong> = unterwegs. Versendete Aufträge verschwinden nach 14 Tagen vom Board (über "auch ältere versendete" sehen Sie alle); in der Spalte werden zuerst die letzten 5 gezeigt.</p>
          <p>Die <strong>Druckzeit</strong> auf der Karte ist eine Schätzung: Sie wird berechnet, wenn der Positionstext genau dem Namen eines Produkts mit hinterlegter Druckzeit entspricht (Katalog → Produkte). Der Produktionsstatus hat nichts mit dem Belegstatus zu tun - er ändert weder Rechnung noch Materialbestand.</p>
          <p><strong>Drucke und Kosten:</strong> Wählst du beim Senden eines Drucks (Druckerkarte → Druck senden) einen Auftrag, oder ordnest du einen Druck im Druckverlauf zu, erscheint er als grünes Zeichen auf der Karte. Über <strong>Kosten</strong> siehst du, was Material und Maschine tatsächlich gekostet haben, verglichen mit der Kalkulation.</p>
        </InfoBox>
      </div>
    </div>
  );
}
