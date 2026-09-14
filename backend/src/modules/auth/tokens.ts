import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../../config/env";
import { sha256Hex } from "../../utils/crypto";
import { prisma } from "../../db/prisma";

export interface AccessTokenPayload {
  sub: string; // userId
  companyId: string;
  role: string;
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

/**
 * Refresh-Tokens sind zufällige, undurchsichtige Strings (kein JWT).
 * In der Datenbank wird nur der SHA-256-Hash gespeichert (rotierend, mit
 * Revocation-Unterstützung), sodass ein DB-Leak allein keine gültigen
 * Tokens preisgibt.
 */
export async function issueRefreshToken(userId: string, ip?: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString("base64url");
  const tokenHash = sha256Hex(raw);
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt, createdByIp: ip },
  });
  return raw;
}

export async function rotateRefreshToken(rawToken: string, ip?: string) {
  const tokenHash = sha256Hex(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
    return null;
  }
  const newRaw = await issueRefreshToken(existing.userId, ip);
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), replacedBy: sha256Hex(newRaw) },
  });
  return { user: existing.user, newRefreshToken: newRaw };
}

export async function revokeRefreshToken(rawToken: string) {
  const tokenHash = sha256Hex(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserTokens(userId: string) {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
