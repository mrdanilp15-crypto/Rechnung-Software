import { ReactNode, useEffect, useRef, useState } from "react";

export interface RowAction {
  label: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

/**
 * "⋮"-Menü für Nebenaktionen einer Zeile (PDF, Bearbeiten, Löschen, ...) - hält Listen
 * übersichtlich, statt eine wachsende Reihe einzelner Text-Buttons pro Zeile anzuhäufen.
 * Die wichtigste/kontextabhängige Aktion (z.B. "→ Rechnung") bleibt daneben als
 * eigenständiger, sichtbarer Button bestehen.
 */
export function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="w-8 h-8 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 text-lg leading-none"
        aria-label="Weitere Aktionen"
      >
        ⋮
      </button>
      {open && (
        // z-40: muss über der fixen oberen/unteren Navigationsleiste (jeweils z-30, siehe Layout.tsx) liegen, sonst
        // sind untere Menüpunkte auf dem Handy verdeckt, wenn die Zeile weiter unten auf dem Bildschirm steht.
        // max-h + overflow-y-auto, damit auch ein langes Menü auf kleinen Bildschirmen nie über den Rand hinausragt.
        <div className="absolute right-0 mt-1 w-44 max-h-[60vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-40 text-sm">
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                action.onClick();
              }}
              className={`w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 ${action.danger ? "text-red-600" : ""}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
