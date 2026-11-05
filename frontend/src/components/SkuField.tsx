import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Props {
  /** "products" oder "materials": bestimmt, woher die nächste freie Nummer kommt */
  kind: "products" | "materials";
  value: string;
  onChange: (v: string) => void;
  /** Bereits bekannte Artikel für die sofortige Dublettenwarnung (der Server prüft zusätzlich endgültig) */
  others: { id: string; sku?: string | null; name: string }[];
  selfId?: string | null;
  /** Bei neuen Artikeln das Feld mit der nächsten freien Nummer vorbelegen */
  prefill?: boolean;
  label?: string;
}

/** Eingabefeld für Artikelnummern mit Vorschlag der nächsten freien Nummer und Warnung bei Doppelvergabe. */
export function SkuField({ kind, value, onChange, others, selfId, prefill, label = "Artikelnummer (SKU)" }: Props) {
  const [next, setNext] = useState<string | null>(null);

  async function fetchNext(): Promise<string | null> {
    try {
      const res = await api.get(`/${kind}/next-sku`);
      setNext(res.data.sku);
      return res.data.sku as string;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    void fetchNext().then((n) => {
      if (n && prefill && !value) onChange(n);
    });
    // nur beim Öffnen des Formulars
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const v = value.trim().toLowerCase();
  const dup = v ? others.find((o) => o.id !== selfId && o.sku && o.sku.trim().toLowerCase() === v) : undefined;

  return (
    <div>
      <label className="block text-sm mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={next ?? ""}
          className={`w-full min-w-0 px-3 py-2 rounded border bg-white dark:bg-slate-800 ${dup ? "border-red-500" : "border-slate-300 dark:border-slate-600"}`}
        />
        <button
          type="button"
          onClick={async () => {
            const n = await fetchNext();
            if (n) onChange(n);
          }}
          className="shrink-0 px-3 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm whitespace-nowrap"
          title="Nächste freie Nummer eintragen"
        >
          Nächste frei
        </button>
      </div>
      {dup ? (
        <p className="text-xs text-red-600 mt-1">Schon vergeben an „{dup.name}“. {next ? `Nächste freie: ${next}` : ""}</p>
      ) : (
        <p className="text-xs text-slate-500 mt-1">{next ? `Nächste freie Nummer: ${next}` : "Leer lassen, wenn du keine Nummer vergeben willst."}</p>
      )}
    </div>
  );
}
