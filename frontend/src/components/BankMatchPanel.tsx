import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useToast } from "./Toast";

import { HelpTip } from "./HelpTip";
/**
 * Zahlungseingänge ohne Rechnung: Vorschläge mit Begründung, Zuordnen per Klick (die Rechnung wird dann als bezahlt markiert), anderes Zuordnen
 * aus der Liste offener Rechnungen oder Ausblenden (gehört zu keiner Rechnung). Nichts wird ohne deine Bestätigung gebucht.
 */

interface Suggestion { invoiceId: string; number: string | null; customer: string; totalCents: number; diffCents: number; reason: string; score: number }
interface Row { transaction: { id: string; bookingDate: string; amountCents: number; purpose: string | null; counterparty: string | null }; suggestions: Suggestion[] }
interface OpenInvoice { id: string; number: string | null; customerName: string; totalCents: number }

const eur = (c: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100);

export function BankMatchPanel({ reloadKey, onChanged }: { reloadKey: number; onChanged: () => void }) {
  const showToast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<OpenInvoice[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get("/bank/suggestions").then((r) => setRows(r.data)).catch(() => setRows([]));
    api.get("/documents").then((r) => setOpen((r.data as { kind: string; id: string; number: string | null; customerName: string; totalCents: number | null; status: string; isCancellationDocument?: boolean }[])
      .filter((d) => d.kind === "INVOICE" && (d.status === "SENT" || d.status === "OVERDUE") && !d.isCancellationDocument && d.totalCents !== null)
      .map((d) => ({ id: d.id, number: d.number, customerName: d.customerName, totalCents: d.totalCents as number })))).catch(() => setOpen([]));
  }, []);
  useEffect(load, [load, reloadKey]);

  async function match(txId: string, invoiceId: string, diff: number) {
    let acceptDifference = false;
    if (diff !== 0) {
      if (!window.confirm(`Der Betrag weicht um ${eur(Math.abs(diff))} ab (${diff < 0 ? "Zahlung ist niedriger" : "Zahlung ist höher"}). Die Rechnung trotzdem als bezahlt markieren? (z.B. bei Skonto)`)) return;
      acceptDifference = true;
    }
    setBusy(txId);
    try {
      await api.post(`/bank/transactions/${txId}/match`, { invoiceId, acceptDifference });
      showToast("Zugeordnet, Rechnung als bezahlt markiert", "success");
      load();
      onChanged();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "Zuordnen hat nicht geklappt", "error");
    } finally {
      setBusy(null);
    }
  }
  async function ignore(txId: string) {
    await api.post(`/bank/transactions/${txId}/ignore`, { ignored: true });
    load();
    onChanged();
  }

  if (!rows || rows.length === 0) return rows ? <p className="text-sm text-slate-500 mb-4">Alle Zahlungseingänge sind zugeordnet oder ausgeblendet.</p> : null;
  const select = "px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm";
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4 space-y-3">
      <div>
        <h2 className="font-medium">Zahlungen zuordnen ({rows.length})<HelpTip topic="bank" className="ml-2" /></h2>
        <p className="text-sm text-slate-500">Diese Zahlungseingänge konnten nicht eindeutig einer Rechnung zugeordnet werden. Prüfe den Vorschlag und bestätige mit einem Klick - die Rechnung wird dann als bezahlt markiert.</p>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
        {rows.map(({ transaction: t, suggestions }) => (
          <li key={t.id} className="py-3 space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
              <span className="text-slate-500">{new Date(t.bookingDate).toLocaleDateString("de-DE")}</span>
              <span className="font-medium">{t.counterparty || "unbekannt"}</span>
              <span className="text-green-600 font-medium">{eur(t.amountCents)}</span>
              <span className="text-xs text-slate-500 truncate max-w-full">{t.purpose}</span>
            </div>
            {suggestions.length > 0 ? (
              <ul className="space-y-1.5">
                {suggestions.map((s) => (
                  <li key={s.invoiceId} className="flex flex-wrap items-center gap-2 text-sm rounded-lg bg-slate-50 dark:bg-slate-900/40 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{s.number ?? "Rechnung"}</span> · {s.customer} · {eur(s.totalCents)}
                      <span className="block text-xs text-slate-500">{s.reason}{s.diffCents !== 0 ? ` - Differenz ${eur(s.diffCents)}` : ""}</span>
                    </span>
                    <button type="button" disabled={busy === t.id} onClick={() => match(t.id, s.invoiceId, s.diffCents)} className="px-3 py-1 rounded-lg bg-brand text-white text-xs font-medium disabled:opacity-50">Zuordnen</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">Keine passende offene Rechnung gefunden.</p>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-2 text-slate-500">Andere Rechnung:
                <select defaultValue="" onChange={(e) => { const inv = open.find((o) => o.id === e.target.value); if (inv) void match(t.id, inv.id, t.amountCents - inv.totalCents); e.target.value = ""; }} className={select}>
                  <option value="">wählen ...</option>
                  {open.map((o) => <option key={o.id} value={o.id}>{o.number ?? "Entwurf"} · {o.customerName} · {eur(o.totalCents)}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => ignore(t.id)} className="text-slate-500 hover:underline" title="Gehört zu keiner Rechnung (z.B. private Einlage) - nicht mehr vorschlagen">Ausblenden</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
