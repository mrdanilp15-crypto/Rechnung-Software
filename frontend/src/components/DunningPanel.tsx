import { useEffect, useState } from "react";
import { api } from "../api/client";
import { PdfLink } from "./PdfLink";
import { PlaceholderHint } from "./DocumentTexts";

interface HistoryEntry {
  id: string;
  level: number;
  createdAt: string;
  totalCents: number;
  sentByEmail: boolean;
  newDueDate: string;
  hasPdf: boolean;
}

interface NextStep {
  level: number;
  levelLabel: string;
  principalCents: number;
  feeCents: number;
  interestCents: number;
  flatFeeCents: number;
  totalCents: number;
  interestRateBps: number;
  daysOverdue: number;
  newDueDate: string;
  text: string;
  canEmail: boolean;
  customerEmail?: string | null;
  notYetOverdue: boolean;
}

const LEVEL_LABEL: Record<number, string> = { 1: "Zahlungserinnerung", 2: "1. Mahnung", 3: "2. Mahnung (letzte)" };
const eur = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const date = (iso: string) => new Intl.DateTimeFormat("de-DE").format(new Date(iso));

/**
 * Mahnwesen einer offenen Rechnung: bisherige Zahlungserinnerungen/Mahnungen und die nächste Stufe mit berechneten
 * Gebühren, Verzugszinsen und (bei Firmenkunden) der Verzugskostenpauschale. Der Text ist vor dem Erzeugen änderbar.
 */
export function DunningPanel({ invoiceId, onChanged }: { invoiceId: string; onChanged: () => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [next, setNext] = useState<NextStep | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get(`/dunning/invoice/${invoiceId}`);
      setHistory(data.history);
      setNext(data.next);
      setText(data.next?.text ?? "");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  async function create(send: boolean) {
    if (!next) return;
    if (send && !confirm(`${next.levelLabel} jetzt per E-Mail an ${next.customerEmail} senden?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/dunning/invoice/${invoiceId}`, { level: next.level, send, text });
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error || "Mahnung konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Mahnwesen wird geladen ...</p>;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4 space-y-4 text-sm">
      <h2 className="font-medium">Zahlungserinnerung und Mahnungen</h2>

      {history.length > 0 && (
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {history.map((h) => (
            <div key={h.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>{LEVEL_LABEL[h.level]}</strong> vom {date(h.createdAt)} · {eur(h.totalCents)} · Frist bis {date(h.newDueDate)}
                {h.sentByEmail && <span className="text-green-600"> · per E-Mail gesendet</span>}
              </span>
              {h.hasPdf && (
                <PdfLink url={`/dunning/${h.id}/pdf`} filename={`mahnung-stufe-${h.level}.pdf`} className="text-brand hover:underline">PDF ansehen</PdfLink>
              )}
            </div>
          ))}
        </div>
      )}

      {next ? (
        <div className="space-y-3">
          <p className="font-medium">Nächste Stufe: {next.levelLabel}</p>
          {next.notYetOverdue && <p className="text-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 dark:text-yellow-200 rounded p-2">Die Fälligkeit ist noch nicht erreicht - eine Mahnung ist erst nach Ablauf der Zahlungsfrist sinnvoll.</p>}
          <div className="max-w-md space-y-1">
            <div className="flex justify-between"><span className="text-slate-500">Offene Rechnung</span><span>{eur(next.principalCents)}</span></div>
            {next.feeCents > 0 && <div className="flex justify-between"><span className="text-slate-500">Mahngebühren</span><span>{eur(next.feeCents)}</span></div>}
            {next.level >= 2 && (
              <div className="flex justify-between"><span className="text-slate-500">Verzugszinsen ({(next.interestRateBps / 100).toLocaleString("de-DE")} % p.a., {next.daysOverdue} Tage)</span><span>{eur(next.interestCents)}</span></div>
            )}
            {next.flatFeeCents > 0 && <div className="flex justify-between"><span className="text-slate-500">Verzugskostenpauschale (§288 Abs. 5 BGB)</span><span>{eur(next.flatFeeCents)}</span></div>}
            <div className="flex justify-between font-semibold border-t border-slate-200 dark:border-slate-700 pt-1"><span>Gesamtforderung</span><span>{eur(next.totalCents)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Neue Zahlungsfrist</span><span>{date(next.newDueDate)}</span></div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Text des Schreibens (änderbar)</label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900" />
            <PlaceholderHint />
          </div>
          {error && <p className="text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => create(false)} disabled={busy} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700 disabled:opacity-50">
              {busy ? "Wird erstellt ..." : "Erstellen (PDF zum Versenden)"}
            </button>
            {next.canEmail && (
              <button onClick={() => create(true)} disabled={busy} className="px-4 py-2 rounded bg-brand hover:bg-brand-dark text-white disabled:opacity-50">
                Erstellen und per E-Mail senden
              </button>
            )}
          </div>
          {!next.canEmail && <p className="text-xs text-slate-500">E-Mail-Versand: {next.customerEmail ? "unter Einstellungen → E-Mail-Versand einrichten" : "beim Kunden ist keine E-Mail-Adresse hinterlegt"} - das erzeugte PDF können Sie auch selbst verschicken.</p>}
        </div>
      ) : (
        <p className="text-slate-500">{history.some((h) => h.level >= 3) ? "Die letzte Mahnstufe wurde erzeugt. Weitere Schritte (Inkasso, gerichtliches Mahnverfahren) erfolgen außerhalb der Software." : "Für diese Rechnung ist aktuell keine Mahnung möglich."}</p>
      )}
    </div>
  );
}
