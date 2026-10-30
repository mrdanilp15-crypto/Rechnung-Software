import { spawn } from "child_process";
import { fetchBambuSnapshot } from "./network";

/**
 * Kamera der Bambu-Drucker. P1P/P1S/A1/A1 mini liefern JPEG-Bilder über einen eigenen Port (siehe network.ts). X1C, X1E, P2S, H2D und H2S
 * liefern dagegen einen Videostrom (RTSP über TLS, Port 322, "LAN-Modus-Liveview" muss am Drucker an sein). Den wandelt ffmpeg im Server
 * in einzelne JPEG-Bilder um, die als Bildfolge (MJPEG) an den Browser gehen.
 *
 * Pro Drucker läuft höchstens EIN Strom, egal wie viele Betrachter zusehen - er startet beim ersten Betrachter und endet kurz nach dem
 * letzten. Die Drucker vertragen nur wenige gleichzeitige Kameraverbindungen.
 */

export const RTSP_MODELS = ["X1C", "X1E", "P2S", "H2D", "H2S"] as const;
export const JPEG_PORT_MODELS = ["P1P", "P1S", "A1", "A1MINI"] as const;
export const CAMERA_MODELS = [...JPEG_PORT_MODELS, ...RTSP_MODELS] as const;

export function buildRtspUrl(host: string, accessCode: string, scheme: "rtsps" | "rtsp" = "rtsps", port = 322): string {
  return `${scheme}://bblp:${encodeURIComponent(accessCode)}@${host}:${port}/streaming/live/1`;
}

/** Schneidet aus einem Bytestrom nacheinander komplette JPEG-Bilder (Start FFD8, Ende FFD9) heraus. */
export class JpegSplitter {
  private buf: Buffer = Buffer.alloc(0);
  private static SOI = Buffer.from([0xff, 0xd8]);
  private static EOI = Buffer.from([0xff, 0xd9]);

  push(chunk: Buffer): Buffer[] {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const frames: Buffer[] = [];
    for (;;) {
      const soi = this.buf.indexOf(JpegSplitter.SOI);
      if (soi < 0) {
        this.buf = this.buf.subarray(Math.max(0, this.buf.length - 1)); // evtl. halber Startmarker am Ende
        break;
      }
      const eoi = this.buf.indexOf(JpegSplitter.EOI, soi + 2);
      if (eoi < 0) {
        this.buf = this.buf.subarray(soi);
        if (this.buf.length > 8 * 1024 * 1024) this.buf = Buffer.alloc(0); // kein Ende in Sicht - verwerfen
        break;
      }
      frames.push(Buffer.from(this.buf.subarray(soi, eoi + 2)));
      this.buf = this.buf.subarray(eoi + 2);
    }
    return frames;
  }
}

/** Übersetzt die Fehlerausgabe von ffmpeg in einen verständlichen Hinweis. */
export function explainFfmpegError(stderr: string): string {
  const s = stderr.toLowerCase();
  if (s.includes("401") || s.includes("unauthorized")) return "Der Drucker lehnt den Zugangscode ab. Bitte den Zugangscode am Drucker prüfen.";
  if (s.includes("connection refused") || s.includes("timed out") || s.includes("no route") || s.includes("network is unreachable") || s.includes("connection reset")) {
    return "Der Drucker liefert keinen Videostrom. Am Drucker unter Einstellungen → Netzwerk den \"LAN-Modus-Liveview\" einschalten (der LAN-Modus allein reicht nicht) und die IP-Adresse prüfen.";
  }
  if (s.includes("404") || s.includes("not found")) return "Der Drucker kennt den Videostrom nicht. Firmware und \"LAN-Modus-Liveview\" am Drucker prüfen.";
  const last = stderr.trim().split("\n").pop();
  return `Kamera nicht verfügbar${last ? ` (${last.slice(0, 160)})` : ""}.`;
}

export interface FrameSourceOptions {
  ffmpegPath?: string;
  fps?: number;
  width?: number;
  /** Sekunden bis zum ersten Bild, bevor der Start als gescheitert gilt */
  startupSeconds?: number;
  /** Sekunden zwischen zwei Bildern, bevor der laufende Strom als hängend gilt */
  stallSeconds?: number;
}

/** Ausgabeteil des ffmpeg-Aufrufs: Bildrate und Größe begrenzen, als Folge von JPEGs auf die Standardausgabe schreiben. */
export function ffmpegOutputArgs({ fps, width }: { fps: number; width: number }): string[] {
  return ["-an", "-vf", `fps=${fps},scale='min(${width},iw)':-2`, "-q:v", "5", "-f", "image2pipe", "-c:v", "mjpeg", "pipe:1"];
}
export function ffmpegArgs(url: string, o: { fps: number; width: number }): string[] {
  return ["-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp", "-i", url, ...ffmpegOutputArgs(o)];
}

/** Startet ffmpeg für einen RTSP-Strom. Liefert eine Funktion zum Beenden. */
export function startRtspFrames(url: string, opts: FrameSourceOptions, onFrame: (jpeg: Buffer) => void, onEnd: (err: Error | null) => void): () => void {
  const { ffmpegPath = "ffmpeg", fps = 2, width = 1280, startupSeconds = 15, stallSeconds = 10 } = opts;
  const args = ffmpegArgs(url, { fps, width });
  const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
  const splitter = new JpegSplitter();
  let stderr = "";
  let lastFrame = Date.now();
  let gotFrame = false;
  let ended = false;
  const finish = (err: Error | null) => {
    if (ended) return;
    ended = true;
    clearInterval(watchdog);
    child.kill("SIGKILL");
    onEnd(err);
  };
  const watchdog = setInterval(() => {
    if (Date.now() - lastFrame > (gotFrame ? stallSeconds : startupSeconds) * 1000) finish(new Error(explainFfmpegError(stderr || "timed out")));
  }, 3000);
  child.stdout.on("data", (chunk: Buffer) => {
    for (const frame of splitter.push(chunk)) {
      lastFrame = Date.now();
      gotFrame = true;
      onFrame(frame);
    }
  });
  child.stderr.on("data", (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-2000);
  });
  child.on("error", (err: NodeJS.ErrnoException) => finish(new Error(err.code === "ENOENT" ? "ffmpeg ist auf dem Server nicht installiert - für die Kamera von X1C, X1E, P2S und H2 nötig (siehe INSTALL.md)." : `ffmpeg konnte nicht gestartet werden (${err.message})`)));
  child.on("close", () => finish(new Error(explainFfmpegError(stderr))));
  return () => {
    if (ended) return;
    ended = true;
    clearInterval(watchdog);
    child.kill("SIGKILL");
  };
}

export interface Subscriber {
  frame(jpeg: Buffer): void;
  end(err: Error | null): void;
}
export type SourceFactory = (emit: (jpeg: Buffer) => void, fail: (err: Error | null) => void) => () => void;

interface Shared {
  subs: Set<Subscriber>;
  stop: () => void;
  last: { at: number; jpeg: Buffer } | null;
  closeTimer?: ReturnType<typeof setTimeout>;
}

/** Teilt einen laufenden Bildstrom pro Drucker unter allen Betrachtern. */
export class CameraHub {
  private streams = new Map<string, Shared>();
  constructor(private graceMs = 3000) {}

  get activeStreams(): number {
    return this.streams.size;
  }

  subscribe(key: string, source: SourceFactory, sub: Subscriber): () => void {
    let shared = this.streams.get(key);
    if (shared) clearTimeout(shared.closeTimer);
    if (!shared) {
      const created: Shared = { subs: new Set(), stop: () => {}, last: null };
      this.streams.set(key, created);
      shared = created;
      let sync = true;
      let failedEarly: Error | null | undefined;
      created.stop = source(
        (jpeg) => {
          created.last = { at: Date.now(), jpeg };
          for (const s of created.subs) s.frame(jpeg);
        },
        (err) => {
          if (sync) {
            failedEarly = err;
            return;
          }
          this.drop(key, err);
        },
      );
      sync = false;
      if (failedEarly !== undefined) {
        this.drop(key, failedEarly);
        sub.end(failedEarly);
        return () => {};
      }
    }
    shared.subs.add(sub);
    if (shared.last && Date.now() - shared.last.at < 5000) sub.frame(shared.last.jpeg);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const s = this.streams.get(key);
      if (!s) return;
      s.subs.delete(sub);
      if (s.subs.size === 0) {
        clearTimeout(s.closeTimer);
        s.closeTimer = setTimeout(() => this.drop(key, null, true), this.graceMs);
      }
    };
  }

  private drop(key: string, err: Error | null, onlyIfEmpty = false) {
    const s = this.streams.get(key);
    if (!s) return;
    if (onlyIfEmpty && s.subs.size > 0) return;
    this.streams.delete(key);
    clearTimeout(s.closeTimer);
    s.stop();
    for (const sub of s.subs) sub.end(err);
    s.subs.clear();
  }

  /** Erstes Bild abwarten (nutzt einen schon laufenden Strom mit). */
  firstFrame(key: string, source: SourceFactory, timeoutMs = 30000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let unsub: () => void = () => {};
      let done = false;
      const timer = setTimeout(() => finish(new Error("Zeitüberschreitung - kein Kamerabild erhalten.")), timeoutMs);
      const finish = (err: Error | null, jpeg?: Buffer) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        setImmediate(() => unsub());
        if (err) reject(err);
        else resolve(jpeg!);
      };
      unsub = this.subscribe(key, source, { frame: (j) => finish(null, j), end: (e) => finish(e ?? new Error("Kamera beendet")) });
    });
  }
}

export const cameraHub = new CameraHub();

/** Quelle für Drucker mit JPEG-Port: etwa ein Bild pro Sekunde einzeln abholen. */
export function jpegPortSource(host: string, accessCode: string, intervalMs = 1000): SourceFactory {
  return (emit, fail) => {
    let stopped = false;
    (async () => {
      while (!stopped) {
        const started = Date.now();
        try {
          emit(await fetchBambuSnapshot(host, accessCode));
        } catch (err) {
          if (!stopped) fail(err as Error);
          return;
        }
        const wait = intervalMs - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
    })();
    return () => {
      stopped = true;
    };
  };
}

export function rtspSource(url: string, opts: FrameSourceOptions = {}): SourceFactory {
  return (emit, fail) => startRtspFrames(url, opts, emit, fail);
}
