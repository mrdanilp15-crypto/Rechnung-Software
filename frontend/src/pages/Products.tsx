import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Fuse from "fuse.js";
import { api } from "../api/client";
import { SaveButton } from "../components/SaveButton";
import { useSaveStatus } from "../hooks/useSaveStatus";
import { useToast } from "../components/Toast";
import { MobileCard, MobileField } from "../components/MobileCard";
import { calcCost, feesAt, type CostRates, type PriceTier, type PrinterCosts } from "../lib/cost";

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
  costOverrideCents?: number | null;
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
  setupMinutes?: number;
  packagingCents?: number;
  extraMaterialPercent?: number;
  priceTiers?: PriceTier[] | null;
  piecesPerPlate?: number;
  extraCosts?: { label: string; amountCents: number }[] | null;
  materials: ProductMaterial[];
}
interface TierRow {
  minQuantity: string;
  priceEur: string;
}
interface MaterialUsageRow {
  materialId: string;
  quantityPerUnit: string; // je Druckplatte (Slicer-Angabe); gespeichert wird je Stück = Platte / Stück pro Platte
  override: string; // eigener Preis je Material-Einheit in Euro (leer = Lagerpreis)
}
interface ExtraRow {
  label: string;
  amountEur: string;
}

const EXTRA_SUGGESTIONS = ["Lackieren / Bemalen", "Klarlack", "Schleifen / Spachteln", "Magnete einkleben", "Gewindeeinsätze", "Montage", "Geschenkverpackung"];
/** Zahl für ein Eingabefeld: ohne Rechenrauschen (z.B. 0.30000000000000004) */
const field = (n: number) => String(Math.round(n * 10000) / 10000);

const emptyForm = { sku: "", name: "", description: "", unit: "Stk.", unitPriceEur: "0.00", vatRateBps: 1900, printTimeMinutes: "", laborMinutes: "", printerId: "", setupMinutes: "", packagingEur: "", extraMaterialPercent: "", piecesPerPlate: "1" };

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
  const [rates, setRates] = useState<Rates>({ machineRateCentsPerHour: 0, laborRateCentsPerHour: 0, materialWastePercent: 5, targetMarginPercent: 30, electricityCentsPerKwh: 35, overheadPercent: 5, failRatePercent: 5, platformFeePercent: 0, priceRounding: "NONE", minPriceCents: 0 });
  const [printers, setPrinters] = useState<PrinterOption[]>([]);
  const [tierRows, setTierRows] = useState<TierRow[]>([]);
  const [calcQty, setCalcQty] = useState("1");
  const [extraRows, setExtraRows] = useState<ExtraRow[]>([]);
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
        failRatePercent: res.data.failRatePercent ?? 5,
        platformFeePercent: res.data.platformFeePercent ?? 0,
        priceRounding: res.data.priceRounding ?? "NONE",
        minPriceCents: res.data.minPriceCents ?? 0,
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
    setTierRows([]);
    setExtraRows([]);
    setCalcQty("1");
    setShowForm(true);
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    const n = p.piecesPerPlate && p.piecesPerPlate > 1 ? p.piecesPerPlate : 1; // gespeichert wird je Stück, angezeigt je Druckplatte
    setForm({
      sku: p.sku || "",
      name: p.name,
      description: p.description || "",
      unit: p.unit,
      unitPriceEur: (p.unitPriceCents / 100).toFixed(2),
      vatRateBps: p.vatRateBps,
      printTimeMinutes: p.printTimeMinutes ? field(p.printTimeMinutes * n) : "",
      laborMinutes: p.laborMinutes ? String(p.laborMinutes) : "",
      printerId: p.printerId ?? "",
      setupMinutes: p.setupMinutes ? String(p.setupMinutes) : "",
      packagingEur: p.packagingCents ? String(p.packagingCents / 100) : "",
      extraMaterialPercent: p.extraMaterialPercent ? String(p.extraMaterialPercent) : "",
      piecesPerPlate: String(n),
    });
    setExtraRows((p.extraCosts ?? []).map((x) => ({ label: x.label, amountEur: (x.amountCents / 100).toFixed(2) })));
    setTierRows((p.priceTiers ?? []).map((t) => ({ minQuantity: String(t.minQuantity), priceEur: (t.unitPriceCents / 100).toFixed(2) })));
    setCalcQty("1");
    setMaterialRows(p.materials.map((m) => ({ materialId: m.materialId, quantityPerUnit: field(m.quantityPerUnit * n), override: m.costOverrideCents != null ? field(m.costOverrideCents / 100) : "" })));
    setShowForm(true);
  }

  function addMaterialRow() {
    if (materials.length === 0) return;
    setMaterialRows((rows) => [...rows, { materialId: materials[0].id, quantityPerUnit: "", override: "" }]);
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
    const n = pieces; // Zeit und Material sind je Druckplatte erfasst, gespeichert wird je Stück
    const payload = {
      sku: form.sku || undefined,
      name: form.name,
      description: form.description || undefined,
      unit: form.unit,
      unitPriceCents: Math.round(parseFloat(form.unitPriceEur) * 100),
      vatRateBps: form.vatRateBps,
      printTimeMinutes: (parseFloat(form.printTimeMinutes) || 0) / n,
      piecesPerPlate: n,
      extraCosts: extraRows.filter((x) => x.label.trim() && parseFloat(x.amountEur) > 0).map((x) => ({ label: x.label.trim(), amountCents: Math.round(parseFloat(x.amountEur) * 100) })),
      laborMinutes: parseFloat(form.laborMinutes) || 0,
      printerId: form.printerId || null,
      setupMinutes: parseFloat(form.setupMinutes) || 0,
      packagingCents: Math.round((parseFloat(form.packagingEur) || 0) * 100),
      extraMaterialPercent: parseFloat(form.extraMaterialPercent) || 0,
      priceTiers: tierRows
        .map((r) => ({ minQuantity: parseFloat(r.minQuantity), unitPriceCents: Math.round((parseFloat(r.priceEur) || 0) * 100) }))
        .filter((r) => r.minQuantity >= 2 && r.unitPriceCents > 0),
      materials: validMaterialRows.map((r) => ({ materialId: r.materialId, quantityPerUnit: parseFloat(r.quantityPerUnit) / n, costOverrideCents: r.override.trim() !== "" && parseFloat(r.override) >= 0 ? parseFloat(r.override) * 100 : null })),
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
  const pieces = Math.max(1, Math.floor(parseFloat(form.piecesPerPlate) || 1));
  const extraTotalCents = extraRows.reduce((s, x) => s + Math.round((parseFloat(x.amountEur) || 0) * 100), 0);
  function formExtras(quantity: number) {
    return { extraCostsCents: extraTotalCents, setupMinutes: parseFloat(form.setupMinutes) || 0, packagingCents: Math.round((parseFloat(form.packagingEur) || 0) * 100), extraMaterialPercent: parseFloat(form.extraMaterialPercent) || 0, quantity };
  }
  const liveUsed = materialRows
    .map((r) => ({ quantityPerUnit: (parseFloat(r.quantityPerUnit) || 0) / pieces, costPerUnitCents: r.override.trim() !== "" && parseFloat(r.override) >= 0 ? parseFloat(r.override) * 100 : materials.find((m) => m.id === r.materialId)?.costPerUnitCents ?? 0 }))
    .filter((r) => r.quantityPerUnit > 0);
  const costAtQuantity = (q: number) =>
    calcCost(liveUsed, (parseFloat(form.printTimeMinutes) || 0) / pieces, parseFloat(form.laborMinutes) || 0, rates, printers.find((pr) => pr.id === form.printerId), formExtras(q));
  const liveCost = costAtQuantity(Math.max(1, parseFloat(calcQty) || 1));
  const livePriceCents = Math.round(parseFloat(form.unitPriceEur) * 100) || 0;
  const liveFees = feesAt(livePriceCents, rates);
  const liveProfit = livePriceCents - liveFees - liveCost.total;

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
              <p className="text-xs text-slate-500 mt-1">Verkaufspreis <strong>netto</strong> (ohne USt.). Den Preisvorschlag aus der Kalkulation unten können Sie mit "Übernehmen" eintragen.</p>
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

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3 items-start">
              <div>
                <label className="block text-sm mb-1">Stück pro Druckplatte</label>
                <input type="number" min="1" step="1" value={form.piecesPerPlate} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, piecesPerPlate: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              </div>
              <p className="text-xs text-slate-500 sm:pt-6">
                {pieces > 1
                  ? <>Druckzeit und Materialverbrauch unten tragen Sie <strong>für die ganze Platte</strong> ein (so zeigt es der Slicer) - die Software teilt durch {pieces} Stück. Pro Stück: {field((parseFloat(form.printTimeMinutes) || 0) / pieces)} min Druckzeit.</>
                  : <>Passen mehrere gleiche Teile auf eine Druckplatte, tragen Sie hier die Anzahl ein. Dann gelten Druckzeit und Materialverbrauch unten für die ganze Platte, und die Kosten werden auf die Stück verteilt. Bei 1 gelten die Werte pro Stück.</>}
              </p>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm">Materialverbrauch {pieces > 1 ? "pro Druckplatte" : `pro ${form.unit || "Einheit"}`} (optional)</label>
              <button type="button" onClick={addMaterialRow} disabled={materials.length === 0} className="text-brand hover:underline text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                + Material hinzufügen
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-2">Wie viel Material ein Stück verbraucht - den Wert zeigt Ihr Slicer (Bambu Studio, Cura, PrusaSlicer) nach dem Slicen an, <strong>inklusive Stützstrukturen, Skirt und Purge</strong>. Beim Erstellen einer Rechnung wird der Bestand automatisch um diese Menge verringert.</p>
            {materials.length === 0 && <p className="text-xs text-slate-500">Noch kein Material angelegt - siehe Katalog → Material (Lager).</p>}
            {materialRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_130px_150px_auto] gap-2 mb-2">
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
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder={`Preis €/${materials.find((m) => m.id === row.materialId)?.unit || "Einheit"} (optional)`}
                  title={`Eigener Preis nur für dieses Produkt. Leer = Lagerpreis (${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 5 }).format((materials.find((m) => m.id === row.materialId)?.costPerUnitCents ?? 0) / 100)} €/${materials.find((m) => m.id === row.materialId)?.unit || ""})`}
                  value={row.override}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => updateMaterialRow(idx, { override: e.target.value })}
                  className={`w-full px-3 py-2 rounded border bg-white dark:bg-slate-800 ${row.override.trim() !== "" ? "border-brand" : "border-slate-300 dark:border-slate-600"}`}
                />
                <button type="button" onClick={() => removeMaterialRow(idx)} className="text-red-500 px-2">✕</button>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
            <div className="text-sm font-medium">Kalkulation (optional)</div>
            <p className="text-xs text-slate-500 -mt-2">
              Ergebnis = Material (mit Ausschuss) + Strom + Abschreibung + Verschleiß + Arbeit + Gemeinkosten = <strong>Selbstkosten</strong>. Darauf kommt der Gewinnaufschlag = <strong>Preisvorschlag</strong>. Alle Sätze stehen unter Einstellungen → Firma → Kalkulation, die Maschinenwerte unter Katalog → Drucker.
            </p>
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
                <label className="block text-xs text-slate-500 mb-1">Druckzeit {pieces > 1 ? "pro Druckplatte" : `pro ${form.unit || "Einheit"}`} (Minuten)</label>
                <input type="number" min="0" step="any" value={form.printTimeMinutes} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, printTimeMinutes: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                <p className="text-xs text-slate-500 mt-1">Reine Druckzeit laut Slicer. Beispiel: 2 h 30 min = 150. {pieces > 1 ? "Für die ganze Platte." : "Bei mehreren Teilen pro Platte oben die Stückzahl eintragen."}</p>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Arbeitszeit pro {form.unit || "Einheit"} (Minuten, Nachbearbeitung/Verpackung)</label>
                <input type="number" min="0" step="any" value={form.laborMinutes} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, laborMinutes: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                <p className="text-xs text-slate-500 mt-1">Ihre eigene Zeit, in der Sie arbeiten statt der Drucker: Platte vorbereiten, Stützen entfernen, schleifen, verpacken. Typisch 3-10 Minuten. Wird mit dem Arbeitsstundensatz bewertet.</p>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs text-slate-500">Veredelung / Nachbearbeitung (Kosten pro {form.unit || "Einheit"})</label>
                <button type="button" onClick={() => setExtraRows((rows) => [...rows, { label: "", amountEur: "" }])} className="text-brand hover:underline text-sm">+ Posten hinzufügen</button>
              </div>
              <p className="text-xs text-slate-500 mb-2">Zusätzliche Kosten pro Stück, z.B. Lackieren 40 €, Klarlack 2 €, Magnete 0,50 €. Fremdleistungen und Zubehör gehören hierher; Ihre eigene Arbeitszeit tragen Sie oben als Arbeitszeit ein.</p>
              {extraRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_110px_auto] gap-2 mb-2">
                  <input list="extra-suggestions" placeholder="Bezeichnung" value={row.label} onChange={(e) => setExtraRows((rows) => rows.map((r, i) => (i === idx ? { ...r, label: e.target.value } : r)))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                  <input type="number" min="0" step="0.01" placeholder="€" value={row.amountEur} onFocus={(e) => e.target.select()} onChange={(e) => setExtraRows((rows) => rows.map((r, i) => (i === idx ? { ...r, amountEur: e.target.value } : r)))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                  <button type="button" onClick={() => setExtraRows((rows) => rows.filter((_, i) => i !== idx))} className="text-red-500 px-2">✕</button>
                </div>
              ))}
              <datalist id="extra-suggestions">{EXTRA_SUGGESTIONS.map((x) => <option key={x} value={x} />)}</datalist>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Rüstzeit pro Auftrag (Minuten)</label>
                <input type="number" min="0" step="any" value={form.setupMinutes} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, setupMinutes: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                <p className="text-xs text-slate-500 mt-1">Zeit, die <strong>einmal pro Auftrag</strong> anfällt, egal wie viele Stück: Datei slicen, Platte und Material einrichten, Auftrag abwickeln. Verteilt sich auf die Stückzahl (Tabelle unten).</p>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Verpackung &amp; Versand pro {form.unit || "Einheit"} (€)</label>
                <input type="number" min="0" step="0.01" value={form.packagingEur} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, packagingEur: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                <p className="text-xs text-slate-500 mt-1">Karton, Polstermaterial, Etikett. Porto nur eintragen, wenn Sie den Versand <strong>nicht</strong> separat berechnen.</p>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Zusätzlicher Materialverlust (%)</label>
                <input type="number" min="0" step="any" value={form.extraMaterialPercent} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, extraMaterialPercent: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                <p className="text-xs text-slate-500 mt-1">Nur für Sonderfälle zusätzlich zum allgemeinen Ausschuss: z.B. Mehrfarbdruck mit AMS (Spülblock/Purge, oft 20-100 %) oder sehr viele Stützen. Sonst leer lassen.</p>
              </div>
            </div>
            {liveCost.total > 0 ? (
              <div className="text-sm space-y-1 bg-slate-50 dark:bg-slate-900/40 rounded p-3">
                <div className="flex items-center justify-between gap-2 pb-1">
                  <label className="text-xs text-slate-500" htmlFor="calc-qty">Berechnet für Auftragsmenge (Stück) - bestimmt den Rüstzeit-Anteil</label>
                  <input id="calc-qty" type="number" min="1" step="1" value={calcQty} onFocus={(e) => e.target.select()} onChange={(e) => setCalcQty(e.target.value)} className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-right" />
                </div>
                <div className="flex justify-between"><span className="text-slate-500">Material (inkl. {rates.materialWastePercent + (parseFloat(form.extraMaterialPercent) || 0)}% Ausschuss/Verlust)</span><span>{formatPrice(liveCost.material)}</span></div>
                {form.printerId ? (
                  <>
                    <div className="flex justify-between"><span className="text-slate-500">Strom</span><span>{formatPrice(liveCost.electricity)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Abschreibung Drucker</span><span>{formatPrice(liveCost.depreciation)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Verschleiß &amp; Wartung</span><span>{formatPrice(liveCost.wear)}</span></div>
                  </>
                ) : (
                  <div className="flex justify-between"><span className="text-slate-500">Maschine (pauschal)</span><span>{formatPrice(liveCost.machineFlat)}</span></div>
                )}
                {rates.failRatePercent > 0 && <div className="flex justify-between"><span className="text-slate-500">Fehldrucke ({rates.failRatePercent}% auf Maschinenzeit)</span><span>{formatPrice(liveCost.failures)}</span></div>}
                <div className="flex justify-between"><span className="text-slate-500">Arbeit{liveCost.setup > 0 ? ` (davon Rüstzeit ${formatPrice(liveCost.setup)})` : ""}</span><span>{formatPrice(liveCost.labor)}</span></div>
                {extraRows.filter((x) => x.label.trim() && parseFloat(x.amountEur) > 0).map((x, i) => (
                  <div key={i} className="flex justify-between"><span className="text-slate-500">{x.label}</span><span>{formatPrice(Math.round(parseFloat(x.amountEur) * 100))}</span></div>
                ))}
                {liveCost.packaging > 0 && <div className="flex justify-between"><span className="text-slate-500">Verpackung &amp; Versand</span><span>{formatPrice(liveCost.packaging)}</span></div>}
                {rates.overheadPercent > 0 && <div className="flex justify-between"><span className="text-slate-500">Gemeinkosten ({rates.overheadPercent}%)</span><span>{formatPrice(liveCost.overhead)}</span></div>}
                <div className="flex justify-between font-medium border-t border-slate-200 dark:border-slate-700 pt-1"><span>Selbstkosten</span><span>{formatPrice(liveCost.total)}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500" title={`${rates.targetMarginPercent}% Aufschlag auf die Selbstkosten entsprechen ${(100 - 10000 / (100 + rates.targetMarginPercent)).toFixed(0)}% Gewinn vom Verkaufspreis`}>
                    Preisvorschlag (netto, +{rates.targetMarginPercent}% auf Selbstkosten{rates.platformFeePercent > 0 ? `, ${rates.platformFeePercent}% Gebühren eingerechnet` : ""})
                  </span>
                  <span className="flex items-center gap-2">
                    {formatPrice(liveCost.recommended)}
                    <button type="button" onClick={() => setForm((f) => ({ ...f, unitPriceEur: (liveCost.recommended / 100).toFixed(2) }))} className="text-brand hover:underline text-xs">Übernehmen</button>
                  </span>
                </div>
                {Math.abs(liveCost.recommended - liveCost.recommendedRaw) > 0.5 && (
                  <p className="text-xs text-slate-500">
                    {liveCost.recommendedRaw < rates.minPriceCents && liveCost.recommended === rates.minPriceCents ? `Mindestpreis ${formatPrice(rates.minPriceCents)} greift (rechnerisch ${formatPrice(liveCost.recommendedRaw)}).` : `Gerundet von ${formatPrice(liveCost.recommendedRaw)} (Einstellungen → Firma → Kalkulation).`}
                  </p>
                )}
                {rates.platformFeePercent > 0 && livePriceCents > 0 && <div className="flex justify-between"><span className="text-slate-500">Plattform-/Zahlungsgebühren bei aktuellem Preis ({rates.platformFeePercent}%)</span><span>{formatPrice(liveFees)}</span></div>}
                <div className={`flex justify-between font-medium ${liveProfit < 0 ? "text-red-600" : "text-green-600"}`}>
                  <span>Gewinn bei aktuellem Preis ({formatPrice(livePriceCents)})</span>
                  <span>{formatPrice(liveProfit)}{livePriceCents > 0 ? ` (${Math.round((liveProfit / livePriceCents) * 100)}% vom Preis)` : ""}</span>
                </div>
                <p className="text-xs text-slate-500 pt-1">"Gewinn" ist vor Steuern und Ihrem Unternehmerlohn - Einkommen-/Gewerbesteuer und Sozialabgaben sind darin nicht berücksichtigt. {liveCost.depreciation > 0 && "Die Abschreibung ist eine Rücklage für den nächsten Drucker, kein Geld, das Sie sofort ausgeben."}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Material oben, Druck-/Arbeitszeit hier eintragen und die Stundensätze unter Einstellungen → Firma hinterlegen - dann erscheinen Selbstkosten, Preisvorschlag und Gewinn.</p>
            )}
            {liveCost.total > 0 && (parseFloat(form.setupMinutes) || 0) > 0 && (
              <div className="text-sm bg-slate-50 dark:bg-slate-900/40 rounded p-3">
                <div className="font-medium mb-1">Preis je Stück nach Auftragsmenge</div>
                <div className="grid grid-cols-[repeat(4,auto)] gap-x-4 gap-y-0.5 justify-start text-xs sm:text-sm">
                  <span className="text-slate-500">Menge</span><span className="text-slate-500 text-right">Selbstkosten</span><span className="text-slate-500 text-right">Preisvorschlag</span><span className="text-slate-500 text-right">Gewinn bei Preis</span>
                  {[1, 5, 10, 25, 50, 100].map((q) => {
                    const c = costAtQuantity(q);
                    const p = livePriceCents - liveFees - c.total;
                    return (
                      <Fragment key={q}>
                        <span>{q} Stk.</span><span className="text-right">{formatPrice(c.total)}</span><span className="text-right">{formatPrice(c.recommended)}</span><span className={`text-right ${p < 0 ? "text-red-600" : "text-green-600"}`}>{livePriceCents > 0 ? formatPrice(p) : "-"}</span>
                      </Fragment>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500 mt-1">Je mehr Stück pro Auftrag, desto kleiner der Rüstzeit-Anteil. Das können Sie unten als Staffelpreis weitergeben.</p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div className="text-sm font-medium">Staffelpreise (optional)</div>
              <div className="flex gap-3 text-sm">
                {liveCost.total > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const rows: TierRow[] = [];
                      for (const q of [10, 50, 100]) {
                        const price = costAtQuantity(q).recommended;
                        const limit = rows.length ? Math.round(parseFloat(rows[rows.length - 1].priceEur) * 100) : livePriceCents || Infinity;
                        if (price < limit) rows.push({ minQuantity: String(q), priceEur: (price / 100).toFixed(2) });
                      }
                      setTierRows(rows);
                    }}
                    className="text-brand hover:underline"
                  >
                    Aus Kalkulation vorschlagen
                  </button>
                )}
                <button type="button" onClick={() => setTierRows((rows) => [...rows, { minQuantity: "", priceEur: "" }])} className="text-brand hover:underline">+ Staffel hinzufügen</button>
              </div>
            </div>
            <p className="text-xs text-slate-500">Günstigerer Stückpreis ab einer Mindestmenge, z.B. ab 10 Stück 9,00 €. Beim Erstellen eines Angebots oder einer Rechnung wird der Preis automatisch passend zur Menge gesetzt (einen von Hand geänderten Preis überschreibt das nicht). Preise netto. "Aus Kalkulation vorschlagen" setzt Staffeln ab 10, 50 und 100 Stück, sofern sie günstiger als der aktuelle Preis sind.</p>
            {tierRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                <input type="number" min="2" step="1" placeholder="Ab Menge (Stk.)" value={row.minQuantity} onFocus={(e) => e.target.select()} onChange={(e) => setTierRows((rows) => rows.map((r, i) => (i === idx ? { ...r, minQuantity: e.target.value } : r)))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                <input type="number" min="0" step="0.01" placeholder="Preis pro Stück (€)" value={row.priceEur} onFocus={(e) => e.target.select()} onChange={(e) => setTierRows((rows) => rows.map((r, i) => (i === idx ? { ...r, priceEur: e.target.value } : r)))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                <button type="button" onClick={() => setTierRows((rows) => rows.filter((_, i) => i !== idx))} className="text-red-500 px-2">✕</button>
              </div>
            ))}
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
              <div className="hidden xl:grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: "1fr 140px 90px auto" }}>
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  {(p.sku || p.description) && (
                    <div className="text-xs text-slate-500 truncate">{[p.sku, p.description].filter(Boolean).join(" · ")}</div>
                  )}
                  {(() => {
                    const cost = calcCost(
                      p.materials.map((m) => ({ quantityPerUnit: m.quantityPerUnit, costPerUnitCents: m.costOverrideCents ?? m.material.costPerUnitCents ?? 0 })),
                      p.printTimeMinutes ?? 0,
                      p.laborMinutes ?? 0,
                      rates,
                      printers.find((pr) => pr.id === p.printerId),
                      { setupMinutes: p.setupMinutes, packagingCents: p.packagingCents, extraMaterialPercent: p.extraMaterialPercent, extraCostsCents: (p.extraCosts ?? []).reduce((s, x) => s + x.amountCents, 0) }
                    );
                    if (cost.total <= 0 || p.unitPriceCents <= 0) return null;
                    const profit = p.unitPriceCents - feesAt(p.unitPriceCents, rates) - cost.total;
                    return (
                      <div className={`text-xs ${profit < 0 ? "text-red-600" : "text-green-600"}`}>
                        Kosten {formatPrice(cost.total)}{(p.setupMinutes ?? 0) > 0 ? " (bei 1 Stk.)" : ""} · Gewinn {formatPrice(profit)} ({Math.round((profit / p.unitPriceCents) * 100)}%)
                      </div>
                    );
                  })()}
                  {p.priceTiers && p.priceTiers.length > 0 && (
                    <div className="text-xs text-slate-400 truncate">
                      Staffelpreise: {p.priceTiers.map((t) => `ab ${t.minQuantity} Stk. ${formatPrice(t.unitPriceCents)}`).join(" · ")}
                    </div>
                  )}
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
