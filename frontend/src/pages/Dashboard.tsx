import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { StatusChip } from "../components/StatusChip";
import { type LiveStatus } from "../components/PrinterLive";
import { NotificationsCard } from "../components/NotificationsCard";
import { useAuthStore } from "../store/authStore";
import { Kpi, MaterialWidget, MonthChart, OrdersWidget, Panel, PrinterOverview, QuickActions, eur, isLow, stockKg, type DayPoint, type MaterialRow, type OrderRow } from "../components/dashboard/widgets";

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

/** Ring-Diagramm der Rechnungen nach Status (SVG); in der Mitte die Gesamtzahl. */
function StatusRing({ parts }: { parts: { label: string; count: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.count, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" className="w-32 h-32 shrink-0 -rotate-90" role="img" aria-label="Rechnungen nach Status">
        <circle cx="70" cy="70" r={R} fill="none" strokeWidth="16" className="stroke-slate-100 dark:stroke-slate-700" />
        {total > 0 &&
          parts.filter((p) => p.count > 0).map((p) => {
            const len = (p.count / total) * C;
            const el = <circle key={p.label} cx="70" cy="70" r={R} fill="none" strokeWidth="16" stroke={p.color} strokeDasharray={`${Math.max(len - 2, 0.5)} ${C - Math.max(len - 2, 0.5)}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
        <g className="rotate-90 origin-center">
          <text x="70" y="68" textAnchor="middle" className="fill-slate-900 dark:fill-slate-100" fontSize="26" fontWeight="600">{total}</text>
          <text x="70" y="86" textAnchor="middle" className="fill-slate-500" fontSize="11">Rechnungen</text>
        </g>
      </svg>
      <ul className="space-y-1.5 text-sm min-w-0">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-slate-600 dark:text-slate-300">{p.label}</span>
            <span className="ml-auto pl-3 font-medium">{p.count}</span>
          </li>
        ))}
      </ul>
    </div>
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
  const [livePrinters, setLivePrinters] = useState<{ id: string; name: string; status: LiveStatus }[]>([]);
  const [dunning, setDunning] = useState<{ invoiceId: string; invoiceNumber: string; customerName: string; totalCents: number; daysOverdue: number; nextLevel: number }[]>([]);

  useEffect(() => {
    api.get("/documents").then((res) => setRows(res.data)).finally(() => setLoading(false));
    api.get("/companies/me/revenue-status").then((res) => setRevenue(res.data));
    api.get("/dunning/suggestions").then((res) => setDunning(res.data)).catch(() => setDunning([]));
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
        setLivePrinters(list.data.filter((p: { id: string; liveEnabled: boolean }) => p.liveEnabled && live.data[p.id]).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name, status: live.data[p.id] })));
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

  const ringParts = [
    { label: "Entwurf", count: invoices.filter((r) => r.status === "DRAFT").length, color: "#f59e0b" },
    { label: "Versendet", count: invoices.filter((r) => r.status === "SENT").length, color: "#3b82f6" },
    { label: "Überfällig", count: overdue.length, color: "#ef4444" },
    { label: "Bezahlt", count: invoices.filter((r) => r.status === "PAID").length, color: "#22c55e" },
  ];

  const firstName = user?.name?.split(/\s+/)[0] ?? "";
  const summary = [
    onlinePrinters.length > 0 ? (printerErrors > 0 ? `${printerErrors} Drucker mit Fehler` : printingNow > 0 ? `${printingNow} Drucker ${printingNow === 1 ? "druckt" : "drucken"}` : "Deine Drucker sind bereit") : null,
    waitingOrders > 0 ? `${waitingOrders} Auftr${waitingOrders === 1 ? "ag wartet" : "äge warten"} auf Bearbeitung` : activeOrders.length > 0 ? "Alle Aufträge sind in Arbeit" : "Keine offenen Aufträge",
  ].filter(Boolean).join(" · ");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{greeting(now.getHours())}{firstName ? `, ${firstName}` : ""}!</h1>
          <p className="text-sm text-slate-500 mt-1">{summary}</p>
        </div>
        <p className="text-sm text-slate-500">{WEEKDAY_DATE.format(now)}</p>
      </div>

      <NotificationsCard />

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

      {dunning.length > 0 && (
        <div className="mb-6 rounded-xl border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 p-4">
          <h2 className="text-sm font-medium mb-2">Zahlung überfällig - Erinnerung/Mahnung fällig</h2>
          <div className="space-y-1.5 text-sm">
            {dunning.slice(0, 5).map((d) => (
              <Link key={d.invoiceId} to={`/invoices/${d.invoiceId}?dunning=1`} className="flex items-center justify-between gap-3 hover:underline">
                <span className="truncate">{d.invoiceNumber} · {d.customerName} · {d.daysOverdue} Tage überfällig</span>
                <span className="shrink-0">{eur(d.totalCents)} <span className="text-brand ml-2">{d.nextLevel === 1 ? "Erinnerung" : `${d.nextLevel - 1}. Mahnung`} →</span></span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p>Wird geladen ...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
            <Kpi icon="board" tone="brand" label="Aktive Aufträge" value={activeOrders.length} sub={newOrders > 0 ? `+${newOrders} seit gestern` : "keine neuen seit gestern"} subTone={newOrders > 0 ? "good" : "muted"} to="/production" />
            <Kpi icon="printer" tone="green" label="Drucker online" value={livePrinters.length > 0 ? `${onlinePrinters.length} / ${livePrinters.length}` : "-"} sub={livePrinters.length > 0 ? `${Math.round((onlinePrinters.length / livePrinters.length) * 100)} % online` : "keine Live-Verbindung"} subTone={livePrinters.length > 0 && onlinePrinters.length < livePrinters.length ? "warn" : "muted"} to="/catalog?tab=printers" />
            <Kpi icon="money" tone="violet" label="Umsatz (dieser Monat)" value={eur(monthRevenue)} sub={revenueDelta === null ? `Vormonat ${eur(prevRevenue)}` : `${revenueDelta >= 0 ? "+" : ""}${revenueDelta} % zum Vormonat`} subTone={revenueDelta === null ? "muted" : revenueDelta >= 0 ? "good" : "bad"} to="/finance" />
            <Kpi icon="filament" tone="amber" label="Materialbestand" value={`${kgTotal.toLocaleString("de-DE", { maximumFractionDigits: 1 })} kg`} sub={materials.length === 0 ? "noch kein Material" : lowCount > 0 ? `${lowCount} Artikel knapp` : "alles ausreichend"} subTone={lowCount > 0 ? "bad" : "good"} to="/catalog?tab=materials" />
            <Kpi icon="receipt" tone={overdue.length > 0 ? "red" : "slate"} label="Offene Rechnungen" value={eur(openTotal)} sub={`${open.length} Rechnung${open.length === 1 ? "" : "en"}${overdue.length > 0 ? ` · ${overdue.length} überfällig` : ""}`} subTone={overdue.length > 0 ? "bad" : "muted"} to="/documents?type=INVOICE" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3">
            <Panel title="Druckerübersicht" action={{ to: "/catalog?tab=printers", label: "Alle anzeigen" }} className="xl:col-span-2">
              <PrinterOverview printers={livePrinters} />
            </Panel>
            <Panel title="Aktuelle Aufträge" action={{ to: "/production", label: "Alle anzeigen" }}>
              <OrdersWidget orders={openOrders} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3">
            <Panel className="xl:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <h2 className="text-base font-semibold tracking-tight">Umsatz &amp; Gewinn</h2>
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs" role="group" aria-label="Zeitraum">
                  {([["month", "Dieser Monat"], ["year", "12 Monate"]] as const).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setChartRange(key)} aria-pressed={chartRange === key} className={`px-3 py-1.5 ${chartRange === key ? "bg-brand text-white" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-2 mb-3">
                <div><p className="text-2xl font-semibold tracking-tight">{eur(monthRevenue)}</p><p className="text-xs text-slate-500 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand" />Umsatz (netto)</p></div>
                <div><p className="text-2xl font-semibold tracking-tight">{eur(monthExpenses)}</p><p className="text-xs text-slate-500 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />Ausgaben</p></div>
                <div><p className={`text-2xl font-semibold tracking-tight ${monthResult < 0 ? "text-red-500" : ""}`}>{eur(monthResult)}</p><p className="text-xs text-slate-500 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" />Ergebnis (vor Steuern)</p></div>
              </div>
              {chartRange === "month" ? (
                series.length > 0 ? <MonthChart days={series} today={now.getDate()} /> : <p className="text-sm text-slate-500">Noch keine Daten für diesen Monat.</p>
              ) : hasChartData && stats ? (
                <>
                  <IncomeExpenseChart months={stats.months} expenses={stats.expenseMonths} />
                  <p className="text-xs text-slate-500 mt-1">{now.getFullYear()}: Umsatz {eur(stats.yearRevenueCents)} netto</p>
                </>
              ) : (
                <p className="text-sm text-slate-500">Noch keine Daten.</p>
              )}
              <p className="text-xs text-slate-500 mt-2">Monatsansicht: aufgelaufene Werte seit dem 1. des Monats. Umsatz aus gestellten Rechnungen netto, Ausgaben laut Ausgabenliste.</p>
            </Panel>
            <Panel title="Materiallager" action={{ to: "/catalog?tab=materials", label: "Alle anzeigen" }}>
              <MaterialWidget materials={materials} />
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-6">
            <Panel title="Letzte Aktivität" action={{ to: "/documents", label: "Alle Belege" }} className="xl:col-span-2">
              <div className="-mx-2 divide-y divide-slate-100 dark:divide-slate-700">
                {recent.map((r) => (
                  <Link key={`${r.kind}-${r.id}`} to={r.kind === "INVOICE" ? `/invoices/${r.id}` : `/documents?type=${r.kind}`} className="flex items-center justify-between gap-3 px-2 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/40 rounded-lg">
                    <span className="min-w-0">
                      <span className="block truncate"><span className="font-medium">{r.isCancellationDocument ? "Korrekturbeleg" : KIND_LABEL[r.kind]} {r.number}</span></span>
                      <span className="block truncate text-xs text-slate-500">{r.customerName}</span>
                    </span>
                    <span className="shrink-0 flex items-center gap-3">
                      <StatusChip status={r.status} kind={r.kind} isCancellationDocument={r.isCancellationDocument} emailed={!!r.emailSentAt} />
                      <span className="w-24 text-right font-medium">{r.totalCents === null ? "" : eur(r.totalCents)}</span>
                    </span>
                  </Link>
                ))}
                {recent.length === 0 && <p className="px-2 py-6 text-center text-slate-500 text-sm">Noch nichts ausgestellt. Starte mit "Rechnung erstellen".</p>}
              </div>
            </Panel>

            <div className="space-y-3 min-w-0">
              <Panel title="Schnellaktionen"><QuickActions /></Panel>
              <Panel title="Rechnungen nach Status"><StatusRing parts={ringParts} /></Panel>
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
