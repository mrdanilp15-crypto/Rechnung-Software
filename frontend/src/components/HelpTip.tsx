import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { helpTopic } from "../lib/helpContent";

/**
 * "?"-Symbol mit Kurzhilfe: Tippen/Klicken (oder Darüberfahren am Computer) zeigt eine kurze Erklärung, mit Link zum ausführlichen Hilfethema.
 * Der Text kommt aus dem zentralen Hilfe-Inhalt (lib/helpContent.ts), damit Kurzhilfe und Hilfeseite nie auseinanderlaufen; mit `text` lässt er
 * sich für eine einzelne Stelle überschreiben. Die Sprechblase wird am Seitenrand festgehalten, damit sie auch am Handy nie abgeschnitten wird.
 */
export function HelpTip({ topic, text, title, className = "" }: { topic?: string; text?: string; title?: string; className?: string }) {
  const t = topic ? helpTopic(topic) : undefined;
  const shown = text ?? t?.short;
  const heading = title ?? t?.title;
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxW: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    if (!b) return;
    const margin = 12;
    const maxW = Math.min(320, window.innerWidth - margin * 2);
    const left = Math.min(Math.max(margin, b.left + b.width / 2 - maxW / 2), window.innerWidth - maxW - margin);
    const h = pop.current?.offsetHeight ?? 120;
    const below = b.bottom + 8;
    const top = below + h > window.innerHeight - margin && b.top - 8 - h > margin ? b.top - 8 - h : below;
    setPos({ top, left, maxW });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, shown]);

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setPinned(false); };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const el = e.target as Node;
      if (btn.current?.contains(el) || pop.current?.contains(el)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, place]);

  if (!shown) return null;
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`Hilfe${heading ? `: ${heading}` : ""}`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open && pinned) { setOpen(false); setPinned(false); } else { setOpen(true); setPinned(true); }
        }}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen(true); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse" && !pinned) setOpen(false); }}
        className={`inline-flex shrink-0 items-center justify-center w-[18px] h-[18px] rounded-full border border-slate-400 dark:border-slate-500 text-slate-500 dark:text-slate-400 text-[11px] font-semibold leading-none align-middle hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${className}`}
      >
        ?
      </button>
      {open && createPortal(
        <div
          ref={pop}
          role="tooltip"
          style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.maxW ?? 300, zIndex: 100 }}
          className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl p-3 text-sm text-slate-700 dark:text-slate-200 font-normal normal-case tracking-normal text-left"
          onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen(true); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse" && !pinned) setOpen(false); }}
        >
          {heading && <div className="font-medium mb-1">{heading}</div>}
          <p className="leading-snug">{shown}</p>
          {topic && t && (
            <Link to={`/help#${topic}`} onClick={() => { setOpen(false); setPinned(false); }} className="inline-block mt-2 text-brand hover:underline text-xs font-medium">
              Mehr in der Hilfe →
            </Link>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Eine Zeile Kurzerklärung mit "Mehr"-Link, z.B. unter den Reitern einer Seite. */
export function HelpLine({ topic, className = "" }: { topic: string; className?: string }) {
  const t = helpTopic(topic);
  if (!t) return null;
  return (
    <p className={`text-sm text-slate-500 dark:text-slate-400 mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full border border-slate-400 text-[11px] font-semibold shrink-0" aria-hidden>?</span>
      <span>{t.short}</span>
      <Link to={`/help#${topic}`} className="text-brand hover:underline whitespace-nowrap">Mehr in der Hilfe</Link>
    </p>
  );
}
