import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Fuse from "fuse.js";
import { api } from "../api/client";
import { SaveButton } from "../components/SaveButton";
import { useSaveStatus } from "../hooks/useSaveStatus";
import { useToast } from "../components/Toast";
import { MobileCard, MobileField } from "../components/MobileCard";

const ROW_COLUMNS = "1fr 100px 1fr 130px 120px 90px 130px";

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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">{t("customers.title")}</h1>
        <button onClick={startCreate} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">
          {t("customers.new")}
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-6 space-y-4">
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">{t("customers.email")}</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            </div>
            {field("phone", "Telefon")}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {field("street", "Straße & Hausnummer", "sm:col-span-2")}
            {field("postalCode", "Postleitzahl")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field("city", t("customers.city"))}
            {field("country", "Land (ISO-Code, z.B. DE, AT, CH)")}
          </div>

          <div>
            <label className="block text-sm mb-1">Notizen (nur intern sichtbar)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <SaveButton status={status} className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded justify-center">
              {t("customers.save")}
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
        placeholder={t("customers.search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full mb-4 px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
      />

      {loading ? (
        <p>{t("common.loading")}</p>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow divide-y divide-slate-100 dark:divide-slate-700">
          <div className="hidden md:grid items-center gap-3 px-4 py-2 text-xs font-medium text-slate-500" style={{ gridTemplateColumns: ROW_COLUMNS }}>
            <span>Name</span>
            <span>Nummer</span>
            <span>E-Mail</span>
            <span>Telefon</span>
            <span>Ort</span>
            <span>Typ</span>
            <span></span>
          </div>
          {filtered.map((c) => {
            const typeBadge = (
              <span className={`text-xs px-2 py-0.5 rounded-full ${c.type === "GEWERBLICH" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>
                {c.type === "GEWERBLICH" ? t("customers.business") : t("customers.private")}
              </span>
            );
            const actions = (
              <div className="flex gap-3 justify-end shrink-0">
                <button onClick={() => startEdit(c)} className="text-brand hover:underline">
                  {t("common.edit")}
                </button>
                <button onClick={() => handleDelete(c)} className="text-red-600 hover:underline">
                  {t("common.delete")}
                </button>
              </div>
            );
            return (
              <div key={c.id}>
                {/* Desktop */}
                <div className="hidden md:grid items-center gap-3 px-4 py-3 text-sm" style={{ gridTemplateColumns: ROW_COLUMNS }}>
                  <div className="min-w-0">
                    <Link to={`/customers/${c.id}`} className="font-medium truncate text-brand hover:underline block">
                      {c.name}
                    </Link>
                    {c.contactName && <div className="text-xs text-slate-500 truncate">{c.contactName}</div>}
                  </div>
                  <span className="text-slate-500 truncate">{c.customerNumber}</span>
                  <span className="truncate">{c.email || "-"}</span>
                  <span className="truncate">{c.phone || "-"}</span>
                  <span className="truncate">{c.city || "-"}</span>
                  <span className="justify-self-start">{typeBadge}</span>
                  {actions}
                </div>
                {/* Mobile */}
                <MobileCard
                  title={<Link to={`/customers/${c.id}`} className="text-brand hover:underline">{c.name}</Link>}
                  subtitle={c.contactName || c.customerNumber}
                  actions={actions}
                >
                  <MobileField label="Nummer" value={c.customerNumber} />
                  <MobileField label="E-Mail" value={c.email || "-"} />
                  <MobileField label="Telefon" value={c.phone || "-"} />
                  <MobileField label="Ort" value={c.city || "-"} />
                  <MobileField label="Typ" value={typeBadge} />
                </MobileCard>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="px-4 py-6 text-center text-slate-500">Keine Kunden gefunden.</p>}
        </div>
      )}
    </div>
  );
}
