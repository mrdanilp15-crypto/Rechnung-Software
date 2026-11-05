import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { DocumentChain } from "../components/DocumentChain";
import { PdfLink } from "../components/PdfLink";
import { SendDocumentDialog } from "../components/SendDocumentDialog";
import { StatusChip } from "../components/StatusChip";
import { useToast } from "../components/Toast";
import { Panel } from "../components/dashboard/widgets";

/** Angebotsseite: Zusammenfassung, Positionen, Aktionen (senden, annehmen, ablehnen, nachfassen) und die ganze Belegkette des Vorgangs. */

interface Quote {
  id: string;
  quoteNumber: string;
  status: string;
  issueDate: string;
  validUntil: string | null;
  subtotalCents: number;
  vatTotalCents: number;
  totalCents: number;
  emailSentAt: string | null;
  notes?: string | null;
  customer: { id: string; name: string; email: string | null; phone?: string | null };
  items: { id: string; description: string; quantity: number; unit: string; unitPriceCents: number; lineTotalCents: number }[];
}

const money = (c: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100);
const day = (iso: string) => new Intl.DateTimeFormat("de-DE").format(new Date(iso));

export default function QuoteDetail() {
  const { id } = useParams();
  const showToast = useToast();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [send, setSend] = useState<{ followUp: boolean } | null>(null);
  const [chainKey, setChainKey] = useState(0);

  const load = useCallback(() => {
    api.get(`/quotes/${id}`).then((r) => setQuote(r.data)).catch((e) => setError(e?.response?.data?.error ?? "Angebot konnte nicht geladen werden."));
  }, [id]);
  useEffect(load, [load]);

  async function setStatus(status: string, label: string) {
    try {
      await api.patch(`/quotes/${id}/status`, { status });
      showToast(`${quote?.quoteNumber}: ${label}`, "success");
      load();
      setChainKey((k) => k + 1);
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "Status konnte nicht geändert werden", "error");
    }
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!quote) return <p>Wird geladen ...</p>;
  if (quote.status === "DRAFT") return <Navigate to={`/quotes/${quote.id}/edit`} replace />;

  const open = quote.status === "SENT" || quote.status === "EXPIRED";
  return (
    <div className="max-w-5xl">
      <Link to="/documents?type=QUOTE" className="text-sm text-slate-500 hover:underline">← Belege</Link>
      <div className="flex flex-wrap items-center gap-3 mt-1 mb-1">
        <h1 className="text-2xl font-semibold">Angebot {quote.quoteNumber}</h1>
        <StatusChip status={quote.status} kind="QUOTE" emailed={!!quote.emailSentAt} />
      </div>
      <p className="text-sm text-slate-500 mb-4">
        <Link to={`/customers/${quote.customer.id}`} className="text-brand hover:underline">{quote.customer.name}</Link>
        {quote.customer.email ? ` · ${quote.customer.email}` : ""} · vom {day(quote.issueDate)}{quote.validUntil ? ` · gültig bis ${day(quote.validUntil)}` : ""}
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <PdfLink url={`/quotes/${quote.id}/pdf`} filename={`${quote.quoteNumber}.pdf`} className="px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600">PDF ansehen</PdfLink>
        <button type="button" onClick={() => setSend({ followUp: false })} className="px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600">{quote.emailSentAt ? "Erneut senden" : "Per E-Mail senden"}</button>
        {open && <button type="button" onClick={() => setSend({ followUp: true })} className="px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600">Nachfassen</button>}
        {quote.status === "SENT" && <button type="button" onClick={() => setStatus("ACCEPTED", "angenommen")} className="px-3 py-2 rounded-lg text-sm bg-green-600 text-white">Angenommen</button>}
        {open && <button type="button" onClick={() => setStatus("DECLINED", "abgelehnt")} className="px-3 py-2 rounded-lg text-sm border border-red-300 text-red-700 dark:border-red-700 dark:text-red-400">Abgelehnt</button>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 space-y-3 min-w-0">
          <Panel title="Positionen">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-slate-500 text-left"><th className="font-medium py-1">Beschreibung</th><th className="font-medium py-1 text-right">Menge</th><th className="font-medium py-1 text-right">Einzel</th><th className="font-medium py-1 text-right">Summe</th></tr></thead>
                <tbody>
                  {quote.items.map((i) => (
                    <tr key={i.id} className="border-t border-slate-100 dark:border-slate-700 align-top">
                      <td className="py-1.5 pr-2">{i.description.split("\n")[0]}</td>
                      <td className="py-1.5 text-right whitespace-nowrap">{i.quantity} {i.unit}</td>
                      <td className="py-1.5 text-right whitespace-nowrap">{money(i.unitPriceCents)}</td>
                      <td className="py-1.5 text-right whitespace-nowrap">{money(i.lineTotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-sm text-right space-y-0.5">
              <p className="text-slate-500">Netto {money(quote.subtotalCents)}{quote.vatTotalCents > 0 ? ` · USt. ${money(quote.vatTotalCents)}` : ""}</p>
              <p className="font-semibold">Gesamt {money(quote.totalCents)}</p>
            </div>
            {quote.notes && <p className="mt-3 text-sm text-slate-500">{quote.notes}</p>}
          </Panel>
        </div>
        <div className="min-w-0">
          <Panel title="Vorgang">
            <DocumentChain key={chainKey} kind="QUOTE" id={quote.id} />
          </Panel>
        </div>
      </div>

      {send && (
        <SendDocumentDialog
          base="/quotes"
          id={quote.id}
          label="Angebot"
          number={quote.quoteNumber}
          isDraft={false}
          followUp={send.followUp}
          onClose={() => setSend(null)}
          onSent={(to) => { setSend(null); showToast(`Angebot wurde an ${to} gesendet`, "success"); load(); }}
        />
      )}
    </div>
  );
}
