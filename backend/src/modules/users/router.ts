import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { hashPassword, isPasswordStrongEnough } from "../auth/password";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { revokeAllUserTokens } from "../auth/tokens";

export const usersRouter = Router();
usersRouter.use(requireAuth);

// Nur Admins verwalten Benutzer (Rollen & Rechte).
usersRouter.get("/", requireRole("ADMIN"), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { companyId: req.auth!.companyId },
    select: { id: true, name: true, email: true, role: true, isActive: true, locale: true, lastLoginAt: true, totpEnabled: true },
    orderBy: { name: "asc" },
  });
  res.json(users);
});

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(10),
  role: z.enum(["ADMIN", "MITARBEITER", "BUCHHALTUNG"]).default("MITARBEITER"),
  locale: z.enum(["de", "en"]).default("de"),
});

usersRouter.post("/", requireRole("ADMIN"), async (req, res) => {
  const body = createUserSchema.parse(req.body);
  if (!isPasswordStrongEnough(body.password)) throw new HttpError(400, "Passwort zu schwach");
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw new HttpError(409, "E-Mail bereits vergeben");
  const passwordHash = await hashPassword(body.password);
  const { password: _password, ...rest } = body;
  const user = await prisma.user.create({
    data: { ...rest, passwordHash, companyId: req.auth!.companyId },
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "user.create", entityType: "User", entityId: user.id });
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["ADMIN", "MITARBEITER", "BUCHHALTUNG"]).optional(),
  isActive: z.boolean().optional(),
  locale: z.enum(["de", "en"]).optional(),
});

usersRouter.patch("/:id", requireRole("ADMIN"), async (req, res) => {
  const body = updateUserSchema.parse(req.body);
  const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!user) throw new HttpError(404, "Benutzer nicht gefunden");
  const updated = await prisma.user.update({ where: { id: user.id }, data: body });
  if (body.isActive === false) await revokeAllUserTokens(user.id);
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "user.update", entityType: "User", entityId: user.id, metadata: body });
  res.json({ id: updated.id, name: updated.name, role: updated.role, isActive: updated.isActive });
});

usersRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!user) throw new HttpError(404, "Benutzer nicht gefunden");
  if (user.id === req.auth!.sub) throw new HttpError(400, "Eigenes Konto kann nicht gelöscht werden");
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  await revokeAllUserTokens(user.id);
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "user.deactivate", entityType: "User", entityId: user.id });
  res.status(204).send();
});
