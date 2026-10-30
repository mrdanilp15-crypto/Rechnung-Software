/**
 * Bambu-Lab-Status aus den MQTT-Berichten des Druckers (LAN-Modus, Thema device/<Seriennummer>/report).
 *
 * Der Drucker schickt nach "pushall" einen vollständigen Stand und danach nur noch Änderungen (Deltas) im Objekt "print".
 * Deshalb wird jeder Bericht in den bisherigen Stand eingemischt (mergePrintReport) und erst daraus der anzeigbare Status
 * berechnet (normalizeStatus). Alles hier ist reine Logik ohne Netzwerk und wird mit Beispielberichten getestet.
 */

export type RawPrint = Record<string, any>;

export type GcodeState = "IDLE" | "PREPARE" | "RUNNING" | "PAUSE" | "FINISH" | "FAILED" | "UNKNOWN";

export interface Tray {
  slot: number;
  type: string | null; // z.B. PLA
  brand: string | null; // z.B. PLA Basic
  color: string | null; // #rrggbb
  remainPercent: number | null;
  rfid: boolean; // Bambu-Spule mit Chip (Füllstand verlässlich)
  tag: string | null; // Chip-Kennung der Spule (ändert sich beim Spulenwechsel)
  amsSlot: number | null; // AMS-Einheit * 4 + Fach; null bei der externen Spule
  active: boolean;
}
export interface AmsUnit {
  id: number;
  humidityLevel: number | null; // 1 (feucht) bis 5 (trocken)
  trays: Tray[];
}

export interface PrinterLiveStatus {
  connection: "off" | "connecting" | "online" | "offline" | "auth_failed" | "error";
  message: string | null;
  lastSeen: string | null;
  state: GcodeState;
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
  ams: { units: AmsUnit[]; external: Tray | null; activeLabel: string | null };
}

export const STATE_LABELS: Record<GcodeState, string> = {
  IDLE: "Bereit",
  PREPARE: "Bereitet vor",
  RUNNING: "Druckt",
  PAUSE: "Pausiert",
  FINISH: "Fertig",
  FAILED: "Fehlgeschlagen",
  UNKNOWN: "Unbekannt",
};

export function toGcodeState(raw: unknown): GcodeState {
  const s = String(raw ?? "").toUpperCase();
  return (["IDLE", "PREPARE", "RUNNING", "PAUSE", "FINISH", "FAILED"] as const).find((x) => x === s) ?? "UNKNOWN";
}

export const isActiveState = (s: GcodeState) => s === "PREPARE" || s === "RUNNING" || s === "PAUSE";

/** Bericht in den bisherigen Stand einmischen: Schlüssel auf oberster Ebene werden ersetzt, das AMS-Objekt feldweise ergänzt. */
export function mergePrintReport(current: RawPrint, message: unknown): RawPrint {
  const print = (message as { print?: RawPrint } | null)?.print;
  if (!print || typeof print !== "object") return current;
  const next: RawPrint = { ...current };
  for (const [key, value] of Object.entries(print)) {
    if (key === "ams" && value && typeof value === "object" && current.ams && typeof current.ams === "object") {
      next.ams = { ...current.ams, ...(value as RawPrint) };
    } else {
      next[key] = value;
    }
  }
  return next;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

function trayColor(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s) ? `#${s.slice(0, 6).toLowerCase()}` : null;
}

function parseTray(raw: RawPrint, slot: number, active: boolean, amsSlot: number | null = null): Tray {
  const type = String(raw.tray_type ?? "").trim() || null;
  const remain = num(raw.remain);
  const tag = String(raw.tag_uid ?? "");
  return {
    slot,
    type,
    brand: String(raw.tray_sub_brands ?? "").trim() || null,
    color: type ? trayColor(raw.tray_color) : null,
    remainPercent: remain !== null && remain >= 0 && remain <= 100 ? remain : null,
    rfid: tag.length > 0 && !/^0+$/.test(tag),
    tag: tag.length > 0 && !/^0+$/.test(tag) ? tag : null,
    amsSlot,
    active,
  };
}

function parseAms(print: RawPrint): PrinterLiveStatus["ams"] {
  const trayNow = String(print.ams?.tray_now ?? "");
  const units: AmsUnit[] = [];
  const list = Array.isArray(print.ams?.ams) ? print.ams.ams : [];
  for (const unit of list) {
    const id = num(unit?.id) ?? units.length;
    const trays: Tray[] = [];
    for (const t of Array.isArray(unit?.tray) ? unit.tray : []) {
      const slot = num(t?.id) ?? trays.length;
      trays.push(parseTray(t ?? {}, slot, trayNow === String(id * 4 + slot), id * 4 + slot));
    }
    units.push({ id, humidityLevel: num(unit?.humidity), trays });
  }
  const external = print.vt_tray && typeof print.vt_tray === "object" && String(print.vt_tray.tray_type ?? "").trim() ? parseTray(print.vt_tray, 0, trayNow === "254") : null;
  let activeLabel: string | null = null;
  if (trayNow === "254") activeLabel = "Externe Spule";
  else if (trayNow && trayNow !== "255" && /^\d+$/.test(trayNow)) {
    const n = parseInt(trayNow, 10);
    activeLabel = `AMS ${Math.floor(n / 4) + 1} · Fach ${(n % 4) + 1}`;
  }
  return { units, external, activeLabel };
}

export function normalizeStatus(print: RawPrint, meta: { connection: PrinterLiveStatus["connection"]; message?: string | null; lastSeen: Date | null }): PrinterLiveStatus {
  const state = toGcodeState(print.gcode_state);
  const error = num(print.print_error);
  const jobName = String(print.subtask_name || print.gcode_file || "").trim() || null;
  const percent = num(print.mc_percent);
  return {
    connection: meta.connection,
    message: meta.message ?? null,
    lastSeen: meta.lastSeen ? meta.lastSeen.toISOString() : null,
    state,
    stateLabel: STATE_LABELS[state],
    progressPercent: percent === null ? null : Math.max(0, Math.min(100, Math.round(percent))),
    remainingMinutes: num(print.mc_remaining_time),
    layer: num(print.layer_num),
    totalLayers: num(print.total_layer_num),
    jobName,
    nozzleTemp: round1(num(print.nozzle_temper)),
    nozzleTarget: round1(num(print.nozzle_target_temper)),
    bedTemp: round1(num(print.bed_temper)),
    bedTarget: round1(num(print.bed_target_temper)),
    chamberTemp: round1(num(print.chamber_temper)),
    wifiSignal: String(print.wifi_signal ?? "").trim() || null,
    errorCode: error && error !== 0 ? error : null,
    ams: parseAms(print),
  };
}

export function offlineStatus(connection: PrinterLiveStatus["connection"], message: string | null = null, lastSeen: Date | null = null): PrinterLiveStatus {
  return normalizeStatus({}, { connection, message, lastSeen });
}

// ---------- Druckaufträge (Verlauf) ----------

export type JobResult = "FINISHED" | "FAILED" | "CANCELLED" | "UNKNOWN";
export type JobEvent = { type: "start"; name: string | null } | { type: "end"; result: JobResult };

/**
 * Erkennt aus dem Wechsel des Druckerzustands, wann ein Druck beginnt und endet:
 * PREPARE/RUNNING/PAUSE = aktiv; Ende mit FINISH = fertig, FAILED = fehlgeschlagen, IDLE = abgebrochen.
 * Beim ersten Bericht nach Verbindungsaufbau gilt: war der Drucker schon aktiv, beginnt ab jetzt ein (angefangener) Auftrag.
 */
export class JobTracker {
  private previous: GcodeState | null = null;

  /** Anfangszustand setzen, ohne einen Start zu melden (z.B. wenn ein bereits offener Auftrag übernommen wird). */
  prime(state: GcodeState) {
    this.previous = state;
  }

  update(state: GcodeState, name: string | null): JobEvent[] {
    if (state === "UNKNOWN") return [];
    const events: JobEvent[] = [];
    const wasActive = this.previous !== null && isActiveState(this.previous);
    const nowActive = isActiveState(state);
    if (nowActive && !wasActive) events.push({ type: "start", name });
    if (!nowActive && wasActive) events.push({ type: "end", result: state === "FINISH" ? "FINISHED" : state === "FAILED" ? "FAILED" : "CANCELLED" });
    this.previous = state;
    return events;
  }
}
