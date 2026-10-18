import { useMemo, useRef, useState } from "react";
import { api } from "../api/client";

export interface PickerCustomer {
  id: string;
  customerNumber?: string;
  name: string;
  city?: string | null;
  country?: string;
  type?: string;
  vatId?: string | null;
}

const inputClass = "w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm";

/**
 * Kunde direkt im Beleg suchen ODER neu anlegen - ohne die Seite zu verlassen. Beim Tippen erscheint
 * unter den Treffern immer der Eintrag "als neuen Kunden anlegen"; dafür genügt der Name, alle
 * weiteren Angaben (Adresse, USt-IdNr.) lassen sich sofort oder später ergänzen.
 */
export function CustomerPicker({
  customers,
  value,
  onSelect,
  onCreated,
}: {
  customers: PickerCustomer[];
  value: string;
  onSelect: (id: string) => void;
  onCreated: (customer: PickerCustomer) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", type: "PRIVAT" as "PRIVAT" | "GEWERBLICH", email: "", street: "", postalCode: "", city: "", country: "DE", vatId: "" });
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();

  const selected = customers.find((c) => c.id === value);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter((c) => [c.name, c.customerNumber, c.city].some((f) => f?.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [customers, query]);

  function startCreate() {
    setForm((f) => ({ ...f, name: query.trim() }));
    setCreating(true);
    setOpen(false);
    setError(null);
  }

  async function create() {
    if (!form.name.trim()) return setError("Bitte einen Namen eingeben.");
    setSaving(true);
    setError(null);
    try {
      const clean = (v: string) => v.trim() || undefined;
      const { data } = await api.post("/customers", {
        type: form.type,
        name: form.name.trim(),
        email: clean(form.email) ?? "",
        street: clean(form.street),
        postalCode: clean(form.postalCode),
        city: clean(form.city),
        country: (clean(form.country) ?? "DE").toUpperCase(),
        vatId: form.type === "GEWERBLICH" ? clean(form.vatId) : undefined,
      });
      onCreated(data);
      onSelect(data.id);
      setCreating(false);
      setChanging(false);
      setQuery("");
      setForm({ name: "", type: "PRIVAT", email: "", street: "", postalCode: "", city: "", country: "DE", vatId: "" });
    } catch (err: any) {
      setError(err.response?.data?.error || "Kunde konnte nicht angelegt werden.");
    } finally {
      setSaving(false);
    }
  }

  if (creating) {
    return (
      <div className="rounded-lg border border-brand/40 bg-blue-50/50 dark:bg-slate-900/40 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Neuer Kunde</span>
          <button type="button" onClick={() => setCreating(false)} className="text-xs text-slate-500 hover:underline">Abbrechen</button>
        </div>
        <div className="flex gap-4 text-sm">
          {(["PRIVAT", "GEWERBLICH"] as const).map((t) => (
            <label key={t} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="customerType" checked={form.type === t} onChange={() => setForm({ ...form, type: t })} />
              {t === "PRIVAT" ? "Privatperson" : "Firma"}
            </label>
          ))}
        </div>
        <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={inputClass} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} placeholder="Straße und Hausnummer" className={`${inputClass} sm:col-span-2`} />
          <input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} placeholder="PLZ" className={inputClass} />
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Ort" className={inputClass} />
          <input value={form.country} maxLength={2} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} placeholder="Land (DE)" className={inputClass} />
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="E-Mail (für den Versand)" className={inputClass} />
          {form.type === "GEWERBLICH" && (
            <input value={form.vatId} onChange={(e) => setForm({ ...form, vatId: e.target.value })} placeholder="USt-IdNr. (bei EU-Firmen wichtig)" className={`${inputClass} sm:col-span-2`} />
          )}
        </div>
        <p className="text-xs text-slate-500">Nur der Name ist nötig. Alles andere können Sie jetzt oder später unter "Kunden" ergänzen.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="button" onClick={create} disabled={saving} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm disabled:opacity-60">
          {saving ? "Wird angelegt..." : "Kunden anlegen und übernehmen"}
        </button>
      </div>
    );
  }

  if (selected && !changing) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{selected.name}</div>
          <div className="text-xs text-slate-500 truncate">
            {[selected.customerNumber, [selected.city, selected.country && selected.country !== "DE" ? selected.country : ""].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button type="button" onClick={() => { setChanging(true); setQuery(""); }} className="text-xs text-brand hover:underline shrink-0">Ändern</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        autoFocus={changing}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { clearTimeout(blurTimer.current); setOpen(true); }}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
        placeholder="Kunde suchen oder neu eintippen ..."
        className={inputClass}
      />
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg overflow-hidden text-sm">
          {matches.map((c) => (
            <button
              type="button"
              key={c.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(c.id); setChanging(false); setOpen(false); }}
              className="w-full text-left px-3 py-2 flex justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <span className="truncate">{c.name}</span>
              <span className="text-xs text-slate-500 shrink-0">{[c.customerNumber, c.city].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={startCreate}
            className="w-full text-left px-3 py-2 border-t border-slate-100 dark:border-slate-700 text-brand hover:bg-blue-50 dark:hover:bg-slate-700"
          >
            + {query.trim() ? `„${query.trim()}“ als neuen Kunden anlegen` : "Neuen Kunden anlegen"}
          </button>
        </div>
      )}
    </div>
  );
}
