import { afterAll, beforeAll, describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import net from "net";
import fs from "fs";
import os from "os";
import path from "path";
import aedesFactory from "aedes";
import FtpSrv from "ftp-srv";
import { buildAmsMapping, buildStartPayload, inspect3mf, publishToPrinter, remoteFileName, uploadToPrinter } from "../src/modules/printers/bambu/printJob";

const SLICE_INFO = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header><header_item key="X-BBL-Client-Type" value="slicer"/></header>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="prediction" value="5400"/>
    <metadata key="weight" value="24.5"/>
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#161616" used_m="5.1" used_g="15.2" />
    <filament id="3" tray_info_idx="GFA01" type="PETG" color="#FFFFFF" used_m="3.0" used_g="9.3" />
  </plate>
  <plate>
    <metadata key="index" value="2"/>
    <metadata key="prediction" value="600"/>
    <metadata key="weight" value="3"/>
    <filament id="1" type="PLA" color="#161616FF" used_m="1" used_g="3" />
  </plate>
</config>`;

function make3mf(opts: { withGcode?: boolean } = {}): Buffer {
  const zip = new AdmZip();
  zip.addFile("3D/3dmodel.model", Buffer.from("<model/>"));
  zip.addFile("Metadata/slice_info.config", Buffer.from(SLICE_INFO));
  if (opts.withGcode !== false) {
    zip.addFile("Metadata/plate_1.gcode", Buffer.from("G28\n"));
    zip.addFile("Metadata/plate_1.gcode.md5", Buffer.from("abcdef0123456789abcdef0123456789\n"));
    zip.addFile("Metadata/plate_2.gcode", Buffer.from("G28\n"));
  }
  return zip.toBuffer();
}

describe("Druck senden: 3MF lesen", () => {
  it("erkennt Platten, Dauer, Gewicht und Filamente", () => {
    const plates = inspect3mf(make3mf());
    expect(plates).toHaveLength(2);
    expect(plates[0]).toMatchObject({ index: 1, gcodePath: "Metadata/plate_1.gcode", md5: "ABCDEF0123456789ABCDEF0123456789", predictionSeconds: 5400, weightGrams: 24.5 });
    expect(plates[0].filaments).toEqual([
      { id: 1, type: "PLA", color: "#161616", usedGrams: 15.2 },
      { id: 3, type: "PETG", color: "#ffffff", usedGrams: 9.3 },
    ]);
    expect(plates[1].md5).toBeNull();
    expect(plates[1].filaments[0].color).toBe("#161616");
  });
  it("lehnt Dateien ohne G-Code mit hilfreichem Hinweis ab", () => {
    expect(() => inspect3mf(make3mf({ withGcode: false }))).toThrow(/enthält keinen G-Code/);
  });
  it("lehnt Nicht-ZIP-Dateien ab", () => {
    expect(() => inspect3mf(Buffer.from("das ist kein zip"))).toThrow(/keine gültige 3MF/);
  });
});

describe("Druck senden: Befehl", () => {
  it("bereinigt Dateinamen für die SD-Karte", () => {
    expect(remoteFileName("Drachen Größe M.3mf")).toBe("Drachen_Gro_e_M.gcode.3mf");
    expect(remoteFileName("../../etc/passwd.gcode.3mf")).toBe("etc_passwd.gcode.3mf");
    expect(remoteFileName("ähnlich.3mf")).toMatch(/^[A-Za-z0-9._-]+\.gcode\.3mf$/);
    expect(remoteFileName("???.3mf")).toBe("druck.gcode.3mf");
  });
  it("baut die Fachzuordnung nach Filament-Nummer", () => {
    const plate = inspect3mf(make3mf())[0];
    expect(buildAmsMapping(plate.filaments, { 1: 0, 3: 6 })).toEqual([0, -1, 6]);
    expect(buildAmsMapping(plate.filaments, { 1: 254 })).toEqual([254, -1, -1]);
  });
  it("baut den Startbefehl", () => {
    const plate = inspect3mf(make3mf())[0];
    const cmd = JSON.parse(buildStartPayload({ fileName: "vase.gcode.3mf", plate, amsMapping: [0, -1, 6], useAms: true }));
    expect(cmd.print).toMatchObject({ command: "project_file", param: "Metadata/plate_1.gcode", url: "file:///sdcard/vase.gcode.3mf", subtask_name: "vase", use_ams: true, ams_mapping: [0, -1, 6], md5: "ABCDEF0123456789ABCDEF0123456789" });
  });
});

describe("Druck senden: Übertragung (simulierter Drucker)", () => {
  let broker: ReturnType<typeof aedesFactory>;
  let server: net.Server;
  let mqttPort = 0;
  const received: { topic: string; payload: string }[] = [];
  let ftp: FtpSrv;
  let ftpPort = 0;
  let root = "";

  beforeAll(async () => {
    broker = aedesFactory();
    broker.authenticate = (_c, u, p, cb) => {
      const ok = u?.toString() === "bblp" && p?.toString() === "12345678";
      cb(ok ? null : (Object.assign(new Error("Auth"), { returnCode: 4 }) as never), ok);
    };
    broker.on("publish", (packet, client) => {
      if (client) received.push({ topic: packet.topic, payload: packet.payload.toString() });
    });
    server = net.createServer(broker.handle);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    mqttPort = (server.address() as net.AddressInfo).port;

    root = fs.mkdtempSync(path.join(os.tmpdir(), "ftp-"));
    const probe = net.createServer();
    await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
    ftpPort = (probe.address() as net.AddressInfo).port;
    await new Promise<void>((r) => probe.close(() => r()));
    ftp = new FtpSrv({ url: `ftp://127.0.0.1:${ftpPort}`, pasv_url: "127.0.0.1", pasv_min: 40100, pasv_max: 40200, anonymous: false });
    ftp.on("login", ({ username, password }: { username: string; password: string }, resolve: (v: { root: string }) => void, reject: (e: Error) => void) => {
      if (username === "bblp" && password === "12345678") resolve({ root });
      else reject(new Error("530 Login incorrect"));
    });
    await ftp.listen();
  });

  afterAll(async () => {
    await ftp.close();
    await new Promise<void>((r) => broker.close(() => server.close(() => r())));
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("schickt den Startbefehl an das richtige Thema", async () => {
    await publishToPrinter({ host: "127.0.0.1", serial: "01S00A123", accessCode: "12345678" }, '{"print":{"command":"project_file"}}', { brokerUrl: `mqtt://127.0.0.1:${mqttPort}` });
    await new Promise((r) => setTimeout(r, 100));
    expect(received.some((m) => m.topic === "device/01S00A123/request" && m.payload.includes("project_file"))).toBe(true);
  });

  it("meldet einen falschen Zugangscode verständlich", async () => {
    await expect(publishToPrinter({ host: "127.0.0.1", serial: "01S00A123", accessCode: "00000000" }, "{}", { brokerUrl: `mqtt://127.0.0.1:${mqttPort}` })).rejects.toThrow(/Zugangscode/);
  });

  it("lädt die Datei per FTP hoch", async () => {
    const data = make3mf();
    await uploadToPrinter({ host: "127.0.0.1", serial: "x", accessCode: "12345678" }, data, "test.gcode.3mf", { port: ftpPort, secure: false });
    expect(fs.readFileSync(path.join(root, "test.gcode.3mf")).equals(data)).toBe(true);
  });

  it("meldet einen falschen Zugangscode beim Hochladen verständlich", async () => {
    await expect(uploadToPrinter({ host: "127.0.0.1", serial: "x", accessCode: "00000000" }, Buffer.from("x"), "x.3mf", { port: ftpPort, secure: false })).rejects.toThrow(/Zugangscode/);
  });
});
