import { useState } from "react";
import { api } from "../api/client";

/**
 * Bestand eines Fertigteils buchen: Zugang (z.B. fertig gedruckt), Abgang (z.B. verschenkt, Ausschuss, Messe) oder Inventur (Bestand ist genau ...).
 * Verkäufe über Rechnungen buchen den Bestand von selbst ab.
 */
type Mode = "in" | "out" | "count";

export function ProductStockDialog({ product, onClose, onSaved }: { product: { id: string; name: string; unit: string; stockQuantity: number }; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<Mode>("in");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = parseFloat(qty.replace(",", "."));
  const valid = Number.isFinite(q) && (mode === "count" ? q >= 0 : q > 0);
  const result = !valid ? null : mode === "in" ? product.stockQuantity + q : mode === "out" ? product.stockQuantity - q : q;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/products/${product.id}/stock`, mode === "count" ? { mode: "set", quantity: q, note: note || undefined } : { mode: "add", quantity: mode === "in" ? q : -q, note: note || undefined });
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Buchen hat nicht geklappt.");
    } finally {
      setBusy(false);
    }
  }

  const input = "px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm";
  return (
    <div className="fixed inset-0 z-[55] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-label="Bestand buchen">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm p-4 space-y-3 text-sm">
        <h2 className="font-semibold">Bestand buchen: {product.name}</h2>
        <p className="text-xs text-slate-500">Aktuell im Lager: <strong>{product.stockQuantity} {product.unit}</strong></p>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs" role="group">
          {([["in", "Zugang"], ["out", "Abgang"], ["count", "Inventur"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k} className={`flex-1 px-3 py-1.5 ${mode === k ? "bg-brand text-white" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>{l}</button>
          ))}
        </div>
        <label className="block">
          {mode === "in" ? "Wie viele sind dazugekommen?" : mode === "out" ? "Wie viele sind weggegangen?" : "Wie viele sind es tatsächlich?"}
          <input type="number" min="0" step="any" inputMode="decimal" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} className={`${input} block w-full mt-1`} />
        </label>
        <label className="block">Notiz (optional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "in" ? "z.B. Charge vom 5.11. fertig" : mode === "out" ? "z.B. Messe, Ausschuss" : "z.B. Jahresinventur"} className={`${input} block w-full mt-1`} /></label>
        {result !== null && <p className="text-xs text-slate-500">Danach im Lager: <strong>{Math.round(result * 1000) / 1000} {product.unit}</strong></p>}
        {error && <p className="text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700">Abbrechen</button>
          <button disabled={!valid || busy} onClick={save} className="px-4 py-2 rounded-lg bg-brand text-white disabled:opacity-50">{busy ? "Bucht ..." : "Buchen"}</button>
        </div>
      </div>
    </div>
  );
}
