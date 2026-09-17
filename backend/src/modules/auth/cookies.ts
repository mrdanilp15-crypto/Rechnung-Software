import { Response } from "express";
import jwt from "jsonwebtoken";
import { isProd, env } from "../../config/env";

/**
 * Setzt Access-/Refresh-Token zusätzlich als httpOnly-Cookies, damit das Frontend
 * (SPA) sie nicht mehr selbst in localStorage halten muss - localStorage ist bei einem
 * XSS-Angriff im Klartext auslesbar, ein httpOnly-Cookie dagegen für JavaScript
 * grundsätzlich unsichtbar (siehe docs/SECURITY.md, Abschnitt "Sitzungen (JWT)").
 *
 * Die Tokens werden WEITERHIN zusätzlich im JSON-Response-Body zurückgegeben (nicht nur
 * als Cookie) - das hält die API für nicht-browserbasierte Aufrufer (Skripte, externe
 * Integrationen über Authorization: Bearer, siehe docs/API.md) unverändert nutzbar. Das
 * Frontend selbst nutzt diese Werte aus dem Body nicht mehr für eigene Requests.
 *
 * Cookie-Pfad/SameSite funktionieren hier ohne Cross-Origin-Sonderfälle, weil sowohl in
 * der Produktion (nginx) als auch lokal (Vite-Dev-Proxy, siehe vite.config.ts) die API
 * aus Sicht des Browsers immer unter demselben Origin wie das Frontend erreichbar ist.
 */
const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";

function accessTokenMaxAgeMs(accessToken: string): number {
  const decoded = jwt.decode(accessToken) as { exp?: number } | null;
  if (!decoded?.exp) return 15 * 60 * 1000; // Fallback, sollte nie eintreten
  return Math.max(0, decoded.exp * 1000 - Date.now());
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge: accessTokenMaxAgeMs(accessToken),
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    // Nur an /api/auth/* gesendet (Refresh/Logout) statt an jede Anfrage - reduziert
    // die Angriffsfläche, in der der (mächtigere) Refresh-Token überhaupt übertragen wird.
    path: "/api/auth",
    maxAge: env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}

export function getAccessTokenCookie(cookies: Record<string, string> | undefined): string | undefined {
  return cookies?.[ACCESS_COOKIE];
}

export function getRefreshTokenCookie(cookies: Record<string, string> | undefined): string | undefined {
  return cookies?.[REFRESH_COOKIE];
}
