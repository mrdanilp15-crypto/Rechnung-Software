import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { SaveButton } from "../components/SaveButton";
import { useSaveStatus } from "../hooks/useSaveStatus";
import { InfoBox } from "../components/InfoBox";
import { useToast } from "../components/Toast";
import { MobileCard, MobileField } from "../components/MobileCard";
import { RowActionsMenu } from "../components/RowActionsMenu";

interface Material {
  amsMeasured?: boolean;
  amsSources?: string[];
  id: string;
  name: string;
  unit: string;
  stockQuantity: number;
  costPerUnitCents: number;
  supplierId?: string | null;
}

const emptyForm = { name: "", unit: "g", stockQuantity: "0", initialCostEur: "", costPerUnitEur: "", supplierId: "" };
const emptyRestock = { quantity: "", totalCostEur: "", vendor: "" };

const formatEuro = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
// Preis/Einheit liegt bei kleinen Einheiten (z.B. Gramm) oft deutlich unter einem Cent -
// mit der normalen 2-Nachkommastellen-Währungsformatierung würde das auf "0,00 €" runden.
const formatUnitPrice = (cents: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(cents / 100);
const formatQty = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);

export default function Materials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [restockForm, setRestockForm] = useState(emptyRestock);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const createSave = useSaveStatus();
  const restockSave = useSaveStatus();
  const showToast = useToast();

  function load() {
    api.get("/materials").then((res) => setMaterials(res.data));
  }
  useEffect(load, []);
  useEffect(() => {
    api.get("/suppliers").then((res) => setSuppliers(res.data)).catch(() => setSuppliers([]));
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(m: Material) {
    setEditingId(m.id);
    setForm({
      name: m.name,
      unit: m.unit,
      stockQuantity: String(m.stockQuantity),
      initialCostEur: "",
      costPerUnitEur: m.costPerUnitCents ? String(m.costPerUnitCents / 100) : "",
      supplierId: m.supplierId ?? "",
    });
    setShowForm(true);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const stockQuantity = parseFloat(form.stockQuantity) || 0;
    const payload: Record<string, unknown> = { name: form.name, unit: form.unit, stockQuantity, supplierId: form.supplierId || null };
    if (editingId) {
      if (form.costPerUnitEur) payload.costPerUnitCents = parseFloat(form.costPerUnitEur) * 100;
    } else {
      if (form.initialCostEur) payload.initialCostCents = Math.round(parseFloat(form.initialCostEur) * 100);
    }
    try {
      await createSave.run(() =>
        editingId ? api.patch(`/materials/${editingId}`, payload) : api.post("/materials", payload)
      );
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      load();
      showToast(editingId ? "Material aktualisiert" : "Material angelegt", "success");
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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold">Material</h1>
        <button onClick={startCreate} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm w-full sm:w-auto">
          Neues Material
        </button>
      </div>

      <InfoBox title="Wozu dient Material?" defaultOpen>
        <p>Hier erfasst du <strong>Rohstoffe</strong>, die du selbst einkaufst (z.B. Filament) - getrennt von den Produkten, die du verkaufst.</p>
        <p>Trage beim Anlegen direkt ein, wie viel du hast und was du dafür insgesamt bezahlt hast (z.B. 1000g für 24,99€) - der Preis pro Einheit wird automatisch berechnet und eine passende Ausgabe angelegt (Finanzen → Ausgaben), du musst den Einkauf also nicht doppelt eintragen. Käufst du später nach, geht das genauso über <strong>"Nachbestellen"</strong>.</p>
<p><strong>Wichtig für die Kalkulation:</strong> Beim Nachbestellen rechnet die Software mit dem <em>gleitenden Durchschnittspreis</em>: Reste der alten Spule behalten ihren alten Preis, die neue Lieferung ihren neuen - daraus entsteht ein gemeinsamer Preis pro Einheit (z.B. 500 g Rest zu 0,02 € + 1000 g für 30 € ergeben rund 0,0267 €/g). Rabatte und Versandkosten gehören in den Gesamtpreis, damit der echte Einkaufspreis stimmt. Bei "Bearbeiten" können Sie den Preis auch von Hand korrigieren.</p>
        <p>Bei <strong>Produkte</strong> kannst du hinterlegen, wie viel von welchem Material ein Produkt pro Stück verbraucht (z.B. "15g Filament pro Druck"). Beim Erstellen einer Rechnung wird der Bestand hier automatisch entsprechend reduziert.</p>
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
            <p className="text-xs text-slate-500 mt-1">Wähl die kleinste Einheit, die du beim Verbrauch pro Produkt eintippen willst - bei Filament z.B. <strong>g</strong> statt kg, da ein Druck oft nur wenige Gramm braucht.</p>
          </div>
          <div>
            <label className="block text-sm mb-1">{editingId ? "Bestand (Korrektur)" : "Aktueller Bestand"}</label>
            <input type="number" step="any" min="0" value={form.stockQuantity} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, stockQuantity: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            <p className="text-xs text-slate-500 mt-1">{editingId ? "Nur ändern, wenn Sie nachgezählt/-gewogen haben (z.B. Spule wiegen minus Leerspule). Normalerweise bucht die Software den Verbrauch selbst." : "Menge in der oben gewählten Einheit, z.B. 1000 für eine 1-kg-Spule bei Einheit g."}</p>
          </div>
          {editingId ? (
            <div>
              <label className="block text-sm mb-1">Preis pro Einheit (€, Korrektur)</label>
              <input type="number" step="any" min="0" placeholder="z.B. 0,025" value={form.costPerUnitEur} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, costPerUnitEur: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <p className="text-xs text-slate-500 mt-1">Preis je {form.unit || "Einheit"}. Beispiel: 1 kg für 24,99 € = 0,02499 € pro g. Dieser Preis fließt in die Produktkalkulation ein.</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm mb-1">Gesamtpreis dafür (€, optional)</label>
              <input type="number" step="0.01" min="0" placeholder="z.B. 24,99" value={form.initialCostEur} onFocus={(e) => e.target.select()} onChange={(e) => setForm((f) => ({ ...f, initialCostEur: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
              <p className="text-xs text-slate-500 mt-1">Was du für den oben angegebenen Bestand insgesamt bezahlt hast - der Preis/Einheit wird automatisch berechnet, eine Ausgabe automatisch angelegt.</p>
            </div>
          )}
          <div className="sm:col-span-3">
            <label className="block text-sm mb-1">Lieferant (optional)</label>
            <select value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))} className="w-full sm:max-w-sm px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
              <option value="">Kein Lieferant</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="text-xs text-slate-500 mt-1">Wo Sie dieses Material normalerweise kaufen. Nachbestellungen werden auf diesen Lieferanten gebucht (Lieferanten pflegen Sie unter Katalog → Lieferanten).</p>
          </div>
          <div className="sm:col-span-3 flex gap-2">
            <SaveButton status={createSave.status} className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded justify-center">{editingId ? "Speichern" : "Anlegen"}</SaveButton>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700">Abbrechen</button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        <div className="hidden xl:grid items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500" style={{ gridTemplateColumns: "1fr 130px 140px auto" }}>
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
            <div className="hidden xl:grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: "1fr 130px 140px auto" }}>
              <span className="min-w-0"><span className="block font-medium truncate">{m.name}{m.amsMeasured && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-normal" title={(m.amsSources ?? []).join(", ") + " - der Verbrauch wird aus dem AMS gemessen und automatisch abgebucht, nicht über Rechnungs-Rezepte"}>AMS-gemessen</span>}</span>{m.supplierId && <span className="block text-xs text-slate-500 truncate">{suppliers.find((s) => s.id === m.supplierId)?.name}</span>}</span>
              <span className="text-right">{stockValue}</span>
              <span className="text-right text-slate-500">{formatUnitPrice(m.costPerUnitCents)}/{m.unit}</span>
              {actions}
            </div>
            {/* Mobile */}
            <MobileCard title={m.name} actions={actions}>
              <MobileField label="Bestand" value={stockValue} />
              <MobileField label="Preis/Einheit" value={`${formatUnitPrice(m.costPerUnitCents)}/${m.unit}`} />
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
