import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { isProd } from "../config/env";
import { logger } from "../utils/logger";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: "Ressource nicht gefunden" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validierungsfehler", details: err.flatten() });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  logger.error({ err, path: req.path, requestId: req.requestId }, "Unbehandelter Fehler");
  res.status(500).json({
    error: "Interner Serverfehler",
    // Stacktraces nie an den Client ausliefern (Informationsleck).
    ...(isProd ? {} : { debug: err instanceof Error ? err.message : String(err) }),
  });
}
