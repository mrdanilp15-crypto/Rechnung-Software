import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { hashPassword, isPasswordStrongEnough } from "../auth/password";
import crypto from "crypto";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { revokeAllUserTokens } from "../auth/tokens";
import multer from "multer";
import fs from "fs";
import path from "path";
import { env } from "../../config/env";
import { AVATAR_COLORS, AVATAR_PRESETS, MAX_AVATAR_BYTES, avatarOf, detectImage, isColor, isPreset } from "./avatar";

export const usersRouter = Router();
usersRouter.use(requireAuth);

// Nur Admins verwalten Benutzer (Rollen & Rechte).
usersRouter.get("/", requireRole("ADMIN"), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { companyId: req.auth!.companyId },
    select: { id: true, name: true, email: true, role: true, isActive: true, locale: true, lastLoginAt: true, totpEnabled: true, avatarPath: true, avatarPreset: true, avatarColor: true, avatarUpdatedAt: true },
    orderBy: { name: "asc" },
  });
  res.json(users.map(({ avatarPath, avatarPreset, avatarColor, avatarUpdatedAt, ...u }) => ({ ...u, avatar: avatarOf({ avatarPath, avatarPreset, avatarColor, avatarUpdatedAt }) })));
});

// Mitarbeiter-Verzeichnis für Auswahlfelder (Zuständiger ...): jeder angemeldete Benutzer, nur aktive Konten, ohne E-Mail-Adressen
usersRouter.get("/directory", async (req, res) => {
  const users = await prisma.user.findMany({
    where: { companyId: req.auth!.companyId, isActive: true },
    select: { id: true, name: true, role: true, avatarPath: true, avatarPreset: true, avatarColor: true, avatarUpdatedAt: true },
    orderBy: { name: "asc" },
  });
  res.json(users.map(({ avatarPath, avatarPreset, avatarColor, avatarUpdatedAt, ...u }) => ({ ...u, avatar: avatarOf({ avatarPath, avatarPreset, avatarColor, avatarUpdatedAt }) })));
});

// ---------- Profilbild ----------
// :id darf "me" sein. Das eigene Bild darf jeder ändern, fremde nur ein Administrator.
const AVATAR_DIR = () => path.resolve(env.UPLOAD_DIR, "avatars");
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } });

async function avatarTarget(req: import("express").Request) {
  const id = req.params.id === "me" ? req.auth!.sub : req.params.id;
  if (id !== req.auth!.sub && req.auth!.role !== "ADMIN") throw new HttpError(403, "Das Profilbild anderer darf nur ein Administrator ändern.");
  const user = await prisma.user.findFirst({ where: { id, companyId: req.auth!.companyId } });
  if (!user) throw new HttpError(404, "Benutzer nicht gefunden");
  return user;
}

function removeAvatarFiles(userId: string) {
  for (const ext of ["png", "jpg"]) fs.rmSync(path.join(AVATAR_DIR(), `${userId}.${ext}`), { force: true });
}

usersRouter.get("/avatar-options", (_req, res) => res.json({ presets: AVATAR_PRESETS, colors: AVATAR_COLORS }));

// Foto ausliefern (angemeldete Benutzer derselben Firma)
usersRouter.get("/:id/avatar", async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId }, select: { avatarPath: true } });
  if (!user?.avatarPath) throw new HttpError(404, "Kein Foto");
  const abs = path.resolve(env.UPLOAD_DIR, user.avatarPath);
  if (!abs.startsWith(AVATAR_DIR() + path.sep) || !fs.existsSync(abs)) throw new HttpError(404, "Kein Foto");
  res.setHeader("Content-Type", abs.endsWith(".png") ? "image/png" : "image/jpeg");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.sendFile(abs);
});

// Symbol und Farbe wählen (null = zurück zu den Initialen)
usersRouter.put("/:id/avatar", async (req, res) => {
  const body = z.object({ preset: z.string().nullable(), color: z.string().nullable() }).parse(req.body);
  if (body.preset !== null && !isPreset(body.preset)) throw new HttpError(400, "Unbekanntes Symbol");
  if (body.color !== null && !isColor(body.color)) throw new HttpError(400, "Unbekannte Farbe");
  const user = await avatarTarget(req);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { avatarPreset: body.preset, avatarColor: body.color, avatarUpdatedAt: new Date() } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "user.avatar", entityType: "User", entityId: user.id });
  res.json(avatarOf(updated));
});

// Eigenes Foto hochladen (PNG/JPEG bis 512 KB; die Oberfläche verkleinert vorher auf 256 Pixel)
usersRouter.post("/:id/avatar/photo", avatarUpload.single("file"), async (req, res) => {
  const user = await avatarTarget(req);
  if (!req.file) throw new HttpError(400, "Keine Datei erhalten");
  const kind = detectImage(req.file.buffer);
  if (!kind) throw new HttpError(400, "Nur PNG- und JPEG-Bilder sind erlaubt.");
  fs.mkdirSync(AVATAR_DIR(), { recursive: true });
  removeAvatarFiles(user.id);
  fs.writeFileSync(path.join(AVATAR_DIR(), `${user.id}.${kind}`), req.file.buffer);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { avatarPath: `avatars/${user.id}.${kind}`, avatarUpdatedAt: new Date() } });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "user.avatar", entityType: "User", entityId: user.id });
  res.json(avatarOf(updated));
});

usersRouter.delete("/:id/avatar/photo", async (req, res) => {
  const user = await avatarTarget(req);
  removeAvatarFiles(user.id);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { avatarPath: null, avatarUpdatedAt: new Date() } });
  res.json(avatarOf(updated));
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
  const existing = await prisma.user.findFirst({ where: { email: { equals: body.email.trim(), mode: "insensitive" } } });
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

/** Zufälliges, garantiert ausreichend starkes Temporär-Passwort (Base64url-Alphabet
 * enthält Buchstaben, Ziffern, "-" und "_" - erfüllt die Mindestanforderung praktisch
 * immer, im unwahrscheinlichen Ausnahmefall wird einfach neu gezogen). */
function generateTempPassword(): string {
  let candidate = crypto.randomBytes(9).toString("base64url");
  while (!isPasswordStrongEnough(candidate)) candidate = crypto.randomBytes(9).toString("base64url");
  return candidate;
}

// Admin setzt ein neues, zufällig erzeugtes Passwort für einen Benutzer, der sein
// eigenes vergessen hat (oder ausgesperrt ist) - wird dem Admin einmalig angezeigt, damit
// er es der Person mitteilen kann. Alle bestehenden Sitzungen dieses Benutzers werden
// beendet, eine evtl. aktive Sperre (failedLoginCount/lockedUntil) wird mit aufgehoben.
usersRouter.post("/:id/reset-password", requireRole("ADMIN"), async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!user) throw new HttpError(404, "Benutzer nicht gefunden");
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
  });
  await revokeAllUserTokens(user.id);
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "user.reset_password", entityType: "User", entityId: user.id });
  res.json({ tempPassword });
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
