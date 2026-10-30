import { prisma } from "../../db/prisma";
import { logger } from "../../utils/logger";
import { isSmtpConfigured, sendMailForCompany } from "../email/mailer";

/**
 * Benachrichtigungen zu Druckern: Jede Meldung landet in der Meldungsliste der App (Startseite) und - wenn eingeschaltet -
 * zusätzlich als E-Mail über das SMTP-Postfach der Firma. Die Einstellungen liegen in der Tabelle Setting (ein JSON-Wert).
 */

export type NotificationType = "PRINT_FINISHED" | "PRINT_FAILED" | "PRINTER_ERROR";

export interface NotifySettings {
  email: string;
  byMail: boolean;
  onFinish: boolean;
  onFail: boolean;
  onError: boolean;
}

const KEY = "notifySettings";
export const DEFAULT_SETTINGS: NotifySettings = { email: "", byMail: false, onFinish: true, onFail: true, onError: true };

export async function getNotifySettings(companyId: string): Promise<NotifySettings> {
  const row = await prisma.setting.findUnique({ where: { companyId_key: { companyId, key: KEY } } });
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<NotifySettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveNotifySettings(companyId: string, s: NotifySettings): Promise<void> {
  await prisma.setting.upsert({
    where: { companyId_key: { companyId, key: KEY } },
    create: { companyId, key: KEY, value: JSON.stringify(s) },
    update: { value: JSON.stringify(s) },
  });
}

export const isEnabled = (type: NotificationType, s: NotifySettings) => (type === "PRINT_FINISHED" ? s.onFinish : type === "PRINT_FAILED" ? s.onFail : s.onError);

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}

/** Fehlercode des Druckers wie in der Bambu-Wiki angegeben, z.B. 0300-4000. */
export function formatErrorCode(code: number): string {
  const h = code.toString(16).toUpperCase().padStart(8, "0");
  return `${h.slice(0, 4)}-${h.slice(4)}`;
}

export interface PrinterEvent {
  type: NotificationType;
  printerId: string;
  printerName: string;
  jobName: string | null;
  minutes?: number;
  errorCode?: number;
  materialUsage?: { name: string; grams: number }[];
}

export function buildMessage(e: PrinterEvent): { title: string; body: string } {
  const job = e.jobName ? `"${e.jobName}"` : "Druck";
  const usage = e.materialUsage && e.materialUsage.length > 0 ? ` Verbrauch: ${e.materialUsage.map((u) => `${u.name} ${Math.round(u.grams)} g`).join(", ")}.` : "";
  if (e.type === "PRINT_FINISHED") return { title: `${e.printerName}: ${job} ist fertig`, body: `Der Druck ${job} auf ${e.printerName} ist fertig${e.minutes ? ` (Dauer ${formatDuration(e.minutes)})` : ""}.${usage}` };
  if (e.type === "PRINT_FAILED") return { title: `${e.printerName}: ${job} fehlgeschlagen`, body: `Der Druck ${job} auf ${e.printerName} ist fehlgeschlagen${e.minutes ? ` (nach ${formatDuration(e.minutes)})` : ""}. Bitte am Drucker nachsehen.${usage}` };
  return { title: `${e.printerName}: Drucker meldet einen Fehler`, body: `${e.printerName} meldet beim Druck ${job} den Fehler ${e.errorCode !== undefined ? formatErrorCode(e.errorCode) : ""}. Der Druck ist vermutlich angehalten - bitte am Drucker nachsehen (Bedeutung des Codes in der Bambu-Wiki).` };
}

/** Meldung anlegen und je nach Einstellung per E-Mail verschicken. Fehler beim Mailversand werden nur protokolliert. */
export async function notifyPrinterEvent(companyId: string, event: PrinterEvent): Promise<void> {
  const settings = await getNotifySettings(companyId);
  if (!isEnabled(event.type, settings)) return;
  const { title, body } = buildMessage(event);
  await prisma.notification.create({ data: { companyId, type: event.type, title, body, printerId: event.printerId } });
  if (!settings.byMail || !settings.email) return;
  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || !isSmtpConfigured(company)) {
      logger.warn({ companyId }, "Benachrichtigung per E-Mail nicht möglich: SMTP ist nicht eingerichtet");
      return;
    }
    await sendMailForCompany(company, { to: settings.email, subject: title, text: `${body}\n\nDiese Nachricht kommt automatisch von Ihrer Rechnungssoftware.` });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Benachrichtigung per E-Mail fehlgeschlagen");
  }
}
