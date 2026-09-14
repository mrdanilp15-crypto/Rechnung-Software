import { Router } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "../../db/prisma";
import { hashPassword, verifyPassword, isPasswordStrongEnough } from "./password";
import { signAccessToken, issueRefreshToken, rotateRefreshToken, revokeRefreshToken } from "./tokens";
import { generateTotpSecret, encryptTotpSecret, buildOtpAuthUrl, verifyTotpToken } from "./twoFactor";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";

export const authRouter = Router();

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

const registerSchema = z.object({
  companyName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(10),
  locale: z.enum(["de", "en"]).default("de"),
});

// Registrierung legt eine neue Firma (Mandant) samt erstem Admin-Benutzer an.
authRouter.post("/register", async (req, res) => {
  const body = registerSchema.parse(req.body);
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

  await writeAuditLog({ req, companyId: user.companyId, userId: user.id, action: "auth.login", entityType: "User", entityId: user.id });

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, locale: user.locale },
  });
});

const refreshSchema = z.object({ refreshToken: z.string() });

authRouter.post("/refresh", async (req, res) => {
  const body = refreshSchema.parse(req.body);
  const result = await rotateRefreshToken(body.refreshToken, req.ip);
  if (!result) throw new HttpError(401, "Refresh-Token ungültig oder abgelaufen");
  const { user, newRefreshToken } = result;
  const accessToken = signAccessToken({ sub: user.id, companyId: user.companyId, role: user.role, email: user.email });
  res.json({ accessToken, refreshToken: newRefreshToken });
});

authRouter.post("/logout", async (req, res) => {
  const body = refreshSchema.parse(req.body);
  await revokeRefreshToken(body.refreshToken);
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

authRouter.post("/2fa/disable", requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub } });
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
  await writeAuditLog({ req, companyId: user.companyId, userId: user.id, action: "auth.2fa_disabled", entityType: "User", entityId: user.id });
  res.json({ ok: true });
});
