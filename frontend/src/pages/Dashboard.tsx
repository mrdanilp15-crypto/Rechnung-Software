import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  customer: { name: string };
}

interface RevenueStatus {
  isSmallBusiness: boolean;
  yearRevenueCents: number;
  thresholdCents: number;
  percentUsed: number;
  isApproaching: boolean;
  isExceeded: boolean;
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [revenue, setRevenue] = useState<RevenueStatus | null>(null);
  const [counts, setCounts] = useState({ customers: 0, products: 0, openQuotes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/invoices")
      .then((res) => setInvoices(res.data))
      .finally(() => setLoading(false));
    api.get("/companies/me/revenue-status").then((res) => setRevenue(res.data));
    Promise.all([api.get("/customers"), api.get("/products"), api.get("/quotes")]).then(([customers, products, quotes]) => {
      setCounts({
        customers: customers.data.length,
        products: products.data.length,
        openQuotes: quotes.data.filter((q: { status: string }) => q.status === "SENT" || q.status === "DRAFT").length,
      });
    });
  }, []);

  const openTotal = invoices
    .filter((i) => i.status === "SENT" || i.status === "OVERDUE")
    .reduce((sum, i) => sum + i.totalCents, 0);
  const overdueCount = invoices.filter((i) => i.status === "OVERDUE").length;
  const paidTotal = invoices.filter((i) => i.status === "PAID").reduce((sum, i) => sum + i.totalCents, 0);

  const format = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">{t("nav.dashboard")}</h1>

      {revenue?.isSmallBusiness && (revenue.isApproaching || revenue.isExceeded) && (
        <div className={`rounded-lg p-4 mb-6 text-sm ${revenue.isExceeded ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200"}`}>
          {revenue.isExceeded ? (
            <>Umsatzgrenze für die Kleinunternehmerregelung überschritten ({format(revenue.yearRevenueCents)} von {format(revenue.thresholdCents)}). Details unter Einstellungen.</>
          ) : (
            <>Kleinunternehmer-Umsatzgrenze zu {revenue.percentUsed}% erreicht ({format(revenue.yearRevenueCents)} von {format(revenue.thresholdCents)}).</>
          )}
        </div>
      )}

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white dark:bg-slate-800 rounded-lg p-5 shadow">
              <p className="text-sm text-slate-500">Offene Forderungen</p>
              <p className="text-2xl font-semibold">{format(openTotal)}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-5 shadow">
              <p className="text-sm text-slate-500">Überfällige Rechnungen</p>
              <p className="text-2xl font-semibold text-red-600">{overdueCount}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-5 shadow">
              <p className="text-sm text-slate-500">Bezahlt (gesamt)</p>
              <p className="text-2xl font-semibold text-green-600">{format(paidTotal)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Link to="/customers" className="bg-white dark:bg-slate-800 rounded-lg p-5 shadow hover:shadow-md transition-shadow">
              <p className="text-sm text-slate-500">Kunden</p>
              <p className="text-2xl font-semibold">{counts.customers}</p>
            </Link>
            <Link to="/products" className="bg-white dark:bg-slate-800 rounded-lg p-5 shadow hover:shadow-md transition-shadow">
              <p className="text-sm text-slate-500">Produkte &amp; Leistungen</p>
              <p className="text-2xl font-semibold">{counts.products}</p>
            </Link>
            <Link to="/quotes" className="bg-white dark:bg-slate-800 rounded-lg p-5 shadow hover:shadow-md transition-shadow">
              <p className="text-sm text-slate-500">Offene Angebote</p>
              <p className="text-2xl font-semibold">{counts.openQuotes}</p>
            </Link>
          </div>

          <h2 className="text-lg font-medium mb-3">Letzte Rechnungen</h2>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
            {invoices.slice(0, 8).map((inv) => (
              <div key={inv.id} className="grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: "140px 1fr 120px 110px" }}>
                <span className="truncate">{inv.invoiceNumber}</span>
                <span className="truncate">{inv.customer.name}</span>
                <span className="text-right">{format(inv.totalCents)}</span>
                <span className="text-slate-500 text-right">{inv.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
