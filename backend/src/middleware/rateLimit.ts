import rateLimit from "express-rate-limit";
import { env } from "../config/env";

// Allgemeines API-Limit gegen Missbrauch/DoS auf Anwendungsebene.
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Die Live-Vorschau im Rechnungseditor sendet beim Tippen viele Anfragen - sie hat ein eigenes Limit
  skip: (req) => req.path.endsWith("/preview-pdf"),
  message: { error: "Zu viele Anfragen. Bitte später erneut versuchen." },
});

// Eigenes, großzügigeres Limit für die Live-Vorschau (PDF-Rendering ist aber teurer als ein normaler Request).
export const previewRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX * 4,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Vorschau-Anfragen. Bitte kurz warten." },
});

// "Passwort vergessen": zählt ALLE Anfragen (auch erfolgreiche), sonst ließe sich über die Firma-SMTP-Adresse Mail-Spam auslösen.
export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anfragen. Bitte in einer Stunde erneut versuchen." },
});

export const resetPasswordRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Versuche. Bitte in einer Stunde erneut versuchen." },
});

// Strengeres Limit für Login/Registrierung gegen Brute-Force-Angriffe.
export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Zu viele Anmeldeversuche. Bitte später erneut versuchen." },
});
