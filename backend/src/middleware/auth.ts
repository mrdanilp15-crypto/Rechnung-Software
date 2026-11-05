import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "../modules/auth/tokens";
import { getAccessTokenCookie } from "../modules/auth/cookies";
import { prisma } from "../db/prisma";
import { apiKeyPolicy, hashApiKey, looksLikeApiKey } from "../modules/apikeys/keys";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
      requestId?: string;
    }
  }
}

// Akzeptiert den Access-Token entweder aus dem httpOnly-Cookie (Web-Frontend, siehe
// modules/auth/cookies.ts) ODER aus einem "Authorization: Bearer ..."-Header (Skripte/
// externe API-Integrationen, siehe docs/API.md) - das Cookie ist der primäre, sicherere
// Weg für den Browser, der Header bleibt für nicht-browserbasierte Aufrufer nutzbar.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  // API-Schlüssel (hp_...): eigene Prüfung mit eng begrenzten Rechten (siehe modules/apikeys/keys.ts)
  if (bearer && looksLikeApiKey(bearer)) {
    try {
      const key = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(bearer) } });
      if (!key) return res.status(401).json({ error: "API-Schlüssel ungültig oder widerrufen" });
      const policy = apiKeyPolicy(req.method, req.baseUrl, key.scope);
      if (!policy.ok) return res.status(policy.status).json({ error: policy.error });
      // als Mitarbeiter ohne Verwaltungsrechte; Audit-Log und Zuständigkeiten erkennen "apikey:" (kein Benutzer)
      req.auth = { sub: `apikey:${key.id}`, companyId: key.companyId, role: "MITARBEITER", email: `api-key:${key.name}` };
      if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
        void prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
      }
      return next();
    } catch {
      return res.status(500).json({ error: "API-Schlüssel konnte nicht geprüft werden" });
    }
  }

  const token = bearer ?? getAccessTokenCookie(req.cookies);
  if (!token) {
    return res.status(401).json({ error: "Nicht authentifiziert" });
  }
  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Token ungültig oder abgelaufen" });
  }
}

export function requireRole(...roles: Array<"ADMIN" | "MITARBEITER" | "BUCHHALTUNG">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Nicht authentifiziert" });
    if (!roles.includes(req.auth.role as any)) {
      return res.status(403).json({ error: "Keine Berechtigung für diese Aktion" });
    }
    next();
  };
}
