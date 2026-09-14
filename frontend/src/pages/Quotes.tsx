import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { PdfLink } from "../components/PdfLink";

interface Quote {
  id: string;
  quoteNumber: string;
  status: string;
  totalCents: number;
  issueDate: string;
  validUntil?: string;
  customer: { name: string };
}

const statusLabel: Record<string, string> = {
  DRAFT: "Entwurf",
  SENT: "Versendet",
  ACCEPTED: "Angenommen",
  DECLINED: "Abgelehnt",
  EXPIRED: "Abgelaufen",
};

const ROW_COLUMNS = "120px 1fr 100px 100px 100px 90px 300px";
const formatDate = (iso?: string) => (iso ? new Intl.DateTimeFormat("de-DE").format(new Date(iso)) : "-");

export default function Quotes() {
  const { t } = useTranslation();
  const [quotes, setQuotes] = useState<Quote[]>([]);

  function load() {
    api.get("/quotes").then((res) => setQuotes(res.data));
  }
  useEffect(load, []);

  const format = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

  async function convert(id: string) {
    await api.post(`/quotes/${id}/convert-to-invoice`);
    load();
  }

  async function setStatus(id: string, status: string) {
    await api.patch(`/quotes/${id}/status`, { status });
    load();
  }

  async function handleDelete(q: Quote) {
    if (!confirm(`Entwurf "${q.quoteNumber}" wirklich löschen?`)) return;
    await api.delete(`/quotes/${q.id}`);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">{t("nav.quotes")}</h1>
        <Link to="/quotes/new" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
          Neues Angebot
        </Link>
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        <div className="grid items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500" style={{ gridTemplateColumns: ROW_COLUMNS }}>
          <span>Nummer</span>
          <span>Kunde</span>
          <span className="text-right">Datum</span>
          <span className="text-right">Gültig bis</span>
          <span className="text-right">Betrag</span>
          <span className="text-right">Status</span>
          <span></span>
        </div>
        {quotes.map((q) => (
          <div key={q.id} className="grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: ROW_COLUMNS }}>
            <span className="font-medium truncate">{q.quoteNumber}</span>
            <span className="truncate">{q.customer.name}</span>
            <span className="text-right text-slate-500">{formatDate(q.issueDate)}</span>
            <span className="text-right text-slate-500">{formatDate(q.validUntil)}</span>
            <span className="text-right">{format(q.totalCents)}</span>
            <span className="text-slate-500 text-right">{statusLabel[q.status] ?? q.status}</span>
            <div className="flex gap-3 justify-end flex-wrap">
              <PdfLink url={`/quotes/${q.id}/pdf`} filename={`${q.quoteNumber}.pdf`} className="text-brand hover:underline">PDF</PdfLink>
              {q.status === "DRAFT" && (
                <>
                  <Link to={`/quotes/${q.id}/edit`} className="text-brand hover:underline">{t("common.edit")}</Link>
                  <button onClick={() => handleDelete(q)} className="text-red-600 hover:underline">{t("common.delete")}</button>
                  <button onClick={() => setStatus(q.id, "SENT")} className="text-brand hover:underline">Versenden</button>
                </>
              )}
              {q.status === "SENT" && (
                <>
                  <button onClick={() => setStatus(q.id, "ACCEPTED")} className="text-green-600 hover:underline">Angenommen</button>
                  <button onClick={() => setStatus(q.id, "DECLINED")} className="text-red-600 hover:underline">Abgelehnt</button>
                </>
              )}
              {q.status === "ACCEPTED" && (
                <button onClick={() => convert(q.id)} className="text-brand hover:underline">→ Rechnung</button>
              )}
            </div>
          </div>
        ))}
        {quotes.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Angebote vorhanden.</p>}
      </div>
    </div>
  );
}
