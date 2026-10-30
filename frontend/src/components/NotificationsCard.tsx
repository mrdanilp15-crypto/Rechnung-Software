import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";

interface Item {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}
interface Settings {
  email: string;
  byMail: boolean;
  onFinish: boolean;
  onFail: boolean;
  onError: boolean;
}

const TONE: Record<string, string> = {
  PRINT_FINISHED: "bg-green-500",
  PRINT_FAILED: "bg-red-500",
  PRINTER_ERROR: "bg-amber-500",
};

/** Meldungen der Drucker (Druck fertig, fehlgeschlagen, Druckerfehler) mit den Einstellungen für E-Mail-Benachrichtigung. */
export function NotificationsCard() {
  const isAdmin = useAuthStore((s) => s.user?.role) === "ADMIN";
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    api.get("/notifications").then((r) => { setItems(r.data.items); setUnread(r.data.unread); }).catch(() => {});
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (open && !settings) api.get("/notifications/settings").then((r) => setSettings(r.data)).catch(() => {});
  }, [open, settings]);

  async function markRead() {
    await api.post("/notifications/read");
    load();
  }
  async function save() {
    if (!settings) return;
    setMsg(null);
    try {
      await api.put("/notifications/settings", settings);
      setMsg("Gespeichert.");
    } catch (err: any) {
      setMsg(err?.response?.data?.error ?? "Speichern hat nicht geklappt.");
    }
  }
  const set = (patch: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  if (items.length === 0 && !isAdmin) return null;
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-6">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="font-medium">Meldungen{unread > 0 && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-brand text-white">{unread} neu</span>}</h2>
        {unread > 0 && <button onClick={markRead} className="text-xs text-brand hover:underline">Alle gelesen</button>}
        {isAdmin && <button onClick={() => setOpen((v) => !v)} className="text-xs text-slate-500 hover:underline ml-auto">{open ? "Einstellungen schließen" : "Einstellungen"}</button>}
      </div>

      {open && settings && (
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3 mb-3 text-sm space-y-2">
          <p className="text-xs text-slate-500">Meldungen erscheinen immer hier. Zusätzlich per E-Mail (über das in den Einstellungen eingerichtete Postfach):</p>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.byMail} onChange={(e) => set({ byMail: e.target.checked })} /> Per E-Mail benachrichtigen</label>
          <input type="email" placeholder="E-Mail-Adresse für Meldungen" value={settings.email} onChange={(e) => set({ email: e.target.value })} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.onFinish} onChange={(e) => set({ onFinish: e.target.checked })} /> Druck fertig</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.onFail} onChange={(e) => set({ onFail: e.target.checked })} /> Druck fehlgeschlagen</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.onError} onChange={(e) => set({ onError: e.target.checked })} /> Druckerfehler</label>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} className="bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded text-sm">Speichern</button>
            {msg && <span className="text-xs text-slate-500">{msg}</span>}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Noch keine Meldungen. Sie erscheinen, wenn ein Druck fertig oder fehlgeschlagen ist oder ein Drucker einen Fehler meldet (Drucker mit Live-Verbindung).</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
          {items.slice(0, 8).map((n) => (
            <li key={n.id} className="py-2 flex gap-3">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TONE[n.type] ?? "bg-slate-400"}`} />
              <div className="min-w-0">
                <div className={n.readAt ? "text-slate-600 dark:text-slate-300" : "font-medium"}>{n.title}</div>
                <div className="text-xs text-slate-500">{n.body}</div>
                <div className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
