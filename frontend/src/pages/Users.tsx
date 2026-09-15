import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { SaveButton } from "../components/SaveButton";
import { useSaveStatus } from "../hooks/useSaveStatus";
import { useToast } from "../components/Toast";

interface CompanyUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MITARBEITER" | "BUCHHALTUNG";
  isActive: boolean;
  locale: string;
  lastLoginAt?: string;
  totpEnabled: boolean;
}

const ROLE_PERMISSIONS: { role: "ADMIN" | "MITARBEITER" | "BUCHHALTUNG"; label: string; permissions: string[] }[] = [
  {
    role: "ADMIN",
    label: "Admin",
    permissions: [
      "Alles, was Mitarbeiter und Buchhaltung dürfen",
      "Firmeneinstellungen (Stammdaten, Logo/Stempel, E-Mail-Versand, 2FA)",
      "Benutzerkonten anlegen, Rollen ändern, deaktivieren",
      "Backups erstellen, Webhooks verwalten",
    ],
  },
  {
    role: "MITARBEITER",
    label: "Mitarbeiter",
    permissions: [
      "Kunden und Produkte anlegen/bearbeiten",
      "Rechnungen, Angebote, Lieferscheine, Auftragsbestätigungen erstellen und versenden",
      "Kein Zugriff auf Firmeneinstellungen, Benutzerverwaltung oder Backups",
    ],
  },
  {
    role: "BUCHHALTUNG",
    label: "Buchhaltung",
    permissions: [
      "Alles, was Mitarbeiter dürfen",
      "Rechnungen als bezahlt markieren oder stornieren",
      "Kein Zugriff auf Firmeneinstellungen oder Benutzerverwaltung",
    ],
  },
];

const emptyForm = { name: "", email: "", password: "", role: "MITARBEITER" as const };

const formatDate = (iso?: string) => (iso ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "Noch nie angemeldet");

const ROW_COLUMNS = "1fr 140px 70px 70px 150px 120px";

/**
 * Benutzerverwaltung: eine Firma kann beliebig viele Benutzerkonten anlegen (z.B. für
 * Versand, Büro, Buchhaltung) - jedes mit eigenem Login und eigener Rolle. Alle
 * Benutzer einer Firma sehen dieselben Kunden/Rechnungen/Produkte (geteilte Firmendaten),
 * nur die Berechtigungen unterscheiden sich nach Rolle (siehe docs/SECURITY.md).
 */
export default function Users() {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showRoleInfo, setShowRoleInfo] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const { status, run } = useSaveStatus();
  const showToast = useToast();

  function load() {
    api.get("/users").then((res) => setUsers(res.data));
  }
  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await run(() => api.post("/users", form));
      setForm(emptyForm);
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error || "Fehler beim Anlegen");
    }
  }

  async function handleRoleChange(u: CompanyUser, role: string) {
    await api.patch(`/users/${u.id}`, { role });
    load();
    showToast(`Rolle von ${u.name} geändert`, "success");
  }

  async function handleToggleActive(u: CompanyUser) {
    if (u.isActive && !confirm(`"${u.name}" deaktivieren? Die Person kann sich danach nicht mehr anmelden.`)) return;
    await api.patch(`/users/${u.id}`, { isActive: !u.isActive });
    load();
    showToast(`${u.name} ${u.isActive ? "deaktiviert" : "aktiviert"}`, "success");
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-medium">Benutzerkonten</h2>
          <p className="text-sm text-slate-500">
            Mehrere Personen (z.B. Büro, Versand, Buchhaltung) können eigene Logins für dieselbe Firma erhalten. Jede Person sieht dieselben Kunden, Rechnungen und Produkte - nur die Rolle bestimmt, welche Aktionen erlaubt sind.
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm shrink-0 ml-4">
          Neuer Benutzer
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setShowRoleInfo((v) => !v)}
          className="w-full flex justify-between items-center px-4 py-2 text-sm font-medium text-left"
        >
          <span>Was darf welche Rolle?</span>
          <span className="text-slate-400">{showRoleInfo ? "▲" : "▼"}</span>
        </button>
        {showRoleInfo && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 pb-4 text-sm">
            {ROLE_PERMISSIONS.map((r) => (
              <div key={r.role}>
                <p className="font-medium text-brand mb-1">{r.label}</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600 dark:text-slate-300">
                  {r.permissions.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 border-t border-slate-100 dark:border-slate-700 pt-4">
          <div>
            <label className="block text-sm mb-1">Name</label>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-sm mb-1">E-Mail (Login)</label>
            <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-sm mb-1">Passwort (mind. 10 Zeichen)</label>
            <input required type="password" minLength={10} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          </div>
          <div>
            <label className="block text-sm mb-1">Rolle</label>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as any }))} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
              <option value="MITARBEITER">Mitarbeiter</option>
              <option value="BUCHHALTUNG">Buchhaltung</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="col-span-2 flex gap-2">
            <SaveButton status={status} className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded justify-center">Anlegen</SaveButton>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700">Abbrechen</button>
          </div>
        </form>
      )}

      <div className="border-t border-slate-100 dark:border-slate-700">
        <div className="grid items-center gap-3 py-2 text-xs font-medium text-slate-500 border-b border-slate-100 dark:border-slate-700" style={{ gridTemplateColumns: ROW_COLUMNS }}>
          <span>Name / E-Mail</span>
          <span>Rolle</span>
          <span>Status</span>
          <span>2FA</span>
          <span>Letzter Login</span>
          <span></span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {users.map((u) => (
            <div key={u.id} className="grid items-center gap-3 py-3 text-sm" style={{ gridTemplateColumns: ROW_COLUMNS }}>
              <div className="min-w-0">
                <div className="font-medium truncate">{u.name}</div>
                <div className="text-xs text-slate-500 truncate">{u.email}</div>
              </div>
              <select
                value={u.role}
                disabled={u.id === currentUser?.id}
                onChange={(e) => handleRoleChange(u, e.target.value)}
                className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs disabled:opacity-50"
              >
                <option value="MITARBEITER">Mitarbeiter</option>
                <option value="BUCHHALTUNG">Buchhaltung</option>
                <option value="ADMIN">Admin</option>
              </select>
              <span className={u.isActive ? "text-green-600" : "text-slate-400"}>{u.isActive ? "Aktiv" : "Inaktiv"}</span>
              <span className={u.totpEnabled ? "text-green-600" : "text-slate-400"}>{u.totpEnabled ? "An" : "Aus"}</span>
              <span className="text-slate-500 text-xs truncate">{formatDate(u.lastLoginAt)}</span>
              <div className="flex justify-end">
                {u.id !== currentUser?.id ? (
                  <button onClick={() => handleToggleActive(u)} className={u.isActive ? "text-red-600 hover:underline" : "text-brand hover:underline"}>
                    {u.isActive ? "Deaktivieren" : "Aktivieren"}
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">(Sie)</span>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && <p className="py-6 text-center text-slate-500">Keine weiteren Benutzer.</p>}
        </div>
      </div>
    </div>
  );
}
