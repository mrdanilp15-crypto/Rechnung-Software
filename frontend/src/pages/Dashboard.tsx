import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { StatusIcon, statusInfo } from "../components/StatusChip";
import { Icon } from "../components/Icon";
import { type LiveStatus } from "../components/PrinterLive";
import { TodoPanel } from "../components/TodoPanel";
import { SetupChecklist } from "../components/SetupChecklist";
import { NotificationsCard } from "../components/NotificationsCard";
import { useAuthStore } from "../store/authStore";
import { Kpi, MaterialWidget, MonthChart, OrdersWidget, Panel, PrinterOverview, QuickActions, eur, isLow, stockKg, type DayPoint, type MaterialRow, type OrderRow } from "../components/dashboard/widgets";

import { HelpTip } from "../components/HelpTip";
interface DocRow {
  kind: "INVOICE" | "QUOTE" | "ORDER_CONFIRMATION" | "DELIVERY_NOTE";
  id: string;
  number: string | null;
  customerName: string;
  date: string;
  totalCents: number | null;
  status: string;
  isCancellationDocument: boolean;
  emailSentAt: string | null;
}

interface RevenueStatus {
  isSmallBusiness: boolean;
  yearRevenueCents: number;
  priorYearRevenueCents: number;
  thresholdCents: number;
  currentYearThresholdCents: number;
  percentUsed: number;
  isApproaching: boolean;
  priorYearExceeded: boolean;
  currentYearExceeded: boolean;
}

interface Stats {
  months: { month: string; revenueCents: number }[];
  expenseMonths?: { month: string; expenseCents: number }[];
  topCustomers: { name: string; revenueCents: number }[];
  yearRevenueCents: number;
}

const MONTH_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTH_LONG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const eurShort = (c: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);

/** Balkendiagramm (reines SVG, keine Bibliothek): Netto-Umsatz in der Akzentfarbe, Ausgaben daneben in Bernstein; aktueller Monat kräftig. */
function IncomeExpenseChart({ months, expenses }: { months: Stats["months"]; expenses: Stats["expenseMonths"] }) {
  const max = Math.max(1, ...months.map((m) => m.revenueCents), ...(expenses ?? []).map((e) => e.expenseCents));
  const W = 600;
  const H = 150;
  const slot = W / months.length;
  const barW = (slot - 10) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full" role="img" aria-label="Netto-Umsatz und Ausgaben der letzten zwölf Monate">
      {[0.5, 1].map((f) => (
        <line key={f} x1={0} x2={W} y1={H - H * f} y2={H - H * f} className="stroke-slate-200 dark:stroke-slate-700" strokeDasharray="3 4" />
      ))}
      {months.map((m, i) => {
        const exp = expenses?.find((e) => e.month === m.month)?.expenseCents ?? 0;
        const hr = Math.round((m.revenueCents / max) * H);
        const he = Math.round((exp / max) * H);
        const isLast = i === months.length - 1;
        const label = MONTH_SHORT[Number(m.month.slice(5)) - 1];
        return (
          <g key={m.month}>
            <title>{`${label} ${m.month.slice(0, 4)}: Umsatz ${eurShort(m.revenueCents)}, Ausgaben ${eurShort(exp)}`}</title>
            <rect x={i * slot + 4} y={H - hr} width={barW} height={Math.max(hr, m.revenueCents > 0 ? 2 : 0)} rx={3} className={isLast ? "fill-brand" : "fill-brand/40"} />
            <rect x={i * slot + 4 + barW + 2} y={H - he} width={barW} height={Math.max(he, exp > 0 ? 2 : 0)} rx={3} className={isLast ? "fill-amber-500" : "fill-amber-400/50"} />
            <text x={i * slot + slot / 2} y={H + 16} textAnchor="middle" className="fill-slate-500" fontSize="11">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

const KIND_LABEL = { INVOICE: "Rechnung", QUOTE: "Angebot", ORDER_CONFIRMATION: "Auftrag", DELIVERY_NOTE: "Lieferschein" } as const;
const KIND_BASE = { INVOICE: "/invoices", QUOTE: "/quotes", ORDER_CONFIRMATION: "/order-confirmations", DELIVERY_NOTE: "/delivery-notes" } as const;

const greeting = (hour: number) => (hour < 11 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend");
const WEEKDAY_DATE = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Startseite: Begrüßung, Kennzahlen, Druckerübersicht, Aufträge, Umsatz und Gewinn, Materiallager, Schnellaktionen und letzte Belege. */
export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const [rows, setRows] = useState<DocRow[]>([]);
  const [revenue, setRevenue] = useState<RevenueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [series, setSeries] = useState<DayPoint[]>([]);
  const [chartRange, setChartRange] = useState<"month" | "year">("month");
  const [livePrinters, setLivePrinters] = useState<{ id: string; name: string; status: LiveStatus; imageDocumentId?: string | null }[]>([]);

  useEffect(() => {
    api.get("/documents").then((res) => setRows(res.data)).finally(() => setLoading(false));
    api.get("/companies/me/revenue-status").then((res) => setRevenue(res.data));
    api.get("/production").then((res) => setOrders(res.data.items)).catch(() => setOrders([]));
    api.get("/documents/stats").then((res) => setStats(res.data)).catch(() => setStats(null));
    api.get("/materials").then((res) => setMaterials(res.data)).catch(() => setMaterials([]));
    api.get("/documents/month-series").then((res) => setSeries(res.data.days)).catch(() => setSeries([]));
  }, []);

  // Drucker mit Live-Anbindung: alle 10 Sekunden aktualisieren, solange die Seite sichtbar ist
  useEffect(() => {
    let cancelled = false;
    async function loadPrinters() {
      try {
        const [list, live] = await Promise.all([api.get("/printers"), api.get("/printers/live")]);
        if (cancelled) return;
        setLivePrinters(list.data.filter((p: { id: string; liveEnabled: boolean }) => p.liveEnabled && live.data[p.id]).map((p: { id: string; name: string; imageDocumentId?: string | null }) => ({ id: p.id, name: p.name, imageDocumentId: p.imageDocumentId, status: live.data[p.id] })));
      } catch {
        if (!cancelled) setLivePrinters([]);
      }
    }
    loadPrinters();
    const timer = setInterval(() => { if (!document.hidden) loadPrinters(); }, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // Sprung von der Glocke oben: zur Karte "Meldungen" scrollen
  useEffect(() => {
    if (location.hash === "#meldungen" && !loading) document.getElementById("meldungen")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, loading]);

  // Korrekturbelege (Storno/Gutschrift) tragen negative Beträge und stehen neben dem stornierten Original -
  // in den offenen Posten haben sie nichts verloren.
  const invoices = rows.filter((r) => r.kind === "INVOICE" && !r.isCancellationDocument);
  const open = invoices.filter((r) => r.status === "SENT" || r.status === "OVERDUE");
  const openTotal = open.reduce((sum, r) => sum + (r.totalCents ?? 0), 0);
  const overdue = invoices.filter((r) => r.status === "OVERDUE");
  const drafts = rows.filter((r) => r.status === "DRAFT");
  const recent = rows.filter((r) => r.status !== "DRAFT").slice(0, 6);

  const now = new Date();
  const monthRevenue = stats?.months[stats.months.length - 1]?.revenueCents ?? 0;
  const prevRevenue = stats?.months[stats.months.length - 2]?.revenueCents ?? 0;
  const monthExpenses = stats?.expenseMonths?.[stats.expenseMonths.length - 1]?.expenseCents ?? 0;
  const monthResult = monthRevenue - monthExpenses;
  const hasChartData = !!stats && (stats.months.some((m) => m.revenueCents > 0) || !!stats.expenseMonths?.some((m) => m.expenseCents > 0));
  const revenueDelta = prevRevenue > 0 ? Math.round(((monthRevenue - prevRevenue) / prevRevenue) * 100) : null;

  // Aufträge
  const activeOrders = orders.filter((o) => o.productionStatus !== "SHIPPED");
  const waitingOrders = activeOrders.filter((o) => o.productionStatus === "CREATED").length;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const newOrders = activeOrders.filter((o) => o.issueDate && new Date(o.issueDate) >= yesterday).length;
  const openOrders = [...activeOrders].sort((a, b) => (a.expectedDeliveryDate ?? "9999").localeCompare(b.expectedDeliveryDate ?? "9999"));

  // Drucker
  const onlinePrinters = livePrinters.filter((p) => p.status.connection === "online");
  const printingNow = onlinePrinters.filter((p) => ["RUNNING", "PREPARE", "PAUSE"].includes(p.status.state)).length;
  const printerErrors = onlinePrinters.filter((p) => p.status.errorCode !== null && p.status.state !== "IDLE").length;

  // Material
  const kgTotal = materials.reduce((s, m) => s + (stockKg(m) ?? 0), 0);
  const lowCount = materials.filter(isLow).length;

  const firstName = user?.name?.split(/\s+/)[0] ?? "";
  const summary = [
    onlinePrinters.length > 0 ? (printerErrors > 0 ? `${printerErrors} Drucker mit Fehler` : printingNow > 0 ? `${printingNow} Drucker ${printingNow === 1 ? "druckt" : "drucken"}` : "Deine Drucker sind bereit") : null,
    waitingOrders > 0 ? `${waitingOrders} Auftr${waitingOrders === 1 ? "ag wartet" : "äge warten"} auf Bearbeitung` : activeOrders.length > 0 ? "Alle Aufträge sind in Arbeit" : "Nichts in Produktion",
  ].filter(Boolean).join(" · ");

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{WEEKDAY_DATE.format(now)}</p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{greeting(now.getHours())}{firstName ? `, ${firstName}` : ""}<HelpTip topic="start" className="ml-2" /></h1>
          <p className="text-sm text-slate-500 mt-0.5">{summary}</p>
        </div>
        <Link to="/#meldungen" className="lg:hidden w-10 h-10 rounded-full bg-white shadow flex items-center justify-center text-slate-600 shrink-0" aria-label="Meldungen"><Icon name="bell" className="w-5 h-5" /></Link>
      </div>

      {revenue?.isSmallBusiness && (revenue.isApproaching || revenue.currentYearExceeded || revenue.priorYearExceeded) && (
        <div className={`rounded-xl p-4 mb-6 text-sm ${revenue.currentYearExceeded || revenue.priorYearExceeded ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200"}`}>
          {revenue.priorYearExceeded ? (
            <>Vorjahresgrenze für die Kleinunternehmerregelung überschritten ({eur(revenue.priorYearRevenueCents)} von {eur(revenue.thresholdCents)}). Details unter Einstellungen.</>
          ) : revenue.currentYearExceeded ? (
            <>Laufende Umsatzgrenze für die Kleinunternehmerregelung überschritten ({eur(revenue.yearRevenueCents)} von {eur(revenue.currentYearThresholdCents)}). Details unter Einstellungen.</>
          ) : (
            <>Kleinunternehmer-Umsatzgrenze zu {revenue.percentUsed}% erreicht ({eur(revenue.yearRevenueCents)} von {eur(revenue.currentYearThresholdCents)}).</>
          )}
        </div>
      )}

      {/* Oben: große Karte mit dem offenen Betrag, daneben/darunter die vier häufigsten Schritte, dann die Kennzahl-Kacheln */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3">
        <Link to="/documents?type=OPEN_INVOICE" className="md:col-span-3 block bg-brand text-white rounded-3xl p-5 sm:p-6 shadow-lg shadow-brand/20 active:scale-[0.99] transition">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/75">Noch offen</p>
            <span className="text-xs font-medium bg-white/15 rounded-full px-2.5 py-1">Alle ansehen →</span>
          </div>
          <p className="text-4xl sm:text-5xl font-semibold tracking-tight mt-1">{loading ? "…" : eur(openTotal)}</p>
          <p className="text-sm text-white/75 mt-1">
            {open.length === 0 ? "Keine offenen Rechnungen" : `${open.length} Rechnung${open.length === 1 ? "" : "en"}`}
            {overdue.length > 0 && <> · <span className="text-rose-200 font-medium">{overdue.length} überfällig</span></>}
          </p>
        </Link>
        <div className="md:col-span-2 flex items-center md:justify-center md:bg-white md:rounded-3xl md:shadow py-3 md:py-4">
          <QuickActions className="w-full md:w-auto" />
        </div>
      </div>

      {!loading && (
      <div className={`grid grid-cols-2 gap-3 mb-6 [&>*:last-child:nth-child(odd)]:col-span-2 md:[&>*:last-child:nth-child(odd)]:col-span-1 ${livePrinters.length > 0 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <Kpi icon="checkCircle" tone="green" label="Bezahlt diesen Monat" value={eur(monthRevenue)} sub={revenueDelta === null ? `Vormonat ${eur(prevRevenue)}` : `${revenueDelta >= 0 ? "+" : ""}${revenueDelta} % zum Vormonat`} subTone={revenueDelta === null ? "muted" : revenueDelta >= 0 ? "good" : "bad"} to="/finance" />
        <Kpi icon="board" tone="violet" label="In Produktion" value={activeOrders.length} sub={newOrders > 0 ? `+${newOrders} seit gestern` : "keine neuen seit gestern"} subTone={newOrders > 0 ? "good" : "muted"} to="/production" />
        <Kpi icon="filament" tone="pink" label="Material" value={`${kgTotal.toLocaleString("de-DE", { maximumFractionDigits: 1 })} kg`} sub={materials.length === 0 ? "noch kein Material" : lowCount > 0 ? `${lowCount} Artikel knapp` : "alles ausreichend"} subTone={lowCount > 0 ? "bad" : materials.length === 0 ? "muted" : "good"} to="/catalog?tab=materials" />
        {livePrinters.length > 0 && <Kpi icon="printer" tone="slate" label="Drucker online" value={`${onlinePrinters.length} / ${livePrinters.length}`} sub={printingNow > 0 ? `${printingNow} ${printingNow === 1 ? "druckt" : "drucken"}` : "alle bereit"} subTone={printerErrors > 0 ? "bad" : "muted"} to="/catalog?tab=printers" />}
      </div>
      )}

      <TodoPanel />
      <NotificationsCard />
      <SetupChecklist />

      {loading ? (
        <p>Wird geladen ...</p>
      ) : (
        <>
          {/* Leere Bereiche (kein Drucker verbunden, kein Material) blendet die Startseite aus - die Kacheln oben sagen das schon */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3">
            {livePrinters.length > 0 && (
              <Panel title="Druckerübersicht" help="printers" action={{ to: "/catalog?tab=printers", label: "Alle anzeigen" }} className="xl:col-span-2">
                <PrinterOverview printers={livePrinters} />
              </Panel>
            )}
            <Panel title="Aktuelle Aufträge" help="production" action={{ to: "/production", label: "Alle anzeigen" }} className={livePrinters.length > 0 ? "" : "xl:col-span-3"}>
              <OrdersWidget orders={openOrders} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3">
            <Panel className={materials.length > 0 ? "xl:col-span-2" : "xl:col-span-3"}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <h2 className="text-base font-semibold tracking-tight">Umsatz &amp; Gewinn</h2>
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs" role="group" aria-label="Zeitraum">
                  {([["month", "Dieser Monat"], ["year", "12 Monate"]] as const).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setChartRange(key)} aria-pressed={chartRange === key} className={`px-3 py-1.5 ${chartRange === key ? "bg-brand text-white" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-2 mb-3">
                <div><p className="text-2xl font-semibold tracking-tight">{eur(monthRevenue)}</p><p className="text-xs text-slate-500 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand" />Umsatz (bezahlt{revenue?.isSmallBusiness ? "" : ", netto"})</p></div>
                <div><p className="text-2xl font-semibold tracking-tight">{eur(monthExpenses)}</p><p className="text-xs text-slate-500 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />Ausgaben</p></div>
                <div><p className={`text-2xl font-semibold tracking-tight ${monthResult < 0 ? "text-red-500" : ""}`}>{eur(monthResult)}</p><p className="text-xs text-slate-500 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" />Ergebnis (vor Steuern)</p></div>
              </div>
              {chartRange === "month" ? (
                series.length > 0 ? <MonthChart days={series} today={now.getDate()} /> : <p className="text-sm text-slate-500">Noch keine Daten für diesen Monat.</p>
              ) : hasChartData && stats ? (
                <>
                  <IncomeExpenseChart months={stats.months} expenses={stats.expenseMonths} />
                  <p className="text-xs text-slate-500 mt-1">{now.getFullYear()}: Umsatz {eur(stats.yearRevenueCents)}{revenue?.isSmallBusiness ? "" : " netto"}</p>
                </>
              ) : (
                <p className="text-sm text-slate-500">Noch keine Daten.</p>
              )}
              <p className="text-xs text-slate-500 mt-2">Monatsansicht: aufgelaufene Werte seit dem 1. des Monats. Umsatz = bezahlte Rechnungen nach Zahlungsdatum{revenue?.isSmallBusiness ? "" : " (netto)"}, Ausgaben laut Ausgabenliste.</p>
            </Panel>
            {materials.length > 0 && (
              <Panel title="Materiallager" help="materials" action={{ to: "/catalog?tab=materials", label: "Alle anzeigen" }}>
                <MaterialWidget materials={materials} />
              </Panel>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-6">
            <Panel title="Letzte Aktivität" help="documents" action={{ to: "/documents", label: "Alle Belege" }} className="xl:col-span-2">
              <div className="-mx-2 divide-y divide-slate-100 dark:divide-slate-700">
                {recent.map((r) => (
                  <Link key={`${r.kind}-${r.id}`} to={r.kind === "INVOICE" ? `/invoices/${r.id}` : `/documents?type=${r.kind}`} className="flex items-center gap-3 px-2 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/40 rounded-xl">
                    <StatusIcon status={r.status} kind={r.kind} isCancellationDocument={r.isCancellationDocument} emailed={!!r.emailSentAt} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.customerName}</span>
                      <span className="block truncate text-xs text-slate-500">{r.isCancellationDocument ? "Korrekturbeleg" : KIND_LABEL[r.kind]} {r.number} · {statusInfo(r.status, { kind: r.kind, isCancellationDocument: r.isCancellationDocument, emailed: !!r.emailSentAt }).label}</span>
                    </span>
                    <span className="shrink-0 text-right font-semibold">{r.totalCents === null ? "" : eur(r.totalCents)}</span>
                  </Link>
                ))}
                {recent.length === 0 && <p className="px-2 py-6 text-center text-slate-500 text-sm">Noch nichts ausgestellt. Starte mit "Rechnung erstellen".</p>}
              </div>
            </Panel>

            <div className="space-y-3 min-w-0">
              {stats && (
                <Panel title={`Beste Kunden ${now.getFullYear()}`}>
                  {stats.topCustomers.length === 0 && <p className="text-sm text-slate-500">Noch kein Umsatz.</p>}
                  <ol className="space-y-1.5 text-sm">
                    {stats.topCustomers.slice(0, 5).map((c, i) => (
                      <li key={c.name + i} className="flex justify-between gap-3">
                        <span className="truncate"><span className="text-slate-400 mr-1.5">{i + 1}.</span>{c.name}</span>
                        <span className="shrink-0">{eur(c.revenueCents)}</span>
                      </li>
                    ))}
                  </ol>
                </Panel>
              )}
              {drafts.length > 0 && (
                <Panel title="Zuletzt angefangen">
                  <div className="space-y-1.5 text-sm">
                    {drafts.slice(0, 4).map((r) => (
                      <Link key={`${r.kind}-${r.id}`} to={`${KIND_BASE[r.kind]}/${r.id}/edit`} className="flex items-center justify-between gap-3 hover:underline">
                        <span className="truncate"><span className="text-slate-500">{KIND_LABEL[r.kind]}</span> · {r.customerName}</span>
                        <span className="text-brand shrink-0">Weiter →</span>
                      </Link>
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
