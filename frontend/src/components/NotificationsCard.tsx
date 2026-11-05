import { useEffect, useMemo, useState } from "react";
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
  onLowStock: boolean;
  onMaintenance: boolean;
}

const TONE: Record<string, string> = {
  LOW_STOCK: "bg-amber-500",
  MAINTENANCE_DUE: "bg-amber-500",
  PRINT_FINISHED: "bg-green-500",
  PRINT_FAILED: "bg-red-500",
  PRINTER_ERROR: "bg-amber-500",
};

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Push auf diesem Gerät ein-/ausschalten (Web Push: nur über HTTPS; auf iPhone/iPad nur bei zum Home-Bildschirm hinzugefügter App). */
function PushControl() {
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [active, setActive] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => setActive(!!sub)).catch(() => {});
  }, [supported]);

  if (!supported) return <p className="text-xs text-slate-500">Push-Nachrichten gehen auf diesem Gerät/Browser nicht. Am iPhone/iPad: Seite über "Teilen → Zum Home-Bildschirm" als App hinzufügen und von dort öffnen.</p>;

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      if (!import.meta.env.PROD) throw new Error("Push geht nur in der installierten Version (HTTPS), nicht im Entwicklungsmodus.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Die Erlaubnis für Benachrichtigungen wurde nicht erteilt. Im Browser/Gerät unter Einstellungen erlauben.");
      const reg = await navigator.serviceWorker.ready;
      const { data } = await api.get("/notifications/push/key");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.publicKey) as unknown as BufferSource });
      await api.post("/notifications/push/subscribe", sub.toJSON());
      setActive(true);
      setMsg("Push ist auf diesem Gerät eingeschaltet.");
    } catch (err: any) {
      setMsg(err?.response?.data?.error ?? err?.message ?? "Push konnte nicht eingeschaltet werden.");
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.post("/notifications/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setActive(false);
      setMsg("Push ist auf diesem Gerät ausgeschaltet.");
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    const { data } = await api.post("/notifications/push/test");
    setMsg(data.sent > 0 ? "Test-Nachricht gesendet." : "Kein Gerät angemeldet.");
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-slate-600 dark:text-slate-300">Push aufs Handy/Tablet:</span>
      {active ? (
        <>
          <button disabled={busy} onClick={disable} className="px-3 py-1.5 rounded text-sm bg-slate-200 dark:bg-slate-700">Auf diesem Gerät ausschalten</button>
          <button onClick={test} className="text-brand hover:underline text-sm">Test senden</button>
        </>
      ) : (
        <button disabled={busy} onClick={enable} className="px-3 py-1.5 rounded text-sm bg-brand text-white">Auf diesem Gerät einschalten</button>
      )}
      {msg && <span className="text-xs text-slate-500 w-full">{msg}</span>}
    </div>
  );
}

/** Meldungen der Drucker (Druck fertig, fehlgeschlagen, Druckerfehler) mit den Einstellungen für E-Mail-Benachrichtigung. */
export function NotificationsCard() {
  const isAdmin = useAuthStore((s) => s.user?.role) === "ADMIN";
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Die Karte lässt sich einklappen (merkt sich der Browser), gleiche Meldungen werden zusammengefasst
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("meldungen_collapsed") === "1";
    } catch {
      return false;
    }
  });
  function toggleCollapsed() {
    setCollapsed((v) => {
      try {
        localStorage.setItem("meldungen_collapsed", v ? "0" : "1");
      } catch {
        // Speicher gesperrt - gilt dann nur bis zum Neuladen
      }
      return !v;
    });
  }
  const grouped = useMemo(() => {
    const out: (Item & { count: number })[] = [];
    for (const n of items) {
      const hit = out.find((g) => g.title === n.title && g.body === n.body);
      if (hit) hit.count += 1;
      else out.push({ ...n, count: 1 });
    }
    return out;
  }, [items]);

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

  return (
    <div id="meldungen" className="bg-white dark:bg-slate-800 rounded-xl shadow p-4 mb-6 scroll-mt-24">
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${collapsed ? "" : "mb-2"}`}>
        <h2 className="font-medium">Meldungen{unread > 0 && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-brand text-white whitespace-nowrap">{unread} neu</span>}</h2>
        {unread > 0 && <button onClick={markRead} className="text-xs text-brand hover:underline">Alle gelesen</button>}
        <button onClick={toggleCollapsed} className="text-xs text-slate-500 hover:underline" aria-expanded={!collapsed}>{collapsed ? "Ausklappen" : "Einklappen"}</button>
        {isAdmin && <button onClick={() => setOpen((v) => !v)} className="text-xs text-slate-500 hover:underline ml-auto">{open ? "Einstellungen schließen" : "Einstellungen"}</button>}
      </div>

      {!collapsed && <div className="mb-3"><PushControl /></div>}

      {open && settings && !collapsed && (
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3 mb-3 text-sm space-y-2">
          <p className="text-xs text-slate-500">Meldungen erscheinen immer hier. Zusätzlich per E-Mail (über das in den Einstellungen eingerichtete Postfach):</p>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.byMail} onChange={(e) => set({ byMail: e.target.checked })} /> Per E-Mail benachrichtigen</label>
          <input type="email" placeholder="E-Mail-Adresse für Meldungen" value={settings.email} onChange={(e) => set({ email: e.target.value })} className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.onFinish} onChange={(e) => set({ onFinish: e.target.checked })} /> Druck fertig</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.onFail} onChange={(e) => set({ onFail: e.target.checked })} /> Druck fehlgeschlagen</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.onError} onChange={(e) => set({ onError: e.target.checked })} /> Druckerfehler</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.onLowStock} onChange={(e) => set({ onLowStock: e.target.checked })} /> Material wird knapp</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={settings.onMaintenance} onChange={(e) => set({ onMaintenance: e.target.checked })} /> Wartung fällig</label>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} className="bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded text-sm">Speichern</button>
            {msg && <span className="text-xs text-slate-500">{msg}</span>}
          </div>
        </div>
      )}

      {collapsed ? null : items.length === 0 ? (
        <p className="text-sm text-slate-500">Noch keine Meldungen. Sie erscheinen, wenn ein Druck fertig oder fehlgeschlagen ist oder ein Drucker einen Fehler meldet (Drucker mit Live-Verbindung).</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
          {grouped.slice(0, 3).map((n) => (
            <li key={n.id} className="py-2 flex gap-3">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TONE[n.type] ?? "bg-slate-400"}`} />
              <div className="min-w-0">
                <div className={n.readAt ? "text-slate-600 dark:text-slate-300" : "font-medium"}>{n.title}{n.count > 1 && <span className="ml-2 text-xs text-slate-500 font-normal">×{n.count}</span>}</div>
                <div className="text-xs text-slate-500">{n.body}</div>
                <div className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!collapsed && grouped.length > 3 && <p className="text-xs text-slate-500 mt-2">+ {grouped.length - 3} ältere Meldungen</p>}
    </div>
  );
}
