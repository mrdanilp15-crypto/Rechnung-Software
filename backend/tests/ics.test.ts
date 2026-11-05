import { describe, it, expect } from "vitest";
import { buildIcs, escapeIcs, foldLine } from "../src/modules/calendar/ics";
import { checkWebhookUrl } from "../src/modules/webhooks/url";

const now = new Date("2026-11-10T08:00:00Z");

describe("Kalenderfeed", () => {
  it("maskiert Sonderzeichen", () => {
    expect(escapeIcs("A, B; C\\D\nE")).toBe("A\\, B\\; C\\\\D\\nE");
  });
  it("erzeugt gültige ganztägige Termine mit CRLF und stabiler UID", () => {
    const ics = buildIcs([{ uid: "order-1", date: new Date("2026-11-12T00:00:00Z"), title: "Liefertermin AB-1 (Max)", url: "https://app.example.de/orders/1" }], "Betrieb", now);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:order-1@rechnungssoftware");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261112");
    expect(ics).toContain("DTEND;VALUE=DATE:20261113");
    expect(ics).toContain("DTSTAMP:20261110T080000Z");
    expect(ics).toContain("SUMMARY:Liefertermin AB-1 (Max)");
    expect(ics).not.toMatch(/[^\r]\n/); // nur CRLF
  });
  it("Monatsende: Ende ist der erste des Folgemonats", () => {
    expect(buildIcs([{ uid: "x", date: new Date("2026-11-30T00:00:00Z"), title: "t" }], "c", now)).toContain("DTEND;VALUE=DATE:20261201");
  });
  it("faltet lange Zeilen nach 75 Bytes, auch mit Umlauten, ohne Zeichen zu zerreißen", () => {
    const long = "SUMMARY:" + "ä".repeat(60);
    const folded = foldLine(long);
    for (const part of folded.split("\r\n")) expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(long);
  });
});

describe("Webhook-Adresse", () => {
  it("erlaubt http/https auch im Heimnetz", () => {
    expect(checkWebhookUrl("https://hooks.example.de/abc")).toEqual({ ok: true });
    expect(checkWebhookUrl("http://192.168.178.20:5678/webhook/x")).toEqual({ ok: true });
  });
  it("sperrt fremde Protokolle, Zugangsdaten und Metadaten-Adressen", () => {
    expect(checkWebhookUrl("ftp://x.de")).toMatchObject({ ok: false });
    expect(checkWebhookUrl("https://user:pw@x.de")).toMatchObject({ ok: false });
    expect(checkWebhookUrl("http://169.254.169.254/latest/meta-data")).toMatchObject({ ok: false });
    expect(checkWebhookUrl("nicht-eine-adresse")).toMatchObject({ ok: false });
  });
});
