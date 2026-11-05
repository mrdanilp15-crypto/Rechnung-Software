import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { buildIcs, type CalendarEvent } from "./ics";

/**
 * Kalender-Abo (ICS): Liefertermine, Zahlungsziele, Angebotsfristen und Wartung im Handy-/Desktop-Kalender.
 * Kalender-Apps können sich nicht anmelden, deshalb gilt eine geheime Adresse mit langem Zufalls-Token (jederzeit erneuerbar oder abschaltbar).
 * Der Feed enthält Belegnummern und Kundennamen, keine Beträge.
 */
export const calendarRouter = Router();

const KEY = "calendarToken";
const DAY = 86_400_000;

const feedUrl = (token: string) => `${env.PUBLIC_APP_URL.replace(/\/$/, "")}/api/calendar/feed/${token}.ics`;

// ---------- öffentlicher Feed (nur mit Token) ----------
calendarRouter.get("/feed/:token.ics", async (req, res) => {
  const token = req.params.token;
  if (!/^[0-9a-f]{48}$/.test(token)) throw new HttpError(404, "Nicht gefunden");
  const row = await prisma.setting.findFirst({ where: { key: KEY, value: token }, select: { companyId: true } });
  if (!row) throw new HttpError(404, "Nicht gefunden");
  const companyId = row.companyId;
  const now = new Date();
  const from = new Date(now.getTime() - 30 * DAY);
  const to = new Date(now.getTime() + 180 * DAY);
  const base = env.PUBLIC_APP_URL.replace(/\/$/, "");

  const [company, orders, invoices, quotes, tasks] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } }),
    prisma.orderConfirmation.findMany({ where: { companyId, voidedAt: null, status: { not: "DRAFT" }, productionStatus: { not: "SHIPPED" }, expectedDeliveryDate: { gte: from, lte: to } }, select: { id: true, confirmationNumber: true, expectedDeliveryDate: true, customer: { select: { name: true } } } }),
    prisma.invoice.findMany({ where: { companyId, status: { in: ["SENT", "OVERDUE"] }, isCancellationDocument: false, dueDate: { gte: from, lte: to } }, select: { id: true, invoiceNumber: true, dueDate: true, customer: { select: { name: true } } } }),
    prisma.quote.findMany({ where: { companyId, status: "SENT", validUntil: { gte: from, lte: to } }, select: { id: true, quoteNumber: true, validUntil: true, customer: { select: { name: true } } } }),
    prisma.maintenanceTask.findMany({ where: { companyId, intervalDays: { gt: 0 }, printer: { isArchived: false } }, select: { id: true, name: true, intervalDays: true, lastDoneAt: true, printer: { select: { name: true } } } }),
  ]);

  const events: CalendarEvent[] = [];
  for (const o of orders) events.push({ uid: `order-${o.id}`, date: o.expectedDeliveryDate!, title: `Lieferung ${o.confirmationNumber} - ${o.customer.name}`, url: `${base}/orders/${o.id}` });
  for (const i of invoices) events.push({ uid: `invoice-${i.id}`, date: i.dueDate!, title: `Zahlung fällig ${i.invoiceNumber ?? ""} - ${i.customer.name}`.replace("  ", " "), url: `${base}/invoices/${i.id}` });
  for (const q of quotes) events.push({ uid: `quote-${q.id}`, date: q.validUntil!, title: `Angebot ${q.quoteNumber} gültig bis - ${q.customer.name}`, url: `${base}/documents?type=QUOTE` });
  for (const t of tasks) {
    const due = new Date(t.lastDoneAt.getTime() + (t.intervalDays ?? 0) * DAY);
    if (due >= from && due <= to) events.push({ uid: `maint-${t.id}`, date: due, title: `Wartung: ${t.printer.name} - ${t.name}`, url: `${base}/catalog?tab=printers` });
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.send(buildIcs(events, `${company.name} - Termine`, now));
});

// ---------- Verwaltung (nur Administratoren, nicht per API-Schlüssel) ----------
async function currentToken(companyId: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { companyId_key: { companyId, key: KEY } } });
  return row?.value ?? null;
}

function info(token: string | null) {
  if (!token) return { enabled: false as const };
  const url = feedUrl(token);
  return { enabled: true as const, url, webcalUrl: url.replace(/^https?:/, "webcal:") };
}

calendarRouter.get("/info", requireAuth, requireRole("ADMIN"), async (req, res) => {
  res.json(info(await currentToken(req.auth!.companyId)));
});

// einschalten bzw. neuen Token erzeugen (die alte Adresse funktioniert danach nicht mehr)
calendarRouter.post("/enable", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const companyId = req.auth!.companyId;
  const token = crypto.randomBytes(24).toString("hex");
  await prisma.setting.upsert({ where: { companyId_key: { companyId, key: KEY } }, create: { companyId, key: KEY, value: token }, update: { value: token } });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "calendar.enable", entityType: "Company", entityId: companyId });
  res.json(info(token));
});

calendarRouter.delete("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const companyId = req.auth!.companyId;
  await prisma.setting.deleteMany({ where: { companyId, key: KEY } });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "calendar.disable", entityType: "Company", entityId: companyId });
  res.status(204).send();
});
