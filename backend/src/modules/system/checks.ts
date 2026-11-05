/** Verbindungsprüfung und Einrichtungs-Checkliste als reine Logik (testbar); die Daten holt router.ts. */

export type State = "ok" | "warn" | "error" | "off";

export interface Check {
  id: string;
  label: string;
  state: State;
  detail: string;
  /** Wohin der Nutzer zum Beheben/Einrichten kommt (App-Pfad) */
  to?: string;
  /** Vorhandene Testfunktion: "smtp-test" | "backup-run" */
  test?: "smtp-test" | "backup-run";
}

export interface ChecksInput {
  now: Date;
  smtpConfigured: boolean;
  smtpUser: string | null;
  failedMails: number;
  printers: { name: string; connection: string; message: string | null }[];
  pushSubscriptions: number;
  publicUrl: string;
  backup: { enabled: boolean; intervalHours: number; lastAt: Date | null; s3: boolean };
  freeDiskBytes: number | null;
}

const HOUR = 3_600_000;

function ago(from: Date, now: Date): string {
  const h = Math.floor((now.getTime() - from.getTime()) / HOUR);
  if (h < 1) return "vor weniger als einer Stunde";
  if (h < 48) return `vor ${h} ${h === 1 ? "Stunde" : "Stunden"}`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tagen`;
}

export function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".localhost");
  } catch {
    return false;
  }
}

export function buildChecks(i: ChecksInput): Check[] {
  const checks: Check[] = [];

  // E-Mail
  if (!i.smtpConfigured) {
    checks.push({ id: "email", label: "E-Mail-Versand", state: "warn", detail: "Kein Postfach eingerichtet - Belege lassen sich nur als PDF herunterladen, nicht direkt versenden.", to: "/settings?tab=email" });
  } else if (i.failedMails > 0) {
    checks.push({ id: "email", label: "E-Mail-Versand", state: "error", detail: `${i.failedMails} ${i.failedMails === 1 ? "Rechnung konnte" : "Rechnungen konnten"} in den letzten 30 Tagen nicht gesendet werden. Zugangsdaten prüfen.`, to: "/settings?tab=email", test: "smtp-test" });
  } else {
    checks.push({ id: "email", label: "E-Mail-Versand", state: "ok", detail: `Postfach ${i.smtpUser ?? ""} eingerichtet. Mit "Testen" kommt eine Probe-Mail.`.replace("  ", " "), to: "/settings?tab=email", test: "smtp-test" });
  }

  // Drucker
  if (i.printers.length === 0) {
    checks.push({ id: "printers", label: "Drucker-Verbindung", state: "off", detail: "Kein Drucker mit Live-Verbindung eingerichtet (Bambu Lab im LAN). Ohne Verbindung gibt es keinen Live-Status, keine Materialabbuchung und kein \"Druck senden\".", to: "/catalog?tab=printers" });
  } else {
    for (const p of i.printers) {
      const state: State = p.connection === "online" ? "ok" : p.connection === "connecting" ? "warn" : "error";
      const text = p.connection === "online" ? "verbunden" : p.connection === "connecting" ? "verbindet ..." : p.connection === "auth_failed" ? "Zugangscode wird abgelehnt" : p.connection === "offline" ? "nicht erreichbar (ausgeschaltet oder anderes Netz?)" : "Verbindungsfehler";
      checks.push({ id: `printer-${p.name}`, label: `Drucker ${p.name}`, state, detail: p.message && state !== "ok" && p.message.toLowerCase() !== text.toLowerCase() ? `${text} - ${p.message}` : text, to: "/catalog?tab=printers" });
    }
  }

  // Adresse der Software (QR-Codes, Links in Mails)
  if (isLocalUrl(i.publicUrl)) {
    checks.push({ id: "public-url", label: "Adresse der Software", state: "warn", detail: `PUBLIC_APP_URL steht auf ${i.publicUrl}. QR-Codes und Links funktionieren so nur auf diesem Rechner - für Handy-Scans die echte (HTTPS-)Adresse eintragen.` });
  } else if (!i.publicUrl.startsWith("https://")) {
    checks.push({ id: "public-url", label: "Adresse der Software", state: "warn", detail: `${i.publicUrl} ist nicht verschlüsselt (kein HTTPS). Push-Meldungen und die Kamera zum Scannen brauchen HTTPS.` });
  } else {
    checks.push({ id: "public-url", label: "Adresse der Software", state: "ok", detail: i.publicUrl });
  }

  // Push
  if (i.pushSubscriptions > 0) {
    checks.push({ id: "push", label: "Push-Meldungen", state: "ok", detail: `${i.pushSubscriptions} ${i.pushSubscriptions === 1 ? "Gerät angemeldet" : "Geräte angemeldet"}.` });
  } else if (!i.publicUrl.startsWith("https://")) {
    checks.push({ id: "push", label: "Push-Meldungen", state: "off", detail: "Nicht eingerichtet. Braucht eine HTTPS-Adresse; danach auf der Startseite bei \"Meldungen\" aufs Handy aktivieren." });
  } else {
    checks.push({ id: "push", label: "Push-Meldungen", state: "off", detail: "Kein Gerät angemeldet. Auf der Startseite bei \"Meldungen\" lassen sie sich aktivieren.", to: "/#meldungen" });
  }

  // Backup
  const b = i.backup;
  if (!b.lastAt) {
    checks.push({ id: "backup", label: "Backup", state: b.enabled ? "warn" : "error", detail: b.enabled ? "Noch kein Backup vorhanden - das erste läuft nach dem eingestellten Intervall. Mit \"Jetzt sichern\" sofort." : "Automatische Backups sind aus und es gibt noch kein Backup.", test: "backup-run" });
  } else {
    const ageH = (i.now.getTime() - b.lastAt.getTime()) / HOUR;
    const stale = ageH > Math.max(b.intervalHours * 2, 48);
    checks.push({
      id: "backup",
      label: "Backup",
      state: stale ? "error" : !b.enabled ? "warn" : "ok",
      detail: `Letztes Backup ${ago(b.lastAt, i.now)}${b.enabled ? `, automatisch alle ${b.intervalHours} h` : ", automatische Backups sind aus"}${b.s3 ? ", zusätzlich im Cloud-Speicher" : ", nur auf diesem Server (Kopie an anderen Ort empfohlen)"}.`,
      test: "backup-run",
    });
  }

  // Speicherplatz
  if (i.freeDiskBytes !== null) {
    const gb = i.freeDiskBytes / 1024 ** 3;
    checks.push({ id: "disk", label: "Speicherplatz", state: gb < 1 ? "error" : gb < 5 ? "warn" : "ok", detail: `${gb.toLocaleString("de-DE", { maximumFractionDigits: 1 })} GB frei für Belege, Dateien und Backups.` });
  }

  return checks;
}

export interface SetupInput {
  companyDataComplete: boolean;
  hasBank: boolean;
  hasLogo: boolean;
  smtpConfigured: boolean;
  hasPrinter: boolean;
  hasProduct: boolean;
  hasCustomer: boolean;
  hasBackup: boolean;
}

export interface SetupStep {
  id: string;
  label: string;
  done: boolean;
  to: string;
}

export function buildSetup(i: SetupInput): SetupStep[] {
  return [
    { id: "company", label: "Firmendaten und Steuerangaben ausfüllen (Pflicht auf Rechnungen)", done: i.companyDataComplete, to: "/settings?tab=company" },
    { id: "bank", label: "Bankverbindung (IBAN) eintragen", done: i.hasBank, to: "/settings?tab=company" },
    { id: "logo", label: "Logo hochladen", done: i.hasLogo, to: "/settings?tab=branding" },
    { id: "email", label: "E-Mail-Versand einrichten", done: i.smtpConfigured, to: "/settings?tab=email" },
    { id: "customer", label: "Ersten Kunden anlegen", done: i.hasCustomer, to: "/customers" },
    { id: "product", label: "Erstes Produkt mit Kalkulation anlegen", done: i.hasProduct, to: "/catalog?tab=products" },
    { id: "printer", label: "Drucker verbinden (optional)", done: i.hasPrinter, to: "/catalog?tab=printers" },
    { id: "backup", label: "Erstes Backup erstellen", done: i.hasBackup, to: "/settings?tab=verbindungen" },
  ];
}
