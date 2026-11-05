import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { DocumentChain } from "../components/DocumentChain";
import { PdfLink } from "../components/PdfLink";
import { SendDocumentDialog } from "../components/SendDocumentDialog";
import { StatusChip } from "../components/StatusChip";
import { useToast } from "../components/Toast";
import { Panel } from "../components/dashboard/widgets";

/** Lieferscheinseite: Positionen (ohne Preise), PDF und Versand sowie die ganze Belegkette des Vorgangs mit dem Weg zur Rechnung. */

interface Note {
  id: string;
  noteNumber: string;
  status: string;
  deliveryDate: string;
  emailSentAt: string | null;
  notes?: string | null;
  sourceOrderConfirmationId: string | null;
  customer: { id: string; name: string; email: string | null };
  items: { id: string; description: string; quantity: number; unit: string }[];
}

const day = (iso: string) => new Intl.DateTimeFormat("de-DE").format(new Date(iso));

export default function DeliveryNoteDetail() {
  const { id } = useParams();
  const showToast = useToast();
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    api.get(`/delivery-notes/${id}`).then((r) => setNote(r.data)).catch((e) => setError(e?.response?.data?.error ?? "Lieferschein konnte nicht geladen werden."));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!note) return <p>Wird geladen ...</p>;
  if (note.status === "DRAFT") return <Navigate to={`/delivery-notes/${note.id}/edit`} replace />;

  return (
    <div className="max-w-5xl">
      <Link to="/documents?type=DELIVERY_NOTE" className="text-sm text-slate-500 hover:underline">← Belege</Link>
      <div className="flex flex-wrap items-center gap-3 mt-1 mb-1">
        <h1 className="text-2xl font-semibold">Lieferschein {note.noteNumber}</h1>
        <StatusChip status={note.status} kind="DELIVERY_NOTE" emailed={!!note.emailSentAt} />
      </div>
      <p className="text-sm text-slate-500 mb-4">
        <Link to={`/customers/${note.customer.id}`} className="text-brand hover:underline">{note.customer.name}</Link>
        {note.customer.email ? ` · ${note.customer.email}` : ""} · Lieferdatum {day(note.deliveryDate)}
        {note.sourceOrderConfirmationId && <> · <Link to={`/orders/${note.sourceOrderConfirmationId}`} className="text-brand hover:underline">zum Auftrag</Link></>}
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <PdfLink url={`/delivery-notes/${note.id}/pdf`} filename={`${note.noteNumber}.pdf`} className="px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600">PDF ansehen</PdfLink>
        <button type="button" onClick={() => setSending(true)} className="px-3 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600">{note.emailSentAt ? "Erneut senden" : "Per E-Mail senden"}</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 min-w-0">
          <Panel title="Positionen">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-500 text-left"><th className="font-medium py-1">Beschreibung</th><th className="font-medium py-1 text-right">Menge</th></tr></thead>
              <tbody>
                {note.items.map((i) => (
                  <tr key={i.id} className="border-t border-slate-100 dark:border-slate-700 align-top">
                    <td className="py-1.5 pr-2">{i.description.split("\n")[0]}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">{i.quantity} {i.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {note.notes && <p className="mt-3 text-sm text-slate-500">{note.notes}</p>}
          </Panel>
        </div>
        <div className="min-w-0">
          <Panel title="Vorgang">
            <DocumentChain kind="DELIVERY_NOTE" id={note.id} />
          </Panel>
        </div>
      </div>

      {sending && (
        <SendDocumentDialog
          base="/delivery-notes"
          id={note.id}
          label="Lieferschein"
          number={note.noteNumber}
          isDraft={false}
          onClose={() => setSending(false)}
          onSent={(to) => { setSending(false); showToast(`Lieferschein wurde an ${to} gesendet`, "success"); load(); }}
        />
      )}
    </div>
  );
}
