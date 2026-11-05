import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QUICK_ACTIONS } from "../lib/quickActions";

/** "+ Neu"-Knopf in der oberen Leiste: Rechnung, Angebot, Auftrag, Kunde, Produkt ... von jeder Seite aus mit einem Klick anlegen. */
export function NewMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="px-3.5 h-9 rounded-xl bg-brand hover:bg-brand-dark text-white text-sm font-medium flex items-center gap-1.5">
        <span className="text-base leading-none">+</span> Neu
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-30 text-sm">
          {QUICK_ACTIONS.filter((a) => a.group === "new").map((a) => (
            <button key={a.id} role="menuitem" type="button" onClick={() => { setOpen(false); navigate(a.path); }} className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700">
              {a.label}
            </button>
          ))}
          <div className="border-t border-slate-100 dark:border-slate-700 mt-1 pt-1 px-4 py-1.5 text-xs text-slate-500">Weitere Aktionen: Strg K</div>
        </div>
      )}
    </div>
  );
}
