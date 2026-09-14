import rateLimit from "express-rate-limit";
import { env } from "../config/env";

// Allgemeines API-Limit gegen Missbrauch/DoS auf Anwendungsebene.
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Anfragen. Bitte später erneut versuchen." },
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
