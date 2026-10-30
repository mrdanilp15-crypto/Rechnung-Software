import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import net from "net";
import aedesFactory from "aedes";
import { BambuMonitorCore, testBambuConnection, type JobStore, type OpenJob } from "../src/modules/printers/bambu/monitorCore";
import { fetchBambuSnapshot } from "../src/modules/printers/bambu/network";

/**
 * Simuliert einen Bambu-Lab-Drucker mit einem lokalen MQTT-Broker (ohne TLS): Der "Drucker" antwortet auf "pushall" mit einem
 * Gesamtbericht und schickt auf Wunsch Teilberichte. Geprüft wird insbesondere, dass die Software nur liest.
 */

const SERIAL = "01P00A000000001";
const CODE = "12345678";
const REPORT = `device/${SERIAL}/report`;

const full = (state: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ print: { gcode_state: state, mc_percent: 10, mc_remaining_time: 60, layer_num: 5, total_layer_num: 50, subtask_name: "Testteil", nozzle_temper: 200, bed_temper: 60, ams: { tray_now: "0", ams: [{ id: "0", humidity: "3", tray: [{ id: "0", tray_type: "PLA", tray_color: "FF0000FF", remain: 80, tag_uid: "ABCDEF0123456789" }] }] }, ...extra } });

let broker: ReturnType<typeof aedesFactory>;
let server: net.Server;
let port = 0;
let currentState = "IDLE";
let currentName = "Testteil";
const clientPublishes: { topic: string; payload: string }[] = [];
let connects = 0;

const url = () => (_host: string) => `mqtt://127.0.0.1:${port}`;
const waitFor = async (cond: () => boolean | Promise<boolean>, ms = 4000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("Zeitüberschreitung im Test");
};

beforeAll(async () => {
  broker = aedesFactory();
  broker.authenticate = (_client, username, password, cb) => {
    connects++;
    if (username?.toString() === "bblp" && password?.toString() === CODE) return cb(null, true);
    const err = Object.assign(new Error("Auth error"), { returnCode: 4 });
    cb(err as never, false);
  };
  // Der simulierte Drucker: antwortet auf pushall mit dem Gesamtstand
  broker.on("publish", (packet, client) => {
    if (!client) return; // vom Broker selbst gesendet
    clientPublishes.push({ topic: packet.topic, payload: packet.payload.toString() });
    if (packet.topic === `device/${SERIAL}/request` && packet.payload.toString().includes("pushall")) {
      broker.publish({ cmd: "publish", qos: 0, retain: false, dup: false, topic: REPORT, payload: full(currentState, { subtask_name: currentName }) }, () => {});
    }
  });
  server = net.createServer(broker.handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as net.AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => broker.close(() => server.close(() => resolve())));
});

const push = (payload: string) => broker.publish({ cmd: "publish", qos: 0, retain: false, dup: false, topic: REPORT, payload }, () => {});

function memoryStore() {
  const jobs: { id: string; companyId: string; printerId: string; name: string | null; startedAt: Date; endedAt?: Date; result?: string; minutes?: number }[] = [];
  const store: JobStore = {
    findOpen: async (printerId) => jobs.filter((j) => j.printerId === printerId && !j.endedAt).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ?? null,
    create: async (d) => {
      const job = { id: `job${jobs.length + 1}`, ...d };
      jobs.push(job);
      return { id: job.id, name: job.name, startedAt: job.startedAt } as OpenJob;
    },
    close: async (id, d) => {
      Object.assign(jobs.find((j) => j.id === id)!, d);
    },
  };
  return { jobs, store };
}

const cores: BambuMonitorCore[] = [];
afterEach(() => {
  cores.splice(0).forEach((c) => c.stopAll());
  clientPublishes.length = 0;
});
const makeCore = (store: JobStore) => {
  const core = new BambuMonitorCore({ store, log: { info: () => {}, warn: () => {} }, brokerUrl: url() });
  cores.push(core);
  return core;
};
const target = (over: Partial<{ accessCode: string; serial: string }> = {}) => ({ printerId: "p1", companyId: "c1", host: "127.0.0.1", serial: SERIAL, accessCode: CODE, ...over });

describe("Bambu-Monitor mit simuliertem Drucker", () => {
  it("verbindet, fragt den Gesamtstand an und zeigt Fortschritt und AMS", async () => {
    currentState = "RUNNING";
    const { store } = memoryStore();
    const core = makeCore(store);
    core.startTarget(target());
    await waitFor(() => core.getStatus("p1").connection === "online");
    const s = core.getStatus("p1");
    expect(s).toMatchObject({ state: "RUNNING", progressPercent: 10, remainingMinutes: 60, layer: 5, totalLayers: 50, jobName: "Testteil", nozzleTemp: 200 });
    expect(s.ams.units[0].trays[0]).toMatchObject({ type: "PLA", color: "#ff0000", remainPercent: 80, active: true });
  });

  it("übernimmt Teilberichte in den Stand", async () => {
    currentState = "RUNNING";
    const { store } = memoryStore();
    const core = makeCore(store);
    core.startTarget(target());
    await waitFor(() => core.getStatus("p1").connection === "online");
    push(JSON.stringify({ print: { mc_percent: 55, layer_num: 28 } }));
    await waitFor(() => core.getStatus("p1").progressPercent === 55);
    expect(core.getStatus("p1")).toMatchObject({ layer: 28, jobName: "Testteil", totalLayers: 50 });
  });

  it("sendet ausschließlich die Anfrage nach dem Gesamtstand - nie Steuerbefehle", async () => {
    currentState = "RUNNING";
    const { store } = memoryStore();
    const core = makeCore(store);
    core.startTarget(target());
    await waitFor(() => core.getStatus("p1").connection === "online");
    await new Promise((r) => setTimeout(r, 150));
    expect(clientPublishes.length).toBeGreaterThan(0);
    for (const p of clientPublishes) {
      expect(p.topic).toBe(`device/${SERIAL}/request`);
      expect(JSON.parse(p.payload)).toEqual({ pushing: { sequence_id: "0", command: "pushall" } });
    }
  });

  it("legt beim Druckstart einen Auftrag an und schließt ihn bei Fertig mit der Dauer", async () => {
    currentState = "IDLE";
    const { store, jobs } = memoryStore();
    const core = makeCore(store);
    core.startTarget(target());
    await waitFor(() => core.getStatus("p1").connection === "online");
    expect(jobs).toHaveLength(0);
    push(full("RUNNING"));
    await waitFor(() => jobs.length === 1);
    expect(jobs[0]).toMatchObject({ printerId: "p1", companyId: "c1", name: "Testteil" });
    expect(jobs[0].endedAt).toBeUndefined();
    push(full("RUNNING", { mc_percent: 90 })); // läuft weiter - kein zweiter Auftrag
    push(full("FINISH", { mc_percent: 100 }));
    await waitFor(() => !!jobs[0].endedAt);
    await core.idle("p1");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ result: "FINISHED" });
    expect(jobs[0].minutes).toBeGreaterThanOrEqual(0);
  });

  it("erkennt Abbruch und Fehlschlag", async () => {
    currentState = "IDLE";
    const { store, jobs } = memoryStore();
    const core = makeCore(store);
    core.startTarget(target());
    await waitFor(() => core.getStatus("p1").connection === "online");
    push(full("RUNNING", { subtask_name: "A" }));
    push(full("IDLE", { subtask_name: "A" }));
    push(full("RUNNING", { subtask_name: "B" }));
    push(full("FAILED", { subtask_name: "B" }));
    await waitFor(() => jobs.length === 2 && !!jobs[1].endedAt);
    expect(jobs.map((j) => j.result)).toEqual(["CANCELLED", "FAILED"]);
  });

  it("übernimmt nach Neustart einen noch offenen Auftrag, statt einen zweiten anzulegen", async () => {
    currentState = "RUNNING";
    currentName = "Testteil";
    const { store, jobs } = memoryStore();
    jobs.push({ id: "alt", companyId: "c1", printerId: "p1", name: "Testteil", startedAt: new Date(Date.now() - 3600_000) });
    const core = makeCore(store);
    core.startTarget(target());
    await waitFor(() => core.getStatus("p1").connection === "online");
    await core.idle("p1");
    expect(jobs).toHaveLength(1);
    push(full("FINISH"));
    await waitFor(() => !!jobs[0].endedAt);
    expect(jobs[0]).toMatchObject({ id: "alt", result: "FINISHED" });
    expect(jobs[0].minutes).toBeGreaterThanOrEqual(59);
  });

  it("schließt einen offenen Auftrag als unbekannt, wenn der Drucker inzwischen nicht mehr druckt", async () => {
    currentState = "IDLE";
    const { store, jobs } = memoryStore();
    jobs.push({ id: "alt", companyId: "c1", printerId: "p1", name: "Altes Teil", startedAt: new Date(Date.now() - 7200_000) });
    const core = makeCore(store);
    core.startTarget(target());
    await waitFor(() => core.getStatus("p1").connection === "online");
    await core.idle("p1");
    expect(jobs[0]).toMatchObject({ result: "UNKNOWN" });
  });

  it("meldet falschen Zugangscode und versucht es nicht endlos erneut", async () => {
    const { store } = memoryStore();
    const core = makeCore(store);
    const before = connects;
    core.startTarget(target({ accessCode: "00000000" }));
    await waitFor(() => core.getStatus("p1").connection === "auth_failed");
    expect(core.getStatus("p1").message).toMatch(/Zugangscode/);
    await new Promise((r) => setTimeout(r, 600));
    expect(connects - before).toBe(1);
  });

  it("meldet einen nicht erreichbaren Drucker mit verständlicher Meldung", async () => {
    const free = await new Promise<number>((resolve) => {
      const s = net.createServer().listen(0, "127.0.0.1", () => {
        const p = (s.address() as net.AddressInfo).port;
        s.close(() => resolve(p));
      });
    });
    const { store } = memoryStore();
    const core = new BambuMonitorCore({ store, log: { info: () => {}, warn: () => {} }, brokerUrl: () => `mqtt://127.0.0.1:${free}` });
    cores.push(core);
    core.startTarget(target());
    await waitFor(() => core.getStatus("p1").connection === "error");
    expect(core.getStatus("p1").message).toMatch(/abgelehnt|erreichbar/);
  });

  it("liefert für unbekannte Drucker den Status 'aus'", () => {
    const core = makeCore(memoryStore().store);
    expect(core.getStatus("gibt-es-nicht").connection).toBe("off");
  });
});

describe("Verbindungstest", () => {
  it("meldet Erfolg mit Status", async () => {
    currentState = "IDLE";
    const r = await testBambuConnection({ host: "127.0.0.1", serial: SERIAL, accessCode: CODE }, { brokerUrl: url(), timeoutMs: 3000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status.state).toBe("IDLE");
  });
  it("erkennt einen falschen Zugangscode", async () => {
    const r = await testBambuConnection({ host: "127.0.0.1", serial: SERIAL, accessCode: "99999999" }, { brokerUrl: url(), timeoutMs: 3000 });
    expect(r).toEqual({ ok: false, reason: "Der Drucker hat den Zugangscode abgelehnt." });
  });
  it("erkennt eine falsche Seriennummer (verbunden, aber keine Antwort)", async () => {
    const r = await testBambuConnection({ host: "127.0.0.1", serial: "FALSCHE_SERIE_1", accessCode: CODE }, { brokerUrl: url(), timeoutMs: 1200 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Seriennummer/);
  });
});

describe("Kamerabild", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0x03, 0xff, 0xd9]);
  const frame = () => {
    const h = Buffer.alloc(16);
    h.writeUIntLE(jpeg.length, 0, 3);
    return Buffer.concat([h, jpeg]);
  };
  const cameraServer = (onAuth: (data: Buffer, socket: net.Socket) => void) =>
    new Promise<{ port: number; close: () => void }>((resolve) => {
      const srv = net.createServer((socket) => {
        let got = Buffer.alloc(0);
        socket.on("data", (d) => {
          got = Buffer.concat([got, d]);
          if (got.length >= 80) onAuth(got, socket);
        });
        socket.on("error", () => {});
      });
      srv.listen(0, "127.0.0.1", () => resolve({ port: (srv.address() as net.AddressInfo).port, close: () => srv.close() }));
    });

  it("holt ein Einzelbild: Anmeldung mit Zugangscode, Bild in Teilstücken", async () => {
    let auth: Buffer | null = null;
    const srv = await cameraServer((data, socket) => {
      auth = data;
      const f = frame();
      socket.write(f.subarray(0, 10));
      setTimeout(() => socket.write(f.subarray(10)), 30);
    });
    const img = await fetchBambuSnapshot("127.0.0.1", CODE, { port: srv.port, secure: false, timeoutMs: 3000 });
    srv.close();
    expect(img.equals(jpeg)).toBe(true);
    expect(auth!.subarray(16, 20).toString()).toBe("bblp");
    expect(auth!.subarray(48, 56).toString()).toBe(CODE);
  });
  it("meldet verständlich, wenn die Kamera die Verbindung schließt (falscher Code)", async () => {
    const srv = await cameraServer((_d, socket) => socket.end());
    await expect(fetchBambuSnapshot("127.0.0.1", "x", { port: srv.port, secure: false, timeoutMs: 3000 })).rejects.toThrow(/Zugangscode/);
    srv.close();
  });
  it("meldet eine Zeitüberschreitung, wenn kein Bild kommt", async () => {
    const srv = await cameraServer(() => {});
    await expect(fetchBambuSnapshot("127.0.0.1", CODE, { port: srv.port, secure: false, timeoutMs: 400 })).rejects.toThrow(/Zeitüberschreitung/);
    srv.close();
  });
});

describe("Bambu-Monitor: Haken für Abbuchung und Benachrichtigung", () => {
  const makeHooked = (store: JobStore, hooks: Partial<ConstructorParameters<typeof BambuMonitorCore>[0]>) => {
    const core = new BambuMonitorCore({ store, log: { info: () => {}, warn: () => {} }, brokerUrl: url(), ...hooks });
    cores.push(core);
    return core;
  };

  it("meldet jeden Bericht mit dem laufenden Auftrag und das Druckende mit Ergebnis", async () => {
    currentState = "RUNNING";
    currentName = "Hook-Teil";
    const { store } = memoryStore();
    const reports: { state: string; jobId: string | null; tag: string | null }[] = [];
    const ends: { result: string; name: string | null; jobId: string | null }[] = [];
    const core = makeHooked(store, {
      onReport: async (_t, status, jobId) => { reports.push({ state: status.state, jobId, tag: status.ams.units[0]?.trays[0]?.tag ?? null }); },
      onJobEnd: async (_t, info) => { ends.push({ result: info.result, name: info.name, jobId: info.jobId }); },
    });
    core.startTarget(target());
    await waitFor(() => core.getStatus("p1").connection === "online");
    await core.idle("p1");
    expect(reports.at(-1)).toMatchObject({ state: "RUNNING", tag: "ABCDEF0123456789" });
    // Beim allerersten Bericht startet der Auftrag erst danach; ab dem nächsten Bericht wird der Verbrauch ihm zugeschrieben
    push(JSON.stringify({ print: { mc_percent: 20 } }));
    await waitFor(() => reports.length >= 2);
    expect(reports.at(-1)!.jobId).toBeTruthy();
    push(JSON.stringify({ print: { gcode_state: "FINISH" } }));
    await waitFor(() => ends.length === 1);
    expect(ends[0]).toMatchObject({ result: "FINISHED", name: "Hook-Teil" });
    expect(ends[0].jobId).toBeTruthy();
  });

  it("meldet einen Druckerfehler genau einmal", async () => {
    currentState = "RUNNING";
    const { store } = memoryStore();
    const errors: number[] = [];
    const core = makeHooked(store, { onPrinterError: async (_t, info) => { errors.push(info.code); } });
    core.startTarget(target());
    await waitFor(() => core.getStatus("p1").connection === "online");
    push(JSON.stringify({ print: { print_error: 83935249, gcode_state: "PAUSE" } }));
    await waitFor(() => errors.length === 1);
    push(JSON.stringify({ print: { mc_percent: 30 } }));
    push(JSON.stringify({ print: { mc_percent: 31 } }));
    await core.idle("p1");
    await new Promise((r) => setTimeout(r, 150));
    expect(errors).toEqual([83935249]);
  });
});
