import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { InfoBox } from "../components/InfoBox";
import { useToast } from "../components/Toast";

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  customerNumber: string | null;
  notes: string | null;
  totalSpentCents: number;
  yearSpentCents: number;
  expenseCount: number;
  lastPurchase: string | null;
  materialCount: number;
}

const money = (c: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100);
const dateDe = (iso: string) => new Intl.DateTimeFormat("de-DE").format(new Date(iso));
const inputClass = "w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800";
const emptyForm = { name: "", contactName: "", email: "", phone: "", website: "", street: "", postalCode: "", city: "", country: "", customerNumber: "", notes: "" };

/** Lieferanten: Händler und Hersteller mit Kontaktdaten und Ausgabensummen. */
export default function Suppliers() {
  const showToast = useToast();
  const [items, setItems] = useState<Supplier[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "spent" | "recent">("name");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get("/suppliers").then((r) => setItems(r.data));
  }
  useEffect(load, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((s) => !q || [s.name, s.contactName, s.city, s.customerNumber, s.email].some((v) => v?.toLowerCase().includes(q)));
    return [...list].sort((a, b) => (sort === "spent" ? b.totalSpentCents - a.totalSpentCents : sort === "recent" ? (b.lastPurchase ?? "").localeCompare(a.lastPurchase ?? "") : a.name.localeCompare(b.name, "de")));
  }, [items, query, sort]);

  function startEdit(s: Supplier) {
    setEditingId(s.id);
    setForm({ name: s.name, contactName: s.contactName ?? "", email: s.email ?? "", phone: s.phone ?? "", website: s.website ?? "", street: s.street ?? "", postalCode: s.postalCode ?? "", city: s.city ?? "", country: s.country ?? "", customerNumber: s.customerNumber ?? "", notes: s.notes ?? "" });
    setError(null);
    setShowForm(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editingId) await api.patch(`/suppliers/${editingId}`, form);
      else {
        const { data } = await api.post("/suppliers", form);
        if (data.linkedExpenses) showToast(`${data.linkedExpenses} bisherige Ausgabe(n) mit diesem Namen zugeordnet`, "info");
      }
      setShowForm(false);
      load();
      showToast("Lieferant gespeichert", "success");
    } catch (err: any) {
      setError(err.response?.data?.error || "Speichern fehlgeschlagen.");
    }
  }

  async function remove(s: Supplier) {
    if (!confirm(`"${s.name}" archivieren?\n\nBisherige Ausgaben bleiben erhalten.`)) return;
    await api.delete(`/suppliers/${s.id}`);
    load();
  }

  const field = (label: string, key: keyof typeof emptyForm, props: { type?: string; placeholder?: string; span?: string } = {}) => (
    <label className={`block text-sm ${props.span ?? ""}`}>
      {label}
      <input type={props.type ?? "text"} value={form[key]} placeholder={props.placeholder} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={`${inputClass} mt-1`} />
    </label>
  );

  const yearTotal = items.reduce((s, x) => s + x.yearSpentCents, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h1 className="text-2xl font-semibold">Lieferanten</h1>
        <button onClick={() => { setEditingId(null); setForm(emptyForm); setError(null); setShowForm(true); }} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-lg text-sm">+ Lieferant anlegen</button>
      </div>

      <InfoBox title="Wofür sind Lieferanten?">
        <p>Hier führen Sie Händler und Hersteller, bei denen Sie einkaufen (Filament-Shop, Bambu Store, Verpackung, Elektronik ...) - mit Ansprechpartner, Ihrer Kundennummer dort und Webseite.</p>
        <p><strong>Zuordnung:</strong> Ausgaben (Finanzen → Ausgaben) werden automatisch zugeordnet, wenn der Händlername genau dem Lieferantennamen entspricht (Groß-/Kleinschreibung egal). Bei Material (Katalog → Material) wählen Sie den Lieferanten im Material - Nachbestellungen werden dann auf diesen Lieferanten gebucht.</p>
        <p>Die Spalten zeigen, wie viel Sie insgesamt und in diesem Jahr dort ausgegeben haben, und wann zuletzt eingekauft wurde.</p>
      </InfoBox>

      {showForm && (
        <form onSubmit={submit} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-5 space-y-4">
          <h2 className="font-medium text-sm">{editingId ? "Lieferant bearbeiten" : "Neuer Lieferant"}</h2>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {field("Name *", "name", { span: "sm:col-span-2", placeholder: "z.B. Filamentshop GmbH (so wie bei den Ausgaben)" })}
            {field("Ihre Kundennummer dort", "customerNumber")}
            {field("Ansprechpartner", "contactName")}
            {field("E-Mail", "email", { type: "email" })}
            {field("Telefon", "phone")}
            {field("Webseite", "website", { placeholder: "www.beispiel.de", span: "sm:col-span-3" })}
            {field("Straße", "street", { span: "sm:col-span-3" })}
            {field("PLZ", "postalCode")}
            {field("Ort", "city")}
            {field("Land", "country")}
          </div>
          <label className="block text-sm">Notiz
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="z.B. Versandkostenfrei ab 50 €, Rabattcode" className={`${inputClass} mt-1`} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded">Speichern</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700">Abbrechen</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Lieferant suchen ..." className={`${inputClass} sm:max-w-xs`} aria-label="Suche" />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={`${inputClass} sm:max-w-[200px]`} aria-label="Sortieren">
          <option value="name">Sortiert nach Name</option>
          <option value="spent">Meiste Ausgaben zuerst</option>
          <option value="recent">Zuletzt eingekauft</option>
        </select>
        <span className="ml-auto self-center text-xs text-slate-500">Ausgaben bei Lieferanten dieses Jahr: {money(yearTotal)}</span>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
        {visible.map((s) => (
          <div key={s.id} className="px-4 py-3 text-sm flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{s.name}{s.customerNumber && <span className="ml-2 text-xs text-slate-500 font-normal">Kd.-Nr. {s.customerNumber}</span>}</div>
              <div className="text-xs text-slate-500">
                {[s.contactName, [s.postalCode, s.city].filter(Boolean).join(" "), s.email, s.phone].filter(Boolean).join(" · ") || "keine Kontaktdaten"}
              </div>
              {s.website && <a href={/^https?:\/\//.test(s.website) ? s.website : `https://${s.website}`} target="_blank" rel="noreferrer noopener" className="text-xs text-brand hover:underline">{s.website}</a>}
              {s.notes && <div className="text-xs text-amber-600 dark:text-amber-400">{s.notes}</div>}
            </div>
            <div className="text-right shrink-0">
              <div className="font-medium">{money(s.totalSpentCents)} <span className="text-xs text-slate-500 font-normal">gesamt</span></div>
              <div className="text-xs text-slate-500">{money(s.yearSpentCents)} dieses Jahr · {s.expenseCount} {s.expenseCount === 1 ? "Einkauf" : "Einkäufe"}{s.lastPurchase ? ` · zuletzt ${dateDe(s.lastPurchase)}` : ""}</div>
              {s.materialCount > 0 && <div className="text-xs text-slate-500">{s.materialCount} Material{s.materialCount === 1 ? "" : "ien"}</div>}
              <div className="flex gap-3 justify-end mt-1">
                <button onClick={() => startEdit(s)} className="text-brand hover:underline">Bearbeiten</button>
                <button onClick={() => remove(s)} className="text-red-600 hover:underline">Archivieren</button>
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && <p className="px-4 py-8 text-center text-slate-500 text-sm">{items.length === 0 ? "Noch kein Lieferant angelegt." : "Kein Lieferant gefunden."}</p>}
      </div>
    </div>
  );
}
