import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "../modules/auth/tokens";
import { getAccessTokenCookie } from "../modules/auth/cookies";

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
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : getAccessTokenCookie(req.cookies);
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
