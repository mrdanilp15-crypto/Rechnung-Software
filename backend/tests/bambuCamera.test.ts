import { describe, it, expect, vi } from "vitest";
import { CameraHub, JpegSplitter, buildRtspUrl, explainFfmpegError, type SourceFactory } from "../src/modules/printers/bambu/camera";

const jpeg = (n: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 0x11), Buffer.from([0xff, 0xd9])]);

describe("Bambu-Kamera: RTSP-Adresse", () => {
  it("baut die Adresse mit Benutzer bblp", () => {
    expect(buildRtspUrl("192.168.1.50", "12345678")).toBe("rtsps://bblp:12345678@192.168.1.50:322/streaming/live/1");
    expect(buildRtspUrl("192.168.1.50", "a b/c", "rtsp")).toBe("rtsp://bblp:a%20b%2Fc@192.168.1.50:322/streaming/live/1");
  });
});

describe("Bambu-Kamera: JPEG-Bilder aus dem ffmpeg-Strom", () => {
  it("trennt aneinandergehängte Bilder, auch wenn sie stückweise ankommen", () => {
    const a = jpeg(100);
    const b = jpeg(250);
    const all = Buffer.concat([a, b]);
    const s = new JpegSplitter();
    const out: Buffer[] = [];
    for (let i = 0; i < all.length; i += 37) out.push(...s.push(all.subarray(i, i + 37)));
    expect(out).toHaveLength(2);
    expect(out[0].equals(a)).toBe(true);
    expect(out[1].equals(b)).toBe(true);
  });
  it("wirft Müll vor dem ersten Bild weg und wartet auf ein unvollständiges Bild", () => {
    const s = new JpegSplitter();
    const a = jpeg(50);
    expect(s.push(Buffer.concat([Buffer.from("xxxx"), a.subarray(0, 20)]))).toEqual([]);
    const frames = s.push(a.subarray(20));
    expect(frames).toHaveLength(1);
    expect(frames[0].equals(a)).toBe(true);
  });
});

describe("Bambu-Kamera: Fehlertexte", () => {
  it("erklärt typische Fehler verständlich", () => {
    expect(explainFfmpegError("Server returned 401 Unauthorized")).toMatch(/Zugangscode/);
    expect(explainFfmpegError("Connection refused")).toMatch(/LAN-Modus-Liveview/);
    expect(explainFfmpegError("")).toMatch(/Kamera nicht verfügbar/);
  });
});

describe("Bambu-Kamera: ein Strom für alle Betrachter", () => {
  function fakeSource() {
    const state = { started: 0, stopped: 0, emit: (_: Buffer) => {}, fail: (_: Error | null) => {} };
    const source: SourceFactory = (emit, fail) => {
      state.started++;
      state.emit = emit;
      state.fail = fail;
      return () => { state.stopped++; };
    };
    return { state, source };
  }

  it("startet die Quelle nur einmal und beendet sie erst nach dem letzten Betrachter", async () => {
    vi.useFakeTimers();
    const hub = new CameraHub(1000);
    const { state, source } = fakeSource();
    const got: Buffer[][] = [[], []];
    const u1 = hub.subscribe("p1", source, { frame: (f) => got[0].push(f), end: () => {} });
    const u2 = hub.subscribe("p1", source, { frame: (f) => got[1].push(f), end: () => {} });
    expect(state.started).toBe(1);
    state.emit(jpeg(10));
    expect(got[0]).toHaveLength(1);
    expect(got[1]).toHaveLength(1);
    u1();
    vi.advanceTimersByTime(5000);
    expect(state.stopped).toBe(0);
    u2();
    vi.advanceTimersByTime(500);
    expect(state.stopped).toBe(0); // Schonfrist: kurzes Neuladen der Seite soll den Strom nicht neu starten
    vi.advanceTimersByTime(1000);
    expect(state.stopped).toBe(1);
    expect(hub.activeStreams).toBe(0);
    vi.useRealTimers();
  });

  it("meldet Fehler der Quelle an alle Betrachter und räumt auf", () => {
    const hub = new CameraHub(1000);
    const { state, source } = fakeSource();
    const ended: (Error | null)[] = [];
    hub.subscribe("p2", source, { frame: () => {}, end: (e) => ended.push(e) });
    hub.subscribe("p2", source, { frame: () => {}, end: (e) => ended.push(e) });
    state.fail(new Error("kaputt"));
    expect(ended).toHaveLength(2);
    expect(ended[0]?.message).toBe("kaputt");
    expect(hub.activeStreams).toBe(0);
  });

  it("firstFrame liefert das erste Bild und gibt den Strom wieder frei", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const hub = new CameraHub(10);
    const { state, source } = fakeSource();
    const p = hub.firstFrame("p3", source);
    const img = jpeg(5);
    state.emit(img);
    expect((await p).equals(img)).toBe(true);
    await new Promise((r) => setImmediate(r)); // Freigabe passiert einen Takt später
    vi.advanceTimersByTime(50);
    expect(state.stopped).toBe(1);
    vi.useRealTimers();
  });

  it("wirft bei sofortigem Fehler der Quelle statt zu hängen", async () => {
    const hub = new CameraHub(10);
    const source: SourceFactory = (_emit, fail) => { fail(new Error("ffmpeg fehlt")); return () => {}; };
    await expect(hub.firstFrame("p4", source)).rejects.toThrow("ffmpeg fehlt");
  });
});

describe("Bambu-Kamera: ffmpeg", () => {
  it("meldet fehlendes ffmpeg verständlich", async () => {
    const { startRtspFrames } = await import("../src/modules/printers/bambu/camera");
    const err = await new Promise<Error | null>((resolve) => {
      startRtspFrames("rtsp://bblp:x@127.0.0.1:322/streaming/live/1", { ffmpegPath: "ffmpeg-gibt-es-nicht-xyz" }, () => {}, resolve);
    });
    expect(err?.message).toMatch(/ffmpeg ist auf dem Server nicht installiert/);
  });
  it("begrenzt Bildrate und Breite", async () => {
    const { ffmpegArgs } = await import("../src/modules/printers/bambu/camera");
    const args = ffmpegArgs("rtsps://bblp:1@10.0.0.2:322/streaming/live/1", { fps: 2, width: 1280 });
    expect(args).toContain("rtsps://bblp:1@10.0.0.2:322/streaming/live/1");
    expect(args.join(" ")).toMatch(/fps=2,scale='min\(1280,iw\)':-2/);
    expect(args.slice(0, 6)).toEqual(["-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp", "-i"]);
  });
});
