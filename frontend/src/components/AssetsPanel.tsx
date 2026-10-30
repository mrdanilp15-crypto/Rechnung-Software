import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { InfoBox } from "./InfoBox";
import { useToast } from "./Toast";

interface Asset {
  id: string;
  name: string;
  purchaseDate: string;
  costCents: number;
  method: "GWG" | "LINEAR";
  usefulLifeYears: number | null;
  expenseId: string | null;
  notes: string | null;
  afaThisYear: number;
  bookValueEndOfYear: number;
  schedule: { year: number; amountCents: number }[];
}
interface ExpenseOption {
  id: string;
  date: string;
  vendor: string;
  description?: string | null;
  amountCents: number;
  inAssetRegister?: boolean;
}

const money = (c: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100);
const dateDe = (iso: string) => new Intl.DateTimeFormat("de-DE").format(new Date(iso));
const inputClass = "w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";
const emptyForm = { name: "", purchaseDate: new Date().toISOString().slice(0, 10), costEur: "", method: "LINEAR" as "GWG" | "LINEAR", years: "3", expenseId: "", notes: "" };

/** Anlageverzeichnis: Drucker, Werkzeug und andere Anschaffungen, die über mehrere Jahre abgeschrieben (AfA) oder als GWG sofort abgesetzt werden. */
export function AssetsPanel({ year, onChanged }: { year: number; onChanged?: () => void }) {
  const showToast = useToast();
  const [items, setItems] = useState<Asset[]>([]);
  const [gwgLimit, setGwgLimit] = useState(80000);
  const [expenses, setExpenses] = useState<ExpenseOption[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/assets", { params: { year } }).then((r) => {
      setItems(r.data.items);
      setGwgLimit(r.data.gwgLimitNetCents);
    });
    api.get("/expenses").then((r) => setExpenses(r.data));
  }, [year]);
  useEffect(load, [load]);

  const cost = Math.round((parseFloat(form.costEur.replace(",", ".")) || 0) * 100);
  const freeExpenses = expenses.filter((e) => !e.inAssetRegister || e.id === form.expenseId);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  }
  function startEdit(a: Asset) {
    setEditingId(a.id);
    setForm({ name: a.name, purchaseDate: a.purchaseDate.slice(0, 10), costEur: (a.costCents / 100).toFixed(2), method: a.method, years: String(a.usefulLifeYears ?? 3), expenseId: a.expenseId ?? "", notes: a.notes ?? "" });
    setError(null);
    setShowForm(true);
  }
  function pickExpense(id: string) {
    const e = expenses.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      expenseId: id,
      ...(e && !f.name ? { name: [e.vendor, e.description].filter(Boolean).join(" - ") } : {}),
      ...(e && !f.costEur ? { costEur: (e.amountCents / 100).toFixed(2) } : {}),
      ...(e ? { purchaseDate: e.date.slice(0, 10) } : {}),
    }));
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = { name: form.name, purchaseDate: form.purchaseDate, costCents: cost, method: form.method, usefulLifeYears: form.method === "LINEAR" ? parseInt(form.years, 10) || null : null, expenseId: form.expenseId || null, notes: form.notes || null };
      if (editingId) await api.patch(`/assets/${editingId}`, payload);
      else await api.post("/assets", payload);
      setShowForm(false);
      load();
      onChanged?.();
      showToast("Anlage gespeichert", "success");
    } catch (err: any) {
      setError(err.response?.data?.error || "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: Asset) {
    if (!confirm(`"${a.name}" aus dem Anlageverzeichnis entfernen?\n\nDie EÜR zählt dann wieder die verknüpfte Ausgabe voll (falls vorhanden) statt der Abschreibung.`)) return;
    await api.delete(`/assets/${a.id}`);
    load();
    onChanged?.();
  }

  const totalAfa = items.reduce((s, a) => s + a.afaThisYear, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="font-medium">Anlageverzeichnis {year}</h2>
        <button onClick={startCreate} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm">+ Anlage erfassen</button>
      </div>

      <InfoBox title="Wofür ist das Anlageverzeichnis?">
        <p>Größere Anschaffungen für den Betrieb - z.B. ein <strong>3D-Drucker</strong>, Werkzeug, Computer - setzen Sie nicht immer sofort in voller Höhe ab. Je nach Preis gilt:</p>
        <p><strong>GWG (geringwertiges Wirtschaftsgut):</strong> Kostet das Gut netto höchstens {money(gwgLimit)}, dürfen Sie es im Jahr der Anschaffung sofort voll als Ausgabe ansetzen.</p>
        <p><strong>Lineare Abschreibung (AfA):</strong> Teurere Güter verteilen Sie über die Nutzungsdauer. Im Anschaffungsjahr zählt nur der Anteil ab dem Anschaffungsmonat. Die Nutzungsdauer (z.B. 3, 5 oder 7 Jahre) richtet sich nach den amtlichen AfA-Tabellen - bei einem 3D-Drucker ist die Einordnung nicht eindeutig, bitte mit dem Steuerberater klären.</p>
        <p><strong>Kleinunternehmer:</strong> Sie können keine Vorsteuer abziehen, deshalb sind die Anschaffungskosten der <strong>Bruttobetrag</strong> (Rechnungsbetrag inkl. USt.). Wer die Regelbesteuerung nutzt, trägt den Nettobetrag ein.</p>
        <p><strong>Verknüpfung mit einer Ausgabe:</strong> Haben Sie den Kauf schon unter Finanzen → Ausgaben erfasst, wählen Sie ihn unten aus - dann zählt die EÜR statt der vollen Ausgabe nur noch die Abschreibung des Jahres (kein doppeltes Absetzen). Ohne Verknüpfung kommt die Abschreibung zusätzlich zu Ihren Ausgaben hinzu.</p>
        <p>Die Werte dienen der Orientierung und ersetzen keine Steuerberatung; Grenzen und Fristen ändern sich gelegentlich.</p>
      </InfoBox>

      {showForm && (
        <form onSubmit={submit} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-5 space-y-4">
          <h3 className="font-medium text-sm">{editingId ? "Anlage bearbeiten" : "Neue Anlage"}</h3>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <label className="block text-sm">
            Schon als Ausgabe erfasst? (optional)
            <select value={form.expenseId} onChange={(e) => pickExpense(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="">Nein - kein Ausgabeneintrag vorhanden</option>
              {freeExpenses.map((e) => (
                <option key={e.id} value={e.id}>{dateDe(e.date)} · {e.vendor}{e.description ? ` - ${e.description}` : ""} · {money(e.amountCents)}</option>
              ))}
            </select>
            <span className="block text-xs text-slate-500 mt-0.5">Name, Datum und Betrag werden daraus übernommen; die Ausgabe zählt dann in der EÜR nicht mehr voll, sondern nur noch als Abschreibung.</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block text-sm sm:col-span-2">Bezeichnung
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z.B. Bambu Lab P1S" className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-sm">Anschaffungsdatum
              <input type="date" required value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className={`${inputClass} mt-1`} />
              <span className="block text-xs text-slate-500 mt-0.5">Lieferung/Rechnungsdatum - bestimmt die Monate im ersten Jahr.</span>
            </label>
            <label className="block text-sm">Anschaffungskosten (€)
              <input type="number" required min="0.01" step="0.01" value={form.costEur} onChange={(e) => setForm({ ...form, costEur: e.target.value })} className={`${inputClass} mt-1`} />
              <span className="block text-xs text-slate-500 mt-0.5">Kleinunternehmer: Bruttobetrag. Inkl. Versand und nötigem Zubehör.</span>
            </label>
            <div className="text-sm sm:col-span-2">
              <span className="block mb-1">Abschreibung</span>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2"><input type="radio" name="method" checked={form.method === "LINEAR"} onChange={() => setForm({ ...form, method: "LINEAR" })} /> Linear über mehrere Jahre</label>
                <label className="flex items-center gap-2"><input type="radio" name="method" checked={form.method === "GWG"} onChange={() => setForm({ ...form, method: "GWG" })} /> GWG: sofort im Anschaffungsjahr</label>
              </div>
              {cost > 0 && cost <= gwgLimit && form.method === "LINEAR" && <p className="text-xs text-green-700 dark:text-green-400 mt-1">Dieser Betrag liegt unter der GWG-Grenze von {money(gwgLimit)} (netto) - Sie dürfen auch sofort abschreiben.</p>}
              {cost > gwgLimit && form.method === "GWG" && <p className="text-xs text-amber-600 mt-1">Achtung: über der GWG-Grenze von {money(gwgLimit)} (netto). Bei Regelbesteuerung gilt der Nettobetrag - sonst bitte linear abschreiben.</p>}
            </div>
            {form.method === "LINEAR" && (
              <label className="block text-sm">Nutzungsdauer (Jahre)
                <input type="number" min="1" max="50" step="1" required value={form.years} onChange={(e) => setForm({ ...form, years: e.target.value })} className={`${inputClass} mt-1`} />
                <span className="block text-xs text-slate-500 mt-0.5">Laut AfA-Tabelle bzw. Steuerberater.</span>
              </label>
            )}
          </div>
          <label className="block text-sm">Notiz (optional)
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inputClass} mt-1`} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded disabled:opacity-60">{busy ? "Wird gespeichert ..." : "Speichern"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700">Abbrechen</button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        <div className="hidden xl:grid gap-3 px-4 py-2 text-xs font-medium text-slate-500" style={{ gridTemplateColumns: "minmax(0,1fr) 95px 110px 110px 120px 170px" }}>
          <span>Anlage</span><span>Gekauft</span><span className="text-right">Anschaffung</span><span className="text-right">AfA {year}</span><span className="text-right">Restwert 31.12.</span><span />
        </div>
        {items.map((a) => (
          <div key={a.id} className="px-4 py-3 text-sm xl:grid xl:items-start xl:gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) 95px 110px 110px 120px 170px" }}>
            <div className="min-w-0">
              <div className="font-medium truncate">{a.name}</div>
              <div className="text-xs text-slate-500">{a.method === "GWG" ? "GWG - Sofortabzug" : `linear über ${a.usefulLifeYears} Jahre`}{a.expenseId ? " · mit Ausgabe verknüpft" : ""}</div>
              {a.schedule.length > 1 && <div className="text-xs text-slate-400 mt-0.5">Plan: {a.schedule.map((s) => `${s.year}: ${money(s.amountCents)}`).join(" · ")}</div>}
              {a.notes && <div className="text-xs text-slate-500">{a.notes}</div>}
            </div>
            <span className="xl:block text-slate-600 dark:text-slate-300">{dateDe(a.purchaseDate)}</span>
            <span className="xl:text-right">{money(a.costCents)}</span>
            <span className="xl:text-right font-medium">{money(a.afaThisYear)}</span>
            <span className="xl:text-right">{money(a.bookValueEndOfYear)}</span>
            <span className="flex gap-3 xl:justify-end xl:pl-4 mt-1 xl:mt-0">
              <button onClick={() => startEdit(a)} className="text-brand hover:underline">Bearbeiten</button>
              <button onClick={() => remove(a)} className="text-red-600 hover:underline">Entfernen</button>
            </span>
          </div>
        ))}
        {items.length === 0 && <p className="px-4 py-8 text-center text-slate-500 text-sm">Noch keine Anlage erfasst. Typisch: Drucker, Trockenbox, Werkzeug, Computer.</p>}
        {items.length > 0 && (
          <div className="px-4 py-3 text-sm flex justify-between font-medium bg-slate-50 dark:bg-slate-900/40 rounded-b-lg">
            <span>Abschreibung {year} gesamt (geht in die EÜR ein)</span>
            <span>{money(totalAfa)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
