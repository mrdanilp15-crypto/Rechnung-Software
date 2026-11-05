import { describe, it, expect } from "vitest";
import { buildChecks, buildSetup, isLocalUrl, type ChecksInput } from "../src/modules/system/checks";

const now = new Date("2026-11-10T10:00:00Z");
const base: ChecksInput = {
  now, smtpConfigured: true, smtpUser: "a@b.de", failedMails: 0, printers: [{ name: "P1S", connection: "online", message: null }], pushSubscriptions: 1,
  publicUrl: "https://app.example.de", backup: { enabled: true, intervalHours: 24, lastAt: new Date(now.getTime() - 5 * 3_600_000), s3: true }, freeDiskBytes: 50 * 1024 ** 3,
};
const by = (c: ReturnType<typeof buildChecks>, id: string) => c.find((x) => x.id === id)!;

describe("Verbindungen", () => {
  it("alles in Ordnung -> alles grün", () => {
    expect(buildChecks(base).every((c) => c.state === "ok")).toBe(true);
  });
  it("erkennt localhost als nicht brauchbar für QR-Codes", () => {
    expect(isLocalUrl("http://localhost:5173")).toBe(true);
    expect(isLocalUrl("https://app.example.de")).toBe(false);
    expect(by(buildChecks({ ...base, publicUrl: "http://localhost:5173" }), "public-url").state).toBe("warn");
    expect(by(buildChecks({ ...base, publicUrl: "http://192.168.1.5:8080" }), "public-url").detail).toContain("HTTPS");
  });
  it("E-Mail: nicht eingerichtet = Warnung, fehlgeschlagene Mails = Fehler", () => {
    expect(by(buildChecks({ ...base, smtpConfigured: false }), "email").state).toBe("warn");
    expect(by(buildChecks({ ...base, failedMails: 2 }), "email").state).toBe("error");
  });
  it("Drucker: offline = Fehler, verbindet = Warnung, keiner = aus", () => {
    expect(by(buildChecks({ ...base, printers: [{ name: "X", connection: "offline", message: null }] }), "printer-X").state).toBe("error");
    expect(by(buildChecks({ ...base, printers: [{ name: "X", connection: "connecting", message: null }] }), "printer-X").state).toBe("warn");
    expect(by(buildChecks({ ...base, printers: [] }), "printers").state).toBe("off");
  });
  it("Backup: zu alt = Fehler, keines = Warnung, nur lokal wird erwähnt", () => {
    const old = new Date(now.getTime() - 100 * 3_600_000);
    expect(by(buildChecks({ ...base, backup: { ...base.backup, lastAt: old } }), "backup").state).toBe("error");
    expect(by(buildChecks({ ...base, backup: { ...base.backup, lastAt: null } }), "backup").state).toBe("warn");
    expect(by(buildChecks({ ...base, backup: { ...base.backup, s3: false } }), "backup").detail).toContain("nur auf diesem Server");
  });
  it("Speicherplatz: unter 1 GB = Fehler", () => {
    expect(by(buildChecks({ ...base, freeDiskBytes: 0.5 * 1024 ** 3 }), "disk").state).toBe("error");
  });
  it("Einrichtungs-Checkliste übernimmt die Flags", () => {
    const s = buildSetup({ companyDataComplete: true, hasBank: false, hasLogo: false, smtpConfigured: true, hasPrinter: false, hasProduct: true, hasCustomer: true, hasBackup: false });
    expect(s.filter((x) => x.done).map((x) => x.id)).toEqual(["company", "email", "customer", "product"]);
  });
});
