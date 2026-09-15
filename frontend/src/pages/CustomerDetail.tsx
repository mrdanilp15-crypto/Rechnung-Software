import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

interface HistoryInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  totalCents: number;
}
interface HistoryQuote {
  id: string;
  quoteNumber: string;
  status: string;
  issueDate: string;
  totalCents: number;
}
interface CustomerDetail {
  id: string;
  customerNumber: string;
  type: "PRIVAT" | "GEWERBLICH";
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country: string;
  vatId?: string;
  notes?: string;
  createdAt: string;
  history: { invoices: HistoryInvoice[]; quotes: HistoryQuote[] };
}

const formatEuro = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const formatDate = (iso: string) => new Intl.DateTimeFormat("de-DE").format(new Date(iso));

export default function CustomerDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);

  useEffect(() => {
    api.get(`/customers/${id}`).then((res) => setCustomer(res.data));
  }, [id]);

  if (!customer) return <p>{t("common.loading")}</p>;

  const paidTotal = customer.history.invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.totalCents, 0);
  const openTotal = customer.history.invoices.filter((i) => i.status === "SENT" || i.status === "OVERDUE").reduce((s, i) => s + i.totalCents, 0);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/customers" className="text-brand hover:underline text-sm">&larr; Kunden</Link>
      </div>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-semibold">{customer.name}</h1>
          <p className="text-sm text-slate-500">{customer.customerNumber} · {customer.type === "GEWERBLICH" ? t("customers.business") : t("customers.private")} · Kunde seit {formatDate(customer.createdAt)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-5 shadow">
          <p className="text-sm text-slate-500">Bezahlt (gesamt)</p>
          <p className="text-2xl font-semibold text-green-600">{formatEuro(paidTotal)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-5 shadow">
          <p className="text-sm text-slate-500">Offen</p>
          <p className="text-2xl font-semibold">{formatEuro(openTotal)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-5 shadow">
          <p className="text-sm text-slate-500">Rechnungen / Angebote</p>
          <p className="text-2xl font-semibold">{customer.history.invoices.length} / {customer.history.quotes.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 text-sm space-y-1">
          <h2 className="font-medium mb-2">Kontakt</h2>
          {customer.contactName && <p><strong>Ansprechpartner:</strong> {customer.contactName}</p>}
          <p><strong>E-Mail:</strong> {customer.email || <span className="text-slate-400">-</span>}</p>
          <p><strong>Telefon:</strong> {customer.phone || <span className="text-slate-400">-</span>}</p>
          {customer.vatId && <p><strong>USt-IdNr.:</strong> {customer.vatId}</p>}
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 text-sm space-y-1">
          <h2 className="font-medium mb-2">Adresse</h2>
          <p>{customer.street || <span className="text-slate-400">Keine Adresse hinterlegt</span>}</p>
          <p>{[customer.postalCode, customer.city].filter(Boolean).join(" ")}</p>
          <p>{customer.country}</p>
        </div>
      </div>

      {customer.notes && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-6 text-sm">
          <h2 className="font-medium mb-1">Notizen</h2>
          <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">{customer.notes}</p>
        </div>
      )}

      <h2 className="text-lg font-medium mb-3">Rechnungen</h2>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700 mb-6 overflow-x-auto">
        {customer.history.invoices.map((inv) => (
          <Link key={inv.id} to={`/invoices/${inv.id}`} className="grid items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700" style={{ gridTemplateColumns: "140px 1fr 100px 100px" }}>
            <span className="font-medium">{inv.invoiceNumber}</span>
            <span className="text-slate-500">{formatDate(inv.issueDate)}</span>
            <span className="text-right">{formatEuro(inv.totalCents)}</span>
            <span className="text-right text-slate-500">{inv.status}</span>
          </Link>
        ))}
        {customer.history.invoices.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Rechnungen.</p>}
      </div>

      <h2 className="text-lg font-medium mb-3">Angebote</h2>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700 overflow-x-auto">
        {customer.history.quotes.map((q) => (
          <div key={q.id} className="grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: "140px 1fr 100px 100px" }}>
            <span className="font-medium">{q.quoteNumber}</span>
            <span className="text-slate-500">{formatDate(q.issueDate)}</span>
            <span className="text-right">{formatEuro(q.totalCents)}</span>
            <span className="text-right text-slate-500">{q.status}</span>
          </div>
        ))}
        {customer.history.quotes.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Angebote.</p>}
      </div>
    </div>
  );
}
