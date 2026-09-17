import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { PdfLink } from "../components/PdfLink";
import { MobileCard, MobileField } from "../components/MobileCard";
import { useToast } from "../components/Toast";

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  lineTotalCents: number;
}
interface Invoice {
  id: string;
  invoiceNumber: string | null;
  status: string;
  issueDate: string;
  dueDate?: string;
  subtotalCents: number;
  vatTotalCents: number;
  totalCents: number;
  customer: { name: string; city?: string; email?: string };
  items: InvoiceItem[];
  emailStatus: "NOT_SENT" | "SENT" | "FAILED";
  emailSentAt?: string;
  lastEmailError?: string;
  reminderCount: number;
  lastReminderAt?: string;
  complianceWarnings: string[];
  isCancellationDocument: boolean;
  correctsInvoice?: { id: string; invoiceNumber: string | null } | null;
  corrections: { id: string; invoiceNumber: string | null }[];
}

const emailStatusLabel: Record<string, string> = {
  NOT_SENT: "Noch nicht per E-Mail versendet",
  SENT: "Per E-Mail versendet",
  FAILED: "E-Mail-Versand fehlgeschlagen",
};

export default function InvoiceDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showToast = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailForm, setEmailForm] = useState({ to: "", subject: "", message: "" });
  const [emailSending, setEmailSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reminderText, setReminderText] = useState<string | null>(null);

  function load() {
    api.get(`/invoices/${id}`).then((res) => {
      setInvoice(res.data);
      setEmailForm((f) => ({ ...f, to: f.to || res.data.customer.email || "" }));
    });
  }
  useEffect(load, [id]);

  const format = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

  async function action(path: string) {
    setActionError(null);
    try {
      await api.post(`/invoices/${id}/${path}`);
      load();
    } catch (err: any) {
      setActionError(err.response?.data?.error || t("common.error"));
    }
  }

  async function handleDelete() {
    if (!invoice) return;
    if (!confirm("Diesen Entwurf wirklich löschen?")) return;
    await api.delete(`/invoices/${id}`);
    navigate("/invoices");
  }

  async function handleCancel() {
    if (!invoice) return;
    const reason = prompt("Grund für die Stornierung (optional, erscheint auf dem Korrekturbeleg):") || undefined;
    setActionError(null);
    try {
      const { data } = await api.post(`/invoices/${id}/cancel`, { reason });
      showToast(`Rechnung storniert, Korrekturbeleg ${data.invoiceNumber} erstellt`, "success");
      navigate(`/invoices/${data.id}`);
    } catch (err: any) {
      setActionError(err.response?.data?.error || t("common.error"));
    }
  }

  async function handleSendEmail() {
    setEmailSending(true);
    setActionError(null);
    try {
      await api.post(`/invoices/${id}/send-email`, {
        to: emailForm.to || undefined,
        subject: emailForm.subject || undefined,
        message: emailForm.message || undefined,
      });
      setShowEmailForm(false);
      load();
    } catch (err: any) {
      setActionError(err.response?.data?.error || t("common.error"));
    } finally {
      setEmailSending(false);
    }
  }

  async function handleShare() {
    if (!invoice) return;
    const numberLabel = invoice.invoiceNumber ?? "entwurf";
    try {
      const res = await api.get(`/invoices/${id}/pdf`, { responseType: "blob" });
      const file = new File([res.data], `${numberLabel}.pdf`, { type: "application/pdf" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: numberLabel });
      } else {
        window.open(URL.createObjectURL(res.data), "_blank");
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") setActionError("Teilen wird von diesem Browser nicht unterstützt - bitte PDF herunterladen.");
    }
  }

  async function handleRemind() {
    setActionError(null);
    try {
      const { data } = await api.post(`/invoices/${id}/remind`);
      setReminderText(data.emailSent ? null : data.reminderText);
      load();
    } catch (err: any) {
      setActionError(err.response?.data?.error || t("common.error"));
    }
  }

  if (!invoice) return <p>{t("common.loading")}</p>;
  const numberLabel = invoice.invoiceNumber ?? "Entwurf";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {invoice.isCancellationDocument && <span className="text-red-600">Korrekturbeleg </span>}
            {numberLabel}
          </h1>
          {invoice.correctsInvoice && (
            <p className="text-sm text-slate-500">
              Korrektur zu Rechnung{" "}
              <Link to={`/invoices/${invoice.correctsInvoice.id}`} className="text-brand hover:underline">
                {invoice.correctsInvoice.invoiceNumber}
              </Link>
            </p>
          )}
          {invoice.corrections.length > 0 && (
            <p className="text-sm text-slate-500">
              Storniert durch:{" "}
              {invoice.corrections.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ", "}
                  <Link to={`/invoices/${c.id}`} className="text-brand hover:underline">{c.invoiceNumber}</Link>
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap sm:justify-end">
          {invoice.status === "DRAFT" && (
            <>
              <Link to={`/invoices/${id}/edit`} className="bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded text-sm">
                {t("common.edit")}
              </Link>
              <button onClick={handleDelete} className="bg-red-100 text-red-700 px-3 py-1.5 rounded text-sm">{t("common.delete")}</button>
              <button onClick={() => action("send")} className="bg-brand text-white px-3 py-1.5 rounded text-sm">{t("invoices.send")}</button>
            </>
          )}
          {!invoice.isCancellationDocument && (invoice.status === "SENT" || invoice.status === "OVERDUE") && (
            <>
              <button onClick={() => action("mark-paid")} className="bg-green-600 text-white px-3 py-1.5 rounded text-sm">{t("invoices.markPaid")}</button>
              <button onClick={handleRemind} className="bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded text-sm">
                Zahlungserinnerung {invoice.reminderCount > 0 ? `(#${invoice.reminderCount + 1})` : ""}
              </button>
            </>
          )}
          {!invoice.isCancellationDocument && invoice.status !== "DRAFT" && invoice.status !== "CANCELLED" && (
            <button onClick={handleCancel} className="bg-red-100 text-red-700 px-3 py-1.5 rounded text-sm">{t("invoices.cancel")}</button>
          )}
          {(invoice.status === "DRAFT" || invoice.status === "SENT") && (
            <button onClick={() => setShowEmailForm((v) => !v)} className="bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded text-sm">
              Per E-Mail senden
            </button>
          )}
          <PdfLink url={`/invoices/${id}/pdf`} filename={`${numberLabel}.pdf`} className="bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded text-sm">
            {t("invoices.downloadPdf")}
          </PdfLink>
          <button onClick={handleShare} className="bg-slate-200 dark:bg-slate-700 px-3 py-1.5 rounded text-sm">
            Teilen (WhatsApp, Mail, ...)
          </button>
        </div>
      </div>

      {actionError && <p className="text-red-600 text-sm mb-4">{actionError}</p>}

      {reminderText && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4 text-sm space-y-2">
          <p className="text-slate-500">Kein E-Mail-Versand eingerichtet - hier der Erinnerungstext zum manuellen Versenden:</p>
          <textarea readOnly value={reminderText} rows={5} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900" />
          <button onClick={() => setReminderText(null)} className="text-sm text-brand hover:underline">Schließen</button>
        </div>
      )}

      {showEmailForm && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4 space-y-3">
          <h2 className="font-medium text-sm">Rechnung per E-Mail senden</h2>
          <input placeholder="Empfänger-E-Mail" value={emailForm.to} onChange={(e) => setEmailForm((f) => ({ ...f, to: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <input placeholder="Betreff (optional)" value={emailForm.subject} onChange={(e) => setEmailForm((f) => ({ ...f, subject: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <textarea placeholder="Nachricht (optional, sonst Standardtext)" value={emailForm.message} onChange={(e) => setEmailForm((f) => ({ ...f, message: e.target.value }))} rows={4} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <div className="flex gap-2">
            <button disabled={emailSending} onClick={handleSendEmail} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm disabled:opacity-50">
              {emailSending ? "Wird gesendet..." : "Senden"}
            </button>
            <button onClick={() => setShowEmailForm(false)} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm">Abbrechen</button>
          </div>
        </div>
      )}

      {invoice.complianceWarnings.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-lg p-4 mb-4 text-sm">
          <p className="font-medium mb-1">Hinweise zu Pflichtangaben:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {invoice.complianceWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4 text-sm grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1">
        <p><strong>{t("invoices.customer")}:</strong> {invoice.customer.name}</p>
        <p><strong>E-Mail:</strong> {invoice.customer.email || <span className="text-slate-400">keine hinterlegt</span>}</p>
        <p><strong>{t("invoices.status")}:</strong> {invoice.status}</p>
        <p><strong>Rechnungsdatum:</strong> {new Date(invoice.issueDate).toLocaleDateString("de-DE")}</p>
        <p><strong>{t("invoices.dueDate")}:</strong> {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("de-DE") : "-"}</p>
        <p>
          <strong>E-Mail-Status:</strong>{" "}
          <span className={invoice.emailStatus === "FAILED" ? "text-red-600" : invoice.emailStatus === "SENT" ? "text-green-600" : "text-slate-500"}>
            {emailStatusLabel[invoice.emailStatus]}
          </span>
          {invoice.emailStatus === "FAILED" && invoice.lastEmailError && <span className="text-slate-500"> ({invoice.lastEmailError})</span>}
        </p>
        <p><strong>Zahlungserinnerungen:</strong> {invoice.reminderCount > 0 ? invoice.reminderCount : "keine"}</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow">
        {/* Desktop */}
        <table className="hidden md:table w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700">
            <tr>
              <th className="text-left p-3">Beschreibung</th>
              <th className="text-right p-3">Menge</th>
              <th className="text-right p-3">Einzelpreis</th>
              <th className="text-right p-3">Summe</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                <td className="p-3">{item.description}</td>
                <td className="p-3 text-right whitespace-nowrap">{item.quantity} {item.unit}</td>
                <td className="p-3 text-right whitespace-nowrap">{format(item.unitPriceCents)}</td>
                <td className="p-3 text-right whitespace-nowrap">{format(item.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Mobile */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700">
          {invoice.items.map((item) => (
            <MobileCard key={item.id} title={item.description}>
              <MobileField label="Menge" value={`${item.quantity} ${item.unit}`} />
              <MobileField label="Einzelpreis" value={format(item.unitPriceCents)} />
              <MobileField label="Summe" value={format(item.lineTotalCents)} />
            </MobileCard>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mt-4 max-w-xs ml-auto text-sm">
        <div className="flex justify-between py-1"><span>Netto</span><span>{format(invoice.subtotalCents)}</span></div>
        <div className="flex justify-between py-1"><span>USt.</span><span>{format(invoice.vatTotalCents)}</span></div>
        <div className="flex justify-between py-1 font-semibold border-t border-slate-200 dark:border-slate-700 mt-1 pt-1"><span>{t("invoices.total")}</span><span>{format(invoice.totalCents)}</span></div>
      </div>
    </div>
  );
}
