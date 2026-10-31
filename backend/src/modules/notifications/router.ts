import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { getNotifySettings, saveNotifySettings } from "./service";
import { getVapidKeys, sendPushToCompany } from "./push";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const items = await prisma.notification.findMany({ where: { companyId: req.auth!.companyId }, orderBy: { createdAt: "desc" }, take: 30 });
  const unread = await prisma.notification.count({ where: { companyId: req.auth!.companyId, readAt: null } });
  res.json({ items, unread });
});

notificationsRouter.post("/read", async (req, res) => {
  await prisma.notification.updateMany({ where: { companyId: req.auth!.companyId, readAt: null }, data: { readAt: new Date() } });
  res.status(204).send();
});

notificationsRouter.get("/settings", async (req, res) => {
  res.json(await getNotifySettings(req.auth!.companyId));
});

const settingsSchema = z.object({
  email: z.union([z.literal(""), z.string().trim().email().max(200)]),
  byMail: z.boolean(),
  onFinish: z.boolean(),
  onFail: z.boolean(),
  onError: z.boolean(),
});
notificationsRouter.put("/settings", async (req, res) => {
  if (req.auth!.role !== "ADMIN") throw new HttpError(403, "Nur ein Administrator darf die Benachrichtigungen einstellen.");
  const body = settingsSchema.parse(req.body);
  if (body.byMail && !body.email) throw new HttpError(400, "Für E-Mail-Benachrichtigungen bitte eine Adresse eintragen.");
  await saveNotifySettings(req.auth!.companyId, body);
  res.json(body);
});

// ---------- Push auf diesem Gerät ----------
notificationsRouter.get("/push/key", async (req, res) => {
  res.json({ publicKey: (await getVapidKeys(req.auth!.companyId)).publicKey });
});

const subscribeSchema = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(5).max(100) }) });
notificationsRouter.post("/push/subscribe", async (req, res) => {
  const body = subscribeSchema.parse(req.body);
  await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    create: { companyId: req.auth!.companyId, userId: req.auth!.sub, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth },
    update: { companyId: req.auth!.companyId, userId: req.auth!.sub, p256dh: body.keys.p256dh, auth: body.keys.auth },
  });
  res.status(204).send();
});

notificationsRouter.post("/push/unsubscribe", async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(req.body);
  await prisma.pushSubscription.deleteMany({ where: { endpoint, companyId: req.auth!.companyId } });
  res.status(204).send();
});

notificationsRouter.post("/push/test", async (req, res) => {
  const sent = await sendPushToCompany(req.auth!.companyId, { title: "Test-Nachricht", body: "So sehen Meldungen Ihrer Drucker aus.", url: "/" });
  res.json({ sent });
});
