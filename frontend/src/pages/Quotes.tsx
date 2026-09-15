import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { PdfLink } from "../components/PdfLink";
import { InfoBox } from "../components/InfoBox";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { useToast } from "../components/Toast";
import { MobileCard, MobileField } from "../components/MobileCard";

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
  const navigate = useNavigate();
  const showToast = useToast();
  const [quotes, setQuotes] = useState<Quote[]>([]);

  function load() {
    api.get("/quotes").then((res) => setQuotes(res.data));
  }
  useEffect(load, []);

  const format = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

  async function convert(q: Quote) {
    const { data: invoice } = await api.post(`/quotes/${q.id}/convert-to-invoice`);
    load();
    showToast(`Angebot ${q.quoteNumber} als Rechnung ${invoice.invoiceNumber} angelegt`, "success");
  }

  async function setStatus(q: Quote, status: string) {
    await api.patch(`/quotes/${q.id}/status`, { status });
    load();
    showToast(`${q.quoteNumber}: Status auf "${statusLabel[status] ?? status}" gesetzt`, "success");
  }

  async function handleDelete(q: Quote) {
    if (!confirm(`Angebot "${q.quoteNumber}" wirklich löschen?`)) return;
    await api.delete(`/quotes/${q.id}`);
    load();
    showToast(`Angebot ${q.quoteNumber} gelöscht`, "success");
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">{t("nav.quotes")}</h1>
        <Link to="/quotes/new" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
          Neues Angebot
        </Link>
      </div>
      <InfoBox title="Wozu dient ein Angebot?">
        <p>Ein <strong>unverbindliches Preisangebot</strong> an den Kunden, bevor ein Auftrag zustande kommt. Der Kunde prüft Preis und Leistung und sagt zu oder ab - noch keine rechtliche Verpflichtung.</p>
        <p><strong>1. Schritt im Ablauf:</strong> Angebot erstellen → versenden → Kunde nimmt an oder lehnt ab → bei Annahme direkt mit "→ Rechnung" in eine Rechnung umwandeln (Positionen werden übernommen).</p>
      </InfoBox>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        <div className="hidden md:grid items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500" style={{ gridTemplateColumns: ROW_COLUMNS }}>
          <span>Nummer</span>
          <span>Kunde</span>
          <span className="text-right">Datum</span>
          <span className="text-right">Gültig bis</span>
          <span className="text-right">Betrag</span>
          <span className="text-right">Status</span>
          <span></span>
        </div>
        {quotes.map((q) => {
          const actions = (
            <div className="flex gap-2 justify-end items-center flex-wrap">
              {q.status === "DRAFT" && (
                <button onClick={() => setStatus(q, "SENT")} className="text-brand hover:underline">Versenden</button>
              )}
              {q.status === "SENT" && (
                <>
                  <button onClick={() => setStatus(q, "ACCEPTED")} className="text-green-600 hover:underline">Angenommen</button>
                  <button onClick={() => setStatus(q, "DECLINED")} className="text-red-600 hover:underline">Abgelehnt</button>
                </>
              )}
              {q.status === "ACCEPTED" && (
                <button onClick={() => convert(q)} className="bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded text-sm">→ Rechnung</button>
              )}
              <PdfLink url={`/quotes/${q.id}/pdf`} filename={`${q.quoteNumber}.pdf`} className="text-brand hover:underline">PDF</PdfLink>
              <RowActionsMenu
                actions={[
                  { label: t("common.edit"), onClick: () => navigate(`/quotes/${q.id}/edit`) },
                  { label: t("common.delete"), onClick: () => handleDelete(q), danger: true },
                ]}
              />
            </div>
          );
          return (
            <div key={q.id}>
              {/* Desktop */}
              <div className="hidden md:grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: ROW_COLUMNS }}>
                <span className="font-medium truncate">{q.quoteNumber}</span>
                <span className="truncate">{q.customer.name}</span>
                <span className="text-right text-slate-500">{formatDate(q.issueDate)}</span>
                <span className="text-right text-slate-500">{formatDate(q.validUntil)}</span>
                <span className="text-right">{format(q.totalCents)}</span>
                <span className="text-slate-500 text-right">{statusLabel[q.status] ?? q.status}</span>
                {actions}
              </div>
              {/* Mobile */}
              <MobileCard title={q.quoteNumber} subtitle={q.customer.name}>
                <MobileField label="Datum" value={formatDate(q.issueDate)} />
                <MobileField label="Gültig bis" value={formatDate(q.validUntil)} />
                <MobileField label="Betrag" value={format(q.totalCents)} />
                <MobileField label="Status" value={statusLabel[q.status] ?? q.status} />
                <div className="pt-2">{actions}</div>
              </MobileCard>
            </div>
          );
        })}
        {quotes.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Angebote vorhanden.</p>}
      </div>
    </div>
  );
}
