import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { PrintSendDialog } from "./PrintSendDialog";
import { OrderSelect } from "./OrderSelect";
import { JobUsageDialog } from "./JobUsageDialog";
import { bookingHint } from "../lib/printBooking";

export interface Tray {
  slot: number;
  type: string | null;
  brand: string | null;
  color: string | null;
  remainPercent: number | null;
  rfid: boolean;
  tag?: string | null;
  amsSlot?: number | null;
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
  /** Zum laufenden Druck: aus der App gesendet (Slicer-Plan) und welche AMS-Fächer er laut Plan nutzt */
  booking?: { fromApp: boolean; planSlots: number[] } | null;
}
export interface PrinterJobRow {
  id: string;
  name: string | null;
  startedAt: string;
  endedAt: string | null;
  result: string | null;
  minutes: number | null;
  materialUsage?: { materialId: string; name: string; grams: number }[] | null;
  order?: { id: string; number: string; customerName: string } | null;
  /** bewusst für keinen Auftrag gedruckt (Lager, Test) */
  noOrder?: boolean;
}

const NO_ORDER = "__none__";

interface SlotMapping {
  slot: number;
  materialId: string;
  material: { id: string; name: string; unit: string };
  spoolGrams: number;
}
interface MaterialOption {
  id: string;
  name: string;
  unit: string;
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

/** Zuordnung eines AMS-Fachs zu einem Material: Daraus wird der Verbrauch automatisch vom Bestand abgebucht. */
function SlotAssign({ tray, mapping, materials, canEdit, onChange }: { tray: Tray; mapping?: SlotMapping; materials: MaterialOption[]; canEdit: boolean; onChange: (slot: number, materialId: string | null) => void }) {
  if (!tray.type || tray.amsSlot === null || tray.amsSlot === undefined) return null;
  // Spulen ohne Chip: kein Füllstand, aber die Zuordnung braucht es trotzdem - nach ihr bucht die Software den Slicer-Verbrauch ab (Druck über die App senden)
  const noChip = "Spule ohne Chip: Füllstand nicht messbar. Gebucht wird nach den Slicer-Werten, wenn du den Druck über diese App sendest - bei Drucken aus Bambu Studio oder am Drucker musst du das Material im Druckverlauf festlegen.";
  if (!canEdit) {
    if (!mapping) return !tray.rfid ? <p className="text-[11px] text-slate-500 mt-0.5">Spule ohne Chip: keine automatische Abbuchung.</p> : null;
    return <p className="text-[11px] text-slate-500 mt-0.5">Bucht von: {mapping.material.name}{tray.rfid ? "" : " (nach Slicer-Angabe)"}</p>;
  }
  return (
    <>
      <select
        value={mapping?.materialId ?? ""}
        onChange={(e) => onChange(tray.amsSlot as number, e.target.value || null)}
        className="mt-0.5 w-full text-[11px] rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-1 py-0.5"
        title={tray.rfid ? "Material, von dessen Bestand der Verbrauch dieser Spule automatisch abgebucht wird" : noChip}
        aria-label="Material für automatische Abbuchung"
      >
        <option value="">Keine Abbuchung</option>
        {materials.map((m) => <option key={m.id} value={m.id}>Bucht von: {m.name}</option>)}
      </select>
      {!tray.rfid && <p className="text-[11px] text-slate-500 mt-0.5">{mapping ? "Ohne Chip: Abbuchung nach Slicer-Werten (Druck über die App senden)." : "Ohne Chip: Material wählen, damit der Slicer-Verbrauch abgebucht wird."}</p>}
    </>
  );
}

/** Live-Anzeige eines Druckers: Zustand, Fortschritt, Temperaturen, AMS-Spulen, optional Kamerabild und Verlauf. */
export function PrinterLiveCard({ printerId, status, model, trackedMinutes, lifetimeHours, usedHoursBefore = 0, printerName }: { printerName?: string; printerId: string; status: LiveStatus; model?: string | null; trackedMinutes: number; lifetimeHours: number; usedHoursBefore?: number }) {
  const [photo, setPhoto] = useState<{ url: string | null; error: string | null; loading: boolean } | null>(null);
  const [jobs, setJobs] = useState<PrinterJobRow[] | null>(null);
  const [usageJob, setUsageJob] = useState<PrinterJobRow | null>(null);
  const [live, setLive] = useState<{ key: number; error: string | null } | null>(null);
  const isAdmin = useAuthStore((s) => s.user?.role) === "ADMIN";
  const [mappings, setMappings] = useState<SlotMapping[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [showPrint, setShowPrint] = useState(false);
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
  const hasAmsNow = status.ams.units.length > 0;
  useEffect(() => {
    if (!hasAmsNow) return;
    api.get(`/printers/${printerId}/ams-slots`).then((r) => setMappings(r.data)).catch(() => {});
    if (isAdmin) api.get("/materials").then((r) => setMaterials(r.data.filter((m: MaterialOption) => ["g", "gramm", "kg"].includes(m.unit.trim().toLowerCase())))).catch(() => {});
  }, [printerId, hasAmsNow, isAdmin]);
  async function assignSlot(slot: number, materialId: string | null) {
    setSlotError(null);
    try {
      if (materialId) await api.put(`/printers/${printerId}/ams-slots/${slot}`, { materialId });
      else await api.delete(`/printers/${printerId}/ams-slots/${slot}`);
      setMappings((await api.get(`/printers/${printerId}/ams-slots`)).data);
    } catch (err: any) {
      setSlotError(err?.response?.data?.error ?? "Zuordnung nicht gespeichert.");
    }
  }
  async function assignJob(jobId: string, orderId: string) {
    try {
      await api.patch(`/printers/jobs/${jobId}`, orderId === NO_ORDER ? { noOrder: true } : { orderConfirmationId: orderId || null });
      const res = await api.get(`/printers/${printerId}/jobs`);
      setJobs(res.data);
    } catch (err: any) {
      window.alert(err?.response?.data?.error ?? "Zuordnung hat nicht geklappt.");
    }
  }
  async function toggleJobs() {
    if (jobs) return setJobs(null);
    const res = await api.get(`/printers/${printerId}/jobs`);
    setJobs(res.data);
  }

  const resultLabel: Record<string, string> = { FINISHED: "fertig", FAILED: "fehlgeschlagen", CANCELLED: "abgebrochen", UNKNOWN: "unbekannt" };
  const hasAms = status.ams.units.length > 0 || status.ams.external;
  // Läuft ein Druck: wird das Material abgebucht - und wenn nicht, warum nicht?
  const booking = online && active && hasAmsNow ? bookingHint({ fromApp: !!status.booking?.fromApp, planSlots: status.booking?.planSlots ?? [], trays: status.ams.units.flatMap((u) => u.trays), mappedSlots: mappings.map((m) => m.slot) }) : null;

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
          <p className="text-xs text-slate-500 mt-1" title="So heißt die Datei im Drucker - der Name kommt aus Bambu Studio, MakerWorld oder der Bambu-App, nicht aus dieser Software">
            Datei: <span className="font-medium text-slate-700 dark:text-slate-300">{status.jobName ?? "ohne Namen"}</span> · {status.booking?.fromApp ? "über diese App gesendet" : "nicht über diese App gesendet (Bambu Studio, MakerWorld oder am Drucker gestartet)"}
          </p>
          {booking && <p className={`mt-1 text-xs rounded px-2 py-1 ${booking.tone === "ok" ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300" : "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300"}`} role="note">{booking.tone === "ok" ? "✓ " : "⚠ "}{booking.text}</p>}
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
                {u.trays.map((t) => (
                  <div key={t.slot}>
                    <Spool tray={t} label={`Fach ${t.slot + 1}`} />
                    <SlotAssign tray={t} mapping={mappings.find((m) => m.slot === t.amsSlot)} materials={materials} canEdit={isAdmin} onChange={assignSlot} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {slotError && <p className="text-xs text-red-600">{slotError}</p>}
          {mappings.length > 0 && <p className="text-xs text-slate-500">Der Verbrauch zugeordneter Spulen wird automatisch vom Materialbestand abgebucht: bei Spulen mit Chip nach dem Füllstand, bei Spulen ohne Chip nach den Slicer-Werten (nur bei Drucken, die du über diese App sendest).</p>}
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
        {isAdmin && online && <button type="button" onClick={() => setShowPrint(true)} className="text-brand hover:underline">Druck senden</button>}
        <button type="button" onClick={toggleJobs} className="text-brand hover:underline">{jobs ? "Verlauf ausblenden" : "Druckverlauf"}</button>
        {(trackedMinutes > 0 || usedHoursBefore > 0) && <span className="text-slate-500 ml-auto" title="Vorher bereits gelaufene Stunden plus die aus den erkannten Druckaufträgen erfassten (inkl. Pausen, ab Einrichtung der Live-Verbindung).">Gesamt: {(usedHoursBefore + trackedMinutes / 60).toFixed(1).replace(".", ",")} h von {lifetimeHours} h Lebensdauer ({Math.min(100, ((usedHoursBefore + trackedMinutes / 60) / lifetimeHours) * 100).toFixed(1).replace(".", ",")} %){usedHoursBefore > 0 ? ` · davon ${usedHoursBefore} h schon vorher gelaufen` : ""}</span>}
      </div>
      {showPrint && <PrintSendDialog printerId={printerId} printerName={printerName ?? "Drucker"} status={status} onClose={() => setShowPrint(false)} />}
      {photo?.error && <p className="text-xs text-amber-600">{photo.error}</p>}
      {live && !live.error && (
        <div>
          <img src={`/api/printers/${printerId}/stream?k=${live.key}`} onError={liveFailed} alt="Live-Ansicht des Druckers" className="rounded-lg w-full max-w-2xl border border-slate-200 dark:border-slate-700 bg-black/80 min-h-[8rem]" />
          <p className="text-xs text-slate-500 mt-1">Läuft bis zu 15 Minuten, 1-2 Bilder pro Sekunde. Bleibt das Bild stehen, "Neu starten" drücken.</p>
        </div>
      )}
      {live?.error && <p className="text-xs text-amber-600">{live.error}</p>}
      {photo?.url && <img src={photo.url} alt="Kamerabild des Druckers" className="rounded-lg w-full max-w-md border border-slate-200 dark:border-slate-700" />}

      {usageJob && <JobUsageDialog jobId={usageJob.id} jobName={usageJob.name} current={usageJob.materialUsage} onClose={() => setUsageJob(null)} onSaved={async () => { setUsageJob(null); setJobs((await api.get(`/printers/${printerId}/jobs`)).data); }} />}
      {jobs && (
        <ul className="text-xs divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg">
          {jobs.map((j) => (
            <li key={j.id} className="px-2 py-1.5 flex flex-wrap justify-between gap-2">
              <span className="truncate">{j.name ?? "Druckauftrag"}{j.materialUsage && j.materialUsage.length > 0 ? <span className="text-slate-500"> · {j.materialUsage.map((u) => `${u.name} ${Math.round(u.grams)} g`).join(", ")}</span> : null}</span>
              <span className="text-slate-500">{new Date(j.startedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {j.endedAt ? `${formatMinutes(j.minutes ?? 0)} · ${resultLabel[j.result ?? "UNKNOWN"] ?? j.result}` : "läuft"}</span>
              <span className="w-full flex flex-wrap items-center gap-x-3 gap-y-1">
                {j.endedAt && j.result === "FINISHED" && !(j.materialUsage && j.materialUsage.length > 0) && <span className="text-amber-700 dark:text-amber-400 shrink-0" title="Das AMS hat keinen Verbrauch gemeldet und es gab keinen Slicer-Plan (Spule ohne Chip, Fach keinem Material zugeordnet oder Druck nicht über die App gesendet).">kein Material erfasst</span>}
                {isAdmin && (j.endedAt ? <button type="button" onClick={() => setUsageJob(j)} className="text-brand hover:underline shrink-0" title="Verbrauch festlegen oder korrigieren (z.B. bei Drucken aus Bambu Studio)">{j.materialUsage && j.materialUsage.length > 0 ? "Material ändern" : "Material festlegen"}</button> : <span className="text-slate-500 shrink-0" title="Während des Drucks misst das AMS mit; danach lässt sich der Verbrauch festlegen.">Material nach Druckende</span>)}
                <span className="text-slate-500 shrink-0">Auftrag:</span>
                <OrderSelect value={j.order?.id ?? (j.noOrder ? NO_ORDER : "")} current={j.order} onChange={(id) => assignJob(j.id, id)} className="min-w-0 flex-1 max-w-xs px-1.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs" emptyLabel="noch keinem Auftrag zugeordnet" extraOption={{ value: NO_ORDER, label: "für keinen Auftrag (Lager/Test)" }} />
              </span>
            </li>
          ))}
          {jobs.length === 0 && <li className="px-2 py-2 text-slate-500">Noch keine Druckaufträge erfasst.</li>}
        </ul>
      )}
    </div>
  );
}
