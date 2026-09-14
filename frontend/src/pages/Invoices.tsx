import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  dueDate?: string;
  customer: { name: string };
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-200 text-slate-700",
  SENT: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-400 line-through",
};

export default function Invoices() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/invoices")
      .then((res) => setInvoices(res.data))
      .finally(() => setLoading(false));
  }, []);

  const format = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">{t("invoices.title")}</h1>
        <Link to="/invoices/new" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
          {t("invoices.new")}
        </Link>
      </div>
      {loading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
          {invoices.map((inv) => (
            <Link
              key={inv.id}
              to={`/invoices/${inv.id}`}
              className="grid items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
              style={{ gridTemplateColumns: "140px 1fr 120px 110px" }}
            >
              <span className="font-medium truncate">{inv.invoiceNumber}</span>
              <span className="truncate">{inv.customer.name}</span>
              <span className="text-right">{format(inv.totalCents)}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs justify-self-end ${statusColors[inv.status] ?? ""}`}>
                {t(`invoices.${inv.status.toLowerCase()}`)}
              </span>
            </Link>
          ))}
          {invoices.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Rechnungen vorhanden.</p>}
        </div>
      )}
    </div>
  );
}
