import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { env } from "../config/env";
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
  // Datei-Uploads (Logo, Stempel, CSV ...): verständliche Meldung statt "Interner Serverfehler"
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: `Die Datei ist zu groß (maximal ${env.MAX_UPLOAD_MB} MB).` });
    return res.status(400).json({ error: "Die Datei konnte nicht verarbeitet werden." });
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
