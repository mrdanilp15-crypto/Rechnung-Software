import { describe, it, expect } from "vitest";
import { JobTracker, mergePrintReport, normalizeStatus, offlineStatus, toGcodeState } from "../src/modules/printers/bambu/status";
import { buildCameraAuthPacket, extractJpegFrame, isAllowedPrinterHost } from "../src/modules/printers/bambu/network";

// Aufbau nach den MQTT-Berichten eines Bambu-Lab-Druckers (device/<Seriennummer>/report), gekürzt
const FULL = {
  print: {
    command: "push_status",
    gcode_state: "RUNNING",
    mc_percent: 42,
    mc_remaining_time: 95,
    layer_num: 120,
    total_layer_num: 300,
    subtask_name: "Vase_Spirale",
    gcode_file: "/data/Metadata/plate_1.gcode",
    nozzle_temper: 219.84,
    nozzle_target_temper: 220,
    bed_temper: 60.1,
    bed_target_temper: 60,
    chamber_temper: 32,
    wifi_signal: "-52dBm",
    print_error: 0,
    ams: {
      tray_now: "3",
      ams: [
        {
          id: "0",
          humidity: "4",
          tray: [
            { id: "0", tray_type: "PLA", tray_color: "F72323FF", remain: 75, tray_sub_brands: "PLA Basic", tag_uid: "0123456789ABCDEF" },
            { id: "1", tray_type: "PETG", tray_color: "000000FF", remain: -1, tray_sub_brands: "", tag_uid: "0000000000000000" },
            { id: "2" },
            { id: "3", tray_type: "PLA", tray_color: "FFFFFFFF", remain: 20, tray_sub_brands: "PLA Matte", tag_uid: "AAAAAAAAAAAAAAAA" },
          ],
        },
      ],
    },
    vt_tray: { id: "254", tray_type: "", tray_color: "00000000" },
  },
};

describe("Bambu: Bericht einmischen und Status berechnen", () => {
  const status = normalizeStatus(mergePrintReport({}, FULL), { connection: "online", lastSeen: new Date("2026-10-31T10:00:00Z") });

  it("liest Zustand, Fortschritt, Restzeit, Schichten und Auftrag", () => {
    expect(status).toMatchObject({ connection: "online", state: "RUNNING", stateLabel: "Druckt", progressPercent: 42, remainingMinutes: 95, layer: 120, totalLayers: 300, jobName: "Vase_Spirale", errorCode: null, wifiSignal: "-52dBm" });
  });
  it("rundet Temperaturen auf eine Nachkommastelle", () => {
    expect(status.nozzleTemp).toBe(219.8);
    expect(status.nozzleTarget).toBe(220);
    expect(status.bedTemp).toBe(60.1);
    expect(status.chamberTemp).toBe(32);
  });
  it("liest das AMS: Fächer, Farben, Füllstand, RFID und aktive Spule", () => {
    const unit = status.ams.units[0];
    expect(unit.humidityLevel).toBe(4);
    expect(unit.trays).toHaveLength(4);
    expect(unit.trays[0]).toMatchObject({ type: "PLA", brand: "PLA Basic", color: "#f72323", remainPercent: 75, rfid: true, active: false });
    expect(unit.trays[1]).toMatchObject({ type: "PETG", remainPercent: null, rfid: false }); // remain -1 = unbekannt
    expect(unit.trays[2]).toMatchObject({ type: null, color: null }); // leeres Fach
    expect(unit.trays[3]).toMatchObject({ slot: 3, active: true, remainPercent: 20 });
    expect(status.ams.activeLabel).toBe("AMS 1 · Fach 4");
    expect(status.ams.external).toBeNull();
  });
  it("erkennt die externe Spule und Fehler", () => {
    const raw = mergePrintReport(mergePrintReport({}, FULL), { print: { vt_tray: { tray_type: "TPU", tray_color: "00FF00FF", remain: 50 }, ams: { tray_now: "254" }, print_error: 83886080 } });
    const s = normalizeStatus(raw, { connection: "online", lastSeen: null });
    expect(s.ams.external).toMatchObject({ type: "TPU", color: "#00ff00", active: true });
    expect(s.ams.activeLabel).toBe("Externe Spule");
    expect(s.errorCode).toBe(83886080);
    expect(s.ams.units[0].trays[0].type).toBe("PLA"); // AMS-Liste blieb beim Teil-Update erhalten
  });
  it("mischt Teilberichte (Deltas) in den Gesamtstand", () => {
    const delta = mergePrintReport(mergePrintReport({}, FULL), { print: { mc_percent: 43, layer_num: 125, nozzle_temper: 220.2 } });
    const s = normalizeStatus(delta, { connection: "online", lastSeen: null });
    expect(s).toMatchObject({ progressPercent: 43, layer: 125, nozzleTemp: 220.2, jobName: "Vase_Spirale", remainingMinutes: 95 });
  });
  it("ignoriert Berichte ohne print-Objekt und Unsinn", () => {
    const base = mergePrintReport({}, FULL);
    expect(mergePrintReport(base, { info: { command: "get_version" } })).toBe(base);
    expect(mergePrintReport(base, null)).toBe(base);
    expect(mergePrintReport(base, "text")).toBe(base);
  });
  it("begrenzt Fortschritt und kennt unbekannte Zustände", () => {
    expect(normalizeStatus({ mc_percent: 140 }, { connection: "online", lastSeen: null }).progressPercent).toBe(100);
    expect(toGcodeState("pause")).toBe("PAUSE");
    expect(toGcodeState("???")).toBe("UNKNOWN");
    expect(toGcodeState(undefined)).toBe("UNKNOWN");
  });
  it("liefert für nicht verbundene Drucker einen leeren Status mit Grund", () => {
    const off = offlineStatus("auth_failed", "Zugangscode wurde vom Drucker abgelehnt");
    expect(off).toMatchObject({ connection: "auth_failed", state: "UNKNOWN", progressPercent: null, message: "Zugangscode wurde vom Drucker abgelehnt" });
    expect(off.ams.units).toEqual([]);
  });
});

describe("Bambu: Druckaufträge erkennen", () => {
  it("meldet Start beim Übergang in einen aktiven Zustand und Ende mit dem Ergebnis", () => {
    const t = new JobTracker();
    expect(t.update("IDLE", null)).toEqual([]);
    expect(t.update("PREPARE", "Teil")).toEqual([{ type: "start", name: "Teil" }]);
    expect(t.update("RUNNING", "Teil")).toEqual([]);
    expect(t.update("PAUSE", "Teil")).toEqual([]);
    expect(t.update("RUNNING", "Teil")).toEqual([]);
    expect(t.update("FINISH", "Teil")).toEqual([{ type: "end", result: "FINISHED" }]);
    expect(t.update("FINISH", "Teil")).toEqual([]);
    expect(t.update("RUNNING", "Zweites")).toEqual([{ type: "start", name: "Zweites" }]);
    expect(t.update("FAILED", "Zweites")).toEqual([{ type: "end", result: "FAILED" }]);
    expect(t.update("PREPARE", "Drittes")).toEqual([{ type: "start", name: "Drittes" }]);
    expect(t.update("IDLE", null)).toEqual([{ type: "end", result: "CANCELLED" }]);
  });
  it("zählt einen beim ersten Bericht schon laufenden Druck als Start und ignoriert Unbekanntes", () => {
    const t = new JobTracker();
    expect(t.update("UNKNOWN", null)).toEqual([]);
    expect(t.update("RUNNING", "Laufend")).toEqual([{ type: "start", name: "Laufend" }]);
  });
  it("prime übernimmt einen Zustand ohne Start", () => {
    const t = new JobTracker();
    t.prime("RUNNING");
    expect(t.update("RUNNING", "x")).toEqual([]);
    expect(t.update("FINISH", "x")).toEqual([{ type: "end", result: "FINISHED" }]);
  });
});

describe("Bambu: Adresse und Kamera-Hilfen", () => {
  it("erlaubt nur Adressen im eigenen Netz", () => {
    for (const ok of ["192.168.1.50", "10.0.0.5", "172.16.4.2", "172.31.255.1", "100.100.1.2", "drucker.local", "p1s.fritz.box", "Bambu-P1S.lan"]) expect(isAllowedPrinterHost(ok), ok).toBe(true);
    for (const bad of ["8.8.8.8", "127.0.0.1", "169.254.169.254", "172.32.0.1", "192.169.1.1", "300.1.1.1", "example.com", "localhost", "192.168.1.1:8080", "192.168.1.50/path", "", "10.0.0", "http://192.168.1.2"]) expect(isAllowedPrinterHost(bad), bad).toBe(false);
  });
  it("baut das 80-Byte-Anmeldepaket der Kamera", () => {
    const p = buildCameraAuthPacket("12345678");
    expect(p.length).toBe(80);
    expect(p.readUInt32LE(0)).toBe(0x40);
    expect(p.readUInt32LE(4)).toBe(0x3000);
    expect(p.subarray(16, 20).toString("ascii")).toBe("bblp");
    expect(p.subarray(48, 56).toString("ascii")).toBe("12345678");
    expect(p[56]).toBe(0);
  });
  it("findet das erste vollständige JPEG im Kamerastrom", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 4, 0xff, 0xd9]);
    const header = (size: number) => {
      const h = Buffer.alloc(16);
      h.writeUIntLE(size, 0, 3);
      return h;
    };
    const frame = Buffer.concat([header(jpeg.length), jpeg]);
    expect(extractJpegFrame(frame)?.equals(jpeg)).toBe(true);
    expect(extractJpegFrame(frame.subarray(0, frame.length - 3))).toBeNull(); // noch nicht komplett
    const junk = Buffer.concat([header(5), Buffer.from("abcde"), frame]);
    expect(extractJpegFrame(junk)?.equals(jpeg)).toBe(true); // Nicht-JPEG-Block wird übersprungen
    expect(extractJpegFrame(Buffer.alloc(10))).toBeNull();
    expect(extractJpegFrame(Buffer.concat([header(16_000_000), Buffer.alloc(8)]))).toBeNull(); // unplausible Länge
  });
});
