import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";

export const webhooksRouter = Router();
webhooksRouter.use(requireAuth, requireRole("ADMIN"));

webhooksRouter.get("/", async (req, res) => {
  const webhooks = await prisma.webhook.findMany({ where: { companyId: req.auth!.companyId } });
  res.json(webhooks.map(({ secret, ...rest }) => rest));
});

const webhookSchema = z.object({
  url: z.string().url(),
  eventTypes: z.array(z.string()).min(1),
});

webhooksRouter.post("/", async (req, res) => {
  const body = webhookSchema.parse(req.body);
  const secret = crypto.randomBytes(24).toString("hex");
  const webhook = await prisma.webhook.create({
    data: { companyId: req.auth!.companyId, url: body.url, eventTypes: body.eventTypes.join(","), secret },
  });
  // Secret wird nur einmalig bei Erstellung zurückgegeben.
  res.status(201).json({ ...webhook, secret });
});

webhooksRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.webhook.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Webhook nicht gefunden");
  await prisma.webhook.delete({ where: { id: existing.id } });
  res.status(204).send();
});
