import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { StatusIcon, statusInfo } from "../components/StatusChip";
import { PdfLink } from "../components/PdfLink";
import { LabelDialog } from "../components/LabelDialog";
import { useAuthStore } from "../store/authStore";
import { useToast } from "../components/Toast";

interface HistoryInvoice {
  id: string;
  invoiceNumber: string | null;
  status: string;
  isCancellationDocument?: boolean;
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
  const isAdmin = useAuthStore((s) => s.user?.role) === "ADMIN";
  const showToast = useToast();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [showLabel, setShowLabel] = useState(false);

  function load() {
    api.get(`/customers/${id}`).then((res) => setCustomer(res.data));
  }
  useEffect(load, [id]);

  async function handleGdprErase() {
    if (!customer) return;
    if (!confirm(`Personenbezogene Daten von "${customer.name}" (Name, Adresse, E-Mail, Telefon, Notizen) unwiderruflich anonymisieren? Rechnungen/Belege selbst bleiben aus gesetzlichen Aufbewahrungsgründen erhalten. Das kann nicht rückgängig gemacht werden.`)) return;
    await api.post(`/customers/${id}/gdpr-erase`);
    showToast("Kundendaten anonymisiert", "success");
    load();
  }

  if (!customer) return <p>{t("common.loading")}</p>;

  const paidTotal = customer.history.invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.totalCents, 0);
  const openTotal = customer.history.invoices.filter((i) => !i.isCancellationDocument && (i.status === "SENT" || i.status === "OVERDUE")).reduce((s, i) => s + i.totalCents, 0);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/customers" className="text-brand hover:underline text-sm">&larr; Kunden</Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold shrink-0 ${customer.type === "GEWERBLICH" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>{customer.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"}</span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight truncate">{customer.name}</h1>
            <p className="text-sm text-slate-500">{customer.customerNumber} · {customer.type === "GEWERBLICH" ? t("customers.business") : t("customers.private")} · Kunde seit {formatDate(customer.createdAt)}</p>
          </div>
        </div>
        {/* Die häufigsten Schritte für diesen Kunden - Kunde ist im neuen Beleg schon eingetragen */}
        <div className="flex gap-2 flex-wrap">
          <Link to={`/invoices/new?customer=${id}`} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg shadow-brand/20">+ Rechnung</Link>
          <Link to={`/quotes/new?customer=${id}`} className="bg-white shadow px-4 py-2 rounded-full text-sm font-medium">+ Angebot</Link>
          <button onClick={() => setShowLabel(true)} className="bg-white shadow px-4 py-2 rounded-full text-sm font-medium">Versandetikett</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-3.5 sm:p-5 shadow">
          <p className="text-xs sm:text-sm text-slate-500">Bezahlt</p>
          <p className="text-lg sm:text-2xl font-semibold text-green-600">{formatEuro(paidTotal)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-3.5 sm:p-5 shadow">
          <p className="text-xs sm:text-sm text-slate-500">Offen</p>
          <p className={`text-lg sm:text-2xl font-semibold ${openTotal > 0 ? "text-amber-600" : ""}`}>{formatEuro(openTotal)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-3.5 sm:p-5 shadow">
          <p className="text-xs sm:text-sm text-slate-500">Belege</p>
          <p className="text-lg sm:text-2xl font-semibold">{customer.history.invoices.length + customer.history.quotes.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow p-4 sm:p-5 text-sm space-y-1">
          <h2 className="font-medium mb-2">Kontakt</h2>
          {customer.contactName && <p><strong>Ansprechpartner:</strong> {customer.contactName}</p>}
          {customer.email && <p><strong>E-Mail:</strong> <a href={`mailto:${customer.email}`} className="text-brand hover:underline">{customer.email}</a></p>}
          {customer.phone && <p><strong>Telefon:</strong> <a href={`tel:${customer.phone}`} className="text-brand hover:underline">{customer.phone}</a></p>}
          {!customer.email && !customer.phone && !customer.contactName && <p className="text-slate-400">Keine Kontaktdaten hinterlegt</p>}
          {customer.vatId && <p><strong>USt-IdNr.:</strong> {customer.vatId}</p>}
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow p-4 sm:p-5 text-sm space-y-1">
          <h2 className="font-medium mb-2">Adresse</h2>
          {customer.street || customer.postalCode || customer.city ? (
            <>
              {customer.street && <p>{customer.street}</p>}
              <p>{[customer.postalCode, customer.city].filter(Boolean).join(" ")}</p>
              {customer.country && customer.country !== "DE" && <p>{customer.country}</p>}
              {!customer.street && <p className="text-xs text-amber-600 mt-1">Straße fehlt - für Rechnungen über 250 € (Pflichtangabe) und für den Versand ergänzen.</p>}
            </>
          ) : (
            <p className="text-slate-400">Keine Adresse hinterlegt</p>
          )}
        </div>
      </div>

      {customer.notes && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow p-4 sm:p-5 mb-6 text-sm">
          <h2 className="font-medium mb-1">Notizen</h2>
          <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">{customer.notes}</p>
        </div>
      )}

      <h2 className="text-xs font-medium text-slate-500 px-1 mb-1.5">Rechnungen</h2>
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow divide-y divide-slate-100 dark:divide-slate-700 mb-6">
        {customer.history.invoices.map((inv) => (
          <div key={inv.id}>
            <Link to={`/invoices/${inv.id}`} className="flex items-center gap-3 px-3 md:px-4 py-2.5 hover:bg-slate-50/70 first:rounded-t-3xl last:rounded-b-3xl">
              <StatusIcon status={inv.status} kind="INVOICE" isCancellationDocument={inv.isCancellationDocument} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium truncate">{inv.invoiceNumber ?? "Entwurf"}</span>
                <span className="block text-xs text-slate-500 truncate">{formatDate(inv.issueDate)} · {statusInfo(inv.status, { kind: "INVOICE", isCancellationDocument: inv.isCancellationDocument }).label}</span>
              </span>
              <span className="shrink-0 font-semibold text-sm">{formatEuro(inv.totalCents)}</span>
            </Link>
          </div>
        ))}
        {customer.history.invoices.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Rechnungen.</p>}
      </div>

      <h2 className="text-xs font-medium text-slate-500 px-1 mb-1.5">Angebote</h2>
      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow divide-y divide-slate-100 dark:divide-slate-700">
        {customer.history.quotes.map((q) => (
          <div key={q.id}>
            <Link to={`/quotes/${q.id}`} className="flex items-center gap-3 px-3 md:px-4 py-2.5 hover:bg-slate-50/70 first:rounded-t-3xl last:rounded-b-3xl">
              <StatusIcon status={q.status} kind="QUOTE" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium truncate">{q.quoteNumber ?? "Entwurf"}</span>
                <span className="block text-xs text-slate-500 truncate">{formatDate(q.issueDate)} · {statusInfo(q.status, { kind: "QUOTE" }).label}</span>
              </span>
              <span className="shrink-0 font-semibold text-sm">{formatEuro(q.totalCents)}</span>
            </Link>
          </div>
        ))}
        {customer.history.quotes.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Angebote.</p>}
      </div>
      {/* Datenschutz-Werkzeuge braucht man selten - eingeklappt am Ende */}
      <details className="bg-white dark:bg-slate-800 rounded-3xl shadow p-4 sm:p-5 mt-6 text-sm">
        <summary className="cursor-pointer select-none font-medium">Datenschutz (DSGVO)</summary>
        <p className="text-slate-500 mt-2 mb-3">Wenn der Kunde wissen möchte, welche Daten du über ihn speicherst, oder die Löschung verlangt.</p>
        <div className="flex gap-2 flex-wrap">
          <PdfLink url={`/customers/${id}/gdpr-export.pdf`} filename={`datenauskunft-${customer.customerNumber}.pdf`} download className="bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded text-sm" title="Lesbare Datenauskunft nach Art. 15 DSGVO als PDF - zum Weitergeben an den Kunden">
            Datenauskunft (PDF)
          </PdfLink>
          <PdfLink url={`/customers/${id}/gdpr-export`} filename={`dsgvo-export-${customer.customerNumber}.json`} download className="bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded text-sm" title="Maschinenlesbare Rohdaten (JSON), z.B. zur Datenübertragung">
            Rohdaten (JSON)
          </PdfLink>
          {isAdmin && (
            <button onClick={handleGdprErase} className="bg-red-100 text-red-700 px-3 py-1.5 rounded text-sm">
              Anonymisieren
            </button>
          )}
        </div>
      </details>
      {showLabel && <LabelDialog baseUrl={`/labels/customer/${id}`} title={customer.name} onClose={() => setShowLabel(false)} />}
    </div>
  );
}
