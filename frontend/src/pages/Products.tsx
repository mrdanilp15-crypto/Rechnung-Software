import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Fuse from "fuse.js";
import { api } from "../api/client";

interface Product {
  id: string;
  sku?: string;
  name: string;
  description?: string;
  unit: string;
  unitPriceCents: number;
  vatRateBps: number;
}

const emptyForm = { sku: "", name: "", description: "", unit: "Stk.", unitPriceEur: "0.00", vatRateBps: 1900 };

export default function Products() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get("/products").then((res) => setProducts(res.data));
  }
  useEffect(load, []);

  const fuse = useMemo(() => new Fuse(products, { keys: ["name", "sku", "description"], threshold: 0.35 }), [products]);
  const filtered = query ? fuse.search(query).map((r) => r.item) : products;

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      sku: p.sku || "",
      name: p.name,
      description: p.description || "",
      unit: p.unit,
      unitPriceEur: (p.unitPriceCents / 100).toFixed(2),
      vatRateBps: p.vatRateBps,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      sku: form.sku || undefined,
      name: form.name,
      description: form.description || undefined,
      unit: form.unit,
      unitPriceCents: Math.round(parseFloat(form.unitPriceEur) * 100),
      vatRateBps: form.vatRateBps,
    };
    try {
      if (editingId) {
        await api.patch(`/products/${editingId}`, payload);
      } else {
        await api.post("/products", payload);
      }
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || t("common.error"));
    }
  }

  async function handleDelete(p: Product) {
    if (!confirm(`"${p.name}" wirklich archivieren?`)) return;
    try {
      await api.delete(`/products/${p.id}`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || t("common.error"));
    }
  }

  const formatPrice = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">{t("products.title")}</h1>
        <button onClick={startCreate} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
          {t("products.new")}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <input required placeholder={t("products.name") + " *"} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="col-span-2 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            <input placeholder="Artikelnummer (SKU)" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          </div>
          <textarea
            placeholder="Beschreibung (z.B. Details für Angebote/Rechnungen)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
            rows={2}
          />
          <div className="grid grid-cols-3 gap-4">
            <input placeholder={t("products.unit")} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            <input type="number" step="0.01" placeholder={t("products.unitPrice")} value={form.unitPriceEur} onChange={(e) => setForm((f) => ({ ...f, unitPriceEur: e.target.value }))} className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            <select value={form.vatRateBps} onChange={(e) => setForm((f) => ({ ...f, vatRateBps: Number(e.target.value) }))} className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
              <option value={1900}>19%</option>
              <option value={700}>7%</option>
              <option value={0}>0%</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded">
              {t("common.save")}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      <input
        placeholder={t("products.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full mb-4 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
      />

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        {filtered.map((p) => (
          <div key={p.id} className="grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: "1fr 140px 90px auto" }}>
            <div className="min-w-0">
              <div className="font-medium truncate">{p.name}</div>
              {(p.sku || p.description) && (
                <div className="text-xs text-slate-500 truncate">{[p.sku, p.description].filter(Boolean).join(" · ")}</div>
              )}
            </div>
            <span className="text-right">{formatPrice(p.unitPriceCents)} / {p.unit}</span>
            <span className="text-slate-500 text-right">{(p.vatRateBps / 100).toFixed(0)}% USt.</span>
            <div className="flex gap-3 justify-end">
              <button onClick={() => startEdit(p)} className="text-brand hover:underline">
                {t("common.edit")}
              </button>
              <button onClick={() => handleDelete(p)} className="text-red-600 hover:underline">
                {t("common.delete")}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Produkte gefunden.</p>}
      </div>
    </div>
  );
}
