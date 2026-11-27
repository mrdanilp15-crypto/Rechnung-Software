import { useEffect, useState } from "react";
import { DocumentChain } from "../components/DocumentChain";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AssigneeSelect } from "../components/AssigneeSelect";
import { api } from "../api/client";
import { PdfLink } from "../components/PdfLink";
import { StatusChip } from "../components/StatusChip";
import { useToast } from "../components/Toast";
import { DunningPanel } from "../components/DunningPanel";
import { TemplatePicker } from "../components/TemplatePicker";

import { HelpTip } from "../components/HelpTip";
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
  assigneeId?: string | null;
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
  isSmallBusiness?: boolean;
  correctsInvoice?: { id: string; invoiceNumber: string | null } | null;
  corrections: { id: string; invoiceNumber: string | null }[];
}

const BTN2 = "bg-slate-200 dark:bg-slate-700 px-3 py-2 rounded text-sm";

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
  const [emailCopy, setEmailCopy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reminderText, setReminderText] = useState<string | null>(null);
  const location = useLocation();
  const [showDunning, setShowDunning] = useState(new URLSearchParams(location.search).get("dunning") === "1");

  function load() {
    api.get(`/invoices/${id}`).then((res) => {
      setInvoice(res.data);
      setEmailForm((f) => ({ ...f, to: f.to || res.data.customer.email || "" }));
    });
  }
  useEffect(load, [id]);

  // Von "Rechnung gleich fertigstellen" kommend (?send=1): das E-Mail-Formular gleich öffnen, sobald die Rechnung geladen ist
  useEffect(() => {
    if (!invoice || new URLSearchParams(location.search).get("send") !== "1") return;
    if (invoice.status === "SENT" && !invoice.emailSentAt) setShowEmailForm(true);
    navigate(location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id]);

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

  async function setAssignee(userId: string | null) {
    try {
      await api.patch(`/invoices/${id}/assignee`, { assigneeId: userId });
      load();
    } catch (err: any) {
      setActionError(err.response?.data?.error || "Zuständigkeit konnte nicht geändert werden");
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
        copyToSelf: emailCopy || undefined,
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
      {/* Oben das Wichtigste: wer, wie viel, Stand - darunter nur die 1-2 Schritte, die jetzt dran sind */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">
              {invoice.isCancellationDocument ? <span className="text-red-600">Korrekturbeleg </span> : "Rechnung "}
              {numberLabel}
              <HelpTip topic="invoice" className="ml-2" />
            </h1>
            <p className="text-sm text-slate-500 truncate">{invoice.customer.name}</p>
          </div>
          <StatusChip status={invoice.status} kind="INVOICE" isCancellationDocument={invoice.isCancellationDocument} emailed={invoice.emailStatus === "SENT"} className="mt-1" />
        </div>
        <p className="text-3xl font-semibold tracking-tight mt-3">{format(invoice.totalCents)}</p>
        <p className="text-sm text-slate-500">
          vom {new Date(invoice.issueDate).toLocaleDateString("de-DE")}
          {invoice.dueDate && !invoice.isCancellationDocument && invoice.status !== "PAID" && invoice.status !== "CANCELLED" ? (
            <> · fällig am <span className={invoice.status === "OVERDUE" ? "text-red-600 font-medium" : ""}>{new Date(invoice.dueDate).toLocaleDateString("de-DE")}</span></>
          ) : null}
        </p>
        {invoice.correctsInvoice && (
          <p className="text-sm text-slate-500 mt-1">
            Korrektur zu Rechnung <Link to={`/invoices/${invoice.correctsInvoice.id}`} className="text-brand hover:underline">{invoice.correctsInvoice.invoiceNumber}</Link>
          </p>
        )}
        {invoice.corrections.length > 0 && (
          <p className="text-sm text-slate-500 mt-1">
            Storniert durch:{" "}
            {invoice.corrections.map((c, i) => (
              <span key={c.id}>{i > 0 && ", "}<Link to={`/invoices/${c.id}`} className="text-brand hover:underline">{c.invoiceNumber}</Link></span>
            ))}
          </p>
        )}

        <div className="flex gap-2 flex-wrap mt-4">
          {invoice.status === "DRAFT" && (
            <>
              <button onClick={() => action("send")} title="Vergibt die endgültige Rechnungsnummer. Danach lässt sich die Rechnung nicht mehr ändern, nur noch stornieren." className="bg-brand text-white px-4 py-2 rounded text-sm font-medium">Fertigstellen</button>
              <Link to={`/invoices/${id}/edit`} className={BTN2}>{t("common.edit")}</Link>
            </>
          )}
          {invoice.status !== "DRAFT" && invoice.status !== "CANCELLED" && !invoice.isCancellationDocument && !invoice.emailSentAt && (
            <button onClick={() => setShowEmailForm((v) => !v)} className="bg-brand text-white px-4 py-2 rounded text-sm font-medium">Per E-Mail senden</button>
          )}
          {!invoice.isCancellationDocument && (invoice.status === "SENT" || invoice.status === "OVERDUE") && (
            <button onClick={() => action("mark-paid")} className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium">{t("invoices.markPaid")}</button>
          )}
          <PdfLink url={`/invoices/${id}/pdf`} filename={`${numberLabel}.pdf`} className={BTN2}>PDF</PdfLink>
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer select-none text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Weitere Aktionen</summary>
          <div className="flex gap-2 flex-wrap mt-3">
            {invoice.status === "DRAFT" && <button onClick={handleDelete} className="bg-red-100 text-red-700 px-3 py-2 rounded text-sm">Entwurf verwerfen</button>}
            {invoice.status !== "DRAFT" && invoice.status !== "CANCELLED" && !invoice.isCancellationDocument && invoice.emailSentAt && (
              <button onClick={() => setShowEmailForm((v) => !v)} className={BTN2}>Erneut per E-Mail senden</button>
            )}
            {!invoice.isCancellationDocument && (invoice.status === "SENT" || invoice.status === "OVERDUE") && (
              <button onClick={() => setShowDunning((v) => !v)} className={BTN2}>
                Zahlungserinnerung / Mahnung{invoice.reminderCount > 0 ? ` (Stufe ${invoice.reminderCount})` : ""}
              </button>
            )}
            <button onClick={handleShare} className={BTN2}>Teilen (WhatsApp, Mail, ...)</button>
            {invoice.invoiceNumber && (
              <PdfLink url={`/invoices/${id}/zugferd`} filename={`${numberLabel}-zugferd.pdf`} download className={BTN2} title="PDF mit eingebetteter E-Rechnung (ZUGFeRD / Factur-X) - lesbar für Menschen und Software">E-Rechnung (ZUGFeRD-PDF)</PdfLink>
            )}
            {invoice.invoiceNumber && (
              <PdfLink url={`/invoices/${id}/xrechnung`} filename={`${numberLabel}.xml`} download className={BTN2} title="E-Rechnung im XRechnung-Format (UBL/XML) - z.B. für öffentliche Auftraggeber">E-Rechnung (XRechnung-XML)</PdfLink>
            )}
            {invoice.invoiceNumber && <HelpTip topic="einvoice" />}
            {!invoice.isCancellationDocument && invoice.status !== "DRAFT" && invoice.status !== "CANCELLED" && (
              <button onClick={handleCancel} title="Storniert nur diese Rechnung, nicht den zugrunde liegenden Auftrag." className="bg-red-100 text-red-700 px-3 py-2 rounded text-sm">{t("invoices.cancel")}</button>
            )}
          </div>
          {!invoice.isCancellationDocument && (
            <div className="mt-3 inline-flex items-center gap-1 text-sm">
              <AssigneeSelect value={invoice.assigneeId ?? null} onChange={setAssignee} />
              <HelpTip topic="assignee" />
            </div>
          )}
        </details>
      </div>

      {actionError && <p className="text-red-600 text-sm mb-4">{actionError}</p>}

      {id && (
        <details className="bg-white dark:bg-slate-800 rounded-3xl shadow p-4 mb-4">
          <summary className="cursor-pointer font-medium select-none">Vorgang (Angebot, Auftrag, Lieferschein, Rechnung)<HelpTip topic="chain" className="ml-2" /></summary>
          <div className="mt-3"><DocumentChain kind="INVOICE" id={id} /></div>
        </details>
      )}

      {showDunning && id && <DunningPanel invoiceId={id} onChanged={load} />}

      {reminderText && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow p-4 mb-4 text-sm space-y-2">
          <p className="text-slate-500">Kein E-Mail-Versand eingerichtet - hier der Erinnerungstext zum manuellen Versenden:</p>
          <textarea readOnly value={reminderText} rows={5} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900" />
          <button onClick={() => setReminderText(null)} className="text-sm text-brand hover:underline">Schließen</button>
        </div>
      )}

      {showEmailForm && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow p-4 mb-4 space-y-3">
          <h2 className="font-medium text-sm">Rechnung per E-Mail senden<HelpTip topic="send-mail" className="ml-2" /></h2>
          {id && <TemplatePicker docType="INVOICE" docId={id} onPick={(s, m) => setEmailForm((f) => ({ ...f, subject: s, message: m }))} />}
          <input placeholder="Empfänger-E-Mail" value={emailForm.to} onChange={(e) => setEmailForm((f) => ({ ...f, to: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <input placeholder="Betreff (optional)" value={emailForm.subject} onChange={(e) => setEmailForm((f) => ({ ...f, subject: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <textarea placeholder="Nachricht (optional, sonst Standardtext)" value={emailForm.message} onChange={(e) => setEmailForm((f) => ({ ...f, message: e.target.value }))} rows={4} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={emailCopy} onChange={(e) => setEmailCopy(e.target.checked)} />Kopie an mich senden (verdeckt, an deine Absenderadresse)</label>
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

      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow p-4 mb-4 text-sm grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1">
        <p><strong>E-Mail:</strong> {invoice.customer.email || <span className="text-slate-400">keine hinterlegt</span>}</p>
        <p>
          <strong>E-Mail-Status:</strong>{" "}
          <span className={invoice.emailStatus === "FAILED" ? "text-red-600" : invoice.emailStatus === "SENT" ? "text-green-600" : "text-slate-500"}>
            {emailStatusLabel[invoice.emailStatus]}
          </span>
          {invoice.emailStatus === "FAILED" && invoice.lastEmailError && <span className="text-slate-500"> ({invoice.lastEmailError})</span>}
        </p>
        <p><strong>Zahlungserinnerungen:</strong> {invoice.reminderCount > 0 ? invoice.reminderCount : "keine"}</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow">
        {/* Positionen als Zeilen (alle Bildschirme): Beschreibung, darunter Menge × Einzelpreis, rechts die Summe */}
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {invoice.items.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium whitespace-pre-line">{item.description}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.quantity} {item.unit} × {format(item.unitPriceCents)}</p>
              </div>
              <p className="shrink-0 font-semibold">{format(item.lineTotalCents)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-3xl shadow p-4 mt-4 max-w-xs ml-auto text-sm">
        {/* Kleinunternehmer: kein Netto/USt.-Ausweis, nur der Endbetrag */}
        {!invoice.isSmallBusiness && (
          <>
            <div className="flex justify-between py-1"><span>Netto</span><span>{format(invoice.subtotalCents)}</span></div>
            <div className="flex justify-between py-1"><span>USt.</span><span>{format(invoice.vatTotalCents)}</span></div>
          </>
        )}
        <div className={`flex justify-between py-1 font-semibold ${invoice.isSmallBusiness ? "" : "border-t border-slate-200 dark:border-slate-700 mt-1 pt-1"}`}><span>{t("invoices.total")}</span><span>{format(invoice.totalCents)}</span></div>
        {invoice.isSmallBusiness && <p className="text-xs text-slate-500 mt-1">Keine Umsatzsteuer (Kleinunternehmer, §19 UStG).</p>}
      </div>
    </div>
  );
}
