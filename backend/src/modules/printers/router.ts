import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { env } from "../../config/env";
import { encryptField, decryptField } from "../../utils/crypto";
import { bambuMonitor, testBambuConnection } from "./bambu/monitor";
import { PRINTER_MODELS, fetchBambuSnapshot, isAllowedPrinterHost } from "./bambu/network";
import { CAMERA_MODELS, RTSP_MODELS, buildRtspUrl, cameraHub, jpegPortSource, rtspSource, type SourceFactory } from "./bambu/camera";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import fs from "fs";
import { buildPlanEntries, savePrintPlan } from "./bambu/slicedBooking";
import { computeFailStats } from "./failStats";
import { buildAmsMapping, buildStartPayload, inspect3mf, publishToPrinter, remoteFileName, uploadToPrinter } from "./bambu/printJob";
import { absolutePath } from "../archive/service";
import AdmZip from "adm-zip";
import { Prisma } from "@prisma/client";
import { checkLowStock } from "../notifications/lowStock";
import { matchJobFile, planUsageChange } from "./jobUsage";

/**
 * Drucker/Maschinen mit eigenen Kostenwerten (Anschaffungspreis + Lebensdauer -> Abschreibung je Stunde, Leistung -> Strom,
 * Verschleiß je Stunde). Die Berechnung selbst steht in frontend/src/lib/cost.ts; hier werden nur die Werte verwaltet.
 */
export const printersRouter = Router();
printersRouter.use(requireAuth);

const SEEDED_KEY = "printersSeeded";

// Beim allerersten Aufruf zwei Beispiel-Drucker anlegen, damit die Kalkulation sofort etwas Sinnvolles zeigt.
// Danach nie wieder - wer alle löscht, bekommt keine neuen Beispiele.
async function seedExamplesOnce(companyId: string) {
  const seeded = await prisma.setting.findUnique({ where: { companyId_key: { companyId, key: SEEDED_KEY } } });
  if (seeded) return;
  const existing = await prisma.printer.count({ where: { companyId } });
  if (existing === 0) {
    await prisma.printer.createMany({
      data: [
        { companyId, name: "Bambu Lab P1S (Beispiel)", purchasePriceCents: 70000, lifetimeHours: 6000, powerWatts: 110, wearCentsPerHour: 8, notes: "Beispielwerte - bitte an Ihren Drucker anpassen." },
        { companyId, name: "Creality Ender-3 V3 (Beispiel)", purchasePriceCents: 25000, lifetimeHours: 4000, powerWatts: 150, wearCentsPerHour: 6, notes: "Beispielwerte - bitte an Ihren Drucker anpassen." },
      ],
    });
  }
  await prisma.setting.upsert({
    where: { companyId_key: { companyId, key: SEEDED_KEY } },
    create: { companyId, key: SEEDED_KEY, value: "true" },
    update: { value: "true" },
  });
}

printersRouter.get("/", async (req, res) => {
  await seedExamplesOnce(req.auth!.companyId);
  const printers = await prisma.printer.findMany({
    where: { companyId: req.auth!.companyId, isArchived: false },
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  // Betriebsstunden aus den erkannten Druckaufträgen
  const sums = await prisma.printerJob.groupBy({ by: ["printerId"], where: { companyId: req.auth!.companyId, endedAt: { not: null } }, _sum: { minutes: true }, _count: { _all: true } });
  const sumBy = new Map(sums.map((x) => [x.printerId, x]));
  res.json(printers.map((p) => present(p, sumBy.get(p.id))));
});

/** Zugangscode nie ausliefern - nur ob einer hinterlegt ist. */
function present<T extends { accessCodeEncrypted: string | null }>(p: T, jobs?: { _sum: { minutes: number | null }; _count: { _all: number } }) {
  const { accessCodeEncrypted, ...rest } = p;
  return { ...rest, hasAccessCode: !!accessCodeEncrypted, trackedMinutes: jobs?._sum.minutes ?? 0, trackedJobs: jobs?._count._all ?? 0 };
}

// Live-Status aller Drucker mit aktiver Verbindung (aus dem Arbeitsspeicher, ohne Netzwerkzugriff)
printersRouter.get("/live", async (req, res) => {
  const printers = await prisma.printer.findMany({ where: { companyId: req.auth!.companyId, isArchived: false, connectionType: "BAMBU_LAN", liveEnabled: true }, select: { id: true } });
  res.json(Object.fromEntries(printers.map((p) => [p.id, bambuMonitor.getStatus(p.id)])));
});

// Echte Fehldruckquote der letzten Tage aus den erkannten Druckaufträgen (gesamt und je Drucker)
printersRouter.get("/fail-stats", async (req, res) => {
  const days = Math.min(730, Math.max(7, Number(req.query.days) || 90));
  const jobs = await prisma.printerJob.findMany({
    where: { companyId: req.auth!.companyId, endedAt: { not: null, gte: new Date(Date.now() - days * 86_400_000) } },
    select: { printerId: true, result: true, minutes: true, printer: { select: { name: true } } },
  });
  const byPrinter = new Map<string, { name: string; jobs: typeof jobs }>();
  for (const j of jobs) {
    const e = byPrinter.get(j.printerId) ?? { name: j.printer.name, jobs: [] };
    e.jobs.push(j);
    byPrinter.set(j.printerId, e);
  }
  res.json({
    days,
    total: computeFailStats(jobs),
    printers: [...byPrinter.entries()].map(([id, e]) => ({ id, name: e.name, ...computeFailStats(e.jobs) })),
  });
});

const hostSchema = z.string().trim().max(100).refine(isAllowedPrinterHost, "Bitte die IP-Adresse aus Ihrem Heimnetz angeben (z.B. 192.168.1.50) - Adressen außerhalb des eigenen Netzes sind nicht erlaubt.");
const printerSchema = z.object({
  name: z.string().min(1).max(120),
  purchasePriceCents: z.number().int().min(0).max(100_000_000),
  lifetimeHours: z.number().positive().max(1_000_000),
  usedHoursBefore: z.number().min(0).max(1_000_000).optional(),
  powerWatts: z.number().min(0).max(100_000),
  wearCentsPerHour: z.number().min(0).max(1_000_000),
  notes: z.string().max(1000).nullish(),
  imageDocumentId: z.string().nullish(),
});

// Als Druckerbild geht nur ein Bild aus dem eigenen Archiv
async function checkImage(companyId: string, id: string | null | undefined) {
  if (!id) return null;
  const d = await prisma.archiveDocument.findFirst({ where: { id, companyId }, select: { id: true, mimeType: true } });
  if (!d || !d.mimeType.startsWith("image/")) throw new HttpError(400, "Als Druckerbild geht nur ein Bild aus dem Belegarchiv.");
  return d.id;
}
const connectionSchema = z.object({
  connectionType: z.enum(["NONE", "BAMBU_LAN"]),
  model: z.enum(PRINTER_MODELS).nullish(),
  host: z.union([z.literal(""), hostSchema]).nullish(),
  serial: z.union([z.literal(""), z.string().trim().regex(/^[0-9A-Za-z]{8,24}$/, "Die Seriennummer besteht aus Buchstaben und Ziffern (z.B. 01P00A123456789).")]).nullish(),
  accessCode: z.union([z.literal(""), z.string().trim().regex(/^[0-9A-Za-z]{8}$/, "Der Zugangscode hat 8 Zeichen (Buchstaben/Ziffern).")]).nullish(),
  clearAccessCode: z.boolean().optional(),
  liveEnabled: z.boolean(),
});
const fullSchema = printerSchema.merge(connectionSchema.partial());
const CONNECTION_KEYS = ["connectionType", "model", "host", "serial", "accessCode", "clearAccessCode", "liveEnabled"] as const;

function connectionData(body: Partial<z.infer<typeof fullSchema>>, existing?: { accessCodeEncrypted: string | null; host: string | null; serial: string | null; connectionType: string; liveEnabled: boolean }) {
  const data: Record<string, unknown> = {};
  if (body.connectionType !== undefined) data.connectionType = body.connectionType;
  if (body.model !== undefined) data.model = body.model || null;
  if (body.host !== undefined) data.host = body.host || null;
  if (body.serial !== undefined) data.serial = body.serial ? body.serial.toUpperCase() : null;
  if (body.liveEnabled !== undefined) data.liveEnabled = body.liveEnabled;
  if (body.clearAccessCode) data.accessCodeEncrypted = null;
  else if (body.accessCode) data.accessCodeEncrypted = encryptField(body.accessCode);
  // Live-Verbindung nur mit vollständigen Angaben
  const final = {
    connectionType: (data.connectionType ?? existing?.connectionType ?? "NONE") as string,
    liveEnabled: (data.liveEnabled ?? existing?.liveEnabled ?? false) as boolean,
    host: (data.host !== undefined ? data.host : existing?.host) as string | null,
    serial: (data.serial !== undefined ? data.serial : existing?.serial) as string | null,
    code: (data.accessCodeEncrypted !== undefined ? data.accessCodeEncrypted : existing?.accessCodeEncrypted) as string | null,
  };
  if (final.connectionType === "BAMBU_LAN" && final.liveEnabled && (!final.host || !final.serial || !final.code)) {
    throw new HttpError(400, "Für die Live-Verbindung werden IP-Adresse, Seriennummer und Zugangscode benötigt.");
  }
  if (final.connectionType === "NONE") data.liveEnabled = false;
  return data;
}

// Verbindungsdaten ändern darf nur ein Administrator (der Zugangscode erlaubt Zugriff auf den Drucker)
function assertAdminForConnection(req: { auth?: { role?: string } }, body: Record<string, unknown>) {
  if (CONNECTION_KEYS.some((k) => body[k] !== undefined) && req.auth?.role !== "ADMIN") throw new HttpError(403, "Die Drucker-Verbindung darf nur ein Administrator einrichten.");
}

const syncMonitor = (id: string) => (env.PRINTER_MONITOR_ENABLED ? bambuMonitor.sync(id).catch(() => {}) : Promise.resolve());

printersRouter.post("/", async (req, res) => {
  const body = fullSchema.parse(req.body);
  assertAdminForConnection(req, body);
  const { connectionType, model, host, serial, accessCode, clearAccessCode, liveEnabled, ...basics } = body;
  const printer = await prisma.printer.create({ data: { ...basics, ...connectionData(body), companyId: req.auth!.companyId } as any });
  await syncMonitor(printer.id);
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "printer.create", entityType: "Printer", entityId: printer.id });
  res.status(201).json(present(printer));
});

printersRouter.patch("/:id", async (req, res) => {
  const body = fullSchema.partial().parse(req.body);
  assertAdminForConnection(req, body);
  const existing = await prisma.printer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Drucker nicht gefunden");
  const { connectionType, model, host, serial, accessCode, clearAccessCode, liveEnabled, ...basics } = body;
  if (basics.imageDocumentId !== undefined) basics.imageDocumentId = await checkImage(req.auth!.companyId, basics.imageDocumentId);
  const updated = await prisma.printer.update({ where: { id: existing.id }, data: { ...basics, ...connectionData(body, existing) } as any });
  await syncMonitor(existing.id);
  // Den Zugangscode nie ins Protokoll schreiben
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "printer.update", entityType: "Printer", entityId: existing.id, metadata: { ...basics, connectionChanged: CONNECTION_KEYS.some((k) => (body as Record<string, unknown>)[k] !== undefined) } });
  res.json(present(updated));
});

// Verbindungstest mit den eingegebenen Werten (oder dem gespeicherten Zugangscode): einmaliges Verbinden und Lesen des Status
printersRouter.post("/test-connection", async (req, res) => {
  if (req.auth!.role !== "ADMIN") throw new HttpError(403, "Nur ein Administrator darf die Drucker-Verbindung testen.");
  const body = z
    .object({ printerId: z.string().optional(), host: hostSchema, serial: z.string().trim().regex(/^[0-9A-Za-z]{8,24}$/, "Seriennummer ungültig"), accessCode: z.string().trim().regex(/^[0-9A-Za-z]{8}$/, "Der Zugangscode hat 8 Zeichen").optional() })
    .parse(req.body);
  let code = body.accessCode;
  if (!code && body.printerId) {
    const p = await prisma.printer.findFirst({ where: { id: body.printerId, companyId: req.auth!.companyId } });
    if (p?.accessCodeEncrypted) code = decryptField(p.accessCodeEncrypted);
  }
  if (!code) throw new HttpError(400, "Bitte den Zugangscode eingeben.");
  res.json(await testBambuConnection({ host: body.host, serial: body.serial.toUpperCase(), accessCode: code }));
});

// Kamera: P1P/P1S/A1/A1 mini holen einzelne JPEG-Bilder, X1C/X1E/P2S/H2 liefern einen Videostrom, den ffmpeg in Einzelbilder umwandelt.
async function cameraPrinter(req: { params: Record<string, string>; auth?: { companyId: string } }) {
  const p = await prisma.printer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, isArchived: false } });
  if (!p || p.connectionType !== "BAMBU_LAN" || !p.host || !p.accessCodeEncrypted) throw new HttpError(404, "Für diesen Drucker ist keine Verbindung eingerichtet.");
  if (!p.model || !(CAMERA_MODELS as readonly string[]).includes(p.model)) throw new HttpError(422, "Für dieses Druckermodell ist keine Kamera hinterlegt. Bitte das Modell prüfen.");
  const code = decryptField(p.accessCodeEncrypted);
  const source: SourceFactory = (RTSP_MODELS as readonly string[]).includes(p.model)
    ? rtspSource(buildRtspUrl(p.host, code, env.PRINTER_RTSP_SCHEME), { ffmpegPath: env.FFMPEG_PATH })
    : jpegPortSource(p.host, code);
  return { printer: p, source, isRtsp: (RTSP_MODELS as readonly string[]).includes(p.model) };
}

// Einzelbild; kurz zwischengespeichert, damit mehrere Betrachter den Drucker nicht überlasten
const snapshotCache = new Map<string, { at: number; image: Buffer }>();
printersRouter.get("/:id/snapshot", async (req, res) => {
  const { printer: p, source, isRtsp } = await cameraPrinter(req);
  const cached = snapshotCache.get(p.id);
  let image = cached && Date.now() - cached.at < 2500 ? cached.image : null;
  if (!image) {
    try {
      image = isRtsp ? await cameraHub.firstFrame(`cam:${p.id}`, source) : await fetchBambuSnapshot(p.host!, decryptField(p.accessCodeEncrypted!));
    } catch (err) {
      throw new HttpError(502, (err as Error).message);
    }
    snapshotCache.set(p.id, { at: Date.now(), image });
  }
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "no-store");
  res.send(image);
});

// Live-Ansicht als Bildfolge (multipart/x-mixed-replace, im <img> darstellbar). Ein Strom pro Drucker, geteilt unter allen Betrachtern;
// nach 15 Minuten endet die Sitzung (vergessene Tabs sollen die Kamera nicht dauerhaft belegen) - "Weiter ansehen" startet neu.
const STREAM_MAX_MS = 15 * 60 * 1000;
printersRouter.get("/:id/stream", async (req, res) => {
  const { printer: p, source } = await cameraPrinter(req);
  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=frame",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  let waiting = false;
  let unsubscribe: () => void = () => {};
  const close = () => {
    clearTimeout(limit);
    unsubscribe();
    if (!res.writableEnded) res.end();
  };
  const limit = setTimeout(close, STREAM_MAX_MS);
  unsubscribe = cameraHub.subscribe(`cam:${p.id}`, source, {
    frame(jpeg) {
      if (waiting || res.writableEnded) return; // Betrachter zu langsam: Bild überspringen statt zu stauen
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
      res.write(jpeg);
      if (!res.write("\r\n")) {
        waiting = true;
        res.once("drain", () => { waiting = false; });
      }
    },
    end: () => close(),
  });
  res.on("close", close); // Verbindung vom Betrachter beendet (req "close" kommt bei GET schon nach dem Empfang der Anfrage)
});

// ---------- AMS-Fächer einem Material zuordnen (automatische Abbuchung) ----------
printersRouter.get("/:id/ams-slots", async (req, res) => {
  const p = await prisma.printer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!p) throw new HttpError(404, "Drucker nicht gefunden");
  const rows = await prisma.amsSlotMapping.findMany({ where: { printerId: p.id }, include: { material: { select: { id: true, name: true, unit: true, stockQuantity: true } } }, orderBy: { slot: "asc" } });
  res.json(rows.map((r) => ({ slot: r.slot, materialId: r.materialId, material: r.material, spoolGrams: r.spoolGrams, lastRemain: r.lastRemain })));
});

const slotSchema = z.object({ materialId: z.string().min(1), spoolGrams: z.number().int().min(50).max(10000).default(1000) });
printersRouter.put("/:id/ams-slots/:slot", async (req, res) => {
  if (req.auth!.role !== "ADMIN") throw new HttpError(403, "Die Zuordnung darf nur ein Administrator ändern.");
  const slot = Number(req.params.slot);
  if (!Number.isInteger(slot) || slot < 0 || slot > 15) throw new HttpError(400, "Ungültiges AMS-Fach");
  const body = slotSchema.parse(req.body);
  const p = await prisma.printer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!p) throw new HttpError(404, "Drucker nicht gefunden");
  const material = await prisma.material.findFirst({ where: { id: body.materialId, companyId: req.auth!.companyId, isArchived: false } });
  if (!material) throw new HttpError(400, "Material nicht gefunden");
  if (!["g", "gramm", "kg"].includes(material.unit.trim().toLowerCase())) throw new HttpError(400, "Das Material muss in g oder kg geführt werden, damit der Verbrauch abgebucht werden kann.");
  // Ausgangswert = aktueller Füllstand der Spule: Alles, was vor der Zuordnung verbraucht wurde, wird nicht nachträglich gebucht
  const tray = bambuMonitor.getStatus(p.id).ams.units.flatMap((u) => u.trays).find((t) => t.amsSlot === slot);
  const baseline = tray && tray.rfid && tray.remainPercent !== null ? { lastRemain: Math.round(tray.remainPercent), lastTag: tray.tag } : { lastRemain: null, lastTag: null };
  await prisma.amsSlotMapping.upsert({
    where: { printerId_slot: { printerId: p.id, slot } },
    create: { companyId: req.auth!.companyId, printerId: p.id, slot, materialId: material.id, spoolGrams: body.spoolGrams, ...baseline },
    update: { materialId: material.id, spoolGrams: body.spoolGrams, ...baseline },
  });
  bambuMonitor.refreshAmsMappings(p.id);
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "printer.ams.map", entityType: "Printer", entityId: p.id, metadata: { slot, materialId: material.id } });
  res.json({ ok: true });
});

printersRouter.delete("/:id/ams-slots/:slot", async (req, res) => {
  if (req.auth!.role !== "ADMIN") throw new HttpError(403, "Die Zuordnung darf nur ein Administrator ändern.");
  const p = await prisma.printer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!p) throw new HttpError(404, "Drucker nicht gefunden");
  await prisma.amsSlotMapping.deleteMany({ where: { printerId: p.id, slot: Number(req.params.slot) } });
  bambuMonitor.refreshAmsMappings(p.id);
  res.status(204).send();
});

// ---------- Druck an den Drucker senden (3MF aus dem Belegarchiv) ----------
// Nur Administratoren. "upload" lädt die Datei nur auf die SD-Karte (Start am Drucker); "start" startet zusätzlich den Druck.
const MAX_PRINT_FILE = 150 * 1024 * 1024;

async function printFile(companyId: string, documentId: string) {
  const doc = await prisma.archiveDocument.findFirst({ where: { id: documentId, companyId } });
  if (!doc || !/\.3mf$/i.test(doc.fileName)) throw new HttpError(404, "3MF-Datei nicht gefunden.");
  // Im Archiv steht der Pfad relativ zum Upload-Ordner - erst in den echten Pfad umwandeln
  const abs = absolutePath(doc.filePath);
  if (!fs.existsSync(abs)) throw new HttpError(404, "Die Datei liegt nicht mehr im Archiv.");
  if (fs.statSync(abs).size > MAX_PRINT_FILE) throw new HttpError(413, "Die Datei ist zu groß (maximal 150 MB).");
  return { doc, data: fs.readFileSync(abs) };
}

printersRouter.get("/print/files", async (req, res) => {
  if (req.auth!.role !== "ADMIN") throw new HttpError(403, "Nur ein Administrator darf Drucke senden.");
  const companyId = req.auth!.companyId;
  const docs = await prisma.archiveDocument.findMany({ where: { companyId, fileName: { endsWith: ".3mf", mode: "insensitive" } }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, title: true, fileName: true, sizeBytes: true, createdAt: true } });
  // zu welchem Produkt gehört die Datei? (Produktdateien mit Version) - so erkennt man, welches Teil gedruckt wird
  const links = await prisma.productFile.findMany({ where: { companyId, documentId: { in: docs.map((d) => d.id) } }, select: { documentId: true, revision: true, isCurrent: true, product: { select: { id: true, name: true } } } });
  const rows = docs.map((d) => ({ ...d, products: links.filter((l) => l.documentId === d.id).map((l) => ({ id: l.product.id, name: l.product.name, revision: l.revision, isCurrent: l.isCurrent })) }));
  // Dateien mit Produktzuordnung zuerst (aktuelle Version vor älteren), dann der Rest nach Datum
  const rank = (r: (typeof rows)[number]) => (r.products.some((p) => p.isCurrent) ? 0 : r.products.length > 0 ? 1 : 2);
  res.json(rows.sort((a, b) => rank(a) - rank(b)));
});

// Vorschaubild der Platte aus der 3MF (Bambu Studio legt Metadata/plate_N.png ab) - zeigt, welches Teil gedruckt wird
printersRouter.get("/print/files/:docId/thumbnail", async (req, res) => {
  if (req.auth!.role !== "ADMIN") throw new HttpError(403, "Nur ein Administrator darf Drucke senden.");
  const plate = Math.max(1, Math.min(100, Number(req.query.plate) || 1));
  const { data } = await printFile(req.auth!.companyId, req.params.docId);
  let img: Buffer | null = null;
  try {
    const zip = new AdmZip(data);
    const entry = [`Metadata/plate_${plate}.png`, `Metadata/top_${plate}.png`, "Metadata/plate_1.png"].map((n) => zip.getEntry(n)).find((e) => !!e);
    img = entry ? entry.getData() : null;
  } catch {
    img = null;
  }
  if (!img) throw new HttpError(404, "Kein Vorschaubild in der Datei.");
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(img);
});

printersRouter.get("/print/files/:docId/inspect", async (req, res) => {
  if (req.auth!.role !== "ADMIN") throw new HttpError(403, "Nur ein Administrator darf Drucke senden.");
  const { data } = await printFile(req.auth!.companyId, req.params.docId);
  try {
    res.json({ plates: inspect3mf(data) });
  } catch (err) {
    throw new HttpError(422, (err as Error).message);
  }
});

const printSchema = z.object({
  documentId: z.string().min(1),
  plate: z.number().int().min(1).max(100),
  mode: z.enum(["upload", "start"]),
  useAms: z.boolean().default(true),
  assignment: z.record(z.string(), z.number().int().min(0).max(254)).default({}), // Filament-Nr. -> AMS-Fach (254 = externe Spule)
  confirmPlateClear: z.boolean().optional(),
  orderConfirmationId: z.string().min(1).nullish(), // Auftrag, für den gedruckt wird (Zeit und Material gehen in dessen Ist-Kosten ein)
  noOrder: z.boolean().optional(), // ausdrücklich "Kein Auftrag (Lagerproduktion)": der Druck gilt dann nicht als "ohne Auftrag"
});

printersRouter.post("/:id/print", async (req, res) => {
  if (req.auth!.role !== "ADMIN") throw new HttpError(403, "Nur ein Administrator darf Drucke senden.");
  const body = printSchema.parse(req.body);
  const p = await prisma.printer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, isArchived: false } });
  if (!p || p.connectionType !== "BAMBU_LAN" || !p.host || !p.serial || !p.accessCodeEncrypted) throw new HttpError(404, "Für diesen Drucker ist keine Verbindung eingerichtet.");
  const target = { host: p.host, serial: p.serial, accessCode: decryptField(p.accessCodeEncrypted) };

  if (body.mode === "start") {
    if (!body.confirmPlateClear) throw new HttpError(400, "Bitte bestätigen, dass die Druckplatte leer und sauber ist.");
    const status = bambuMonitor.getStatus(p.id);
    if (status.connection !== "online") throw new HttpError(409, "Der Drucker ist nicht verbunden - ein Start ist nur bei bestehender Live-Verbindung möglich.");
    if (!["IDLE", "FINISH", "FAILED"].includes(status.state)) throw new HttpError(409, `Der Drucker ist gerade nicht bereit (${status.stateLabel}).`);
  }

  const { doc, data } = await printFile(req.auth!.companyId, body.documentId);
  let plates;
  try {
    plates = inspect3mf(data);
  } catch (err) {
    throw new HttpError(422, (err as Error).message);
  }
  const plate = plates.find((x) => x.index === body.plate);
  if (!plate) throw new HttpError(422, `Platte ${body.plate} ist in der Datei nicht geslict.`);
  const assignment = Object.fromEntries(Object.entries(body.assignment).map(([k, v]) => [Number(k), v]));
  if (body.mode === "start" && body.useAms && plate.filaments.some((f) => assignment[f.id] === undefined)) throw new HttpError(400, "Bitte für jedes Filament ein AMS-Fach wählen.");

  let orderId: string | null = null;
  if (body.orderConfirmationId) {
    const order = await prisma.orderConfirmation.findFirst({ where: { id: body.orderConfirmationId, companyId: req.auth!.companyId, voidedAt: null }, select: { id: true } });
    if (!order) throw new HttpError(400, "Auftrag nicht gefunden.");
    orderId = order.id;
  }

  const fileName = remoteFileName(doc.fileName);
  try {
    await uploadToPrinter(target, data, fileName);
    if (body.mode === "start") {
      await publishToPrinter(target, buildStartPayload({ fileName, plate, amsMapping: buildAmsMapping(plate.filaments, assignment), useAms: body.useAms }));
    }
  } catch (err) {
    throw new HttpError(502, (err as Error).message);
  }
  // Erwarteten Verbrauch (Slicer-Angabe) für die Abbuchung bei Druckende merken - gilt für Spulen ohne Chip
  const planEntries = body.useAms ? buildPlanEntries(plate.filaments, assignment) : [];
  await savePrintPlan(req.auth!.companyId, p.id, fileName, planEntries, orderId, body.noOrder === true).catch(() => undefined);
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: body.mode === "start" ? "printer.print.start" : "printer.print.upload", entityType: "Printer", entityId: p.id, metadata: { documentId: doc.id, fileName, plate: plate.index } });
  res.json({ ok: true, fileName, started: body.mode === "start", planned: planEntries.length });
});

// Drucke ohne Auftrag aus allen Druckern (auch aus Bambu Studio oder am Drucker gestartete), neueste zuerst - zum Zuordnen von der Auftragsseite aus
printersRouter.get("/jobs/unassigned", async (req, res) => {
  const jobs = await prisma.printerJob.findMany({
    where: { companyId: req.auth!.companyId, orderConfirmationId: null, noOrder: false, startedAt: { gte: new Date(Date.now() - 90 * 86_400_000) }, printer: { isArchived: false } },
    orderBy: { startedAt: "desc" },
    take: 60,
    select: { id: true, name: true, startedAt: true, endedAt: true, minutes: true, result: true, materialUsage: true, printer: { select: { name: true } } },
  });
  res.json(jobs.map(({ printer, ...j }) => ({ ...j, printerName: printer.name })));
});

printersRouter.get("/:id/jobs", async (req, res) => {
  const p = await prisma.printer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!p) throw new HttpError(404, "Drucker nicht gefunden");
  const jobs = await prisma.printerJob.findMany({
    where: { printerId: p.id },
    orderBy: { startedAt: "desc" },
    take: 30,
    include: { orderConfirmation: { select: { id: true, confirmationNumber: true, customer: { select: { name: true } } } } },
  });
  res.json(jobs.map(({ orderConfirmation, ...j }) => ({ ...j, order: orderConfirmation ? { id: orderConfirmation.id, number: orderConfirmation.confirmationNumber, customerName: orderConfirmation.customer.name } : null })));
});

// Druckauftrag einem Auftrag (Auftragsbestätigung) zuordnen bzw. lösen - auch für Drucke, die direkt am Drucker oder in Bambu Studio gestartet wurden
// noOrder: true = bewusst für keinen Auftrag gedruckt (Lager, Test) - der Druck gilt dann nicht mehr als "ohne Auftrag". Ein Auftrag hebt das wieder auf.
printersRouter.patch("/jobs/:jobId", async (req, res) => {
  const body = z.object({ orderConfirmationId: z.string().min(1).nullish(), noOrder: z.boolean().optional() }).refine((b) => b.orderConfirmationId !== undefined || b.noOrder !== undefined, "Auftrag oder noOrder angeben").parse(req.body);
  const job = await prisma.printerJob.findFirst({ where: { id: req.params.jobId, companyId: req.auth!.companyId } });
  if (!job) throw new HttpError(404, "Druckauftrag nicht gefunden");
  if (body.orderConfirmationId) {
    const order = await prisma.orderConfirmation.findFirst({ where: { id: body.orderConfirmationId, companyId: req.auth!.companyId, voidedAt: null }, select: { id: true } });
    if (!order) throw new HttpError(400, "Auftrag nicht gefunden.");
  }
  const data = body.noOrder === true ? { orderConfirmationId: null, noOrder: true } : { orderConfirmationId: body.orderConfirmationId ?? null, noOrder: false };
  await prisma.printerJob.update({ where: { id: job.id }, data });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "printer.job.assign", entityType: "PrinterJob", entityId: job.id, metadata: { orderConfirmationId: data.orderConfirmationId, noOrder: data.noOrder } });
  res.json({ ok: true });
});

// Mehrere Drucke auf einmal als "für keinen Auftrag" ablegen (z.B. der Sammelpunkt in Heute zu tun). Nur Drucke ohne Auftrag werden angefasst.
printersRouter.post("/jobs/mark-no-order", async (req, res) => {
  const { jobIds } = z.object({ jobIds: z.array(z.string().min(1)).min(1).max(100) }).parse(req.body);
  const r = await prisma.printerJob.updateMany({ where: { id: { in: jobIds }, companyId: req.auth!.companyId, orderConfirmationId: null }, data: { noOrder: true } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "printer.job.no_order", entityType: "PrinterJob", entityId: jobIds[0], metadata: { count: r.count } });
  res.json({ ok: true, count: r.count });
});

// Vorschlag für den Materialverbrauch eines Drucks: passt der Druckname zu einer 3MF im Archiv (gleicher Name wie in Bambu Studio),
// liefert deren Slicer-Angabe (Gramm je Filament) - sonst nichts.
printersRouter.get("/jobs/:jobId/usage-suggestion", async (req, res) => {
  if (req.auth!.role !== "ADMIN") throw new HttpError(403, "Nur ein Administrator darf den Verbrauch ändern.");
  const companyId = req.auth!.companyId;
  const job = await prisma.printerJob.findFirst({ where: { id: req.params.jobId, companyId }, select: { name: true } });
  if (!job) throw new HttpError(404, "Druckauftrag nicht gefunden");
  const docs = await prisma.archiveDocument.findMany({ where: { companyId, fileName: { endsWith: ".3mf", mode: "insensitive" } }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, title: true, fileName: true } });
  const doc = matchJobFile(job.name, docs);
  if (!doc) return res.json({ document: null, plates: [] });
  try {
    const { data } = await printFile(companyId, doc.id);
    const plates = inspect3mf(data).map((p) => ({ index: p.index, weightGrams: p.weightGrams, filaments: p.filaments }));
    res.json({ document: doc, plates });
  } catch (e) {
    // z.B. reine Projektdatei ohne G-Code: Datei bekannt, aber keine Angaben lesbar
    res.json({ document: doc, plates: [], note: (e as Error).message });
  }
});

// Materialverbrauch eines beendeten Drucks festlegen/korrigieren; der Unterschied zum bisher Gebuchten geht in den Materialbestand
printersRouter.put("/jobs/:jobId/usage", async (req, res) => {
  if (req.auth!.role !== "ADMIN") throw new HttpError(403, "Nur ein Administrator darf den Verbrauch ändern.");
  const companyId = req.auth!.companyId;
  const body = z.object({ usage: z.array(z.object({ materialId: z.string().min(1), grams: z.number().min(0).max(100_000) })).max(30) }).parse(req.body);
  const job = await prisma.printerJob.findFirst({ where: { id: req.params.jobId, companyId } });
  if (!job) throw new HttpError(404, "Druckauftrag nicht gefunden");
  if (!job.endedAt) throw new HttpError(409, "Der Druck läuft noch. Den Verbrauch kannst du nach dem Druckende festlegen - bis dahin misst das AMS mit.");
  const ids = [...new Set(body.usage.map((u) => u.materialId))];
  const materials = await prisma.material.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, name: true, unit: true, costPerUnitCents: true } });
  if (materials.length !== ids.length) throw new HttpError(400, "Material nicht gefunden.");
  // auch bisher gebuchte Materialien brauchen Einheit/Preis (für die Bestandskorrektur), selbst wenn sie jetzt entfernt werden
  const oldIds = Array.isArray(job.materialUsage) ? (job.materialUsage as { materialId: string }[]).map((o) => o.materialId) : [];
  const allIds = [...new Set([...ids, ...oldIds])];
  const info = new Map((await prisma.material.findMany({ where: { companyId, id: { in: allIds } }, select: { id: true, name: true, unit: true, costPerUnitCents: true } })).map((m) => [m.id, { name: m.name, unit: m.unit, costPerUnitCents: m.costPerUnitCents }]));
  const { entries, deltas } = planUsageChange(job.materialUsage, body.usage, info);
  await prisma.$transaction([
    ...deltas.filter((d) => !d.skipped && d.amount !== 0).map((d) => prisma.material.update({ where: { id: d.materialId }, data: { stockQuantity: { decrement: d.amount } } })),
    // eine noch ausstehende Slicer-Buchung entfällt, sonst würde nach der Korrektur doppelt gebucht
    prisma.printerJob.update({ where: { id: job.id }, data: { materialUsage: entries as unknown as object, slicedPlan: Prisma.DbNull } }),
  ]);
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "printer.job.usage", entityType: "PrinterJob", entityId: job.id, metadata: { usage: entries.map((e) => ({ name: e.name, grams: e.grams })) } });
  void checkLowStock(companyId);
  res.json({ materialUsage: entries, stockSkipped: deltas.filter((d) => d.skipped).map((d) => info.get(d.materialId)?.name ?? d.materialId) });
});

// Archivieren statt Löschen: Produkte, die diesen Drucker nutzen, behalten ihre Zuordnung nicht - sie fallen auf den
// pauschalen Maschinenstundensatz zurück (siehe Product.printerId, onDelete SetNull bei echtem Löschen).
printersRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.printer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Drucker nicht gefunden");
  await prisma.$transaction([
    prisma.product.updateMany({ where: { printerId: existing.id }, data: { printerId: null } }),
    prisma.printer.update({ where: { id: existing.id }, data: { isArchived: true, liveEnabled: false } }),
  ]);
  await syncMonitor(existing.id);
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "printer.archive", entityType: "Printer", entityId: existing.id });
  res.status(204).send();
});
