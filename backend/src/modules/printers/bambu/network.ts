import net from "net";
import tls from "tls";

/**
 * Netzwerk-Hilfen für die Bambu-Lab-Anbindung im LAN-Modus.
 */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const LOCAL_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.(local|lan|home|internal|fritz\.box)$/i;

/**
 * Nur Adressen im eigenen Netz erlauben (private IPv4-Bereiche, Tailscale/CGNAT 100.64.0.0/10 oder Namen wie drucker.local):
 * Die Adresse wird vom Server aus angesprochen - so lässt sich die Funktion nicht missbrauchen, um beliebige andere
 * Dienste (z.B. im Internet oder Cloud-Metadaten 169.254.169.254) abzufragen.
 */
export function isAllowedPrinterHost(host: string): boolean {
  const h = host.trim();
  const m = h.match(IPV4);
  if (m) {
    const [a, b, c, d] = m.slice(1).map(Number);
    if ([a, b, c, d].some((x) => x > 255)) return false;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return h.length <= 100 && LOCAL_NAME.test(h);
}

// ---------- Kamerabild (P1P, P1S, A1, A1 mini: eigener Stream auf Port 6000) ----------

/** Anmeldepaket des Kamera-Streams: 16 Byte Kopf, dann Benutzer "bblp" und Zugangscode (je 32 Byte, mit 0 aufgefüllt). */
export function buildCameraAuthPacket(accessCode: string): Buffer {
  const buf = Buffer.alloc(80);
  buf.writeUInt32LE(0x40, 0);
  buf.writeUInt32LE(0x3000, 4);
  buf.write("bblp", 16, 32, "ascii");
  buf.write(accessCode, 48, 32, "ascii");
  return buf;
}

/**
 * Sucht im Strom das erste vollständige JPEG. Der Strom besteht aus Blöcken: 16 Byte Kopf (die ersten 3 Byte = Länge der
 * Nutzdaten, little-endian) gefolgt vom JPEG.
 */
export function extractJpegFrame(data: Buffer): Buffer | null {
  let offset = 0;
  while (data.length - offset >= 16) {
    const size = data.readUIntLE(offset, 3);
    if (size < 4 || size > 8 * 1024 * 1024) return null; // kein gültiger Block - Strom verworfen
    if (data.length - offset - 16 < size) return null; // Block noch nicht komplett
    const payload = data.subarray(offset + 16, offset + 16 + size);
    if (payload[0] === 0xff && payload[1] === 0xd8 && payload[payload.length - 2] === 0xff && payload[payload.length - 1] === 0xd9) return Buffer.from(payload);
    offset += 16 + size;
  }
  return null;
}

export async function fetchBambuSnapshot(host: string, accessCode: string, opts: { port?: number; secure?: boolean; timeoutMs?: number } = {}): Promise<Buffer> {
  const { port = 6000, secure = true, timeoutMs = 8000 } = opts;
  return new Promise<Buffer>((resolve, reject) => {
    let chunks: Buffer = Buffer.alloc(0);
    let done = false;
    const finish = (err: Error | null, jpeg?: Buffer) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve(jpeg!);
    };
    const onConnect = () => socket.write(buildCameraAuthPacket(accessCode));
    const socket: net.Socket = secure
      ? tls.connect({ host, port, rejectUnauthorized: false }, onConnect)
      : net.connect({ host, port }, onConnect);
    const timer = setTimeout(() => finish(new Error("Zeitüberschreitung - der Drucker liefert kein Kamerabild (Zugangscode, LAN-Modus und Live-Ansicht prüfen)")), timeoutMs);
    socket.on("data", (d: Buffer) => {
      chunks = Buffer.concat([chunks, d]);
      if (chunks.length > 16 * 1024 * 1024) return finish(new Error("Ungültige Antwort der Kamera"));
      const jpeg = extractJpegFrame(chunks);
      if (jpeg) finish(null, jpeg);
    });
    socket.on("error", (err) => finish(new Error(`Kamera nicht erreichbar (${(err as NodeJS.ErrnoException).code ?? err.message})`)));
    socket.on("close", () => finish(new Error("Die Kamera hat die Verbindung beendet (Zugangscode falsch oder Kamera-Streaming am Drucker aus)")));
  });
}

/** Modelle, deren Kamera sich als Einzelbild über Port 6000 abholen lässt (X1/P2S/H2 nutzen RTSP und werden nicht unterstützt). */
export const CAMERA_SNAPSHOT_MODELS = ["P1P", "P1S", "A1", "A1MINI"] as const;
export const PRINTER_MODELS = ["X1C", "X1E", "P1P", "P1S", "P2S", "A1", "A1MINI", "H2D", "H2S", "OTHER"] as const;
