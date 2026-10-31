import AdmZip from "adm-zip";
import { Client } from "basic-ftp";
import { Readable } from "stream";
import mqtt from "mqtt";

/**
 * Druckaufträge an einen Bambu-Lab-Drucker im LAN-Modus schicken: Die fertig geslicte Datei (.gcode.3mf aus Bambu Studio, "Platte
 * slicen" -> "G-Code 3MF exportieren") wird per FTPS (Port 990, Benutzer "bblp", Passwort = Zugangscode) auf die SD-Karte des Druckers
 * geladen; optional folgt der Startbefehl "project_file" per MQTT. Beides passiert nur auf ausdrücklichen Wunsch eines Administrators
 * (siehe Router) - die dauerhafte Überwachung (monitorCore) sendet weiterhin nie Befehle.
 */

export interface PlateFilament {
  id: number; // 1-basiert wie in Bambu Studio
  type: string | null;
  color: string | null;
  usedGrams: number | null;
}
export interface PlateInfo {
  index: number;
  gcodePath: string;
  md5: string | null;
  predictionSeconds: number | null;
  weightGrams: number | null;
  filaments: PlateFilament[];
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([A-Za-z_][\w-]*)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}
const num = (v: string | undefined) => {
  if (v === undefined || v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** Liest aus einer 3MF-Datei, welche Platten fertig geslict sind (enthalten G-Code) und welche Filamente sie brauchen. */
export function inspect3mf(buffer: Buffer): PlateInfo[] {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new Error("Die Datei ist keine gültige 3MF-Datei.");
  }
  const names = zip.getEntries().map((e) => e.entryName);
  const gcodes = names.map((n) => n.match(/^Metadata\/plate_(\d+)\.gcode$/)).filter((m): m is RegExpMatchArray => !!m).map((m) => Number(m[1]));
  if (gcodes.length === 0) {
    throw new Error("Die Datei enthält keinen G-Code. In Bambu Studio die Platte slicen und über \"Exportieren\" → \"G-Code 3MF\" speichern (die reine Projektdatei lässt sich nicht drucken).");
  }
  const info = new Map<number, { prediction: number | null; weight: number | null; filaments: PlateFilament[] }>();
  const sliceInfo = zip.getEntry("Metadata/slice_info.config");
  if (sliceInfo) {
    const xml = sliceInfo.getData().toString("utf8");
    for (const block of xml.matchAll(/<plate>([\s\S]*?)<\/plate>/g)) {
      const meta: Record<string, string> = {};
      for (const m of block[1].matchAll(/<metadata\b[^>]*\/?>/g)) {
        const a = attrs(m[0]);
        if (a.key) meta[a.key] = a.value;
      }
      const index = Number(meta.index);
      if (!Number.isFinite(index)) continue;
      const filaments: PlateFilament[] = [...block[1].matchAll(/<filament\b[^>]*\/?>/g)].map((m) => {
        const a = attrs(m[0]);
        return { id: Number(a.id), type: a.type || null, color: a.color ? a.color.slice(0, 7).toLowerCase() : null, usedGrams: num(a.used_g) };
      }).filter((f) => Number.isFinite(f.id));
      info.set(index, { prediction: num(meta.prediction), weight: num(meta.weight), filaments });
    }
  }
  return [...new Set(gcodes)].sort((a, b) => a - b).map((index) => {
    const i = info.get(index);
    const md5Entry = zip.getEntry(`Metadata/plate_${index}.gcode.md5`);
    return {
      index,
      gcodePath: `Metadata/plate_${index}.gcode`,
      md5: md5Entry ? md5Entry.getData().toString("utf8").trim().toUpperCase() || null : null,
      predictionSeconds: i?.prediction ?? null,
      weightGrams: i?.weight ?? null,
      filaments: i?.filaments ?? [],
    };
  });
}

/** Dateiname für die SD-Karte des Druckers: nur ASCII ohne Leerzeichen, endet auf .3mf. */
export function remoteFileName(original: string): string {
  const base = original.replace(/\.3mf$/i, "").replace(/\.gcode$/i, "");
  const safe = base.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/\.{2,}/g, "_").replace(/^[_.-]+|[_.-]+$/g, "").slice(0, 60) || "druck";
  return `${safe}.gcode.3mf`;
}

/**
 * Zuordnung Filament -> AMS-Fach für den Startbefehl. Position = Filament-Nummer - 1; Wert = AMS-Fach (Einheit*4+Fach) oder 254 für die
 * externe Spule, -1 für nicht benutzte Filamente.
 */
export function buildAmsMapping(filaments: PlateFilament[], assignment: Record<number, number>): number[] {
  const max = Math.max(0, ...filaments.map((f) => f.id));
  const out = Array<number>(max).fill(-1);
  for (const f of filaments) out[f.id - 1] = assignment[f.id] ?? -1;
  return out;
}

export interface StartOptions {
  fileName: string; // Name auf der SD-Karte
  plate: PlateInfo;
  amsMapping: number[];
  useAms: boolean;
}

export function buildStartPayload(o: StartOptions): string {
  const print: Record<string, unknown> = {
    sequence_id: "0",
    command: "project_file",
    param: o.plate.gcodePath,
    project_id: "0",
    profile_id: "0",
    task_id: "0",
    subtask_id: "0",
    subtask_name: o.fileName.replace(/\.gcode\.3mf$/i, ""),
    file: "",
    url: `file:///sdcard/${o.fileName}`,
    timelapse: false,
    bed_type: "auto",
    bed_leveling: true,
    flow_cali: true,
    vibration_cali: true,
    layer_inspect: true,
    use_ams: o.useAms,
    ams_mapping: o.amsMapping,
  };
  if (o.plate.md5) print.md5 = o.plate.md5;
  return JSON.stringify({ print });
}

export interface PrinterAccess {
  host: string;
  serial: string;
  accessCode: string;
}

/** Datei per FTPS auf die SD-Karte laden. ftpOptions nur für Tests (z.B. anderer Port, ohne TLS). */
export async function uploadToPrinter(target: PrinterAccess, data: Buffer, remoteName: string, ftpOptions: { port?: number; secure?: boolean | "implicit" } = {}): Promise<void> {
  const client = new Client(60_000);
  try {
    await client.access({
      host: target.host,
      port: ftpOptions.port ?? 990,
      user: "bblp",
      password: target.accessCode,
      secure: ftpOptions.secure ?? "implicit",
      secureOptions: { rejectUnauthorized: false }, // der Drucker nutzt ein selbst signiertes Zertifikat
    });
    await client.uploadFrom(Readable.from(data), remoteName);
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (/530|login|password/i.test(msg)) throw new Error("Der Drucker hat den Zugangscode für die Dateiübertragung abgelehnt.");
    if (/ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH/i.test(msg)) throw new Error("Die Dateiübertragung zum Drucker ist nicht möglich (Port 990). LAN-Modus und Netzwerk prüfen.");
    throw new Error(`Dateiübertragung zum Drucker fehlgeschlagen (${msg.slice(0, 120)})`);
  } finally {
    client.close();
  }
}

/** Einen Befehl per MQTT an den Drucker senden und auf die Übergabe warten. brokerUrl nur für Tests. */
export function publishToPrinter(target: PrinterAccess, payload: string, opts: { timeoutMs?: number; brokerUrl?: string } = {}): Promise<void> {
  const { timeoutMs = 10_000, brokerUrl = `mqtts://${target.host}:8883` } = opts;
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(brokerUrl, {
      username: "bblp",
      password: target.accessCode,
      clientId: `rechnungssoftware-cmd-${Math.random().toString(16).slice(2, 10)}`,
      protocolVersion: 4,
      rejectUnauthorized: false,
      reconnectPeriod: 0,
      connectTimeout: timeoutMs,
      clean: true,
    });
    const finish = (err: Error | null) => {
      clearTimeout(timer);
      client.end(true);
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error("Zeitüberschreitung beim Senden des Startbefehls.")), timeoutMs);
    client.on("connect", () => {
      client.publish(`device/${target.serial}/request`, payload, { qos: 1 }, (err) => finish(err ? new Error("Startbefehl konnte nicht gesendet werden.") : null));
    });
    client.on("error", (err) => {
      const code = (err as { code?: number | string }).code;
      finish(new Error(code === 4 || code === 5 ? "Der Drucker hat den Zugangscode abgelehnt." : "Verbindung zum Drucker für den Startbefehl fehlgeschlagen."));
    });
  });
}
