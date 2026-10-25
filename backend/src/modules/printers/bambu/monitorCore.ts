import mqtt, { MqttClient } from "mqtt";
import { JobTracker, isActiveState, mergePrintReport, normalizeStatus, offlineStatus, toGcodeState, type JobEvent, type JobResult, type PrinterLiveStatus, type RawPrint } from "./status";

/**
 * Dauerhafte, nur lesende Verbindung zu Bambu-Lab-Druckern im LAN-Modus (MQTT über TLS, Port 8883, Benutzer "bblp", Passwort =
 * Zugangscode des Druckers). Es werden ausschließlich Berichte gelesen (plus die Anfrage "pushall" für den Gesamtstand) -
 * es werden nie Steuerbefehle (Pause/Stopp/Start) an den Drucker gesendet.
 *
 * Dieser Kern kennt weder Datenbank noch Konfiguration (alles wird hineingereicht) und ist deshalb ohne Server testbar;
 * die Anbindung an Datenbank und Einstellungen steht in monitor.ts.
 */

const STALE_AFTER_MS = 90_000;
const PUSHALL_EVERY_MS = 5 * 60_000;

export interface MonitorTarget {
  printerId: string;
  companyId: string;
  host: string;
  serial: string;
  accessCode: string;
}

export interface OpenJob {
  id: string;
  name: string | null;
  startedAt: Date;
}

/** Ablage der erkannten Druckaufträge (in der App: Datenbank; im Test: Arbeitsspeicher). */
export interface JobStore {
  findOpen(printerId: string): Promise<OpenJob | null>;
  create(data: { companyId: string; printerId: string; name: string | null; startedAt: Date }): Promise<OpenJob>;
  close(id: string, data: { endedAt: Date; result: JobResult; minutes: number }): Promise<void>;
}

export interface MonitorDeps {
  store: JobStore;
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void };
  /** Adresse des MQTT-Servers; im Test z.B. ein lokaler Broker ohne TLS */
  brokerUrl?: (host: string) => string;
}

interface Connection {
  target: MonitorTarget;
  client: MqttClient;
  raw: RawPrint;
  connection: PrinterLiveStatus["connection"];
  message: string | null;
  lastSeen: Date | null;
  tracker: JobTracker;
  jobId: string | null;
  jobStartedAt: Date | null;
  reconciled: boolean;
  queue: Promise<void>;
  pushTimer: NodeJS.Timeout | null;
}

const requestTopic = (serial: string) => `device/${serial}/request`;
const reportTopic = (serial: string) => `device/${serial}/report`;
const pushAllMessage = () => JSON.stringify({ pushing: { sequence_id: "0", command: "pushall" } });
const defaultBrokerUrl = (host: string) => `mqtts://${host}:8883`;

function connectOptions(code: string, reconnectPeriod = 10_000) {
  return {
    username: "bblp",
    password: code,
    clientId: `rechnungssoftware-${Math.random().toString(16).slice(2, 10)}`,
    protocolVersion: 4 as const,
    rejectUnauthorized: false, // Der Drucker nutzt ein eigenes (selbst signiertes) Zertifikat; die Verbindung bleibt im lokalen Netz
    reconnectPeriod,
    connectTimeout: 10_000,
    keepalive: 30,
    clean: true,
  };
}

export const isAuthError = (err: unknown) => {
  const e = err as { code?: number | string; message?: string };
  return e?.code === 4 || e?.code === 5 || /not authorized|bad user name|bad username/i.test(e?.message ?? "");
};

function describeNetworkError(code: string | undefined): string {
  if (code === "ECONNREFUSED") return "Verbindung abgelehnt (LAN-Modus am Drucker aktiv?)";
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH" || code === "ETIMEDOUT") return "Drucker nicht erreichbar (IP-Adresse und Netzwerk prüfen)";
  if (code === "ENOTFOUND") return "Adresse nicht gefunden";
  return "Verbindungsfehler";
}

export class BambuMonitorCore {
  private connections = new Map<string, Connection>();
  private staleTimer: NodeJS.Timeout | null = null;

  constructor(private deps: MonitorDeps) {}

  private url(host: string) {
    return (this.deps.brokerUrl ?? defaultBrokerUrl)(host);
  }

  startStaleCheck() {
    if (this.staleTimer) return;
    this.staleTimer = setInterval(() => this.markStale(), 30_000);
    this.staleTimer.unref?.();
  }

  startTarget(target: MonitorTarget) {
    this.stop(target.printerId);
    const client = mqtt.connect(this.url(target.host), connectOptions(target.accessCode));
    const conn: Connection = {
      target, client, raw: {}, connection: "connecting", message: null, lastSeen: null,
      tracker: new JobTracker(), jobId: null, jobStartedAt: null, reconciled: false, queue: Promise.resolve(), pushTimer: null,
    };
    this.connections.set(target.printerId, conn);

    client.on("connect", () => {
      conn.message = null;
      client.subscribe(reportTopic(target.serial), (err) => {
        if (!err) client.publish(requestTopic(target.serial), pushAllMessage());
      });
      if (conn.pushTimer) clearInterval(conn.pushTimer);
      conn.pushTimer = setInterval(() => client.connected && client.publish(requestTopic(target.serial), pushAllMessage()), PUSHALL_EVERY_MS);
      conn.pushTimer.unref?.();
    });
    client.on("message", (_topic, payload) => {
      let json: unknown;
      try {
        json = JSON.parse(payload.toString("utf8"));
      } catch {
        return;
      }
      // Berichte nacheinander abarbeiten, damit nie zwei Aufträge gleichzeitig angelegt werden
      conn.queue = conn.queue.then(() => this.onReport(conn, json)).catch((err) => this.deps.log.warn({ err: (err as Error).message }, "Druckerbericht konnte nicht verarbeitet werden"));
    });
    client.on("error", (err) => {
      if (isAuthError(err)) {
        // Falscher Zugangscode: nicht endlos weiterprobieren (mehrfache Fehlversuche könnten den Drucker sperren)
        conn.connection = "auth_failed";
        conn.message = "Zugangscode wurde vom Drucker abgelehnt";
        client.end(true);
      } else {
        conn.connection = "error";
        conn.message = describeNetworkError((err as NodeJS.ErrnoException).code);
      }
    });
    client.on("close", () => {
      if (conn.pushTimer) clearInterval(conn.pushTimer);
      if (conn.connection === "online" || conn.connection === "connecting") {
        conn.connection = "offline";
        conn.message = "Drucker nicht erreichbar";
      }
    });
  }

  private async onReport(conn: Connection, json: unknown) {
    const merged = mergePrintReport(conn.raw, json);
    if (merged === conn.raw) return; // kein "print"-Bericht
    conn.raw = merged;
    conn.lastSeen = new Date();
    conn.connection = "online";
    conn.message = null;
    const state = toGcodeState(merged.gcode_state);
    if (state === "UNKNOWN") return;
    const name = String(merged.subtask_name || merged.gcode_file || "").trim() || null;

    // Nach (Neu-)Start: noch offenen Auftrag aus der Ablage übernehmen oder abschließen
    if (!conn.reconciled) {
      conn.reconciled = true;
      const open = await this.deps.store.findOpen(conn.target.printerId);
      if (open) {
        if (isActiveState(state) && (!open.name || !name || open.name === name)) {
          conn.jobId = open.id;
          conn.jobStartedAt = open.startedAt;
          conn.tracker.prime(state);
          return;
        }
        await this.closeJob(open.id, open.startedAt, "UNKNOWN");
      }
    }
    for (const event of conn.tracker.update(state, name)) await this.handleJobEvent(conn, event);
  }

  private async closeJob(jobId: string, startedAt: Date, result: JobResult) {
    const endedAt = new Date();
    await this.deps.store.close(jobId, { endedAt, result, minutes: Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)) });
  }

  private async handleJobEvent(conn: Connection, event: JobEvent) {
    if (event.type === "start") {
      const job = await this.deps.store.create({ companyId: conn.target.companyId, printerId: conn.target.printerId, name: event.name, startedAt: new Date() });
      conn.jobId = job.id;
      conn.jobStartedAt = job.startedAt;
    } else if (conn.jobId && conn.jobStartedAt) {
      const { jobId, jobStartedAt } = conn;
      conn.jobId = null;
      conn.jobStartedAt = null;
      await this.closeJob(jobId, jobStartedAt, event.result);
    }
  }

  private markStale() {
    const now = Date.now();
    for (const c of this.connections.values()) {
      if (c.connection === "online" && c.lastSeen && now - c.lastSeen.getTime() > STALE_AFTER_MS) {
        c.connection = "offline";
        c.message = "Keine Daten vom Drucker (ausgeschaltet?)";
      }
    }
  }

  stop(printerId: string) {
    const c = this.connections.get(printerId);
    if (!c) return;
    if (c.pushTimer) clearInterval(c.pushTimer);
    c.client.end(true);
    this.connections.delete(printerId);
  }

  stopAll() {
    for (const id of [...this.connections.keys()]) this.stop(id);
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.staleTimer = null;
  }

  getStatus(printerId: string): PrinterLiveStatus {
    const c = this.connections.get(printerId);
    if (!c) return offlineStatus("off");
    return normalizeStatus(c.raw, { connection: c.connection, message: c.message, lastSeen: c.lastSeen });
  }

  /** Wartet, bis alle bisher eingegangenen Berichte verarbeitet sind (für Tests). */
  async idle(printerId: string) {
    await this.connections.get(printerId)?.queue;
  }
}

// ---------- Verbindungstest (einmalig, mit Eingabewerten) ----------

export type ConnectionTestResult = { ok: true; status: PrinterLiveStatus } | { ok: false; reason: string };

export function testBambuConnection(target: Pick<MonitorTarget, "host" | "serial" | "accessCode">, opts: { timeoutMs?: number; brokerUrl?: (host: string) => string } = {}): Promise<ConnectionTestResult> {
  const { timeoutMs = 10_000, brokerUrl = defaultBrokerUrl } = opts;
  return new Promise((resolve) => {
    let finished = false;
    let connected = false;
    let raw: RawPrint = {};
    const client = mqtt.connect(brokerUrl(target.host), connectOptions(target.accessCode, 0));
    const done = (result: ConnectionTestResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      client.end(true);
      resolve(result);
    };
    const timer = setTimeout(() => {
      done({ ok: false, reason: connected ? "Verbunden, aber der Drucker antwortet nicht - Seriennummer prüfen (steht am Drucker unter Einstellungen → Gerät)." : "Zeitüberschreitung - der Drucker ist unter dieser Adresse nicht erreichbar (IP-Adresse, LAN-Modus und Netzwerk prüfen)." });
    }, timeoutMs);
    client.on("connect", () => {
      connected = true;
      client.subscribe(reportTopic(target.serial), (err) => {
        if (err) return done({ ok: false, reason: "Abonnieren fehlgeschlagen" });
        client.publish(requestTopic(target.serial), pushAllMessage());
      });
    });
    client.on("message", (_t, payload) => {
      let json: unknown;
      try {
        json = JSON.parse(payload.toString("utf8"));
      } catch {
        return;
      }
      raw = mergePrintReport(raw, json);
      if (Object.keys(raw).length > 0) done({ ok: true, status: normalizeStatus(raw, { connection: "online", lastSeen: new Date() }) });
    });
    client.on("error", (err) => {
      if (isAuthError(err)) return done({ ok: false, reason: "Der Drucker hat den Zugangscode abgelehnt." });
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ECONNREFUSED") return done({ ok: false, reason: "Verbindung abgelehnt - ist der LAN-Modus am Drucker aktiviert?" });
      if (code === "EHOSTUNREACH" || code === "ENETUNREACH" || code === "ETIMEDOUT") return done({ ok: false, reason: "Drucker nicht erreichbar - IP-Adresse und Netzwerk prüfen (der Server muss im selben Netz sein)." });
      if (code === "ENOTFOUND") return done({ ok: false, reason: "Adresse nicht gefunden." });
      done({ ok: false, reason: `Verbindungsfehler${code ? ` (${code})` : ""}` });
    });
  });
}
