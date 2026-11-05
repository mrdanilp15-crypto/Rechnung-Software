import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { generateApiKey } from "./keys";

/** Einstellungen -> Schnittstellen: API-Schlüssel anlegen, ansehen (ohne den Schlüssel selbst) und widerrufen. Nur Administratoren, nie per API-Schlüssel. */
export const apiKeysRouter = Router();
apiKeysRouter.use(requireAuth, requireRole("ADMIN"));

apiKeysRouter.get("/", async (req, res) => {
  const keys = await prisma.apiKey.findMany({ where: { companyId: req.auth!.companyId }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, prefix: true, scope: true, lastUsedAt: true, createdAt: true } });
  res.json(keys);
});

const createSchema = z.object({ name: z.string().trim().min(1).max(60), scope: z.enum(["READ", "FULL"]).default("READ") });

apiKeysRouter.post("/", async (req, res) => {
  const body = createSchema.parse(req.body);
  const count = await prisma.apiKey.count({ where: { companyId: req.auth!.companyId } });
  if (count >= 20) throw new HttpError(400, "Es sind höchstens 20 API-Schlüssel möglich. Bitte nicht mehr benötigte widerrufen.");
  const { key, hash, prefix } = generateApiKey();
  const created = await prisma.apiKey.create({ data: { companyId: req.auth!.companyId, name: body.name, scope: body.scope, keyHash: hash, prefix, createdByUserId: req.auth!.sub } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "apikey.create", entityType: "ApiKey", entityId: created.id, metadata: { name: body.name, scope: body.scope } });
  // Der Schlüssel wird nur jetzt angezeigt.
  res.status(201).json({ id: created.id, name: created.name, scope: created.scope, prefix, createdAt: created.createdAt, key });
});

apiKeysRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.apiKey.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "API-Schlüssel nicht gefunden");
  await prisma.apiKey.delete({ where: { id: existing.id } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "apikey.revoke", entityType: "ApiKey", entityId: existing.id, metadata: { name: existing.name } });
  res.status(204).send();
});
