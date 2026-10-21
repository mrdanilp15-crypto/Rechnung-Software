import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

interface Hit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  path: string;
}

const TYPE_LABEL: Record<string, string> = {
  customer: "Kunde",
  invoice: "Rechnung",
  quote: "Angebot",
  order_confirmation: "Auftrag",
  delivery_note: "Lieferschein",
  product: "Produkt",
  archive: "Archiv",
};

/**
 * Globale Suche (Strg+K bzw. Cmd+K): Kunden, Belege und Produkte von jeder Seite aus finden.
 * Pfeil hoch/runter wählt, Enter öffnet, Escape schließt.
 */
export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get("/search", { params: { q: q.trim() }, signal: controller.signal });
        setHits(res.data);
        setActive(0);
      } catch {
        /* abgebrochen oder Netzwerkfehler: Ergebnisse bleiben leer */
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, open]);

  if (!open) return null;

  function choose(hit: Hit | undefined) {
    if (!hit) return;
    onClose();
    navigate(hit.path);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[12vh] px-4" onMouseDown={onClose}>
      <div className="w-full max-w-xl bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(hits.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") choose(hits[active]);
          }}
          placeholder="Kunde, Rechnung, Angebot oder Produkt suchen ..."
          className="w-full px-4 py-3 text-sm bg-transparent outline-none border-b border-slate-200 dark:border-slate-700"
        />
        <div className="max-h-80 overflow-auto">
          {hits.map((h, i) => (
            <button
              key={`${h.type}-${h.id}`}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(h)}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 text-sm ${i === active ? "bg-blue-50 dark:bg-slate-700" : ""}`}
            >
              <span className="truncate">{h.title}</span>
              <span className="text-xs text-slate-500 shrink-0 truncate max-w-[50%]">{h.subtitle || TYPE_LABEL[h.type]}</span>
            </button>
          ))}
          {q.trim().length >= 2 && hits.length === 0 && !searching && <p className="px-4 py-6 text-sm text-slate-500 text-center">Nichts gefunden.</p>}
          {q.trim().length < 2 && <p className="px-4 py-6 text-sm text-slate-500 text-center">Mindestens 2 Zeichen eingeben.</p>}
        </div>
        <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700 flex gap-4">
          <span>↑↓ wählen</span>
          <span>Enter öffnen</span>
          <span>Esc schließen</span>
        </div>
      </div>
    </div>
  );
}
