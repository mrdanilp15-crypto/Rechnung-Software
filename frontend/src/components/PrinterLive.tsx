import { useEffect, useState } from "react";
import { api } from "../api/client";

export interface Tray {
  slot: number;
  type: string | null;
  brand: string | null;
  color: string | null;
  remainPercent: number | null;
  rfid: boolean;
  active: boolean;
}
export interface LiveStatus {
  connection: "off" | "connecting" | "online" | "offline" | "auth_failed" | "error";
  message: string | null;
  lastSeen: string | null;
  state: "IDLE" | "PREPARE" | "RUNNING" | "PAUSE" | "FINISH" | "FAILED" | "UNKNOWN";
  stateLabel: string;
  progressPercent: number | null;
  remainingMinutes: number | null;
  layer: number | null;
  totalLayers: number | null;
  jobName: string | null;
  nozzleTemp: number | null;
  nozzleTarget: number | null;
  bedTemp: number | null;
  bedTarget: number | null;
  chamberTemp: number | null;
  wifiSignal: string | null;
  errorCode: number | null;
  ams: { units: { id: number; humidityLevel: number | null; trays: Tray[] }[]; external: Tray | null; activeLabel: string | null };
}
export interface PrinterJobRow {
  id: string;
  name: string | null;
  startedAt: string;
  endedAt: string | null;
  result: string | null;
  minutes: number | null;
}

export const CAMERA_MODELS = ["P1P", "P1S", "A1", "A1MINI", "X1C", "X1E", "P2S", "H2D", "H2S"];

export const formatMinutes = (min: number) => {
  const m = Math.max(0, Math.round(min));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
};
const errorText = (n: number) => {
  const h = n.toString(16).toUpperCase().padStart(8, "0");
  return `${h.slice(0, 4)}-${h.slice(4)}`;
};
const temp = (v: number | null, target?: number | null) => (v === null ? "-" : `${Math.round(v)}${target ? ` / ${Math.round(target)}` : ""} °C`);

const STATE_TONE: Record<string, string> = {
  RUNNING: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  PREPARE: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  PAUSE: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  FINISH: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  IDLE: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  UNKNOWN: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};
const CONNECTION_TEXT: Record<string, string> = { connecting: "Verbindet ...", offline: "Offline", auth_failed: "Zugangscode abgelehnt", error: "Keine Verbindung", off: "Aus" };

function Spool({ tray, label }: { tray: Tray; label: string }) {
  const empty = !tray.type;
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${tray.active ? "border-brand ring-1 ring-brand" : "border-slate-200 dark:border-slate-700"}`} title={[tray.brand ?? tray.type, tray.remainPercent !== null ? `${tray.remainPercent} % Rest${tray.rfid ? "" : " (geschätzt, Spule ohne Chip)"}` : null].filter(Boolean).join(" · ")}>
      <span className={`w-5 h-5 rounded-full border shrink-0 ${empty ? "border-dashed border-slate-300 dark:border-slate-600" : "border-slate-300 dark:border-slate-500"}`} style={!empty && tray.color ? { background: tray.color } : undefined} />
      <span className="min-w-0">
        <span className="block text-slate-500 leading-tight">{label}</span>
        <span className="block font-medium leading-tight truncate">{empty ? "leer" : `${tray.type}${tray.remainPercent !== null ? ` · ${tray.remainPercent} %` : ""}`}</span>
      </span>
    </div>
  );
}

/** Live-Anzeige eines Druckers: Zustand, Fortschritt, Temperaturen, AMS-Spulen, optional Kamerabild und Verlauf. */
export function PrinterLiveCard({ printerId, status, model, trackedMinutes, lifetimeHours }: { printerId: string; status: LiveStatus; model?: string | null; trackedMinutes: number; lifetimeHours: number }) {
  const [photo, setPhoto] = useState<{ url: string | null; error: string | null; loading: boolean } | null>(null);
  const [jobs, setJobs] = useState<PrinterJobRow[] | null>(null);
  const [live, setLive] = useState<{ key: number; error: string | null } | null>(null);
  const canCamera = !!model && CAMERA_MODELS.includes(model);
  const online = status.connection === "online";
  const active = status.state === "RUNNING" || status.state === "PREPARE" || status.state === "PAUSE";

  useEffect(() => () => { if (photo?.url) URL.revokeObjectURL(photo.url); }, [photo?.url]);

  async function loadPhoto() {
    setPhoto((p) => ({ url: p?.url ?? null, error: null, loading: true }));
    try {
      const res = await api.get(`/printers/${printerId}/snapshot`, { responseType: "blob" });
      setPhoto({ url: URL.createObjectURL(res.data), error: null, loading: false });
    } catch (err: any) {
      let message = "Kamerabild nicht verfügbar.";
      try {
        message = JSON.parse(await err.response.data.text()).error ?? message;
      } catch {
        // keine lesbare Fehlermeldung
      }
      setPhoto({ url: null, error: message, loading: false });
    }
  }
  // Live-Ansicht: Bildfolge vom Server (ca. 2 Bilder pro Sekunde). Bei einem Fehler zeigt eine Einzelbild-Abfrage die genaue Ursache.
  async function liveFailed() {
    let message = "Die Live-Ansicht konnte nicht gestartet werden.";
    try {
      await api.get(`/printers/${printerId}/snapshot`, { responseType: "blob" });
    } catch (err: any) {
      try {
        message = JSON.parse(await err.response.data.text()).error ?? message;
      } catch {
        // keine lesbare Fehlermeldung
      }
    }
    setLive((l) => (l ? { ...l, error: message } : l));
  }
  async function toggleJobs() {
    if (jobs) return setJobs(null);
    const res = await api.get(`/printers/${printerId}/jobs`);
    setJobs(res.data);
  }

  const resultLabel: Record<string, string> = { FINISHED: "fertig", FAILED: "fehlgeschlagen", CANCELLED: "abgebrochen", UNKNOWN: "unbekannt" };
  const hasAms = status.ams.units.length > 0 || status.ams.external;

  return (
    <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {online ? (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATE_TONE[status.state]}`}>{status.stateLabel}</span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{CONNECTION_TEXT[status.connection] ?? status.connection}</span>
        )}
        {!online && status.message && <span className="text-xs text-slate-500">{status.message}</span>}
        {online && status.errorCode !== null && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" title="Fehlercode des Druckers - Bedeutung in der Bambu-Wiki unter dem Code nachschlagen">Fehler {errorText(status.errorCode)}</span>}
        {online && status.wifiSignal && <span className="text-xs text-slate-400 ml-auto">WLAN {status.wifiSignal}</span>}
      </div>

      {online && active && (
        <div>
          <div className="flex justify-between gap-3 text-sm">
            <span className="font-medium truncate">{status.jobName ?? "Druckauftrag"}</span>
            <span className="shrink-0">{status.progressPercent ?? 0} %</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-1" role="progressbar" aria-valuenow={status.progressPercent ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand transition-all" style={{ width: `${status.progressPercent ?? 0}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-4 text-xs text-slate-500 mt-1">
            {status.layer !== null && status.totalLayers ? <span>Schicht {status.layer} / {status.totalLayers}</span> : null}
            {status.remainingMinutes !== null && <span>noch {formatMinutes(status.remainingMinutes)} · fertig gegen {new Date(Date.now() + status.remainingMinutes * 60000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr</span>}
          </div>
        </div>
      )}

      {online && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
          <span>Düse {temp(status.nozzleTemp, status.nozzleTarget)}</span>
          <span>Bett {temp(status.bedTemp, status.bedTarget)}</span>
          {status.chamberTemp !== null && <span>Gehäuse {temp(status.chamberTemp)}</span>}
        </div>
      )}

      {online && hasAms && (
        <div className="space-y-2">
          {status.ams.units.map((u) => (
            <div key={u.id}>
              <div className="text-xs text-slate-500 mb-1">AMS {u.id + 1}{u.humidityLevel !== null ? ` · Feuchte-Stufe ${u.humidityLevel} von 5 (5 = trocken)` : ""}</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {u.trays.map((t) => <Spool key={t.slot} tray={t} label={`Fach ${t.slot + 1}`} />)}
              </div>
            </div>
          ))}
          {status.ams.external && <div className="max-w-[12rem]"><Spool tray={status.ams.external} label="Externe Spule" /></div>}
          {status.ams.activeLabel && active && <div className="text-xs text-slate-500">Aktuell in Benutzung: {status.ams.activeLabel}</div>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {canCamera && online && <button type="button" onClick={loadPhoto} disabled={photo?.loading} className="text-brand hover:underline disabled:opacity-60">{photo?.loading ? "Lädt ..." : photo?.url ? "Bild aktualisieren" : "Kamerabild anzeigen"}</button>}
        {photo?.url && <button type="button" onClick={() => setPhoto(null)} className="text-slate-500 hover:underline">Bild ausblenden</button>}
        {canCamera && online && !live && <button type="button" onClick={() => { setPhoto(null); setLive({ key: Date.now(), error: null }); }} className="text-brand hover:underline">Live-Ansicht</button>}
        {live && <button type="button" onClick={() => setLive(null)} className="text-slate-500 hover:underline">Live-Ansicht beenden</button>}
        {live && <button type="button" onClick={() => setLive({ key: Date.now(), error: null })} className="text-brand hover:underline">Neu starten</button>}
        <button type="button" onClick={toggleJobs} className="text-brand hover:underline">{jobs ? "Verlauf ausblenden" : "Druckverlauf"}</button>
        {trackedMinutes > 0 && <span className="text-slate-500 ml-auto" title="Aus den erkannten Druckaufträgen (inkl. Pausen). Zählt ab Einrichtung der Live-Verbindung.">Erfasst: {(trackedMinutes / 60).toFixed(1).replace(".", ",")} h von {lifetimeHours} h Lebensdauer ({Math.min(100, (trackedMinutes / 60 / lifetimeHours) * 100).toFixed(1).replace(".", ",")} %)</span>}
      </div>
      {photo?.error && <p className="text-xs text-amber-600">{photo.error}</p>}
      {live && !live.error && (
        <div>
          <img src={`/api/printers/${printerId}/stream?k=${live.key}`} onError={liveFailed} alt="Live-Ansicht des Druckers" className="rounded-lg w-full max-w-2xl border border-slate-200 dark:border-slate-700 bg-black/80 min-h-[8rem]" />
          <p className="text-xs text-slate-500 mt-1">Läuft bis zu 15 Minuten, 1-2 Bilder pro Sekunde. Bleibt das Bild stehen, "Neu starten" drücken.</p>
        </div>
      )}
      {live?.error && <p className="text-xs text-amber-600">{live.error}</p>}
      {photo?.url && <img src={photo.url} alt="Kamerabild des Druckers" className="rounded-lg w-full max-w-md border border-slate-200 dark:border-slate-700" />}

      {jobs && (
        <ul className="text-xs divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg">
          {jobs.map((j) => (
            <li key={j.id} className="px-2 py-1.5 flex flex-wrap justify-between gap-2">
              <span className="truncate">{j.name ?? "Druckauftrag"}</span>
              <span className="text-slate-500">{new Date(j.startedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {j.endedAt ? `${formatMinutes(j.minutes ?? 0)} · ${resultLabel[j.result ?? "UNKNOWN"] ?? j.result}` : "läuft"}</span>
            </li>
          ))}
          {jobs.length === 0 && <li className="px-2 py-2 text-slate-500">Noch keine Druckaufträge erfasst.</li>}
        </ul>
      )}
    </div>
  );
}
