import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useToast } from "./Toast";

/**
 * Einstellungen -> Schnittstellen: API-Schlüssel für eigene Skripte/n8n/Zapier, Webhooks (die Software meldet Ereignisse nach außen)
 * und das Kalender-Abo. Neue Schlüssel und Webhook-Geheimnisse werden nur einmal angezeigt.
 */

interface ApiKeyRow { id: string; name: string; prefix: string; scope: "READ" | "FULL"; lastUsedAt: string | null; createdAt: string }
interface EventRow { name: string; label: string }
interface HookRow { id: string; url: string; eventTypes: string; isActive: boolean; last: { success: boolean; responseCode: number | null; attemptedAt: string; eventType: string } | null }
interface CalendarInfo { enabled: boolean; url?: string; webcalUrl?: string }

const card = "bg-white dark:bg-slate-800 rounded-lg shadow p-6 space-y-3";
const field = "px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm";
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "noch nie");

function CopyBox({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={text} onFocus={(e) => e.target.select()} className={`${field} flex-1 min-w-0 font-mono text-xs`} />
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); } catch { window.prompt("Zum Kopieren:", text); } }} className="px-3 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm shrink-0">{ok ? "Kopiert" : "Kopieren"}</button>
    </div>
  );
}

function ApiKeys() {
  const showToast = useToast();
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"READ" | "FULL">("READ");
  const [created, setCreated] = useState<string | null>(null);
  const load = useCallback(() => { api.get("/api-keys").then((r) => setKeys(r.data)).catch(() => setKeys([])); }, []);
  useEffect(load, [load]);

  async function create() {
    try {
      const { data } = await api.post("/api-keys", { name, scope });
      setCreated(data.key);
      setName("");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "Schlüssel konnte nicht angelegt werden", "error");
    }
  }
  async function revoke(k: ApiKeyRow) {
    if (!window.confirm(`API-Schlüssel "${k.name}" widerrufen? Skripte, die ihn verwenden, funktionieren danach nicht mehr.`)) return;
    await api.delete(`/api-keys/${k.id}`);
    load();
  }

  return (
    <div className={card}>
      <div>
        <h2 className="font-medium">API-Schlüssel</h2>
        <p className="text-sm text-slate-500">Für eigene Skripte und Automatisierung (n8n, Zapier, Make). Der Schlüssel steht in der Kopfzeile <code>Authorization: Bearer hp_...</code>. Er gilt für diese Firma; Benutzer, Einstellungen, Sicherungen und Anmeldung sind damit nie erreichbar. Die <a href="/api/docs" target="_blank" rel="noreferrer" className="text-brand hover:underline">API-Dokumentation</a> zeigt alle Abfragen.</p>
      </div>
      {created && (
        <div className="rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-3 space-y-2">
          <p className="text-sm font-medium">Neuer Schlüssel - er wird nur jetzt angezeigt. Bitte jetzt kopieren und sicher ablegen.</p>
          <CopyBox text={created} />
          <button type="button" onClick={() => setCreated(null)} className="text-xs text-slate-500 hover:underline">Ausblenden</button>
        </div>
      )}
      <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
        {(keys ?? []).map((k) => (
          <li key={k.id} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-medium">{k.name}</span>
            <span className="font-mono text-xs text-slate-500">{k.prefix}…</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${k.scope === "FULL" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>{k.scope === "FULL" ? "lesen und schreiben" : "nur lesen"}</span>
            <span className="text-xs text-slate-500">zuletzt benutzt: {fmt(k.lastUsedAt)}</span>
            <button type="button" onClick={() => revoke(k)} className="ml-auto text-red-600 hover:underline text-xs">Widerrufen</button>
          </li>
        ))}
        {keys && keys.length === 0 && <li className="py-2 text-slate-500">Noch kein Schlüssel angelegt.</li>}
      </ul>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm">Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. n8n" className={`${field} block mt-1 w-48`} /></label>
        <label className="text-sm">Rechte
          <select value={scope} onChange={(e) => setScope(e.target.value as "READ" | "FULL")} className={`${field} block mt-1`}>
            <option value="READ">Nur lesen (sicher)</option>
            <option value="FULL">Lesen und schreiben</option>
          </select>
        </label>
        <button type="button" disabled={!name.trim()} onClick={create} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm disabled:opacity-50">Schlüssel anlegen</button>
      </div>
    </div>
  );
}

function Webhooks() {
  const showToast = useToast();
  const [hooks, setHooks] = useState<HookRow[] | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => { api.get("/webhooks").then((r) => setHooks(r.data)).catch(() => setHooks([])); }, []);
  useEffect(() => { load(); api.get("/webhooks/events").then((r) => setEvents(r.data)).catch(() => undefined); }, [load]);

  async function create() {
    try {
      const { data } = await api.post("/webhooks", { url, eventTypes: picked });
      setSecret(data.secret);
      setUrl("");
      setPicked([]);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.error ?? "Webhook konnte nicht angelegt werden", "error");
    }
  }
  async function test(h: HookRow) {
    setBusy(h.id);
    try {
      const { data } = await api.post(`/webhooks/${h.id}/test`);
      showToast(data.success ? `Test angekommen (Antwort ${data.status})` : `Test fehlgeschlagen: ${data.error ?? `Antwort ${data.status}`}`, data.success ? "success" : "error");
      load();
    } finally {
      setBusy(null);
    }
  }
  async function toggle(h: HookRow) {
    await api.patch(`/webhooks/${h.id}`, { isActive: !h.isActive });
    load();
  }
  async function remove(h: HookRow) {
    if (!window.confirm("Diesen Webhook löschen?")) return;
    await api.delete(`/webhooks/${h.id}`);
    load();
  }
  const label = (n: string) => events.find((e) => e.name === n)?.label ?? n;

  return (
    <div className={card}>
      <div>
        <h2 className="font-medium">Webhooks</h2>
        <p className="text-sm text-slate-500">Die Software meldet gewählte Ereignisse (Rechnung bezahlt, Druck beendet, Auftragsstatus ...) per Internetaufruf an eine Adresse deiner Wahl, z.B. einen n8n-Workflow. Jede Meldung ist mit einem Geheimnis signiert (Kopfzeile <code>X-Signature</code>, HMAC-SHA256), damit der Empfänger die Echtheit prüfen kann.</p>
      </div>
      {secret && (
        <div className="rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-3 space-y-2">
          <p className="text-sm font-medium">Geheimnis zur Signaturprüfung - wird nur jetzt angezeigt:</p>
          <CopyBox text={secret} />
          <button type="button" onClick={() => setSecret(null)} className="text-xs text-slate-500 hover:underline">Ausblenden</button>
        </div>
      )}
      <ul className="divide-y divide-slate-100 dark:divide-slate-700 text-sm">
        {(hooks ?? []).map((h) => (
          <li key={h.id} className="py-3 space-y-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-xs break-all flex-1 min-w-0">{h.url}</span>
              {h.last && <span className={`text-xs px-2 py-0.5 rounded-full ${h.last.success ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`} title={`${label(h.last.eventType)} · ${fmt(h.last.attemptedAt)}`}>letzte Zustellung: {h.last.success ? "ok" : `Fehler${h.last.responseCode ? ` ${h.last.responseCode}` : ""}`}</span>}
              {!h.last && <span className="text-xs text-slate-500">noch nichts gesendet</span>}
            </div>
            <div className="text-xs text-slate-500">{h.eventTypes.split(",").map(label).join(" · ")}</div>
            <div className="flex gap-4 text-xs">
              <button type="button" disabled={busy === h.id} onClick={() => test(h)} className="text-brand hover:underline disabled:opacity-50">{busy === h.id ? "Sendet ..." : "Test senden"}</button>
              <button type="button" onClick={() => toggle(h)} className="text-brand hover:underline">{h.isActive ? "Pausieren" : "Wieder aktivieren"}</button>
              {!h.isActive && <span className="text-amber-600">pausiert</span>}
              <button type="button" onClick={() => remove(h)} className="text-red-600 hover:underline ml-auto">Löschen</button>
            </div>
          </li>
        ))}
        {hooks && hooks.length === 0 && <li className="py-2 text-slate-500">Noch kein Webhook eingerichtet.</li>}
      </ul>
      <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-3">
        <label className="block text-sm">Neue Adresse<input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://n8n.example.de/webhook/..." className={`${field} block w-full mt-1`} /></label>
        <fieldset className="text-sm">
          <legend className="mb-1">Bei diesen Ereignissen melden:</legend>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
            {events.map((e) => (
              <label key={e.name} className="flex items-center gap-2"><input type="checkbox" checked={picked.includes(e.name)} onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.name] : p.filter((x) => x !== e.name)))} /> {e.label}</label>
            ))}
          </div>
        </fieldset>
        <button type="button" disabled={!url.trim() || picked.length === 0} onClick={create} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm disabled:opacity-50">Webhook anlegen</button>
      </div>
    </div>
  );
}

function CalendarFeed() {
  const showToast = useToast();
  const [info, setInfo] = useState<CalendarInfo | null>(null);
  const load = useCallback(() => { api.get("/calendar/info").then((r) => setInfo(r.data)).catch(() => setInfo({ enabled: false })); }, []);
  useEffect(load, [load]);

  async function enable() {
    if (info?.enabled && !window.confirm("Neue Adresse erzeugen? Die bisherige funktioniert danach nicht mehr - du musst das Abo in deinen Kalender-Apps neu eintragen.")) return;
    const { data } = await api.post("/calendar/enable");
    setInfo(data);
  }
  async function disable() {
    if (!window.confirm("Kalender-Abo ausschalten? Die Adresse funktioniert danach nicht mehr.")) return;
    await api.delete("/calendar");
    showToast("Kalender-Abo ausgeschaltet", "success");
    load();
  }
  const local = info?.url?.startsWith("http://localhost") || info?.url?.startsWith("http://127.");

  return (
    <div className={card}>
      <div>
        <h2 className="font-medium">Kalender-Abo</h2>
        <p className="text-sm text-slate-500">Liefertermine, Zahlungsziele, Angebotsfristen und Wartung erscheinen als Termine in Handy-, Google- oder Outlook-Kalender. Der Kalender holt sich die Daten selbst (meist stündlich). Er enthält Belegnummern und Kundennamen, keine Beträge. Wer die Adresse kennt, kann sie lesen - gib sie nicht weiter.</p>
      </div>
      {info?.enabled && info.url ? (
        <div className="space-y-2">
          <CopyBox text={info.url} />
          <p className="text-xs text-slate-500">Im Kalender "Kalender abonnieren / per URL hinzufügen" wählen und diese Adresse einfügen. Auf Apple-Geräten geht auch: <a href={info.webcalUrl} className="text-brand hover:underline">Abo öffnen</a>.</p>
          {local && <p className="text-xs text-amber-600">Die Adresse zeigt auf diesen Rechner (localhost) und funktioniert in anderen Geräten nicht. Trage die echte Adresse der Software als PUBLIC_APP_URL ein.</p>}
          <div className="flex gap-4 text-sm">
            <button type="button" onClick={enable} className="text-brand hover:underline">Neue Adresse erzeugen</button>
            <button type="button" onClick={disable} className="text-red-600 hover:underline">Ausschalten</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={enable} className="bg-brand hover:bg-brand-dark text-white px-4 py-2 rounded text-sm">Kalender-Abo einschalten</button>
      )}
    </div>
  );
}

export function IntegrationsPanel() {
  return (
    <div className="space-y-4">
      <ApiKeys />
      <Webhooks />
      <CalendarFeed />
    </div>
  );
}
