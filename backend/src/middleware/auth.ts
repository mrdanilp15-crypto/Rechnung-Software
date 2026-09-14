import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "../modules/auth/tokens";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
      requestId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Nicht authentifiziert" });
  }
  const token = header.slice("Bearer ".length);
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
