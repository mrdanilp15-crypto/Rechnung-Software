import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

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
  onProductCreated,
  compact = false,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  products: Product[];
  /** Wenn gesetzt, kann eine frei getippte Position mit einem Klick als Produkt im Katalog gemerkt werden. */
  onProductCreated?: (product: Product) => void;
  /** Schmale Spalte (z.B. neben einer Live-Vorschau): jede Position als eigene Karte statt als breite Tabellenzeile. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [savingKey, setSavingKey] = useState<string | null>(null);

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

  // Tippt man den Namen eines Katalogprodukts vollständig ein, werden Preis, Einheit und USt. übernommen.
  function onDescription(item: LineItem, value: string) {
    const match = !item.productId ? products.find((p) => p.name.toLowerCase() === value.trim().toLowerCase()) : undefined;
    if (match) applyProduct(item._key, match.id);
    else updateItem(item._key, { description: value });
  }

  async function saveAsProduct(item: LineItem) {
    setSavingKey(item._key);
    try {
      const { data } = await api.post("/products", {
        name: item.description.trim().split("\n")[0].slice(0, 120),
        unit: item.unit,
        unitPriceCents: item.unitPriceCents,
        vatRateBps: item.vatRateBps,
      });
      updateItem(item._key, { productId: data.id });
      onProductCreated?.(data);
    } catch (err: any) {
      alert(err.response?.data?.error || "Produkt konnte nicht gespeichert werden.");
    } finally {
      setSavingKey(null);
    }
  }

  const productHint = (item: LineItem) =>
    onProductCreated && item.description.trim() ? (
      item.productId ? (
        <span className="text-xs text-green-600 mt-1 inline-block">✓ im Katalog</span>
      ) : (
        <button type="button" onClick={() => saveAsProduct(item)} disabled={savingKey === item._key} className="text-xs text-brand hover:underline mt-1 disabled:opacity-50">
          {savingKey === item._key ? "Wird gespeichert..." : "+ Als Produkt merken"}
        </button>
      )
    ) : null;

  const inputClass = "w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-4">
      <datalist id="pe-products">
        {products.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      {compact ? (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={item._key} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <div className="flex gap-2 items-start">
                <span className="text-xs text-slate-400 pt-2 w-4 shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <input list="pe-products" placeholder="Beschreibung oder Produkt eintippen" value={item.description} onChange={(e) => onDescription(item, e.target.value)} className={inputClass} />
                  {productHint(item)}
                </div>
                <select value={item.productId || ""} onChange={(e) => applyProduct(item._key, e.target.value)} className={`${inputClass} !w-28 shrink-0`} aria-label="Aus Katalog wählen">
                  <option value="">Katalog</option>
                  {products.map((pr) => (
                    <option key={pr.id} value={pr.id}>{pr.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => onChange(items.filter((it) => it._key !== item._key))} className="text-red-500 px-1 pt-1" aria-label="Position entfernen">✕</button>
              </div>
              <div className="grid grid-cols-[1fr_0.8fr_1.2fr_0.9fr_1.1fr] gap-2 items-end pl-6">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Menge</label>
                  <input type="number" min={0} step="any" value={item.quantity} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(item._key, { quantity: parseFloat(e.target.value) || 0 })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Einheit</label>
                  <input value={item.unit} onChange={(e) => updateItem(item._key, { unit: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Preis (€)</label>
                  <input type="number" min={0} step="0.01" value={item.unitPriceCents / 100} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(item._key, { unitPriceCents: Math.round((parseFloat(e.target.value) || 0) * 100) })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">USt.</label>
                  <select value={item.vatRateBps} onChange={(e) => updateItem(item._key, { vatRateBps: Number(e.target.value) })} className={inputClass}>
                    <option value={1900}>19%</option>
                    <option value={700}>7%</option>
                    <option value={0}>0%</option>
                  </select>
                </div>
                <div className="text-right text-sm font-medium pb-1">{formatEuro(item.quantity * item.unitPriceCents)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
      {/* Desktop */}
      <table className="hidden md:table w-full text-sm">
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
                <select value={item.productId || ""} onChange={(e) => applyProduct(item._key, e.target.value)} className={inputClass}>
                  <option value="">--</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </td>
              <td className="py-2 pr-2">
                <input list="pe-products" value={item.description} onChange={(e) => onDescription(item, e.target.value)} className={inputClass} />
                {productHint(item)}
              </td>
              <td className="py-2 pr-2">
                <input type="number" min={0} step="any" value={item.quantity} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(item._key, { quantity: parseFloat(e.target.value) || 0 })} className={inputClass} />
              </td>
              <td className="py-2 pr-2">
                <input type="number" min={0} step="0.01" value={item.unitPriceCents / 100} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(item._key, { unitPriceCents: Math.round((parseFloat(e.target.value) || 0) * 100) })} className={inputClass} />
              </td>
              <td className="py-2 pr-2">
                <select value={item.vatRateBps} onChange={(e) => updateItem(item._key, { vatRateBps: Number(e.target.value) })} className={inputClass}>
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

      {/* Mobile */}
      <div className="md:hidden space-y-4">
        {items.map((item, idx) => (
          <div key={item._key} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-slate-500">Position {idx + 1}</span>
              <button type="button" onClick={() => onChange(items.filter((it) => it._key !== item._key))} className="text-red-500 px-2">✕</button>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Produkt</label>
              <select value={item.productId || ""} onChange={(e) => applyProduct(item._key, e.target.value)} className={inputClass}>
                <option value="">--</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Beschreibung</label>
              <input list="pe-products" value={item.description} onChange={(e) => onDescription(item, e.target.value)} className={inputClass} />
              {productHint(item)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Menge</label>
                <input type="number" min={0} step="any" value={item.quantity} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(item._key, { quantity: parseFloat(e.target.value) || 0 })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Preis (€)</label>
                <input type="number" min={0} step="0.01" value={item.unitPriceCents / 100} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(item._key, { unitPriceCents: Math.round((parseFloat(e.target.value) || 0) * 100) })} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 items-end">
              <div>
                <label className="block text-xs text-slate-500 mb-1">USt.</label>
                <select value={item.vatRateBps} onChange={(e) => updateItem(item._key, { vatRateBps: Number(e.target.value) })} className={inputClass}>
                  <option value={1900}>19%</option>
                  <option value={700}>7%</option>
                  <option value={0}>0%</option>
                </select>
              </div>
              <div className="text-right text-sm">
                <span className="text-slate-500">Summe: </span>
                <span className="font-medium">{formatEuro(item.quantity * item.unitPriceCents)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
        </>
      )}

      <button type="button" onClick={() => onChange([...items, createEmptyLineItem()])} className="mt-3 text-sm text-brand hover:underline">
        + {t("invoices.addItem")}
      </button>
    </div>
  );
}

/** Live-Vorschau der Summen. Maßgeblich sind immer die vom Server berechneten Beträge nach
 * dem Speichern - die Vorschau kennt nur die Kleinunternehmerregelung (keine USt.) und weist
 * bei Auslandskunden darauf hin, dass die USt. entfallen kann (Reverse-Charge/Ausfuhr). */
export function TotalsSummary({ items, isSmallBusiness = false, abroadHint = false }: { items: LineItem[]; isSmallBusiness?: boolean; abroadHint?: boolean }) {
  const { t } = useTranslation();
  const { netTotal, vatTotal, grossTotal } = calcTotals(items);
  const shownVat = isSmallBusiness ? 0 : vatTotal;
  const shownGross = netTotal + shownVat;
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-6 max-w-xs ml-auto text-sm">
      <div className="flex justify-between py-1"><span>Netto</span><span>{formatEuro(netTotal)}</span></div>
      <div className="flex justify-between py-1"><span>USt.</span><span>{formatEuro(shownVat)}</span></div>
      <div className="flex justify-between py-1 font-semibold border-t border-slate-200 dark:border-slate-700 mt-1 pt-1"><span>{t("invoices.total")}</span><span>{formatEuro(isSmallBusiness ? shownGross : grossTotal)}</span></div>
      {isSmallBusiness && <p className="text-xs text-slate-500 mt-2">Kleinunternehmerregelung (§19 UStG): es wird keine Umsatzsteuer ausgewiesen.</p>}
      {abroadHint && !isSmallBusiness && (
        <p className="text-xs text-slate-500 mt-2">Auslandskunde: Die USt. kann entfallen (innergemeinschaftliche Lieferung, Reverse-Charge, Ausfuhr). Die endgültigen Beträge stehen nach dem Speichern fest.</p>
      )}
    </div>
  );
}
