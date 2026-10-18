import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

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

const KIND_LABEL = { INVOICE: "Rechnung", QUOTE: "Angebot", ORDER_CONFIRMATION: "Auftrag", DELIVERY_NOTE: "Lieferschein" } as const;
const KIND_BASE = { INVOICE: "/invoices", QUOTE: "/quotes", ORDER_CONFIRMATION: "/order-confirmations", DELIVERY_NOTE: "/delivery-notes" } as const;
const format = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

/** Startseite: Schnellaktionen, die drei wichtigsten Kennzahlen und offene Entwürfe. */
export default function Dashboard() {
  const [rows, setRows] = useState<DocRow[]>([]);
  const [revenue, setRevenue] = useState<RevenueStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/documents").then((res) => setRows(res.data)).finally(() => setLoading(false));
    api.get("/companies/me/revenue-status").then((res) => setRevenue(res.data));
  }, []);

  // Korrekturbelege (Storno/Gutschrift) tragen negative Beträge und stehen neben dem stornierten Original -
  // in den offenen Posten haben sie nichts verloren.
  const invoices = rows.filter((r) => r.kind === "INVOICE" && !r.isCancellationDocument);
  const open = invoices.filter((r) => r.status === "SENT" || r.status === "OVERDUE");
  const openTotal = open.reduce((sum, r) => sum + (r.totalCents ?? 0), 0);
  const overdue = invoices.filter((r) => r.status === "OVERDUE");
  const drafts = rows.filter((r) => r.status === "DRAFT");
  const recent = rows.filter((r) => r.status !== "DRAFT").slice(0, 6);

  const card = "bg-white dark:bg-slate-800 rounded-lg p-4 shadow";

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Start</h1>

      <div className="flex flex-wrap gap-2 mb-6">
        <Link to="/invoices/new" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">+ Neue Rechnung</Link>
        <Link to="/quotes/new" className="px-4 py-2 rounded text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">Neues Angebot</Link>
        <Link to="/customers" className="px-4 py-2 rounded text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">Kunden</Link>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <Link to="/documents?type=INVOICE" className={`${card} hover:shadow-md transition-shadow`}>
              <p className="text-sm text-slate-500">Offen</p>
              <p className="text-2xl font-semibold">{format(openTotal)}</p>
              <p className="text-xs text-slate-500 mt-1">{open.length} Rechnung{open.length === 1 ? "" : "en"}</p>
            </Link>
            <Link to="/documents?type=INVOICE" className={`${card} hover:shadow-md transition-shadow`}>
              <p className="text-sm text-slate-500">Überfällig</p>
              <p className={`text-2xl font-semibold ${overdue.length ? "text-red-600" : ""}`}>{overdue.length}</p>
              <p className="text-xs text-slate-500 mt-1">{overdue.length ? format(overdue.reduce((s, r) => s + (r.totalCents ?? 0), 0)) : "alles im Rahmen"}</p>
            </Link>
            <Link to="/documents?type=DRAFT" className={`${card} hover:shadow-md transition-shadow`}>
              <p className="text-sm text-slate-500">Entwürfe</p>
              <p className="text-2xl font-semibold">{drafts.length}</p>
              <p className="text-xs text-slate-500 mt-1">noch nicht fertiggestellt</p>
            </Link>
          </div>

          {drafts.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-medium text-slate-500 mb-2">Zuletzt angefangen</h2>
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
                {drafts.slice(0, 4).map((r) => (
                  <Link key={`${r.kind}-${r.id}`} to={`${KIND_BASE[r.kind]}/${r.id}/edit`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
                    <span className="truncate"><span className="text-slate-500">{KIND_LABEL[r.kind]}</span> · {r.customerName}</span>
                    <span className="shrink-0 text-slate-500">{r.totalCents === null ? "" : format(r.totalCents)} <span className="text-brand ml-2">Weiter →</span></span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <h2 className="text-sm font-medium text-slate-500 mb-2">Zuletzt ausgestellt</h2>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
            {recent.map((r) => (
              <Link key={`${r.kind}-${r.id}`} to={r.kind === "INVOICE" ? `/invoices/${r.id}` : `/documents?type=${r.kind}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700">
                <span className="truncate"><span className="text-slate-500">{KIND_LABEL[r.kind]}</span> {r.number} · {r.customerName}</span>
                <span className="shrink-0">{r.totalCents === null ? "" : format(r.totalCents)}</span>
              </Link>
            ))}
            {recent.length === 0 && <p className="px-4 py-6 text-center text-slate-500 text-sm">Noch nichts ausgestellt. Starten Sie mit "Neue Rechnung".</p>}
          </div>
          <p className="text-sm mt-3"><Link to="/documents" className="text-brand hover:underline">Alle Belege ansehen →</Link></p>
        </>
      )}
    </div>
  );
}
