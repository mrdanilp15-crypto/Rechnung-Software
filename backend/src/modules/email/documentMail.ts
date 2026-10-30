import { z } from "zod";
import type { Company, Customer } from "@prisma/client";
import { HttpError } from "../../middleware/errorHandler";
import { buildInvoiceEmailText, sendMailForCompany } from "./mailer";

/**
 * Versand eines Belegs (Angebot, Auftragsbestätigung, Lieferschein) per E-Mail mit dem PDF im Anhang - über das SMTP-Postfach
 * der Firma, genau wie bei Rechnungen. "Fertigstellen" allein verschickt nichts; erst dieser Aufruf sendet die E-Mail.
 */

export const sendDocumentEmailSchema = z.object({
  to: z.string().trim().email().optional(),
  subject: z.string().trim().max(200).optional(),
  message: z.string().max(5000).optional(),
  /** Kopie der E-Mail an die eigene Absenderadresse */
  copyToSelf: z.boolean().optional(),
});

export async function sendDocumentEmail(params: {
  company: Company;
  customer: Pick<Customer, "name" | "contactName" | "email">;
  body: z.infer<typeof sendDocumentEmailSchema>;
  locale: "de" | "en";
  /** Bezeichnung im Satz "anbei erhalten Sie ..." und im Betreff */
  sentence: { de: string; en: string };
  subject: { de: string; en: string };
  number: string;
  pdf: Buffer;
}): Promise<string> {
  const to = params.body.to || params.customer.email;
  if (!to) throw new HttpError(400, "Keine E-Mail-Adresse hinterlegt. Bitte beim Kunden eine E-Mail-Adresse eintragen oder eine Empfängeradresse angeben.");
  const text =
    params.body.message ||
    buildInvoiceEmailText({
      customerName: params.customer.contactName || params.customer.name,
      companyName: params.company.name,
      documentLabel: params.sentence[params.locale],
      documentNumber: params.number,
      locale: params.locale,
    });
  await sendMailForCompany(params.company, {
    to,
    bcc: params.body.copyToSelf ? params.company.smtpFromEmail || params.company.smtpUser || undefined : undefined,
    subject: params.body.subject || `${params.subject[params.locale]} ${params.number}`,
    text,
    attachments: [{ filename: `${params.number}.pdf`, content: params.pdf, contentType: "application/pdf" }],
  });
  return to;
}
