import { Router } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { resolvePdfFonts } from "../pdf/fonts";
import { ACTIVITIES, ACTIVITY_KEYS, activityLabel, clockTime, decimalHours, dayKey, durationMinutes, formatDe, hm, monthRange, summarize } from "./calc";

/**
 * Zeiterfassung: Start/Stopp-Zeit oder manueller Eintrag, optional einem Auftrag zugeordnet. Jeder erfasst seine eigene Zeit;
 * Administratoren und Buchhaltung sehen alle Benutzer. Dazu Stundenzettel als PDF und CSV für den Steuerberater.
 */

export const timeRouter = Router();
timeRouter.use(requireAuth);

const seesAll = (role: string) => role === "ADMIN" || role === "BUCHHALTUNG";
/** Zeiten anderer nachtragen, ändern und löschen dürfen nur Administratoren (Buchhaltung sieht sie nur). */
const canEditOthers = (role: string) => role === "ADMIN";
const MAX_MINUTES = 24 * 60;

async function userNames(companyId: string): Promise<Map<string, string>> {
  const users = await prisma.user.findMany({ where: { companyId }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

async function validOrderId(companyId: string, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const o = await prisma.orderConfirmation.findFirst({ where: { id, companyId }, select: { id: true } });
  if (!o) throw new HttpError(400, "Auftrag nicht gefunden.");
  return o.id;
}

const include = { orderConfirmation: { select: { id: true, confirmationNumber: true, customer: { select: { name: true } } } } } as const;
type Row = Awaited<ReturnType<typeof prisma.timeEntry.findMany<{ include: typeof include }>>>[number];

const present = (e: Row, names: Map<string, string>) => ({
  id: e.id,
  userId: e.userId,
  userName: names.get(e.userId) ?? "Ehemaliger Benutzer",
  startedAt: e.startedAt,
  endedAt: e.endedAt,
  minutes: e.minutes,
  activity: e.activity,
  note: e.note,
  order: e.orderConfirmation ? { id: e.orderConfirmation.id, number: e.orderConfirmation.confirmationNumber, customerName: e.orderConfirmation.customer.name } : null,
});

/** Zeitraum und Benutzer einer Abfrage: Monat "YYYY-MM" (Standard: aktueller Monat, deutsche Zeit); Nicht-Administratoren immer nur sie selbst. */
function scope(req: import("express").Request) {
  const ym = typeof req.query.month === "string" ? req.query.month : dayKey(new Date()).slice(0, 7);
  const range = monthRange(ym);
  if (!range) throw new HttpError(400, "Ungültiger Monat (erwartet JJJJ-MM).");
  const own = req.auth!.sub;
  const asked = typeof req.query.userId === "string" && req.query.userId ? req.query.userId : null;
  const userId = seesAll(req.auth!.role) ? asked : own; // null = alle (nur wer alles sehen darf)
  if (!seesAll(req.auth!.role) && asked && asked !== own) throw new HttpError(403, "Du siehst nur deine eigenen Zeiten.");
  return { ym, ...range, userId };
}

timeRouter.get("/meta", async (req, res) => {
  const users = seesAll(req.auth!.role) ? [...(await userNames(req.auth!.companyId)).entries()].map(([id, name]) => ({ id, name })) : [];
  res.json({ activities: ACTIVITIES, users, seesAll: seesAll(req.auth!.role), selfId: req.auth!.sub, canEditOthers: canEditOthers(req.auth!.role) });
});

// Laufende Zeit des angemeldeten Benutzers (oder null)
timeRouter.get("/running", async (req, res) => {
  const e = await prisma.timeEntry.findFirst({ where: { companyId: req.auth!.companyId, userId: req.auth!.sub, endedAt: null }, include });
  res.json(e ? present(e, await userNames(req.auth!.companyId)) : null);
});

timeRouter.get("/", async (req, res) => {
  const companyId = req.auth!.companyId;
  const s = scope(req);
  const entries = await prisma.timeEntry.findMany({ where: { companyId, startedAt: { gte: s.from, lt: s.to }, ...(s.userId ? { userId: s.userId } : {}) }, include, orderBy: { startedAt: "desc" } });
  const names = await userNames(companyId);
  const sum = summarize(entries);
  res.json({ month: s.ym, entries: entries.map((e) => present(e, names)), totalMinutes: sum.totalMinutes, activities: sum.activities, days: sum.days });
});

const startSchema = z.object({ activity: z.enum(ACTIVITY_KEYS).default("SONSTIGES"), note: z.string().trim().max(300).nullish(), orderConfirmationId: z.string().nullish() });

timeRouter.post("/start", async (req, res) => {
  const companyId = req.auth!.companyId;
  const body = startSchema.parse(req.body);
  if (await prisma.timeEntry.findFirst({ where: { companyId, userId: req.auth!.sub, endedAt: null }, select: { id: true } })) throw new HttpError(409, "Es läuft schon eine Zeit. Bitte zuerst beenden.");
  const created = await prisma.timeEntry.create({
    data: { companyId, userId: req.auth!.sub, startedAt: new Date(), activity: body.activity, note: body.note || null, orderConfirmationId: await validOrderId(companyId, body.orderConfirmationId) },
    include,
  });
  res.status(201).json(present(created, await userNames(companyId)));
});

timeRouter.post("/stop", async (req, res) => {
  const companyId = req.auth!.companyId;
  const running = await prisma.timeEntry.findFirst({ where: { companyId, userId: req.auth!.sub, endedAt: null } });
  if (!running) throw new HttpError(409, "Es läuft keine Zeit.");
  const end = new Date();
  const updated = await prisma.timeEntry.update({ where: { id: running.id }, data: { endedAt: end, minutes: Math.min(MAX_MINUTES, durationMinutes(running.startedAt, end)) }, include });
  res.json(present(updated, await userNames(companyId)));
});

const manualSchema = z.object({
  startedAt: z.coerce.date(),
  minutes: z.number().int().min(1).max(MAX_MINUTES),
  activity: z.enum(ACTIVITY_KEYS).default("SONSTIGES"),
  note: z.string().trim().max(300).nullish(),
  orderConfirmationId: z.string().nullish(),
  /** Nachtragen für einen anderen Benutzer - nur Administratoren; ohne Angabe gilt der angemeldete Benutzer. */
  userId: z.string().nullish(),
});

timeRouter.post("/", async (req, res) => {
  const companyId = req.auth!.companyId;
  const body = manualSchema.parse(req.body);
  if (body.startedAt.getTime() > Date.now() + 5 * 60_000) throw new HttpError(400, "Der Beginn liegt in der Zukunft.");
  const own = req.auth!.sub;
  const forUser = body.userId || own;
  if (forUser !== own) {
    if (!canEditOthers(req.auth!.role)) throw new HttpError(403, "Zeiten für andere nachtragen dürfen nur Administratoren.");
    if (!(await prisma.user.findFirst({ where: { id: forUser, companyId }, select: { id: true } }))) throw new HttpError(400, "Benutzer nicht gefunden.");
  }
  const created = await prisma.timeEntry.create({
    data: { companyId, userId: forUser, startedAt: body.startedAt, endedAt: new Date(body.startedAt.getTime() + body.minutes * 60_000), minutes: body.minutes, activity: body.activity, note: body.note || null, orderConfirmationId: await validOrderId(companyId, body.orderConfirmationId) },
    include,
  });
  if (forUser !== own) await writeAuditLog({ req, companyId, userId: own, action: "time.create-for", entityType: "TimeEntry", entityId: created.id, metadata: { ofUser: forUser, minutes: body.minutes } });
  res.status(201).json(present(created, await userNames(companyId)));
});

async function ownedEntry(req: import("express").Request) {
  const e = await prisma.timeEntry.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!e) throw new HttpError(404, "Eintrag nicht gefunden");
  if (e.userId !== req.auth!.sub && !canEditOthers(req.auth!.role)) throw new HttpError(403, "Du darfst nur deine eigenen Zeiten ändern.");
  return e;
}

const patchSchema = z.object({
  startedAt: z.coerce.date().optional(),
  minutes: z.number().int().min(1).max(MAX_MINUTES).optional(),
  activity: z.enum(ACTIVITY_KEYS).optional(),
  note: z.string().trim().max(300).nullish(),
  orderConfirmationId: z.string().nullish(),
});

timeRouter.patch("/:id", async (req, res) => {
  const companyId = req.auth!.companyId;
  const existing = await ownedEntry(req);
  const body = patchSchema.parse(req.body);
  if (!existing.endedAt && body.minutes !== undefined) throw new HttpError(409, "Eine laufende Zeit bitte erst beenden.");
  const startedAt = body.startedAt ?? existing.startedAt;
  const minutes = body.minutes ?? existing.minutes;
  const updated = await prisma.timeEntry.update({
    where: { id: existing.id },
    data: {
      startedAt,
      ...(existing.endedAt && minutes ? { minutes, endedAt: new Date(startedAt.getTime() + minutes * 60_000) } : {}),
      ...(body.activity ? { activity: body.activity } : {}),
      ...(body.note !== undefined ? { note: body.note || null } : {}),
      ...(body.orderConfirmationId !== undefined ? { orderConfirmationId: await validOrderId(companyId, body.orderConfirmationId) } : {}),
    },
    include,
  });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "time.update", entityType: "TimeEntry", entityId: existing.id, metadata: { ...body, ofUser: existing.userId } });
  res.json(present(updated, await userNames(companyId)));
});

timeRouter.delete("/:id", async (req, res) => {
  const existing = await ownedEntry(req);
  await prisma.timeEntry.delete({ where: { id: existing.id } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "time.delete", entityType: "TimeEntry", entityId: existing.id, metadata: { ofUser: existing.userId, minutes: existing.minutes } });
  res.status(204).send();
});

// ---------- Export ----------

const csvCell = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV für den Steuerberater (Semikolon, deutsches Zahlenformat, mit BOM für Excel). Nur für Administratoren und Buchhaltung. */
timeRouter.get("/export.csv", async (req, res) => {
  if (!seesAll(req.auth!.role)) throw new HttpError(403, "Der Export ist Administratoren und der Buchhaltung vorbehalten.");
  const companyId = req.auth!.companyId;
  const s = scope(req);
  const entries = await prisma.timeEntry.findMany({ where: { companyId, endedAt: { not: null }, startedAt: { gte: s.from, lt: s.to }, ...(s.userId ? { userId: s.userId } : {}) }, include, orderBy: { startedAt: "asc" } });
  const names = await userNames(companyId);
  const header = ["Datum", "Mitarbeiter", "Beginn", "Ende", "Dauer (h:mm)", "Dauer (Stunden)", "Tätigkeit", "Auftrag", "Kunde", "Notiz"];
  const lines = entries.map((e) => [formatDe(e.startedAt), names.get(e.userId) ?? "Ehemaliger Benutzer", clockTime(e.startedAt), e.endedAt ? clockTime(e.endedAt) : "", hm(e.minutes ?? 0), decimalHours(e.minutes ?? 0), activityLabel(e.activity), e.orderConfirmation?.confirmationNumber ?? "", e.orderConfirmation?.customer.name ?? "", e.note ?? ""]);
  const total = entries.reduce((a, e) => a + (e.minutes ?? 0), 0);
  lines.push(["Summe", "", "", "", hm(total), decimalHours(total), "", "", "", ""]);
  const csv = "﻿" + [header, ...lines].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="zeiten-${s.ym}.csv"`);
  res.send(csv);
});

/** Stundenzettel eines Benutzers für einen Monat als PDF, mit Unterschriftszeilen. */
timeRouter.get("/timesheet.pdf", async (req, res) => {
  const companyId = req.auth!.companyId;
  const s = scope(req);
  const userId = s.userId ?? req.auth!.sub;
  const [company, names] = await Promise.all([prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }), userNames(companyId)]);
  const entries = await prisma.timeEntry.findMany({ where: { companyId, userId, endedAt: { not: null }, startedAt: { gte: s.from, lt: s.to } }, include, orderBy: { startedAt: "asc" } });

  const fonts = resolvePdfFonts();
  const doc = new PDFDocument({ size: "A4", margin: 40, font: fonts.regular, info: { Title: `Stundenzettel ${s.ym}` } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const monthName = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${s.ym}-15T12:00:00Z`));
  doc.font(fonts.bold).fontSize(16).text("Stundenzettel", 40, 40);
  doc.font(fonts.regular).fontSize(10).fillColor("#444").text(`${company?.name ?? ""}`, 40, 62);
  doc.fillColor("#000").fontSize(11).text(`Mitarbeiter: ${names.get(userId) ?? "Ehemaliger Benutzer"}`, 40, 86).text(`Monat: ${monthName}`, 40, 101);

  const cols = [
    { x: 40, w: 60, t: "Datum" },
    { x: 100, w: 70, t: "Zeit" },
    { x: 170, w: 45, t: "Dauer" },
    { x: 215, w: 120, t: "Tätigkeit" },
    { x: 335, w: 80, t: "Auftrag" },
    { x: 415, w: 140, t: "Notiz" },
  ];
  let y = 130;
  const header = () => {
    doc.font(fonts.bold).fontSize(9);
    cols.forEach((c) => doc.text(c.t, c.x, y, { width: c.w }));
    y += 14;
    doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor("#999").lineWidth(0.5).stroke();
    doc.font(fonts.regular);
  };
  header();
  for (const e of entries) {
    if (y > 740) {
      doc.addPage();
      y = 40;
      header();
    }
    const cells = [formatDe(e.startedAt), `${clockTime(e.startedAt)} - ${e.endedAt ? clockTime(e.endedAt) : ""}`, hm(e.minutes ?? 0), activityLabel(e.activity), e.orderConfirmation?.confirmationNumber ?? "", e.note ?? ""];
    const heights = cells.map((t, i) => doc.fontSize(9).heightOfString(t, { width: cols[i].w }));
    cells.forEach((t, i) => doc.fontSize(9).fillColor("#000").text(t, cols[i].x, y, { width: cols[i].w }));
    y += Math.max(12, ...heights) + 3;
  }
  const total = entries.reduce((a, e) => a + (e.minutes ?? 0), 0);
  if (y > 700) {
    doc.addPage();
    y = 40;
  }
  doc.moveTo(40, y).lineTo(555, y).strokeColor("#000").lineWidth(0.8).stroke();
  y += 6;
  doc.font(fonts.bold).fontSize(10).text(`Summe: ${hm(total)} Stunden (${decimalHours(total)} h)`, 40, y);
  y += 60;
  doc.font(fonts.regular).fontSize(9).fillColor("#444");
  doc.moveTo(40, y).lineTo(250, y).strokeColor("#444").lineWidth(0.5).stroke().text("Datum, Unterschrift Mitarbeiter", 40, y + 3);
  doc.moveTo(320, y).lineTo(530, y).stroke().text("Datum, Unterschrift Arbeitgeber", 320, y + 3);
  doc.end();
  const pdf = await done;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="stundenzettel-${s.ym}.pdf"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(pdf);
});
