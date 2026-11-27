import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { StatusChip } from "../components/StatusChip";
import { MobileCard, MobileField } from "../components/MobileCard";
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
  const navigate = useNavigate();
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
        <div>
          <h1 className="text-2xl font-semibold">{customer.name}</h1>
          <p className="text-sm text-slate-500">{customer.customerNumber} · {customer.type === "GEWERBLICH" ? t("customers.business") : t("customers.private")} · Kunde seit {formatDate(customer.createdAt)}</p>
        </div>
        {/* Die häufigsten Schritte für diesen Kunden - Kunde ist im neuen Beleg schon eingetragen */}
        <div className="flex gap-2 flex-wrap">
          <Link to={`/invoices/new?customer=${id}`} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm font-medium">+ Rechnung</Link>
          <Link to={`/quotes/new?customer=${id}`} className="bg-slate-200 dark:bg-slate-700 px-4 py-2 rounded text-sm">+ Angebot</Link>
          <button onClick={() => setShowLabel(true)} className="bg-slate-200 dark:bg-slate-700 px-4 py-2 rounded text-sm">Versandetikett</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 sm:p-5 shadow">
          <p className="text-xs sm:text-sm text-slate-500">Bezahlt</p>
          <p className="text-lg sm:text-2xl font-semibold text-green-600">{formatEuro(paidTotal)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 sm:p-5 shadow">
          <p className="text-xs sm:text-sm text-slate-500">Offen</p>
          <p className={`text-lg sm:text-2xl font-semibold ${openTotal > 0 ? "text-amber-600" : ""}`}>{formatEuro(openTotal)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg p-3 sm:p-5 shadow">
          <p className="text-xs sm:text-sm text-slate-500">Belege</p>
          <p className="text-lg sm:text-2xl font-semibold">{customer.history.invoices.length + customer.history.quotes.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 text-sm space-y-1">
          <h2 className="font-medium mb-2">Kontakt</h2>
          {customer.contactName && <p><strong>Ansprechpartner:</strong> {customer.contactName}</p>}
          {customer.email && <p><strong>E-Mail:</strong> <a href={`mailto:${customer.email}`} className="text-brand hover:underline">{customer.email}</a></p>}
          {customer.phone && <p><strong>Telefon:</strong> <a href={`tel:${customer.phone}`} className="text-brand hover:underline">{customer.phone}</a></p>}
          {!customer.email && !customer.phone && !customer.contactName && <p className="text-slate-400">Keine Kontaktdaten hinterlegt</p>}
          {customer.vatId && <p><strong>USt-IdNr.:</strong> {customer.vatId}</p>}
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 text-sm space-y-1">
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
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-6 text-sm">
          <h2 className="font-medium mb-1">Notizen</h2>
          <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">{customer.notes}</p>
        </div>
      )}

      <h2 className="text-lg font-medium mb-3">Rechnungen</h2>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700 mb-6">
        {customer.history.invoices.map((inv) => (
          <div key={inv.id}>
            {/* Desktop */}
            <Link to={`/invoices/${inv.id}`} className="hidden xl:grid items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700" style={{ gridTemplateColumns: "140px 1fr 100px 100px" }}>
              <span className="font-medium">{inv.invoiceNumber ?? "Entwurf"}</span>
              <span className="text-slate-500">{formatDate(inv.issueDate)}</span>
              <span className="text-right">{formatEuro(inv.totalCents)}</span>
              <span className="text-right"><StatusChip status={inv.status} kind="INVOICE" isCancellationDocument={inv.isCancellationDocument} /></span>
            </Link>
            {/* Mobile */}
            <MobileCard title={inv.invoiceNumber ?? "Entwurf"} subtitle={formatDate(inv.issueDate)} onClick={() => navigate(`/invoices/${inv.id}`)}>
              <MobileField label="Betrag" value={formatEuro(inv.totalCents)} />
              <MobileField label="Status" value={<StatusChip status={inv.status} kind="INVOICE" isCancellationDocument={inv.isCancellationDocument} />} />
            </MobileCard>
          </div>
        ))}
        {customer.history.invoices.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Rechnungen.</p>}
      </div>

      <h2 className="text-lg font-medium mb-3">Angebote</h2>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        {customer.history.quotes.map((q) => (
          <div key={q.id}>
            {/* Desktop */}
            <Link to={`/quotes/${q.id}`} className="hidden xl:grid items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700" style={{ gridTemplateColumns: "140px 1fr 100px 100px" }}>
              <span className="font-medium">{q.quoteNumber ?? "Entwurf"}</span>
              <span className="text-slate-500">{formatDate(q.issueDate)}</span>
              <span className="text-right">{formatEuro(q.totalCents)}</span>
              <span className="text-right"><StatusChip status={q.status} kind="QUOTE" /></span>
            </Link>
            {/* Mobile */}
            <MobileCard title={q.quoteNumber ?? "Entwurf"} subtitle={formatDate(q.issueDate)} onClick={() => navigate(`/quotes/${q.id}`)}>
              <MobileField label="Betrag" value={formatEuro(q.totalCents)} />
              <MobileField label="Status" value={<StatusChip status={q.status} kind="QUOTE" />} />
            </MobileCard>
          </div>
        ))}
        {customer.history.quotes.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Angebote.</p>}
      </div>
      {/* Datenschutz-Werkzeuge braucht man selten - eingeklappt am Ende */}
      <details className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mt-6 text-sm">
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
