import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Fuse from "fuse.js";
import { api } from "../api/client";
import { EditPanel } from "../components/EditPanel";
import { AddressFields } from "../components/AddressFields";
import { useSaveStatus } from "../hooks/useSaveStatus";
import { useToast } from "../components/Toast";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { Icon } from "../components/Icon";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

import { HelpTip } from "../components/HelpTip";

interface Customer {
  id: string;
  customerNumber: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country: string;
  vatId?: string;
  leitwegId?: string;
  notes?: string;
  type: "PRIVAT" | "GEWERBLICH";
}

const emptyForm = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  street: "",
  postalCode: "",
  city: "",
  country: "DE",
  vatId: "",
  leitwegId: "",
  notes: "",
  type: "PRIVAT" as "PRIVAT" | "GEWERBLICH",
};

export default function Customers() {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { status, run } = useSaveStatus();
  const showToast = useToast();

  function load() {
    api
      .get("/customers")
      .then((res) => setCustomers(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const fuse = useMemo(() => new Fuse(customers, { keys: ["name", "email", "city", "customerNumber"], threshold: 0.35 }), [customers]);
  const filtered = query ? fuse.search(query).map((r) => r.item) : customers;

  // ?new=1 (aus dem Schnellmenü): Formular zum Anlegen sofort öffnen
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("new") === "1") {
      startCreate();
      url.searchParams.delete("new"); // nicht erneut öffnen, wenn man den Reiter wechselt
      window.history.replaceState(null, "", url);
    }
    // nur beim Öffnen der Seite
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function startEdit(c: Customer) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      contactName: c.contactName || "",
      email: c.email || "",
      phone: c.phone || "",
      street: c.street || "",
      postalCode: c.postalCode || "",
      city: c.city || "",
      country: c.country || "DE",
      vatId: c.vatId || "",
      leitwegId: c.leitwegId || "",
      notes: c.notes || "",
      type: c.type,
    });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await run(async () => {
        if (editingId) {
          await api.patch(`/customers/${editingId}`, form);
        } else {
          await api.post("/customers", form);
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

  async function handleDelete(c: Customer) {
    if (!confirm(`"${c.name}" wirklich archivieren? Belege bleiben erhalten, der Kunde verschwindet aus aktiven Listen.`)) return;
    try {
      await api.delete(`/customers/${c.id}`);
      load();
      showToast(`${c.name} archiviert`, "success");
    } catch (err: any) {
      setError(err.response?.data?.error || t("common.error"));
    }
  }

  const field = (key: keyof typeof emptyForm, label: string, extraClass = "") => (
    <div className={extraClass}>
      <label className="block text-sm mb-1">{label}</label>
      <input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
      />
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center gap-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{t("customers.title")}<HelpTip topic="customers" className="ml-2" /></h1>
        <button onClick={startCreate} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap shadow-lg shadow-brand/20">
          + Neu
        </button>
      </div>

      {error && !showForm && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {showForm && (
        <EditPanel
          title={editingId ? "Kunde bearbeiten" : "Neuer Kunde"}
          subtitle={editingId ? form.name : undefined}
          onClose={() => { setShowForm(false); setEditingId(null); setError(null); }}
          onSubmit={handleSubmit}
          status={status}
          saveLabel={t("customers.save")}
          error={error}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">{t("customers.name")} *</label>
              <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
            {field("contactName", "Ansprechpartner (optional)")}
            <div>
              <label className="block text-sm mb-1">{t("customers.type")}</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as any }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                <option value="PRIVAT">{t("customers.private")}</option>
                <option value="GEWERBLICH">{t("customers.business")}</option>
              </select>
            </div>
            {form.type === "GEWERBLICH" && field("vatId", "USt-IdNr.")}
            {form.type === "GEWERBLICH" && field("leitwegId", "Leitweg-ID (nur bei Behörden/öffentlichen Auftraggebern)")}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">{t("customers.email")}</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
            {field("phone", "Telefon")}
          </div>

          <AddressFields value={{ street: form.street, postalCode: form.postalCode, city: form.city, country: form.country }} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />

          <div>
            <label className="block text-sm mb-1">Notizen (nur intern sichtbar)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
              rows={3}
            />
          </div>

        </EditPanel>
      )}

      <label className="w-full mb-5 flex items-center gap-2 px-4 h-11 rounded-full bg-white shadow text-sm text-slate-400">
        <Icon name="search" className="w-4 h-4 shrink-0" />
        <input placeholder="Name, Nummer, Ort suchen" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 min-w-0 bg-transparent outline-none text-slate-900 placeholder:text-slate-400 !rounded-none focus-visible:!outline-none" />
      </label>

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow divide-y divide-slate-100 dark:divide-slate-700">
          {/* Eine Zeile je Kunde, auf allen Bildschirmen gleich: Initialen, Name, Nummer und Ort; ab Tablet-Breite zusätzlich E-Mail und Telefon */}
          {filtered.map((c) => (
            <div key={c.id} className="flex items-center gap-2 md:gap-4 px-3 md:px-4 py-2.5 hover:bg-slate-50/70 first:rounded-t-3xl last:rounded-b-3xl">
              <Link to={`/customers/${c.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                <span className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${c.type === "GEWERBLICH" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>{initials(c.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium truncate">{c.name}</span>
                  <span className="block text-xs text-slate-500 truncate">{[c.customerNumber, c.contactName, c.city, c.type === "GEWERBLICH" ? "Firma" : null].filter(Boolean).join(" · ")}</span>
                </span>
              </Link>
              <span className="hidden md:block w-56 text-sm text-slate-500 truncate">{c.email || ""}</span>
              <span className="hidden lg:block w-36 text-sm text-slate-500 truncate">{c.phone || ""}</span>
              <button onClick={() => startEdit(c)} className="hidden md:inline-flex px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-medium">{t("common.edit")}</button>
              {/* "Archivieren" statt "Löschen": Kunden mit Belegen müssen erhalten bleiben, der Server archiviert nur */}
              <RowActionsMenu actions={[{ label: t("common.edit"), onClick: () => startEdit(c) }, { label: "Archivieren", onClick: () => handleDelete(c), danger: true }]} />
            </div>
          ))}
          {filtered.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Kunden gefunden.</p>}
        </div>
      )}
    </div>
  );
}
