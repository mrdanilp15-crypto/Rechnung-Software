import { ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Icon, type IconName } from "../components/Icon";
import { StatusChip } from "../components/StatusChip";

interface DocRow {
  kind: "INVOICE" | "QUOTE" | "ORDER_CONFIRMATION" | "DELIVERY_NOTE";
  id: string;
  number: string | null;
  customerName: string;
  date: string;
  totalCents: number | null;
  status: string;
  isCancellationDocument: boolean;
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
const format = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

const TONES = {
  brand: "bg-brand/10 text-brand",
  green: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
} as const;

/** Kennzahl-Kachel: Symbol, Wert, Zusatzzeile; optional als Link. */
function Tile({ icon, tone, label, value, valueClass = "", sub, to }: { icon: IconName; tone: keyof typeof TONES; label: string; value: ReactNode; valueClass?: string; sub?: ReactNode; to?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-1 mb-2 sm:mb-3">
        <p className="text-xs sm:text-sm text-slate-500 truncate">{label}</p>
        <span className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 ${TONES[tone]}`}>
          <Icon name={icon} className="w-4 h-4 sm:w-5 sm:h-5" />
        </span>
      </div>
      <p className={`text-base sm:text-2xl font-semibold tracking-tight ${valueClass}`}>{value}</p>
      {sub && <p className="hidden sm:block text-xs text-slate-500 mt-1">{sub}</p>}
    </>
  );
  const cls = "bg-white dark:bg-slate-800 rounded-lg p-3 sm:p-4 shadow min-w-0";
  return to ? (
    <Link to={to} className={`${cls} hover:shadow-md transition-shadow block`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Startseite: Schnellaktionen, Kennzahlen (Monat und offene Posten), Diagramme und letzte Belege. */
export default function Dashboard() {
  const [rows, setRows] = useState<DocRow[]>([]);
  const [revenue, setRevenue] = useState<RevenueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [production, setProduction] = useState<{ productionStatus: string }[]>([]);
  const [dunning, setDunning] = useState<{ invoiceId: string; invoiceNumber: string; customerName: string; totalCents: number; daysOverdue: number; nextLevel: number }[]>([]);

  useEffect(() => {
    api.get("/documents").then((res) => setRows(res.data)).finally(() => setLoading(false));
    api.get("/companies/me/revenue-status").then((res) => setRevenue(res.data));
    api.get("/dunning/suggestions").then((res) => setDunning(res.data)).catch(() => setDunning([]));
    api.get("/production").then((res) => setProduction(res.data.items)).catch(() => setProduction([]));
    api.get("/documents/stats").then((res) => setStats(res.data)).catch(() => setStats(null));
  }, []);

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
  const monthExpenses = stats?.expenseMonths?.[stats.expenseMonths.length - 1]?.expenseCents ?? 0;
  const monthResult = monthRevenue - monthExpenses;
  const hasChartData = !!stats && (stats.months.some((m) => m.revenueCents > 0) || !!stats.expenseMonths?.some((m) => m.expenseCents > 0));

  const ringParts = [
    { label: "Entwurf", count: invoices.filter((r) => r.status === "DRAFT").length, color: "#f59e0b" },
    { label: "Versendet", count: invoices.filter((r) => r.status === "SENT").length, color: "#3b82f6" },
    { label: "Überfällig", count: overdue.length, color: "#ef4444" },
    { label: "Bezahlt", count: invoices.filter((r) => r.status === "PAID").length, color: "#22c55e" },
  ];

  const card = "bg-white dark:bg-slate-800 rounded-lg p-4 shadow";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Start</h1>
          <p className="text-sm text-slate-500">{MONTH_LONG[now.getMonth()]} {now.getFullYear()} · Überblick über Ihre Werkstatt</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/invoices/new" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm font-medium">+ Neue Rechnung</Link>
          <Link to="/quotes/new" className="px-4 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">Neues Angebot</Link>
          <Link to="/customers" className="px-4 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">Kunden</Link>
        </div>
      </div>

      {revenue?.isSmallBusiness && (revenue.isApproaching || revenue.currentYearExceeded || revenue.priorYearExceeded) && (
        <div className={`rounded-lg p-4 mb-6 text-sm ${revenue.currentYearExceeded || revenue.priorYearExceeded ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200"}`}>
          {revenue.priorYearExceeded ? (
            <>Vorjahresgrenze für die Kleinunternehmerregelung überschritten ({format(revenue.priorYearRevenueCents)} von {format(revenue.thresholdCents)}). Details unter Einstellungen.</>
          ) : revenue.currentYearExceeded ? (
            <>Laufende Umsatzgrenze für die Kleinunternehmerregelung überschritten ({format(revenue.yearRevenueCents)} von {format(revenue.currentYearThresholdCents)}). Details unter Einstellungen.</>
          ) : (
            <>Kleinunternehmer-Umsatzgrenze zu {revenue.percentUsed}% erreicht ({format(revenue.yearRevenueCents)} von {format(revenue.currentYearThresholdCents)}).</>
          )}
        </div>
      )}

      {loading ? (
        <p>Wird geladen ...</p>
      ) : (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Dieser Monat</h2>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
            <Tile icon="money" tone="green" label="Umsatz" value={format(monthRevenue)} valueClass="text-green-600 dark:text-green-400" sub="netto, aus gestellten Rechnungen" to="/finance" />
            <Tile icon="receipt" tone="amber" label="Ausgaben" value={format(monthExpenses)} valueClass="text-amber-600 dark:text-amber-400" sub="laut Ausgabenliste" to="/finance" />
            <Tile icon="scale" tone="brand" label="Ergebnis" value={format(monthResult)} valueClass={monthResult < 0 ? "text-red-600 dark:text-red-400" : ""} sub="Umsatz minus Ausgaben, vor Steuern" to="/finance" />
          </div>

          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Offene Posten</h2>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
            <Tile icon="clock" tone="brand" label="Offen" value={format(openTotal)} sub={`${open.length} Rechnung${open.length === 1 ? "" : "en"}`} to="/documents?type=INVOICE" />
            <Tile icon="alert" tone={overdue.length ? "red" : "slate"} label="Überfällig" value={overdue.length} valueClass={overdue.length ? "text-red-600 dark:text-red-400" : ""} sub={overdue.length ? format(overdue.reduce((s, r) => s + (r.totalCents ?? 0), 0)) : "alles im Rahmen"} to="/documents?type=INVOICE" />
            <Tile icon="pencil" tone="amber" label="Entwürfe" value={drafts.length} sub="noch nicht fertiggestellt" to="/documents?type=DRAFT" />
          </div>

          {dunning.length > 0 && (
            <div className="mb-6 rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 p-4">
              <h2 className="text-sm font-medium mb-2">Zahlung überfällig - Erinnerung/Mahnung fällig</h2>
              <div className="space-y-1.5 text-sm">
                {dunning.slice(0, 5).map((d) => (
                  <Link key={d.invoiceId} to={`/invoices/${d.invoiceId}?dunning=1`} className="flex items-center justify-between gap-3 hover:underline">
                    <span className="truncate">{d.invoiceNumber} · {d.customerName} · {d.daysOverdue} Tage überfällig</span>
                    <span className="shrink-0">{format(d.totalCents)} <span className="text-brand ml-2">{d.nextLevel === 1 ? "Erinnerung" : `${d.nextLevel - 1}. Mahnung`} →</span></span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
            {hasChartData && stats && (
              <div className={`${card} lg:col-span-2`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <h2 className="text-sm font-medium">Umsatz und Ausgaben der letzten 12 Monate</h2>
                  <span className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-brand" />Umsatz (netto)</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />Ausgaben</span>
                  </span>
                </div>
                <IncomeExpenseChart months={stats.months} expenses={stats.expenseMonths} />
                <p className="text-xs text-slate-500 mt-1">{now.getFullYear()}: Umsatz {format(stats.yearRevenueCents)} netto</p>
              </div>
            )}
            <div className={`${card} ${hasChartData ? "" : "lg:col-span-3"}`}>
              <h2 className="text-sm font-medium mb-3">Rechnungen nach Status</h2>
              <StatusRing parts={ringParts} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
            <div className="lg:col-span-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Letzte Aktivität</h2>
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
                {recent.map((r) => (
                  <Link key={`${r.kind}-${r.id}`} to={r.kind === "INVOICE" ? `/invoices/${r.id}` : `/documents?type=${r.kind}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/60">
                    <span className="min-w-0">
                      <span className="block truncate"><span className="font-medium">{r.isCancellationDocument ? "Korrekturbeleg" : KIND_LABEL[r.kind]} {r.number}</span></span>
                      <span className="block truncate text-xs text-slate-500">{r.customerName}</span>
                    </span>
                    <span className="shrink-0 flex items-center gap-3">
                      <StatusChip status={r.status} kind={r.kind} isCancellationDocument={r.isCancellationDocument} />
                      <span className="w-24 text-right font-medium">{r.totalCents === null ? "" : format(r.totalCents)}</span>
                    </span>
                  </Link>
                ))}
                {recent.length === 0 && <p className="px-4 py-6 text-center text-slate-500 text-sm">Noch nichts ausgestellt. Starten Sie mit "Neue Rechnung".</p>}
              </div>
              <p className="text-sm mt-3"><Link to="/documents" className="text-brand hover:underline">Alle Belege ansehen →</Link></p>
            </div>

            <div className="space-y-3">
              {production.length > 0 && (
                <Link to="/production" className={`${card} block hover:shadow-md transition-shadow`}>
                  <h2 className="text-sm font-medium mb-2">Produktion</h2>
                  <div className="space-y-1.5 text-sm">
                    {([["CREATED", "Erstellt", "bg-slate-400"], ["IN_PRODUCTION", "In Produktion", "bg-amber-500"], ["READY_TO_SHIP", "Versandbereit", "bg-blue-500"]] as const).map(([key, label, dot]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                        <span className="text-slate-600 dark:text-slate-300">{label}</span>
                        <span className="ml-auto font-medium">{production.filter((p) => p.productionStatus === key).length}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-brand mt-2">Zum Produktionsboard →</p>
                </Link>
              )}
              {stats && (
                <div className={card}>
                  <h2 className="text-sm font-medium mb-2">Beste Kunden {now.getFullYear()}</h2>
                  {stats.topCustomers.length === 0 && <p className="text-sm text-slate-500">Noch kein Umsatz.</p>}
                  <ol className="space-y-1.5 text-sm">
                    {stats.topCustomers.slice(0, 5).map((c, i) => (
                      <li key={c.name + i} className="flex justify-between gap-3">
                        <span className="truncate"><span className="text-slate-400 mr-1.5">{i + 1}.</span>{c.name}</span>
                        <span className="shrink-0">{format(c.revenueCents)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {drafts.length > 0 && (
                <div className={card}>
                  <h2 className="text-sm font-medium mb-2">Zuletzt angefangen</h2>
                  <div className="space-y-1.5 text-sm">
                    {drafts.slice(0, 4).map((r) => (
                      <Link key={`${r.kind}-${r.id}`} to={`${KIND_BASE[r.kind]}/${r.id}/edit`} className="flex items-center justify-between gap-3 hover:underline">
                        <span className="truncate"><span className="text-slate-500">{KIND_LABEL[r.kind]}</span> · {r.customerName}</span>
                        <span className="text-brand shrink-0">Weiter →</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
