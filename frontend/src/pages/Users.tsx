import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";

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

const roleLabel: Record<string, string> = {
  ADMIN: "Admin",
  MITARBEITER: "Mitarbeiter",
  BUCHHALTUNG: "Buchhaltung",
};

const emptyForm = { name: "", email: "", password: "", role: "MITARBEITER" as const };

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
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get("/users").then((res) => setUsers(res.data));
  }
  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/users", form);
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
  }

  async function handleToggleActive(u: CompanyUser) {
    if (u.isActive && !confirm(`"${u.name}" deaktivieren? Die Person kann sich danach nicht mehr anmelden.`)) return;
    await api.patch(`/users/${u.id}`, { isActive: !u.isActive });
    load();
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

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 border-t border-slate-100 dark:border-slate-700 pt-4">
          <input required placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <input required type="email" placeholder="E-Mail (Login)" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <input required type="password" minLength={10} placeholder="Passwort (mind. 10 Zeichen)" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as any }))} className="px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
            <option value="MITARBEITER">Mitarbeiter</option>
            <option value="BUCHHALTUNG">Buchhaltung</option>
            <option value="ADMIN">Admin</option>
          </select>
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="flex-1 bg-brand hover:bg-brand-dark text-white py-2 rounded">Anlegen</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-700">Abbrechen</button>
          </div>
        </form>
      )}

      <div className="divide-y divide-slate-100 dark:divide-slate-700 border-t border-slate-100 dark:border-slate-700">
        {users.map((u) => (
          <div key={u.id} className="grid items-center gap-3 py-3 text-sm" style={{ gridTemplateColumns: "1fr 150px 90px 100px auto" }}>
            <div className="min-w-0">
              <div className="font-medium truncate">{u.name}</div>
              <div className="text-xs text-slate-500 truncate">{u.email}</div>
            </div>
            <select
              value={u.role}
              disabled={u.id === currentUser?.id}
              onChange={(e) => handleRoleChange(u, e.target.value)}
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs disabled:opacity-50"
            >
              <option value="MITARBEITER">Mitarbeiter</option>
              <option value="BUCHHALTUNG">Buchhaltung</option>
              <option value="ADMIN">Admin</option>
            </select>
            <span className={u.isActive ? "text-green-600" : "text-slate-400"}>{u.isActive ? "Aktiv" : "Inaktiv"}</span>
            <span className="text-slate-500 text-xs">{u.totpEnabled ? "2FA an" : ""}</span>
            <div className="flex gap-3 justify-end">
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
  );
}
