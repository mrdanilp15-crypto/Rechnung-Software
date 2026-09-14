import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { InfoBox } from "../components/InfoBox";

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  issueDate: string;
  dueDate?: string;
  emailStatus: "NOT_SENT" | "SENT" | "FAILED";
  customer: { name: string };
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-200 text-slate-700",
  SENT: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-400 line-through",
};

const ROW_COLUMNS = "28px 130px 1fr 100px 100px 110px 100px 70px";
const formatDate = (iso?: string) => (iso ? new Intl.DateTimeFormat("de-DE").format(new Date(iso)) : "-");

export default function Invoices() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    api
      .get("/invoices")
      .then((res) => setInvoices(res.data))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const format = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

  const deletableInvoices = invoices.filter((inv) => inv.status === "DRAFT");
  const allDeletableSelected = deletableInvoices.length > 0 && deletableInvoices.every((inv) => selected.includes(inv.id));

  function toggleSelected(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    setSelected(allDeletableSelected ? [] : deletableInvoices.map((inv) => inv.id));
  }

  async function handleBulkDelete() {
    if (selected.length === 0) return;
    if (!confirm(`${selected.length} Rechnung(en) wirklich löschen? Dies betrifft nur Entwürfe, bereits versendete Rechnungen werden dabei übersprungen.`)) return;
    setDeleting(true);
    setMessage(null);
    try {
      const res = await api.post<{ deletedCount: number; skippedIds: string[] }>("/invoices/bulk-delete", { ids: selected });
      setMessage(
        res.data.skippedIds.length > 0
          ? `${res.data.deletedCount} gelöscht, ${res.data.skippedIds.length} übersprungen (bereits versendet und daher nicht löschbar).`
          : `${res.data.deletedCount} Rechnung(en) gelöscht.`
      );
      setSelected([]);
      load();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">{t("invoices.title")}</h1>
        <Link to="/invoices/new" className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
          {t("invoices.new")}
        </Link>
      </div>
      <InfoBox title="Wozu dient eine Rechnung?">
        <p>Die eigentliche <strong>Zahlungsaufforderung</strong> an den Kunden - meist nach Lieferung/Fertigstellung erstellt. Enthält Preise, MwSt. und Zahlungsziel.</p>
        <p>Kann direkt aus einem angenommenen Angebot erzeugt werden (siehe Angebote → "→ Rechnung") oder frei erfasst werden. Einmal versendete Rechnungen können aus rechtlichen Gründen (GoBD) nicht mehr geändert, nur noch storniert werden.</p>
      </InfoBox>
      {message && <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{message}</p>}
      {selected.length > 0 && (
        <div className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg shadow px-4 py-2 mb-4">
          <span className="text-sm">{selected.length} ausgewählt</span>
          <button
            onClick={handleBulkDelete}
            disabled={deleting}
            className="text-red-600 hover:underline text-sm disabled:opacity-50"
          >
            {deleting ? "Wird gelöscht..." : "Ausgewählte löschen"}
          </button>
        </div>
      )}
      {loading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
          <div className="grid items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500" style={{ gridTemplateColumns: ROW_COLUMNS }}>
            <input
              type="checkbox"
              checked={allDeletableSelected}
              onChange={toggleSelectAll}
              disabled={deletableInvoices.length === 0}
              title="Alle Entwürfe auswählen"
            />
            <span>Nummer</span>
            <span>Kunde</span>
            <span className="text-right">Datum</span>
            <span className="text-right">Fällig am</span>
            <span className="text-right">Betrag</span>
            <span className="text-right">Status</span>
            <span className="text-right">E-Mail</span>
          </div>
          {invoices.map((inv) => (
            <div
              key={inv.id}
              onClick={() => navigate(`/invoices/${inv.id}`)}
              className="grid items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
              style={{ gridTemplateColumns: ROW_COLUMNS }}
            >
              <input
                type="checkbox"
                checked={selected.includes(inv.id)}
                disabled={inv.status !== "DRAFT"}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleSelected(inv.id)}
                title={inv.status !== "DRAFT" ? "Nur Entwürfe können gelöscht werden" : undefined}
              />
              <span className="font-medium truncate">{inv.invoiceNumber}</span>
              <span className="truncate">{inv.customer.name}</span>
              <span className="text-right text-slate-500">{formatDate(inv.issueDate)}</span>
              <span className={`text-right ${inv.status === "OVERDUE" ? "text-red-600 font-medium" : "text-slate-500"}`}>{formatDate(inv.dueDate)}</span>
              <span className="text-right">{format(inv.totalCents)}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs justify-self-end ${statusColors[inv.status] ?? ""}`}>
                {t(`invoices.${inv.status.toLowerCase()}`)}
              </span>
              <span className="text-right text-xs text-slate-400" title="E-Mail-Status">
                {inv.emailStatus === "SENT" ? "✓ gesendet" : inv.emailStatus === "FAILED" ? "✕ Fehler" : "-"}
              </span>
            </div>
          ))}
          {invoices.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Rechnungen vorhanden.</p>}
        </div>
      )}
    </div>
  );
}
