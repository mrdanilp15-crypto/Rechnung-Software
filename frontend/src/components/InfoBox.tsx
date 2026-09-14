import { useState, ReactNode } from "react";

/** Ausklappbarer Hinweiskasten - erklärt auf Beleg-Übersichtsseiten, wofür der
 * Belegtyp gedacht ist und wie er in den typischen Arbeitsablauf passt. Standardmäßig
 * eingeklappt, damit die Seite nicht überladen wirkt (siehe Feedback zu Einstellungen). */
export function InfoBox({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 mb-4 bg-blue-50/40 dark:bg-slate-800/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex justify-between items-center px-4 py-2 text-sm font-medium text-left text-brand"
      >
        <span>ℹ️ {title}</span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-3 text-sm text-slate-600 dark:text-slate-300 space-y-1.5">{children}</div>}
    </div>
  );
}
