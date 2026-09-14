import { useTranslation } from "react-i18next";

export interface LineItem {
  // Stabiler, nur clientseitig genutzter Schlüssel für React-Listen (siehe unten) -
  // wird nie ans Backend gesendet (Zod-Schemas dort ignorieren unbekannte Felder).
  _key: string;
  productId?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  vatRateBps: number;
}

function newKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}-${Math.random()}`;
}

/** Erzeugt eine neue leere Position mit eigenem, stabilem Schlüssel. Muss als Funktion
 * (nicht als Konstante) verwendet werden, damit jede Position einen eigenen Schlüssel
 * bekommt - siehe Hinweis bei LineItem._key. */
export function createEmptyLineItem(): LineItem {
  return { _key: newKey(), description: "", quantity: 1, unit: "Stk.", unitPriceCents: 0, vatRateBps: 1900 };
}

/** Versieht vom Server geladene Positionen (z.B. beim Bearbeiten eines Entwurfs) mit
 * einem stabilen React-Schlüssel. */
export function withClientKeys<T extends Omit<LineItem, "_key">>(items: T[]): (T & { _key: string })[] {
  return items.map((item) => ({ ...item, _key: newKey() }));
}

interface Product {
  id: string;
  name: string;
  unitPriceCents: number;
  vatRateBps: number;
  unit: string;
}

export function formatEuro(cents: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function calcTotals(items: LineItem[]) {
  const netTotal = items.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);
  const vatTotal = items.reduce((sum, i) => sum + Math.round((i.quantity * i.unitPriceCents * i.vatRateBps) / 10000), 0);
  return { netTotal, vatTotal, grossTotal: netTotal + vatTotal };
}

/** Positionstabelle mit Preisen/USt. - gemeinsam genutzt von Rechnungen, Angeboten und
 * Auftragsbestätigungen, damit Layout und Berechnungslogik nicht dreifach gepflegt werden. */
export function PricedItemsEditor({
  items,
  onChange,
  products,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  products: Product[];
}) {
  const { t } = useTranslation();

  function updateItem(key: string, patch: Partial<LineItem>) {
    onChange(items.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  }

  function applyProduct(key: string, productId: string) {
    if (!productId) {
      updateItem(key, { productId: undefined });
      return;
    }
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    updateItem(key, {
      productId: product.id,
      description: product.name,
      unitPriceCents: product.unitPriceCents,
      vatRateBps: product.vatRateBps,
      unit: product.unit,
    });
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="pb-2">Produkt</th>
            <th className="pb-2">Beschreibung</th>
            <th className="pb-2 w-20">Menge</th>
            <th className="pb-2 w-28">Preis (€)</th>
            <th className="pb-2 w-20">USt.</th>
            <th className="pb-2 w-28 text-right">Summe</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item._key} className="border-t border-slate-100 dark:border-slate-700">
              <td className="py-2 pr-2">
                <select value={item.productId || ""} onChange={(e) => applyProduct(item._key, e.target.value)} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                  <option value="">--</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </td>
              <td className="py-2 pr-2">
                <input value={item.description} onChange={(e) => updateItem(item._key, { description: e.target.value })} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </td>
              <td className="py-2 pr-2">
                <input type="number" min={0} step="any" value={item.quantity} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(item._key, { quantity: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </td>
              <td className="py-2 pr-2">
                <input type="number" min={0} step="0.01" value={item.unitPriceCents / 100} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(item._key, { unitPriceCents: Math.round((parseFloat(e.target.value) || 0) * 100) })} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </td>
              <td className="py-2 pr-2">
                <select value={item.vatRateBps} onChange={(e) => updateItem(item._key, { vatRateBps: Number(e.target.value) })} className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                  <option value={1900}>19%</option>
                  <option value={700}>7%</option>
                  <option value={0}>0%</option>
                </select>
              </td>
              <td className="py-2 text-right">{formatEuro(item.quantity * item.unitPriceCents)}</td>
              <td>
                <button type="button" onClick={() => onChange(items.filter((it) => it._key !== item._key))} className="text-red-500 px-2">✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={() => onChange([...items, createEmptyLineItem()])} className="mt-3 text-sm text-brand hover:underline">
        + {t("invoices.addItem")}
      </button>
    </div>
  );
}

export function TotalsSummary({ items }: { items: LineItem[] }) {
  const { t } = useTranslation();
  const { netTotal, vatTotal, grossTotal } = calcTotals(items);
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-6 max-w-xs ml-auto text-sm">
      <div className="flex justify-between py-1"><span>Netto</span><span>{formatEuro(netTotal)}</span></div>
      <div className="flex justify-between py-1"><span>USt.</span><span>{formatEuro(vatTotal)}</span></div>
      <div className="flex justify-between py-1 font-semibold border-t border-slate-200 dark:border-slate-700 mt-1 pt-1"><span>{t("invoices.total")}</span><span>{formatEuro(grossTotal)}</span></div>
    </div>
  );
}
