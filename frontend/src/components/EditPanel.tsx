import { createContext, useContext, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { SaveButton } from "./SaveButton";
import type { SaveStatus } from "../hooks/useSaveStatus";

/** Felder, die sich per Klick füllen (Adressvorschlag, Rechner), melden damit "es wurde etwas geändert" - sonst gäbe es beim Schließen keine Rückfrage. */
const EditPanelContext = createContext<{ markDirty: () => void }>({ markDirty: () => undefined });
export const useEditPanelDirty = () => useContext(EditPanelContext).markDirty;

/**
 * Bearbeiten-/Anlegen-Fenster, das von rechts hereingleitet (am Handy: ganzer Bildschirm).
 * Die Liste bleibt dahinter stehen, die Seite scrollt nicht weg. Kopfzeile und Speichern-Leiste bleiben
 * immer sichtbar, nur der Inhalt dazwischen scrollt - auch bei langen Formularen.
 *
 * Schließen: Kreuz, Abbrechen, Esc oder Klick neben das Fenster. Wurde etwas geändert, wird vorher nachgefragt.
 * Die Seite liefert nur die Felder (children) und onSubmit; Speichern/Abbrechen/Fehleranzeige übernimmt das Fenster.
 */
export function EditPanel({
  title,
  subtitle,
  onClose,
  onSubmit,
  status = "idle",
  saveLabel = "Speichern",
  error,
  dirty = false,
  saveDisabled = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Wird nach Bestätigung (bzw. ohne Änderungen sofort) aufgerufen - die Seite blendet das Fenster aus */
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  status?: SaveStatus;
  saveLabel?: string;
  error?: string | null;
  /** Zusätzlich zur automatischen Erkennung von Eingaben: es gibt ungespeicherte Änderungen */
  dirty?: boolean;
  /** Speichern sperren, solange Pflichtfelder fehlen */
  saveDisabled?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [touched, setTouched] = useState(false);
  const hasChanges = touched || dirty;

  // sanftes Hereingleiten (ohne Animation, wenn das System das so wünscht)
  useEffect(() => {
    const id = window.setTimeout(() => setShown(true), 20);
    return () => window.clearTimeout(id);
  }, []);

  // Hintergrund nicht mitscrollen lassen; Fokus ins Fenster und danach zurück zum auslösenden Knopf
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const oldOverflow = document.body.style.overflow;
    const oldPadding = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });
    // Am Rechner gleich ins erste Feld; am Handy nicht, sonst springt die Tastatur sofort auf
    if (window.matchMedia?.("(pointer: fine)").matches) panel?.querySelector<HTMLElement>("form input:not([type=hidden]):not([type=checkbox]), form textarea, form select")?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = oldOverflow;
      document.body.style.paddingRight = oldPadding;
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  function requestClose() {
    if (status === "saving") return;
    if (hasChanges && !window.confirm("Es gibt ungespeicherte Änderungen. Wirklich schließen und die Änderungen verwerfen?")) return;
    onClose();
  }

  // Esc schließt, Tab bleibt im Fenster
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      requestClose();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []).filter((n) => n.offsetParent !== null);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onKeyDown={onKeyDown}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`} onClick={requestClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex h-full w-full sm:max-w-xl lg:max-w-2xl flex-col bg-white dark:bg-slate-900 shadow-2xl outline-none sm:border-l border-slate-200 dark:border-slate-700 transition-transform duration-200 ease-out motion-reduce:transition-none ${shown ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="shrink-0 flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-700 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold truncate">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
          </div>
          <button type="button" onClick={requestClose} className="shrink-0 w-9 h-9 -mr-2 rounded-lg text-xl leading-none text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Schließen">
            ✕
          </button>
        </header>
        <form onSubmit={onSubmit} onChangeCapture={() => setTouched(true)} className="flex min-h-0 flex-1 flex-col">
          <EditPanelContext.Provider value={{ markDirty: () => setTouched(true) }}>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">{children}</div>
          </EditPanelContext.Provider>
          <footer className="shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
            {error && <p role="alert" className="mb-2 text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <SaveButton status={status} disabled={saveDisabled} className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded justify-center">
                {saveLabel}
              </SaveButton>
              <button type="button" onClick={requestClose} disabled={status === "saving"} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700 disabled:opacity-60">
                Abbrechen
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
