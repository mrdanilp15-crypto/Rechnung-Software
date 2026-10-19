import { Router } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "../../db/prisma";
import { hashPassword, verifyPassword, isPasswordStrongEnough } from "./password";
import { signAccessToken, issueRefreshToken, rotateRefreshToken, revokeRefreshToken, revokeAllUserTokens } from "./tokens";
import { generateTotpSecret, encryptTotpSecret, buildOtpAuthUrl, verifyTotpToken } from "./twoFactor";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { setAuthCookies, clearAuthCookies, getRefreshTokenCookie } from "./cookies";
import { env } from "../../config/env";
import crypto from "crypto";
import { sha256Hex } from "../../utils/crypto";
import { sendMailForCompany, isSmtpConfigured } from "../email/mailer";
import { forgotPasswordRateLimiter, resetPasswordRateLimiter } from "../../middleware/rateLimit";
import { logger } from "../../utils/logger";

export const authRouter = Router();

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

const registerSchema = z.object({
  companyName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(10),
  locale: z.enum(["de", "en"]).default("de"),
  inviteCode: z.string().optional(),
});

// Registrierung legt eine neue Firma (Mandant) samt erstem Admin-Benutzer an. Ist
// REGISTRATION_INVITE_CODE gesetzt (empfohlen für einen als Einzelfirma betriebenen
// Server), muss der übergebene Code exakt übereinstimmen - sonst wäre die Registrierung
// für jeden im Internet offen, der die URL kennt (siehe config/env.ts).
authRouter.post("/register", async (req, res) => {
  const body = registerSchema.parse(req.body);
  if (env.REGISTRATION_INVITE_CODE && body.inviteCode !== env.REGISTRATION_INVITE_CODE) {
    throw new HttpError(403, "Registrierung ist auf dieser Instanz nur mit gültigem Einladungscode möglich.");
  }
  if (!isPasswordStrongEnough(body.password)) {
    throw new HttpError(400, "Passwort zu schwach (mind. 10 Zeichen, Buchstaben und Ziffern)");
  }
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw new HttpError(409, "E-Mail-Adresse ist bereits registriert");

  const passwordHash = await hashPassword(body.password);
  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: body.companyName, defaultLocale: body.locale },
    });
    const user = await tx.user.create({
      data: {
        companyId: company.id,
        email: body.email,
        passwordHash,
        name: body.name,
        role: "ADMIN",
        locale: body.locale,
      },
    });
    return { company, user };
  });

  await writeAuditLog({
    req,
    companyId: result.company.id,
    userId: result.user.id,
    action: "auth.register",
    entityType: "Company",
    entityId: result.company.id,
  });

  const accessToken = signAccessToken({
    sub: result.user.id,
    companyId: result.company.id,
    role: result.user.role,
    email: result.user.email,
  });
  const refreshToken = await issueRefreshToken(result.user.id, req.ip);
  setAuthCookies(res, accessToken, refreshToken);

  res.status(201).json({
    accessToken,
    refreshToken,
    user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role },
    company: { id: result.company.id, name: result.company.name },
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  totpToken: z.string().optional(),
});

authRouter.post("/login", async (req, res) => {
  const body = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });

  // Bewusst generische Fehlermeldung (kein User-Enumeration-Leak).
  const genericError = () => new HttpError(401, "E-Mail oder Passwort ist falsch");

  if (!user || !user.isActive) throw genericError();

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new HttpError(423, "Konto vorübergehend gesperrt. Bitte später erneut versuchen.");
  }

  const passwordOk = await verifyPassword(user.passwordHash, body.password);
  if (!passwordOk) {
    const failedLoginCount = user.failedLoginCount + 1;
    const lockedUntil =
      failedLoginCount >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount, lockedUntil } });
    await writeAuditLog({ req, companyId: user.companyId, userId: user.id, action: "auth.login_failed", entityType: "User", entityId: user.id });
    throw genericError();
  }

  if (user.totpEnabled) {
    if (!body.totpToken) {
      return res.status(401).json({ error: "2FA-Code erforderlich", requiresTotp: true });
    }
    if (!user.totpSecret || !verifyTotpToken(user.totpSecret, body.totpToken)) {
      throw new HttpError(401, "2FA-Code ungültig");
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const accessToken = signAccessToken({ sub: user.id, companyId: user.companyId, role: user.role, email: user.email });
  const refreshToken = await issueRefreshToken(user.id, req.ip);
  setAuthCookies(res, accessToken, refreshToken);

  await writeAuditLog({ req, companyId: user.companyId, userId: user.id, action: "auth.login", entityType: "User", entityId: user.id });

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, locale: user.locale },
  });
});

// refreshToken im Body ist optional, da das Web-Frontend den Refresh-Token gar nicht
// mehr kennt (httpOnly-Cookie) und ihn automatisch über den Cookie mitschickt - der
// Body bleibt für Skripte/externe Integrationen ohne Cookie-Unterstützung nutzbar.
const refreshSchema = z.object({ refreshToken: z.string().optional() });

authRouter.post("/refresh", async (req, res) => {
  const body = refreshSchema.parse(req.body);
  const rawToken = body.refreshToken ?? getRefreshTokenCookie(req.cookies);
  if (!rawToken) throw new HttpError(401, "Kein Refresh-Token vorhanden");
  const result = await rotateRefreshToken(rawToken, req.ip);
  if (!result) {
    clearAuthCookies(res);
    throw new HttpError(401, "Refresh-Token ungültig oder abgelaufen");
  }
  const { user, newRefreshToken } = result;
  const accessToken = signAccessToken({ sub: user.id, companyId: user.companyId, role: user.role, email: user.email });
  setAuthCookies(res, accessToken, newRefreshToken);
  res.json({ accessToken, refreshToken: newRefreshToken });
});

authRouter.post("/logout", async (req, res) => {
  const body = refreshSchema.parse(req.body);
  const rawToken = body.refreshToken ?? getRefreshTokenCookie(req.cookies);
  if (rawToken) await revokeRefreshToken(rawToken);
  clearAuthCookies(res);
  res.status(204).send();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub } });
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    locale: user.locale,
    totpEnabled: user.totpEnabled,
    companyId: user.companyId,
  });
});

// Selbstauskunft nach Art. 15 DSGVO für den eigenen Benutzer-Account (Login-Daten,
// Rollen/Rechte, eigene Aktivität) - ergänzt die bereits vorhandene kundenbezogene
// Auskunft (customers/:id/gdpr-export), die andere personenbezogene Daten betrifft.
// Enthält bewusst KEINE Passwort-Hashes/TOTP-Secrets, auch nicht verschlüsselt.
authRouter.get("/me/export", requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub } });
  const auditLog = await prisma.auditLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, action: true, entityType: true, entityId: true, ipAddress: true, createdAt: true },
  });
  await writeAuditLog({ req, companyId: user.companyId, userId: user.id, action: "auth.self_export", entityType: "User", entityId: user.id });
  res.setHeader("Content-Disposition", `attachment; filename="dsgvo-export-benutzerkonto.json"`);
  res.json({
    account: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      locale: user.locale,
      isActive: user.isActive,
      totpEnabled: user.totpEnabled,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    },
    activityLog: auditLog,
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(10),
});

// Passwort selbst ändern (angemeldet, mit Kenntnis des aktuellen Passworts) - der normale
// Weg für den täglichen Gebrauch. Für den Fall, dass jemand sein Passwort komplett
// vergessen hat, siehe POST /users/:id/reset-password (nur für Admins, siehe users/router.ts).
authRouter.post("/change-password", requireAuth, async (req, res) => {
  const body = changePasswordSchema.parse(req.body);
  if (!isPasswordStrongEnough(body.newPassword)) {
    throw new HttpError(400, "Neues Passwort zu schwach (mind. 10 Zeichen, Buchstaben und Ziffern)");
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub } });
  const currentOk = await verifyPassword(user.passwordHash, body.currentPassword);
  if (!currentOk) throw new HttpError(401, "Aktuelles Passwort ist falsch");

  const passwordHash = await hashPassword(body.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  // Alle anderen angemeldeten Geräte/Sitzungen abmelden - nur diese Sitzung bleibt aktiv,
  // da sie das neue Passwort ja gerade erst gesetzt hat.
  await revokeAllUserTokens(user.id);
  const accessToken = signAccessToken({ sub: user.id, companyId: user.companyId, role: user.role, email: user.email });
  const refreshToken = await issueRefreshToken(user.id, req.ip);
  setAuthCookies(res, accessToken, refreshToken);
  await writeAuditLog({ req, companyId: user.companyId, userId: user.id, action: "auth.change_password", entityType: "User", entityId: user.id });
  res.json({ ok: true, accessToken, refreshToken });
});

// ---------- Passwort vergessen (Link per E-Mail über das SMTP-Postfach der Firma) ----------

const RESET_TTL_MINUTES = 60;
const forgotSchema = z.object({ email: z.string().email() });

// Antwortet IMMER gleich (kein Hinweis, ob die Adresse existiert) und versendet im Hintergrund,
// damit auch die Antwortzeit nichts verrät. Ohne eingerichtetes SMTP kann keine Mail gesendet werden -
// dann hilft der Notfall-Weg per Server-Befehl (siehe INSTALL.md) oder ein Admin unter Benutzer.
authRouter.post("/forgot-password", forgotPasswordRateLimiter, async (req, res) => {
  const body = forgotSchema.parse(req.body);
  res.json({ ok: true, message: "Falls ein Konto mit dieser Adresse existiert und E-Mail-Versand eingerichtet ist, wurde ein Link zum Zurücksetzen gesendet." });

  void (async () => {
    try {
      const user = await prisma.user.findUnique({ where: { email: body.email }, include: { company: true } });
      if (!user || !user.isActive) return;
      if (!isSmtpConfigured(user.company)) {
        logger.warn({ userId: user.id }, "Passwort-vergessen angefragt, aber kein SMTP eingerichtet");
        return;
      }
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      const raw = crypto.randomBytes(32).toString("base64url");
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha256Hex(raw), expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000) },
      });
      const link = `${env.PUBLIC_APP_URL.replace(/\/$/, "")}/reset-password?token=${raw}`;
      await sendMailForCompany(user.company, {
        to: user.email,
        subject: "Passwort zurücksetzen",
        text: `Hallo ${user.name},

für Ihr Konto wurde das Zurücksetzen des Passworts angefordert. Über diesen Link können Sie ein neues Passwort vergeben (gültig ${RESET_TTL_MINUTES} Minuten, nur einmal verwendbar):

${link}

Haben Sie das nicht angefordert, können Sie diese E-Mail ignorieren - Ihr Passwort bleibt unverändert.`,
      });
      await writeAuditLog({ req, companyId: user.companyId, userId: user.id, action: "auth.forgot_password", entityType: "User", entityId: user.id });
    } catch (err: any) {
      logger.warn({ err: err.message }, "Passwort-vergessen-Mail konnte nicht gesendet werden");
    }
  })();
});

const resetSchema = z.object({ token: z.string().min(20), newPassword: z.string().min(10) });

authRouter.post("/reset-password", resetPasswordRateLimiter, async (req, res) => {
  const body = resetSchema.parse(req.body);
  if (!isPasswordStrongEnough(body.newPassword)) {
    throw new HttpError(400, "Passwort zu schwach (mind. 10 Zeichen, Buchstaben und Ziffern)");
  }
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256Hex(body.token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) {
    throw new HttpError(400, "Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an.");
  }
  const passwordHash = await hashPassword(body.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } }),
  ]);
  await revokeAllUserTokens(record.userId);
  await writeAuditLog({ req, companyId: record.user.companyId, userId: record.userId, action: "auth.reset_password", entityType: "User", entityId: record.userId });
  res.json({ ok: true });
});

// ---------- Zwei-Faktor-Authentifizierung (TOTP, optional) ----------

authRouter.post("/2fa/setup", requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub } });
  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret);
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: encrypted, totpEnabled: false } });
  const otpUrl = buildOtpAuthUrl(secret, user.email);
  const qrDataUrl = await QRCode.toDataURL(otpUrl);
  res.json({ secret, otpUrl, qrDataUrl });
});

const confirm2faSchema = z.object({ token: z.string().length(6) });

authRouter.post("/2fa/confirm", requireAuth, async (req, res) => {
  const body = confirm2faSchema.parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub } });
  if (!user.totpSecret) throw new HttpError(400, "2FA wurde noch nicht eingerichtet");
  if (!verifyTotpToken(user.totpSecret, body.token)) throw new HttpError(400, "Code ungültig");
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  await writeAuditLog({ req, companyId: user.companyId, userId: user.id, action: "auth.2fa_enabled", entityType: "User", entityId: user.id });
  res.json({ ok: true });
});

const disable2faSchema = z.object({ currentPassword: z.string() });

// Verlangt bewusst das aktuelle Passwort - sonst könnte eine gestohlene/vergessene
// angemeldete Sitzung allein den 2FA-Schutz abschalten, ohne dass jemand das
// Passwort kennen muss.
authRouter.post("/2fa/disable", requireAuth, async (req, res) => {
  const body = disable2faSchema.parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub } });
  const passwordOk = await verifyPassword(user.passwordHash, body.currentPassword);
  if (!passwordOk) throw new HttpError(401, "Aktuelles Passwort ist falsch");
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
  await writeAuditLog({ req, companyId: user.companyId, userId: user.id, action: "auth.2fa_disabled", entityType: "User", entityId: user.id });
  res.json({ ok: true });
});
