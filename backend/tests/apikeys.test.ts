import { describe, it, expect } from "vitest";
import { apiKeyPolicy, generateApiKey, hashApiKey, looksLikeApiKey } from "../src/modules/apikeys/keys";

describe("API-Schlüssel", () => {
  it("erzeugt einen zufälligen Schlüssel im festen Format, gespeichert wird nur der Hash", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(looksLikeApiKey(a.key)).toBe(true);
    expect(a.key).not.toBe(b.key);
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).not.toContain(a.key);
    expect(a.prefix).toBe(a.key.slice(0, 7));
  });
  it("erkennt nur gültig geformte Schlüssel (JWTs und Müll nicht)", () => {
    expect(looksLikeApiKey("eyJhbGciOiJIUzI1NiJ9.abc.def")).toBe(false);
    expect(looksLikeApiKey("hp_zz")).toBe(false);
    expect(looksLikeApiKey("hp_" + "g".repeat(48))).toBe(false);
  });
  it("lesender Schlüssel darf nur GET", () => {
    expect(apiKeyPolicy("GET", "/api/invoices", "READ")).toEqual({ ok: true });
    expect(apiKeyPolicy("POST", "/api/invoices", "READ")).toMatchObject({ ok: false, status: 403 });
    expect(apiKeyPolicy("POST", "/api/invoices", "FULL")).toEqual({ ok: true });
  });
  it("Verwaltungsbereiche sind auch mit vollem Schlüssel gesperrt", () => {
    for (const p of ["/api/auth", "/api/users", "/api/backups", "/api/api-keys", "/api/webhooks", "/api/companies", "/api/reset", "/api/time", "/api/notifications"]) {
      expect(apiKeyPolicy("GET", p, "FULL")).toMatchObject({ ok: false, status: 403 });
    }
  });
});
