import nodemailer from "nodemailer";
import type { Company } from "@prisma/client";
import { decryptField } from "../../utils/crypto";
import { HttpError } from "../../middleware/errorHandler";
import { logger } from "../../utils/logger";

/**
 * E-Mail-Versand mit den SMTP-Zugangsdaten der jeweiligen Firma (kein zentraler,
 * gemeinsamer Mailserver - jede Firma bringt ihr eigenes Postfach mit, siehe
 * modules/companies/router.ts, Abschnitt SMTP-Einstellungen).
 *
 * "Zustell-Status": Wir können ehrlich nur feststellen, ob die Übergabe an den SMTP-
 * Server der Firma erfolgreich war (kein Verbindungs-/Auth-Fehler) - keine echte
 * Lesebestätigung oder Zustellgarantie beim Empfänger. Das entspricht dem, was ohne
 * einen spezialisierten Transaktions-E-Mail-Anbieter mit Webhook-API realistisch ist.
 */

export interface SendMailParams {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export function isSmtpConfigured(company: Pick<Company, "smtpHost" | "smtpUser" | "smtpPasswordEncrypted">): boolean {
  return Boolean(company.smtpHost && company.smtpUser && company.smtpPasswordEncrypted);
}

export async function sendMailForCompany(company: Company, params: SendMailParams): Promise<void> {
  if (!isSmtpConfigured(company)) {
    throw new HttpError(
      400,
      "Kein E-Mail-Versand eingerichtet. Bitte SMTP-Zugangsdaten unter Einstellungen → E-Mail-Versand hinterlegen, oder die Rechnung als PDF herunterladen und manuell versenden."
    );
  }

  const password = decryptField(company.smtpPasswordEncrypted!);
  const transporter = nodemailer.createTransport({
    host: company.smtpHost!,
    port: company.smtpPort ?? 587,
    secure: company.smtpSecure,
    auth: { user: company.smtpUser!, pass: password },
  });

  const fromAddress = company.smtpFromEmail || company.smtpUser!;
  const fromName = company.smtpFromName || company.name;

  try {
    await transporter.sendMail({
      from: `"${fromName.replace(/"/g, "")}" <${fromAddress}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
      attachments: params.attachments,
    });
  } catch (err: any) {
    logger.warn({ err: err.message, companyId: company.id }, "E-Mail-Versand fehlgeschlagen");
    throw new HttpError(502, `E-Mail-Versand fehlgeschlagen: ${err.message}. Bitte SMTP-Zugangsdaten prüfen oder die Rechnung als PDF herunterladen.`);
  }
}

export function buildInvoiceEmailText(params: {
  customerName: string;
  companyName: string;
  documentLabel: string;
  documentNumber: string;
  locale: "de" | "en";
}): string {
  if (params.locale === "en") {
    return `Hello ${params.customerName},\n\nplease find attached the ${params.documentLabel} ${params.documentNumber}.\n\nBest regards\n${params.companyName}`;
  }
  return `Hallo ${params.customerName},\n\nanbei erhalten Sie ${params.documentLabel} ${params.documentNumber}.\n\nMit freundlichen Grüßen\n${params.companyName}`;
}

export function buildReminderEmailText(params: {
  customerName: string;
  companyName: string;
  invoiceNumber: string;
  totalFormatted: string;
  dueDateFormatted?: string;
  reminderLevel: number;
}): string {
  const intro =
    params.reminderLevel <= 1
      ? `wir möchten Sie freundlich daran erinnern, dass die Rechnung ${params.invoiceNumber} über ${params.totalFormatted} noch offen ist.`
      : `leider ist die Rechnung ${params.invoiceNumber} über ${params.totalFormatted} weiterhin unbeglichen. Wir bitten um zeitnahen Ausgleich.`;
  return `Hallo ${params.customerName},\n\n${intro}${
    params.dueDateFormatted ? ` Das Zahlungsziel war der ${params.dueDateFormatted}.` : ""
  }\n\nSollten Sie bereits gezahlt haben, betrachten Sie diese Nachricht bitte als gegenstandslos.\n\nMit freundlichen Grüßen\n${params.companyName}`;
}
