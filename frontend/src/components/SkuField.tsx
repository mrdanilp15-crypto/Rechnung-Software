import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

interface Props {
  /** "products" oder "materials": bestimmt, wogegen geprüft wird */
  kind: "products" | "materials";
  value: string;
  onChange: (v: string) => void;
  /** Beim Bearbeiten: der Artikel selbst zählt nicht als Dublette */
  selfId?: string | null;
  /** Bei neuen Artikeln das Feld mit der nächsten freien Nummer vorbelegen */
  prefill?: boolean;
  label?: string;
}

/**
 * Eingabefeld für Artikelnummern. Beim Tippen wird die Nummer live beim Server geprüft
 * (frei / schon vergeben an ...); gelöschte Artikel zählen nicht. "Nächste frei" trägt die nächste Nummer ein.
 */
export function SkuField({ kind, value, onChange, selfId, prefill, label = "Artikelnummer (SKU)" }: Props) {
  const [next, setNext] = useState<string | null>(null);
  const [taken, setTaken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const seq = useRef(0);

  async function check(v: string): Promise<{ taken: string | null; next: string } | null> {
    try {
      const res = await api.get(`/${kind}/sku-check`, { params: { sku: v, ...(selfId ? { exceptId: selfId } : {}) } });
      return res.data;
    } catch {
      return null;
    }
  }

  // beim Öffnen: Vorschlag holen und bei neuen Artikeln vorbelegen
  useEffect(() => {
    void check("").then((r) => {
      if (!r) return;
      setNext(r.next);
      if (prefill && !value) onChange(r.next);
    });
    // nur beim Öffnen des Formulars
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // bei jeder Eingabe (kurz verzögert) live prüfen
  useEffect(() => {
    const v = value.trim();
    setChecked(false);
    if (!v) {
      setTaken(null);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      void check(v).then((r) => {
        if (mine !== seq.current || !r) return; // veraltete Antwort verwerfen
        setTaken(r.taken);
        setNext(r.next);
        setChecked(true);
      });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, kind, selfId]);

  const hasValue = value.trim() !== "";
  // nur ein Präfix getippt (z.B. "HW-"): dann die nächste Nummer dieser Reihe vorschlagen statt "frei" zu melden
  const prefixOnly = hasValue && !/\d$/.test(value.trim());
  const border = taken ? "border-red-500" : checked && hasValue && !prefixOnly ? "border-green-500" : "border-slate-300 dark:border-slate-600";

  return (
    <div>
      <label className="block text-sm mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={next ?? ""}
          className={`w-full min-w-0 px-3 py-2 rounded border bg-white dark:bg-slate-800 ${border}`}
        />
        <button
          type="button"
          onClick={async () => {
            const r = await check(value);
            if (r) {
              setNext(r.next);
              onChange(r.next);
            }
          }}
          className="shrink-0 px-3 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm whitespace-nowrap"
          title="Nächste freie Nummer eintragen"
        >
          Nächste frei
        </button>
      </div>
      {prefixOnly && next ? (
        <p className="text-xs text-slate-500 mt-1">
          Nächste in dieser Reihe:{" "}
          <button type="button" onClick={() => onChange(next)} className="text-brand font-medium hover:underline">{next}</button> (anklicken zum Übernehmen)
        </p>
      ) : taken ? (
        <p className="text-xs text-red-600 mt-1">Schon vergeben an „{taken}“.{next ? ` Nächste freie: ${next}` : ""}</p>
      ) : checked && hasValue && !prefixOnly ? (
        <p className="text-xs text-green-600 mt-1">Frei.</p>
      ) : (
        <p className="text-xs text-slate-500 mt-1">{next ? `Nächste freie Nummer: ${next}` : "Leer lassen, wenn du keine Nummer vergeben willst."}</p>
      )}
    </div>
  );
}
