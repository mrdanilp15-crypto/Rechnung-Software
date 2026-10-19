import { FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Fuse from "fuse.js";
import { api } from "../api/client";
import { SaveButton } from "../components/SaveButton";
import { useSaveStatus } from "../hooks/useSaveStatus";
import { useToast } from "../components/Toast";
import { MobileCard, MobileField } from "../components/MobileCard";
import { calcCost, type CostRates, type PrinterCosts } from "../lib/cost";

interface Material {
  id: string;
  name: string;
  unit: string;
  costPerUnitCents?: number;
}

type Rates = CostRates;
interface PrinterOption extends PrinterCosts {
  id: string;
  name: string;
}
interface ProductMaterial {
  materialId: string;
  quantityPerUnit: number;
  material: Material;
}
interface Product {
  id: string;
  sku?: string;
  name: string;
  description?: string;
  unit: string;
  unitPriceCents: number;
  vatRateBps: number;
  printTimeMinutes?: number;
  laborMinutes?: number;
  printerId?: string | null;
  materials: ProductMaterial[];
}
interface MaterialUsageRow {
  materialId: string;
  quantityPerUnit: string;
}

const emptyForm = { sku: "", name: "", description: "", unit: "Stk.", unitPriceEur: "0.00", vatRateBps: 1900, printTimeMinutes: "", laborMinutes: "", printerId: "" };

export default function Products() {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [materialRows, setMaterialRows] = useState<MaterialUsageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rates, setRates] = useState<Rates>({ machineRateCentsPerHour: 0, laborRateCentsPerHour: 0, materialWastePercent: 5, targetMarginPercent: 30, electricityCentsPerKwh: 35, overheadPercent: 5 });
  const [printers, setPrinters] = useState<PrinterOption[]>([]);
  const { status, run } = useSaveStatus();
  const showToast = useToast();

  function load() {
    api.get("/products").then((res) => setProducts(res.data));
  }
  useEffect(load, []);
  useEffect(() => {
    api.get("/materials").then((res) => setMaterials(res.data));
    api.get("/companies/me").then((res) =>
      setRates({
        machineRateCentsPerHour: res.data.machineRateCentsPerHour ?? 0,
        laborRateCentsPerHour: res.data.laborRateCentsPerHour ?? 0,
        materialWastePercent: res.data.materialWastePercent ?? 5,
        targetMarginPercent: res.data.targetMarginPercent ?? 30,
        electricityCentsPerKwh: res.data.electricityCentsPerKwh ?? 35,
        overheadPercent: res.data.overheadPercent ?? 5,
      })
    );
    api.get("/printers").then((res) => setPrinters(res.data));
  }, []);

  const fuse = useMemo(() => new Fuse(products, { keys: ["name", "sku", "description"], threshold: 0.35 }), [products]);
  const filtered = query ? fuse.search(query).map((r) => r.item) : products;

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setMaterialRows([]);
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
      printTimeMinutes: p.printTimeMinutes ? String(p.printTimeMinutes) : "",
      laborMinutes: p.laborMinutes ? String(p.laborMinutes) : "",
      printerId: p.printerId ?? "",
    });
    setMaterialRows(p.materials.map((m) => ({ materialId: m.materialId, quantityPerUnit: String(m.quantityPerUnit) })));
    setShowForm(true);
  }

  function addMaterialRow() {
    if (materials.length === 0) return;
    setMaterialRows((rows) => [...rows, { materialId: materials[0].id, quantityPerUnit: "" }]);
  }
  function updateMaterialRow(idx: number, patch: Partial<MaterialUsageRow>) {
    setMaterialRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeMaterialRow(idx: number) {
    setMaterialRows((rows) => rows.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const validMaterialRows = materialRows.filter((r) => r.materialId && parseFloat(r.quantityPerUnit) > 0);
    const payload = {
      sku: form.sku || undefined,
      name: form.name,
      description: form.description || undefined,
      unit: form.unit,
      unitPriceCents: Math.round(parseFloat(form.unitPriceEur) * 100),
      vatRateBps: form.vatRateBps,
      printTimeMinutes: parseFloat(form.printTimeMinutes) || 0,
      laborMinutes: parseFloat(form.laborMinutes) || 0,
      printerId: form.printerId || null,
      materials: validMaterialRows.map((r) => ({ materialId: r.materialId, quantityPerUnit: parseFloat(r.quantityPerUnit) })),
    };
    try {
      await run(async () => {
        if (editingId) {
          await api.patch(`/products/${editingId}`, payload);
        } else {
          await api.post("/products", payload);
        }
      });
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
      showToast(`${p.name} archiviert`, "success");
    } catch (err: any) {
      setError(err.response?.data?.error || t("common.error"));
    }
  }

  // Live-Kalkulation für das gerade bearbeitete Produkt
  const liveCost = calcCost(
    materialRows
      .map((r) => ({ quantityPerUnit: parseFloat(r.quantityPerUnit) || 0, costPerUnitCents: materials.find((m) => m.id === r.materialId)?.costPerUnitCents ?? 0 }))
      .filter((r) => r.quantityPerUnit > 0),
    parseFloat(form.printTimeMinutes) || 0,
    parseFloat(form.laborMinutes) || 0,
    rates,
    printers.find((pr) => pr.id === form.printerId)
  );
  const livePriceCents = Math.round(parseFloat(form.unitPriceEur) * 100) || 0;
  const liveProfit = livePriceCents - liveCost.total;

  const formatPrice = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold">{t("products.title")}</h1>
        <button onClick={startCreate} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm w-full sm:w-auto">
          {t("products.new")}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm mb-1">{t("products.name")} *</label>
              <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-sm mb-1">Artikelnummer (SKU)</label>
              <input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1">Beschreibung</label>
            <textarea
              placeholder="z.B. Details für Angebote/Rechnungen"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm mb-1">{t("products.unit")}</label>
              <input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="z.B. Stk., g, Std., m" className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-sm mb-1">{t("products.unitPrice")} (€ pro Einheit)</label>
              <input type="number" step="0.01" value={form.unitPriceEur} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, unitPriceEur: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
            <div>
              <label className="block text-sm mb-1">{t("products.vatRate")}</label>
              <select value={form.vatRateBps} onChange={(e) => setForm((f) => ({ ...f, vatRateBps: Number(e.target.value) }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                <option value={1900}>19% (Standard)</option>
                <option value={700}>7% (ermäßigt)</option>
                <option value={0}>0% (Kleinunternehmer/steuerfrei)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm">Materialverbrauch pro {form.unit || "Einheit"} (optional)</label>
              <button type="button" onClick={addMaterialRow} disabled={materials.length === 0} className="text-brand hover:underline text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                + Material hinzufügen
              </button>
            </div>
            {materials.length === 0 && <p className="text-xs text-slate-500">Noch kein Material angelegt - siehe Menüpunkt "Material".</p>}
            {materialRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_140px_auto] gap-2 mb-2">
                <select value={row.materialId} onChange={(e) => updateMaterialRow(idx, { materialId: e.target.value })} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder={`Menge (${materials.find((m) => m.id === row.materialId)?.unit || ""})`}
                  value={row.quantityPerUnit}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => updateMaterialRow(idx, { quantityPerUnit: e.target.value })}
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                />
                <button type="button" onClick={() => removeMaterialRow(idx)} className="text-red-500 px-2">✕</button>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
            <div className="text-sm font-medium">Kalkulation (optional)</div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Drucker (bestimmt Strom, Abschreibung und Verschleiß)</label>
              <select value={form.printerId} onChange={(e) => setForm((f) => ({ ...f, printerId: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                <option value="">Kein Drucker - pauschaler Maschinenstundensatz ({formatPrice(rates.machineRateCentsPerHour)}/h)</option>
                {printers.map((pr) => (
                  <option key={pr.id} value={pr.id}>{pr.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">Drucker und ihre Werte pflegen Sie unter Katalog → Drucker.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Druckzeit pro {form.unit || "Einheit"} (Minuten)</label>
                <input type="number" min="0" step="any" value={form.printTimeMinutes} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, printTimeMinutes: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Arbeitszeit pro {form.unit || "Einheit"} (Minuten, Nachbearbeitung/Verpackung)</label>
                <input type="number" min="0" step="any" value={form.laborMinutes} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, laborMinutes: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </div>
            </div>
            {liveCost.total > 0 ? (
              <div className="text-sm space-y-1 bg-slate-50 dark:bg-slate-900/40 rounded p-3">
                <div className="flex justify-between"><span className="text-slate-500">Material (inkl. {rates.materialWastePercent}% Ausschuss)</span><span>{formatPrice(liveCost.material)}</span></div>
                {form.printerId ? (
                  <>
                    <div className="flex justify-between"><span className="text-slate-500">Strom</span><span>{formatPrice(liveCost.electricity)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Abschreibung Drucker</span><span>{formatPrice(liveCost.depreciation)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Verschleiß &amp; Wartung</span><span>{formatPrice(liveCost.wear)}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between"><span className="text-slate-500">Maschine (pauschal)</span><span>{formatPrice(liveCost.machineFlat)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-slate-500">Arbeit</span><span>{formatPrice(liveCost.labor)}</span></div>
                {rates.overheadPercent > 0 && <div className="flex justify-between"><span className="text-slate-500">Gemeinkosten ({rates.overheadPercent}%)</span><span>{formatPrice(liveCost.overhead)}</span></div>}
                <div className="flex justify-between font-medium border-t border-slate-200 dark:border-slate-700 pt-1"><span>Selbstkosten</span><span>{formatPrice(liveCost.total)}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Preisvorschlag (+{rates.targetMarginPercent}%)</span>
                  <span className="flex items-center gap-2">
                    {formatPrice(liveCost.recommended)}
                    <button type="button" onClick={() => setForm((f) => ({ ...f, unitPriceEur: (liveCost.recommended / 100).toFixed(2) }))} className="text-brand hover:underline text-xs">Übernehmen</button>
                  </span>
                </div>
                <div className={`flex justify-between font-medium ${liveProfit < 0 ? "text-red-600" : "text-green-600"}`}>
                  <span>Gewinn bei aktuellem Preis ({formatPrice(livePriceCents)})</span>
                  <span>{formatPrice(liveProfit)}{livePriceCents > 0 ? ` (${Math.round((liveProfit / livePriceCents) * 100)}% vom Preis)` : ""}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Material oben, Druck-/Arbeitszeit hier eintragen und die Stundensätze unter Einstellungen → Firma hinterlegen - dann erscheinen Selbstkosten, Preisvorschlag und Gewinn.</p>
            )}
          </div>

          <div className="flex gap-2">
            <SaveButton status={status} className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded justify-center">
              {t("common.save")}
            </SaveButton>
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
        {filtered.map((p) => {
          const actions = (
            <div className="flex gap-3 justify-end shrink-0">
              <button onClick={() => startEdit(p)} className="text-brand hover:underline">
                {t("common.edit")}
              </button>
              <button onClick={() => handleDelete(p)} className="text-red-600 hover:underline">
                {t("common.delete")}
              </button>
            </div>
          );
          return (
            <div key={p.id}>
              {/* Desktop */}
              <div className="hidden md:grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: "1fr 140px 90px auto" }}>
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  {(p.sku || p.description) && (
                    <div className="text-xs text-slate-500 truncate">{[p.sku, p.description].filter(Boolean).join(" · ")}</div>
                  )}
                  {(() => {
                    const cost = calcCost(
                      p.materials.map((m) => ({ quantityPerUnit: m.quantityPerUnit, costPerUnitCents: m.material.costPerUnitCents ?? 0 })),
                      p.printTimeMinutes ?? 0,
                      p.laborMinutes ?? 0,
                      rates,
                      printers.find((pr) => pr.id === p.printerId)
                    );
                    if (cost.total <= 0 || p.unitPriceCents <= 0) return null;
                    const profit = p.unitPriceCents - cost.total;
                    return (
                      <div className={`text-xs ${profit < 0 ? "text-red-600" : "text-green-600"}`}>
                        Kosten {formatPrice(cost.total)} · Gewinn {formatPrice(profit)} ({Math.round((profit / p.unitPriceCents) * 100)}%)
                      </div>
                    );
                  })()}
                  {p.materials.length > 0 && (
                    <div className="text-xs text-slate-400 truncate">
                      Verbraucht: {p.materials.map((m) => `${m.quantityPerUnit}${m.material.unit} ${m.material.name}`).join(", ")}
                    </div>
                  )}
                </div>
                <span className="text-right">{formatPrice(p.unitPriceCents)} / {p.unit}</span>
                <span className="text-slate-500 text-right">{(p.vatRateBps / 100).toFixed(0)}% USt.</span>
                {actions}
              </div>
              {/* Mobile */}
              <MobileCard
                title={p.name}
                subtitle={[p.sku, p.description].filter(Boolean).join(" · ") || undefined}
                actions={actions}
              >
                <MobileField label="Preis" value={`${formatPrice(p.unitPriceCents)} / ${p.unit}`} />
                <MobileField label="USt." value={`${(p.vatRateBps / 100).toFixed(0)}%`} />
                {p.materials.length > 0 && (
                  <MobileField label="Verbraucht" value={p.materials.map((m) => `${m.quantityPerUnit}${m.material.unit} ${m.material.name}`).join(", ")} />
                )}
              </MobileCard>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Produkte gefunden.</p>}
      </div>
    </div>
  );
}
