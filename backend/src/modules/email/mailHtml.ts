/**
 * HTML-Darstellung aller ausgehenden E-Mails: Kopf mit Firmenlogo (als eingebettetes Bild) in der Firmenfarbe, der Nachrichtentext,
 * ein Hinweis auf Anhänge und ein Fuß mit den Firmendaten. Reine Textverarbeitung ohne Abhängigkeiten, damit sie sich testen lässt.
 * Die Text-Fassung der Nachricht bleibt als Alternative erhalten (für Mailprogramme ohne HTML).
 */

export const LOGO_CID = "firmenlogo@rechnungssoftware";

export interface MailBranding {
  name: string;
  legalForm?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  vatId?: string | null;
  taxId?: string | null;
  primaryColor?: string | null;
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const safeColor = (c?: string | null) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#2563eb");

/** Text in Absätze und Zeilenumbrüche umwandeln; Web-Adressen werden anklickbar. Alles andere wird maskiert. */
export function textToHtml(text: string, linkColor: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => {
      const html = escapeHtml(paragraph).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (url) => `<a href="${url}" style="color:${linkColor};word-break:break-all">${url}</a>`);
      return `<p style="margin:0 0 14px;line-height:1.55">${html.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

export function buildMailHtml(branding: MailBranding, text: string, opts: { hasLogo: boolean; attachmentNames?: string[] }): string {
  const color = safeColor(branding.primaryColor);
  const name = escapeHtml(branding.name);
  const header = opts.hasLogo
    ? `<img src="cid:${LOGO_CID}" alt="${name}" style="display:block;max-height:60px;max-width:240px;width:auto;height:auto;border:0">`
    : `<span style="font-size:20px;font-weight:600;color:${color}">${name}</span>`;
  const attachments = (opts.attachmentNames ?? []).filter(Boolean);
  const attachmentBox = attachments.length
    ? `<div style="margin:18px 0 4px;padding:10px 14px;background:#f1f5f9;border-radius:8px;font-size:13px;color:#475569">&#128206; Anhang: ${attachments.map(escapeHtml).join(", ")}</div>`
    : "";
  const address = [[branding.street].filter(Boolean).join(""), [branding.postalCode, branding.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const contact = [branding.phone ? `Tel. ${branding.phone}` : "", branding.email ?? "", branding.website ?? ""].filter(Boolean).map(escapeHtml).join(" &nbsp;·&nbsp; ");
  const tax = [branding.vatId ? `USt-IdNr. ${branding.vatId}` : "", branding.taxId ? `Steuernr. ${branding.taxId}` : ""].filter(Boolean).map(escapeHtml).join(" &nbsp;·&nbsp; ");
  const footerLines = [`<strong>${name}${branding.legalForm ? ` ${escapeHtml(branding.legalForm)}` : ""}</strong>`, escapeHtml(address), contact, tax].filter(Boolean);

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="padding:22px 28px;border-bottom:3px solid ${color}">${header}</td></tr>
<tr><td style="padding:26px 28px 12px;font-size:15px">${textToHtml(text, color)}${attachmentBox}</td></tr>
<tr><td style="padding:18px 28px 24px;font-size:12px;line-height:1.6;color:#64748b;border-top:1px solid #e2e8f0">${footerLines.join("<br>")}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
