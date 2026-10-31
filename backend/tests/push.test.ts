import { describe, it, expect } from "vitest";
import webpush from "web-push";
import { deliverPush, type StoredSubscription } from "../src/modules/notifications/push";

const sub = (id: string): StoredSubscription => ({ id, endpoint: `https://push.example/${id}`, p256dh: "p", auth: "a" });

describe("Push-Nachrichten", () => {
  it("schickt die Nachricht als JSON an alle Geräte", async () => {
    const seen: { endpoint: string; body: string }[] = [];
    const r = await deliverPush([sub("1"), sub("2")], { title: "Fertig", body: "Druck fertig", url: "/" }, async (s, body) => { seen.push({ endpoint: s.endpoint, body }); });
    expect(r).toEqual({ sent: 2, expiredIds: [] });
    expect(JSON.parse(seen[0].body)).toEqual({ title: "Fertig", body: "Druck fertig", url: "/" });
  });
  it("meldet erloschene Abos (404/410) zum Löschen zurück, andere Fehler nicht", async () => {
    const r = await deliverPush([sub("gone"), sub("slow"), sub("ok")], { title: "t", body: "b" }, async (s) => {
      if (s.endpoint.endsWith("gone")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      if (s.endpoint.endsWith("slow")) throw Object.assign(new Error("Timeout"), { statusCode: 500 });
    });
    expect(r.sent).toBe(1);
    expect(r.expiredIds).toEqual(["gone"]);
  });
  it("erzeugt gültige VAPID-Schlüssel und verschlüsselt eine Nachricht für ein Abo", async () => {
    const keys = webpush.generateVAPIDKeys();
    expect(keys.publicKey.length).toBeGreaterThan(60);
    // Ein echtes Browser-Abo besteht aus einem P-256-Schlüssel und einem Auth-Geheimnis - hier lokal erzeugt
    const ecdh = (await import("crypto")).createECDH("prime256v1");
    ecdh.generateKeys();
    const details = webpush.generateRequestDetails(
      { endpoint: "https://push.example/abc", keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: Buffer.from("0123456789abcdef").toString("base64url") } },
      JSON.stringify({ title: "x" }),
      { vapidDetails: { subject: "mailto:a@example.com", publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 60 },
    );
    expect(details.headers.Authorization).toMatch(/^vapid /);
    expect(details.headers["Content-Encoding"]).toBe("aes128gcm");
    expect((details.body as Buffer).length).toBeGreaterThan(20);
  });
});
