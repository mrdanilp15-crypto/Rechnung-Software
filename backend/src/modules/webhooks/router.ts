import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { EVENT_CATALOG } from "../plugins/hooks";
import { deliverWebhook } from "./dispatcher";
import { checkWebhookUrl } from "./url";

export const webhooksRouter = Router();
webhooksRouter.use(requireAuth, requireRole("ADMIN"));

const KNOWN = new Set<string>(EVENT_CATALOG.map((e) => e.name));

webhooksRouter.get("/events", (_req, res) => res.json(EVENT_CATALOG));

webhooksRouter.get("/", async (req, res) => {
  const webhooks = await prisma.webhook.findMany({ where: { companyId: req.auth!.companyId }, orderBy: { createdAt: "asc" } });
  // letzte Zustellung je Webhook, damit man Fehler sofort sieht
  const last = await prisma.webhookDelivery.findMany({
    where: { webhookId: { in: webhooks.map((w) => w.id) } },
    orderBy: { attemptedAt: "desc" },
    take: 200,
    select: { webhookId: true, success: true, responseCode: true, attemptedAt: true, eventType: true },
  });
  res.json(webhooks.map(({ secret, ...rest }) => ({ ...rest, last: last.find((d) => d.webhookId === rest.id) ?? null })));
});

const eventsSchema = z.array(z.string()).min(1).refine((a) => a.every((e) => KNOWN.has(e)), "Unbekanntes Ereignis");
const webhookSchema = z.object({ url: z.string().trim().url(), eventTypes: eventsSchema });

function assertUrl(url: string) {
  const c = checkWebhookUrl(url);
  if (!c.ok) throw new HttpError(400, c.error);
}

webhooksRouter.post("/", async (req, res) => {
  const body = webhookSchema.parse(req.body);
  assertUrl(body.url);
  const count = await prisma.webhook.count({ where: { companyId: req.auth!.companyId } });
  if (count >= 20) throw new HttpError(400, "Es sind höchstens 20 Webhooks möglich.");
  const secret = crypto.randomBytes(24).toString("hex");
  const webhook = await prisma.webhook.create({ data: { companyId: req.auth!.companyId, url: body.url, eventTypes: body.eventTypes.join(","), secret } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "webhook.create", entityType: "Webhook", entityId: webhook.id, metadata: { url: body.url, events: body.eventTypes } });
  // Das Geheimnis zur Signaturprüfung wird nur einmalig bei Erstellung zurückgegeben.
  res.status(201).json({ ...webhook, secret });
});

const patchSchema = z.object({ isActive: z.boolean().optional(), url: z.string().trim().url().optional(), eventTypes: eventsSchema.optional() });

webhooksRouter.patch("/:id", async (req, res) => {
  const body = patchSchema.parse(req.body);
  const existing = await prisma.webhook.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Webhook nicht gefunden");
  if (body.url) assertUrl(body.url);
  const updated = await prisma.webhook.update({
    where: { id: existing.id },
    data: { ...(body.isActive !== undefined ? { isActive: body.isActive } : {}), ...(body.url ? { url: body.url } : {}), ...(body.eventTypes ? { eventTypes: body.eventTypes.join(",") } : {}) },
  });
  const { secret: _secret, ...rest } = updated;
  res.json(rest);
});

// Testereignis senden (unabhängig von den gewählten Ereignissen), damit man die Einrichtung beim Empfänger prüfen kann
webhooksRouter.post("/:id/test", async (req, res) => {
  const existing = await prisma.webhook.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Webhook nicht gefunden");
  const result = await deliverWebhook(existing, "webhook.test", { companyId: req.auth!.companyId, message: "Testereignis aus der Rechnungssoftware" });
  res.json(result);
});

webhooksRouter.get("/:id/deliveries", async (req, res) => {
  const existing = await prisma.webhook.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Webhook nicht gefunden");
  const rows = await prisma.webhookDelivery.findMany({ where: { webhookId: existing.id }, orderBy: { attemptedAt: "desc" }, take: 15, select: { id: true, eventType: true, responseCode: true, success: true, attemptedAt: true } });
  res.json(rows);
});

webhooksRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.webhook.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Webhook nicht gefunden");
  await prisma.webhook.delete({ where: { id: existing.id } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "webhook.delete", entityType: "Webhook", entityId: existing.id });
  res.status(204).send();
});
