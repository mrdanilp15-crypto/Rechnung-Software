/**
 * Angebot und Auftrag verknüpfen: zeigt passende Belege desselben Kunden zur Auswahl. Kommt der Dialog beim Anlegen eines Auftrags
 * aus einem Angebot (es gibt schon einen Auftrag mit gleichem Betrag), lässt sich stattdessen "trotzdem neu anlegen" wählen.
 */

export interface LinkCandidate {
  id: string;
  number: string | null;
  date: string;
  totalCents: number | null;
  status: string;
}

const money = (c: number | null) => (c === null ? "-" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100));
const day = (iso: string) => new Intl.DateTimeFormat("de-DE").format(new Date(iso));

export function LinkDocsDialog({ title, intro, candidates, linkLabel, createLabel, onLink, onCreate, onClose, busy }: {
  title: string;
  intro: string;
  candidates: LinkCandidate[];
  linkLabel: string;
  createLabel?: string;
  onLink: (c: LinkCandidate) => void;
  onCreate?: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:px-4" role="dialog" aria-label={title} onMouseDown={onClose}>
      <div className="w-full sm:max-w-lg bg-white dark:bg-slate-800 rounded-t-xl sm:rounded-xl shadow-2xl p-5 space-y-3 max-h-[92vh] overflow-auto" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-slate-500">{intro}</p>
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {candidates.map((c) => (
            <li key={c.id} className="py-2 flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.number ?? "Entwurf"}</span>
                <span className="block text-xs text-slate-500">{day(c.date)} · {money(c.totalCents)}</span>
              </span>
              <button type="button" disabled={busy} onClick={() => onLink(c)} className="shrink-0 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-medium disabled:opacity-50">{linkLabel}</button>
            </li>
          ))}
          {candidates.length === 0 && <li className="py-3 text-sm text-slate-500">Nichts Passendes gefunden.</li>}
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          {onCreate && createLabel && <button type="button" disabled={busy} onClick={onCreate} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm disabled:opacity-50">{createLabel}</button>}
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-sm ml-auto">Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
