import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { env } from "../../config/env";
import { encryptField, decryptField } from "../../utils/crypto";
import { bambuMonitor, testBambuConnection } from "./bambu/monitor";
import { CAMERA_SNAPSHOT_MODELS, PRINTER_MODELS, fetchBambuSnapshot, isAllowedPrinterHost } from "./bambu/network";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";

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

const hostSchema = z.string().trim().max(100).refine(isAllowedPrinterHost, "Bitte die IP-Adresse aus Ihrem Heimnetz angeben (z.B. 192.168.1.50) - Adressen außerhalb des eigenen Netzes sind nicht erlaubt.");
const printerSchema = z.object({
  name: z.string().min(1).max(120),
  purchasePriceCents: z.number().int().min(0).max(100_000_000),
  lifetimeHours: z.number().positive().max(1_000_000),
  powerWatts: z.number().min(0).max(100_000),
  wearCentsPerHour: z.number().min(0).max(1_000_000),
  notes: z.string().max(1000).nullish(),
});
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

// Kamerabild (Einzelbild) für P1P/P1S/A1/A1 mini; kurz zwischengespeichert, damit mehrere Betrachter den Drucker nicht überlasten
const snapshotCache = new Map<string, { at: number; image: Buffer }>();
printersRouter.get("/:id/snapshot", async (req, res) => {
  const p = await prisma.printer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, isArchived: false } });
  if (!p || p.connectionType !== "BAMBU_LAN" || !p.host || !p.accessCodeEncrypted) throw new HttpError(404, "Für diesen Drucker ist keine Verbindung eingerichtet.");
  if (!p.model || !(CAMERA_SNAPSHOT_MODELS as readonly string[]).includes(p.model)) {
    throw new HttpError(422, "Das Kamerabild wird nur für P1P, P1S, A1 und A1 mini unterstützt (andere Modelle nutzen einen Videostrom, der hier nicht angezeigt werden kann). Bitte Modell prüfen.");
  }
  const cached = snapshotCache.get(p.id);
  let image = cached && Date.now() - cached.at < 2500 ? cached.image : null;
  if (!image) {
    try {
      image = await fetchBambuSnapshot(p.host, decryptField(p.accessCodeEncrypted));
    } catch (err) {
      throw new HttpError(502, (err as Error).message);
    }
    snapshotCache.set(p.id, { at: Date.now(), image });
  }
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "no-store");
  res.send(image);
});

printersRouter.get("/:id/jobs", async (req, res) => {
  const p = await prisma.printer.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!p) throw new HttpError(404, "Drucker nicht gefunden");
  const jobs = await prisma.printerJob.findMany({ where: { printerId: p.id }, orderBy: { startedAt: "desc" }, take: 30 });
  res.json(jobs);
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
