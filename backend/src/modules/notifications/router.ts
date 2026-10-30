import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { getNotifySettings, saveNotifySettings } from "./service";

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
