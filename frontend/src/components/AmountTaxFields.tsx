import { useRef, useState } from "react";
import { centsToField, eurToCents, fromGross, fromNet, fromVat, type TaxSplit } from "../lib/tax";

const input = "w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";
type Field = "gross" | "net" | "vat";

const euro = (cents: number) => centsToField(cents);

/**
 * Betrag, Steuersatz, Netto und Steuerbetrag in einem: Es genügt, das einzutragen, was auf dem Beleg steht - brutto, netto oder nur der
 * Steuerbetrag - die anderen Felder rechnen sich sofort mit. Gespeichert wird weiter der Bruttobetrag (amountEur) und der Steuersatz.
 * Gibt vier Felder aus, die in ein zweispaltiges Raster passen (Brutto | Steuersatz, Netto | Steuerbetrag).
 */
export function AmountTaxFields({
  gross,
  vatRateBps,
  onChange,
  required = false,
}: {
  /** Bruttobetrag in Euro als Text, z.B. "119.00" */
  gross: string;
  /** Steuersatz in Basispunkten als Text: "1900", "700" oder "0" */
  vatRateBps: string;
  onChange: (patch: { amountEur?: string; vatRateBps?: string }) => void;
  required?: boolean;
}) {
  const rate = Number(vatRateBps) || 0;
  // Welches Feld zuletzt getippt wurde und mit welchem Wert - bei Wechsel des Steuersatzes bleibt dieser Wert stehen, der Rest rechnet sich neu
  const anchor = useRef<{ field: Field; cents: number; grossAtThatTime: string } | null>(null);
  // Während ein Feld getippt wird, zeigt es genau den eingetippten Text (sonst würde das Feld unter dem Cursor umgeschrieben)
  const [typing, setTyping] = useState<{ field: Field; text: string } | null>(null);

  const split: TaxSplit = fromGross(eurToCents(gross), rate);

  function split_(field: Field, cents: number, r: number): TaxSplit {
    return field === "gross" ? fromGross(cents, r) : field === "net" ? fromNet(cents, r) : fromVat(cents, r);
  }

  function edit(field: Field, text: string) {
    const cents = eurToCents(text);
    const s = split_(field, cents, rate);
    anchor.current = { field, cents, grossAtThatTime: centsToField(s.grossCents) };
    setTyping({ field, text });
    onChange({ amountEur: centsToField(s.grossCents) });
  }

  function changeRate(next: string) {
    const r = Number(next) || 0;
    const a = anchor.current;
    // nur wenn der Betrag seither nicht von außen geändert wurde (z.B. Formular zurückgesetzt)
    // (Ein getippter Steuerbetrag lässt sich bei 0 % nicht halten - dann bleibt der Bruttobetrag stehen.)
    if (a && a.grossAtThatTime === gross && a.field !== "gross" && !(a.field === "vat" && r <= 0)) {
      const s = split_(a.field, a.cents, r);
      onChange({ vatRateBps: next, amountEur: centsToField(s.grossCents) });
    } else {
      onChange({ vatRateBps: next });
    }
  }

  const shown = (field: Field, value: number) => (typing?.field === field && !(field === "vat" && rate <= 0) ? typing.text : euro(value));

  return (
    <>
      <div>
        <label className="block text-sm mb-1">Betrag brutto (€)</label>
        <input type="number" step="0.01" inputMode="decimal" required={required} value={shown("gross", split.grossCents)} onFocus={(e) => e.target.select()} onChange={(e) => edit("gross", e.target.value)} onBlur={() => setTyping(null)} className={input} />
      </div>
      <div>
        <label className="block text-sm mb-1">MwSt-Satz</label>
        <select value={vatRateBps} onChange={(e) => changeRate(e.target.value)} className={input}>
          <option value="1900">19 %</option>
          <option value="700">7 %</option>
          <option value="0">0 % (steuerfrei)</option>
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1">Netto (€)</label>
        <input type="number" step="0.01" inputMode="decimal" value={shown("net", split.netCents)} onFocus={(e) => e.target.select()} onChange={(e) => edit("net", e.target.value)} onBlur={() => setTyping(null)} className={input} />
      </div>
      <div>
        <label className="block text-sm mb-1">MwSt-Betrag (€)</label>
        <input type="number" step="0.01" inputMode="decimal" disabled={rate <= 0} value={shown("vat", split.vatCents)} onFocus={(e) => e.target.select()} onChange={(e) => edit("vat", e.target.value)} onBlur={() => setTyping(null)} className={`${input} disabled:opacity-60`} />
      </div>
      <p className="sm:col-span-2 text-xs text-slate-500 -mt-2">Trag ein, was auf dem Beleg steht - brutto, netto oder nur den Steuerbetrag. Die anderen Felder rechnen sich sofort mit.</p>
    </>
  );
}

/**
 * Preis netto mit gleich daneben berechnetem Brutto (und umgekehrt: Brutto eintippen setzt den Nettopreis).
 * Der gespeicherte Preis bleibt netto; Brutto ist nur Eingabehilfe.
 */
export function GrossPriceField({ netEur, vatRateBps, onNetChange }: { netEur: string; vatRateBps: number; onNetChange: (netEur: string) => void }) {
  const [typing, setTyping] = useState<string | null>(null);
  if (vatRateBps <= 0) return null;
  const gross = fromNet(eurToCents(netEur), vatRateBps).grossCents;
  return (
    <div className="mt-2">
      <label className="block text-xs text-slate-500 mb-1">Brutto (inkl. {vatRateBps / 100} % USt.) - zum Rechnen oder Eintippen</label>
      <input
        type="number"
        step="0.01"
        inputMode="decimal"
        value={typing ?? euro(gross)}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setTyping(e.target.value);
          onNetChange(centsToField(fromGross(eurToCents(e.target.value), vatRateBps).netCents));
        }}
        onBlur={() => setTyping(null)}
        className="w-full px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
      />
    </div>
  );
}
