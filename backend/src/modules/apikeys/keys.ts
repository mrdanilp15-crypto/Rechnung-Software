import crypto from "crypto";

/**
 * API-Schlüssel für eigene Skripte und Automatisierung. Der Schlüssel hat die Form hp_<48 Hex-Zeichen>; gespeichert wird nur der SHA-256-Hash
 * (der Schlüssel enthält genug Zufall, ein schneller Hash reicht), angezeigt wird er nur einmal bei der Erstellung.
 */

export const API_KEY_PREFIX = "hp_";
export type ApiScope = "READ" | "FULL";

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = API_KEY_PREFIX + crypto.randomBytes(24).toString("hex");
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 7) };
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function looksLikeApiKey(token: string): boolean {
  return /^hp_[0-9a-f]{48}$/.test(token);
}

/** Bereiche, die nie per API-Schlüssel erreichbar sind: Anmeldung/Benutzer, Verwaltung, Sicherung, Einstellungen und alles, was an einen Benutzer gebunden ist. */
const BLOCKED_PREFIXES = ["/api/auth", "/api/api-keys", "/api/users", "/api/backups", "/api/reset", "/api/webhooks", "/api/system", "/api/companies", "/api/notifications", "/api/time", "/api/audit-logs", "/api/calendar"];

export function apiKeyPolicy(method: string, baseUrl: string, scope: string): { ok: true } | { ok: false; status: number; error: string } {
  if (BLOCKED_PREFIXES.some((p) => baseUrl === p || baseUrl.startsWith(p + "/"))) {
    return { ok: false, status: 403, error: "Dieser Bereich ist mit einem API-Schlüssel nicht erreichbar." };
  }
  if (scope !== "FULL" && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    return { ok: false, status: 403, error: "Dieser API-Schlüssel darf nur lesen." };
  }
  return { ok: true };
}
