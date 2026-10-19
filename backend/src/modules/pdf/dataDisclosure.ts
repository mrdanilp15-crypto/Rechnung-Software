import PDFDocument from "pdfkit";
import { resolvePdfFonts } from "./fonts";

/**
 * "Datenauskunft" nach Art. 15 DSGVO als gut lesbares PDF (die JSON-Datei bleibt für die maschinelle Übertragung nach Art. 20).
 * Enthält die gespeicherten Stammdaten, die Liste der Belege und die Pflichtinformationen (Zweck, Rechtsgrundlage, Speicherdauer,
 * Empfänger, Betroffenenrechte). Die Textbausteine sind eine sinnvolle Standardformulierung - bei Besonderheiten (z.B. weitere
 * Dienstleister) bitte vor dem Versand prüfen bzw. ergänzen.
 */

export interface DisclosureInput {
  company: { name: string; street?: string | null; postalCode?: string | null; city?: string | null; email?: string | null; phone?: string | null };
  customer: {
    customerNumber: string; type: string; name: string; contactName?: string | null; email?: string | null; phone?: string | null;
    street?: string | null; postalCode?: string | null; city?: string | null; country: string; vatId?: string | null; leitwegId?: string | null;
    notes?: string | null; isArchived: boolean; createdAt: Date; updatedAt: Date;
  };
  documents: { kind: string; number: string; date: Date; status: string; totalCents?: number | null }[];
}

const fmtDate = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const fmtMoney = (c: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(c / 100);
const STATUS: Record<string, string> = { DRAFT: "Entwurf", SENT: "Versendet", PAID: "Bezahlt", OVERDUE: "Überfällig", CANCELLED: "Storniert", ACCEPTED: "Angenommen", REJECTED: "Abgelehnt" };

export function renderDataDisclosurePdf(input: DisclosureInput): Promise<Buffer> {
  const fonts = resolvePdfFonts();
  const doc = new PDFDocument({ size: "A4", margin: 56, bufferPages: true, font: fonts.regular, info: { Title: `Datenauskunft ${input.customer.customerNumber}`, Author: input.company.name } });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 20;
  const regular = () => doc.font(fonts.regular);
  const bold = () => doc.font(fonts.bold);
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };
  const heading = (text: string) => {
    ensure(50);
    doc.moveDown(0.8);
    bold().fontSize(12).fillColor("#1f2937").text(text, left, doc.y, { width });
    doc.moveTo(left, doc.y + 2).lineTo(left + width, doc.y + 2).lineWidth(0.6).strokeColor("#cbd5e1").stroke();
    doc.moveDown(0.6);
    regular().fontSize(10).fillColor("#111827");
  };
  const paragraph = (text: string) => {
    ensure(doc.heightOfString(text, { width }) + 6);
    regular().fontSize(10).fillColor("#374151").text(text, left, doc.y, { width, lineGap: 2 });
    doc.moveDown(0.4);
  };

  // Zwischenüberschrift + Text bleiben zusammen auf einer Seite
  const titled = (title: string, text: string) => {
    ensure(doc.heightOfString(text, { width }) + 34);
    bold().fontSize(10).fillColor("#111827").text(title, left, doc.y, { width });
    paragraph(text);
  };

  // Kopf
  const c = input.company;
  bold().fontSize(11).fillColor("#111827").text(c.name, left, 56);
  regular().fontSize(9).fillColor("#6b7280").text([[c.street, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", "), c.email, c.phone].filter(Boolean).join("  ·  "), left, doc.y, { width });
  doc.moveDown(1.5);
  bold().fontSize(18).fillColor("#111827").text("Auskunft über gespeicherte personenbezogene Daten", left, doc.y, { width });
  regular().fontSize(10).fillColor("#6b7280").text(`nach Art. 15 DSGVO  ·  erstellt am ${fmtDate(new Date())}  ·  Kundennummer ${input.customer.customerNumber}`, left, doc.y + 2, { width });

  // 1. Stammdaten
  heading("1. Gespeicherte Stammdaten");
  const k = input.customer;
  const rows: [string, string | null | undefined][] = [
    ["Kundennummer", k.customerNumber],
    ["Kundenart", k.type === "GEWERBLICH" ? "Geschäftskunde" : "Privatkunde"],
    ["Name", k.name],
    ["Ansprechpartner", k.contactName],
    ["Anschrift", [k.street, [k.postalCode, k.city].filter(Boolean).join(" "), k.country].filter(Boolean).join(", ")],
    ["E-Mail", k.email],
    ["Telefon", k.phone],
    ["USt-IdNr.", k.vatId],
    ["Leitweg-ID", k.leitwegId],
    ["Interne Notizen", k.notes],
    ["Angelegt am", fmtDate(k.createdAt)],
    ["Zuletzt geändert", fmtDate(k.updatedAt)],
    ["Status", k.isArchived ? "archiviert (nicht mehr aktiv)" : "aktiv"],
  ];
  for (const [label, value] of rows) {
    if (!value) continue;
    const h = Math.max(doc.heightOfString(value, { width: width - 130 }), 12) + 4;
    ensure(h);
    const y = doc.y;
    regular().fontSize(9).fillColor("#6b7280").text(label, left, y, { width: 125 });
    regular().fontSize(10).fillColor("#111827").text(value, left + 130, y, { width: width - 130 });
    doc.y = y + h;
  }

  // 2. Belege
  heading("2. Zu Ihrer Person gespeicherte Belege");
  if (input.documents.length === 0) {
    paragraph("Es sind keine Belege (Rechnungen, Angebote, Aufträge, Lieferscheine) gespeichert.");
  } else {
    const cols = [width * 0.26, width * 0.22, width * 0.18, width * 0.16, width * 0.18];
    const head = ["Art", "Nummer", "Datum", "Status", "Betrag"];
    const drawRow = (cells: string[], isHead: boolean) => {
      ensure(18);
      const y = doc.y;
      let x = left;
      (isHead ? bold() : regular()).fontSize(isHead ? 8.5 : 9).fillColor(isHead ? "#374151" : "#111827");
      cells.forEach((cell, i) => {
        doc.text(cell, x, y, { width: cols[i] - 6, align: i === 4 ? "right" : "left", lineBreak: false });
        x += cols[i];
      });
      doc.y = y + 15;
      if (isHead) doc.moveTo(left, doc.y - 2).lineTo(left + width, doc.y - 2).lineWidth(0.5).strokeColor("#9ca3af").stroke();
    };
    drawRow(head, true);
    for (const d of [...input.documents].sort((a, b) => b.date.getTime() - a.date.getTime())) {
      drawRow([d.kind, d.number, fmtDate(d.date), STATUS[d.status] ?? d.status, d.totalCents == null ? "-" : fmtMoney(d.totalCents)], false);
    }
    doc.moveDown(0.3);
    regular().fontSize(8.5).fillColor("#6b7280").text(`${input.documents.length} Beleg(e). Die einzelnen Positionen stehen in den jeweiligen Belegen und können auf Wunsch zusätzlich übermittelt werden.`, left, doc.y, { width });
  }

  // 3. Pflichtinformationen
  heading("3. Informationen zur Verarbeitung");
  titled("Zwecke und Rechtsgrundlagen", "Ihre Daten werden verarbeitet, um Angebote, Aufträge, Lieferungen und Rechnungen abzuwickeln und zu verwalten (Art. 6 Abs. 1 lit. b DSGVO) sowie um gesetzliche Aufbewahrungs- und Nachweispflichten zu erfüllen (Art. 6 Abs. 1 lit. c DSGVO, insbesondere nach Handels- und Steuerrecht).");
  titled("Speicherdauer", "Rechnungen und Buchungsbelege unterliegen gesetzlichen Aufbewahrungsfristen von bis zu 8 Jahren (Handelsbriefe teils 6 Jahre) und können in dieser Zeit nicht gelöscht werden. Danach werden die Daten gelöscht. Stammdaten ohne bestehende Belege werden auf Wunsch früher gelöscht.");
  titled("Empfänger", "Ihre Daten werden nicht verkauft. Soweit für die Abwicklung erforderlich, erhalten sie Dienstleister, die in unserem Auftrag tätig sind (z.B. Steuerberatung, Hosting/IT, E-Mail-Versand), sowie Behörden, wenn eine gesetzliche Pflicht besteht. Eine Übermittlung in Drittländer findet nicht statt, sofern nicht ausdrücklich angegeben.");
  titled("Herkunft der Daten", "Die Daten stammen von Ihnen selbst (z.B. Anfrage, Bestellung) bzw. aus der Geschäftsbeziehung mit Ihnen.");
  titled("Ihre Rechte", "Sie haben das Recht auf Berichtigung unrichtiger Daten (Art. 16), Löschung (Art. 17, soweit keine Aufbewahrungspflicht entgegensteht), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Außerdem können Sie sich bei einer Datenschutzaufsichtsbehörde beschweren (Art. 77). Eine automatisierte Entscheidungsfindung einschließlich Profiling findet nicht statt.");
  paragraph(`Bei Fragen wenden Sie sich bitte an: ${[c.name, c.email, c.phone].filter(Boolean).join(", ")}.`);

  // Seitenzahlen
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const m = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    regular().fontSize(8).fillColor("#9ca3af").text(`Seite ${i + 1} von ${range.count}`, left, doc.page.height - 36, { width, align: "right", lineBreak: false });
    doc.page.margins.bottom = m;
  }
  doc.end();
  return done;
}
