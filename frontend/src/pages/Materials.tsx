import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { SaveButton } from "../components/SaveButton";
import { useSaveStatus } from "../hooks/useSaveStatus";
import { InfoBox } from "../components/InfoBox";
import { useToast } from "../components/Toast";
import { MobileCard, MobileField } from "../components/MobileCard";
import { RowActionsMenu } from "../components/RowActionsMenu";

interface Material {
  id: string;
  name: string;
  unit: string;
  stockQuantity: number;
  costPerUnitCents: number;
}

const emptyForm = { name: "", unit: "g", stockQuantity: "0" };
const emptyRestock = { quantity: "", totalCostEur: "", vendor: "" };

const formatEuro = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const formatQty = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);

export default function Materials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [restockForm, setRestockForm] = useState(emptyRestock);
  const [error, setError] = useState<string | null>(null);
  const createSave = useSaveStatus();
  const restockSave = useSaveStatus();
  const showToast = useToast();

  function load() {
    api.get("/materials").then((res) => setMaterials(res.data));
  }
  useEffect(load, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(m: Material) {
    setEditingId(m.id);
    setForm({ name: m.name, unit: m.unit, stockQuantity: String(m.stockQuantity) });
    setShowForm(true);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = { name: form.name, unit: form.unit, stockQuantity: parseFloat(form.stockQuantity) || 0 };
    try {
      await createSave.run(() =>
        editingId ? api.patch(`/materials/${editingId}`, payload) : api.post("/materials", payload)
      );
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Fehler beim Speichern");
    }
  }

  function startRestock(m: Material) {
    setRestockingId(m.id);
    setRestockForm(emptyRestock);
  }

  async function handleRestock(e: FormEvent, material: Material) {
    e.preventDefault();
    setError(null);
    try {
      await restockSave.run(() =>
        api.post(`/materials/${material.id}/restock`, {
          quantity: parseFloat(restockForm.quantity),
          totalCostCents: Math.round(parseFloat(restockForm.totalCostEur) * 100),
          vendor: restockForm.vendor || undefined,
        })
      );
      setRestockingId(null);
      load();
      showToast(`${material.name} nachbestellt, Ausgabe automatisch angelegt`, "success");
    } catch (err: any) {
      setError(err.response?.data?.error || "Fehler beim Nachbestellen");
    }
  }

  async function handleArchive(m: Material) {
    if (!confirm(`Material "${m.name}" wirklich archivieren?`)) return;
    await api.delete(`/materials/${m.id}`);
    load();
    showToast(`${m.name} archiviert`, "success");
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Material</h1>
        <button onClick={startCreate} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
          Neues Material
        </button>
      </div>

      <InfoBox title="Wozu dient Material?" defaultOpen>
        <p>Hier erfasst du <strong>Rohstoffe</strong>, die du selbst einkaufst (z.B. Filament) - getrennt von den Produkten, die du verkaufst.</p>
        <p>Bei <strong>Produkte</strong> kannst du hinterlegen, wie viel von welchem Material ein Produkt pro Stück verbraucht (z.B. "15g Filament pro Druck"). Beim Erstellen einer Rechnung wird der Bestand hier automatisch entsprechend reduziert. Über <strong>"Nachbestellen"</strong> trägst du einen Einkauf ein - das erhöht den Bestand und legt automatisch eine passende Ausgabe an (Finanzen → Ausgaben), du musst den Einkauf also nicht doppelt eintragen.</p>
      </InfoBox>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm mb-1">Name *</label>
            <input required placeholder="z.B. PLA Filament schwarz" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-sm mb-1">Einheit</label>
            <input placeholder="z.B. g, kg, Stk., m" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-sm mb-1">{editingId ? "Bestand (Korrektur)" : "Aktueller Bestand"}</label>
            <input type="number" step="any" min="0" value={form.stockQuantity} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, stockQuantity: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          </div>
          <div className="sm:col-span-3 flex gap-2">
            <SaveButton status={createSave.status} className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded justify-center">{editingId ? "Speichern" : "Anlegen"}</SaveButton>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700">Abbrechen</button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        <div className="hidden md:grid items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500" style={{ gridTemplateColumns: "1fr 130px 140px auto" }}>
          <span>Name</span>
          <span className="text-right">Bestand</span>
          <span className="text-right">Preis/Einheit</span>
          <span></span>
        </div>
        {materials.map((m) => {
          const stockValue = (
            <span className={m.stockQuantity < 0 ? "text-red-600 font-medium" : ""}>
              {formatQty(m.stockQuantity)} {m.unit}
            </span>
          );
          const actions = (
            <div className="flex gap-2 justify-end items-center">
              <button onClick={() => startRestock(m)} className="text-brand hover:underline whitespace-nowrap">Nachbestellen</button>
              <RowActionsMenu
                actions={[
                  { label: "Bearbeiten", onClick: () => startEdit(m) },
                  { label: "Archivieren", onClick: () => handleArchive(m), danger: true },
                ]}
              />
            </div>
          );
          return (
          <div key={m.id}>
            {/* Desktop */}
            <div className="hidden md:grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: "1fr 130px 140px auto" }}>
              <span className="font-medium truncate">{m.name}</span>
              <span className="text-right">{stockValue}</span>
              <span className="text-right text-slate-500">{formatEuro(m.costPerUnitCents)}/{m.unit}</span>
              {actions}
            </div>
            {/* Mobile */}
            <MobileCard title={m.name} actions={actions}>
              <MobileField label="Bestand" value={stockValue} />
              <MobileField label="Preis/Einheit" value={`${formatEuro(m.costPerUnitCents)}/${m.unit}`} />
            </MobileCard>
            {restockingId === m.id && (
              <form onSubmit={(e) => handleRestock(e, m)} className="grid grid-cols-1 sm:grid-cols-4 gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700">
                <div>
                  <label className="block text-sm mb-1">Menge ({m.unit})</label>
                  <input required type="number" step="any" min="0.01" value={restockForm.quantity} onFocus={(e) => e.target.select()} onChange={(e) => setRestockForm((f) => ({ ...f, quantity: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Gesamtpreis (€)</label>
                  <input required type="number" step="0.01" min="0" value={restockForm.totalCostEur} onFocus={(e) => e.target.select()} onChange={(e) => setRestockForm((f) => ({ ...f, totalCostEur: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Händler (optional)</label>
                  <input value={restockForm.vendor} onChange={(e) => setRestockForm((f) => ({ ...f, vendor: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
                </div>
                <div className="flex items-end gap-2">
                  <SaveButton status={restockSave.status} className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded justify-center">Buchen</SaveButton>
                  <button type="button" onClick={() => setRestockingId(null)} className="px-3 py-2 rounded bg-slate-200 dark:bg-slate-700">✕</button>
                </div>
              </form>
            )}
          </div>
          );
        })}
        {materials.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Kein Material erfasst.</p>}
      </div>
    </div>
  );
}
