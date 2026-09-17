import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import { formatCents, SMALL_BUSINESS_NOTICE_DE, SMALL_BUSINESS_NOTICE_EN } from "../tax/calculator";
import { buildSepaQrPayload } from "./sepaQr";

export interface BrandingInput {
  name: string;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  taxId?: string | null;
  vatId?: string | null;
  iban?: string | null;
  bic?: string | null;
  bankName?: string | null;
  logoPath?: string | null;
  stampPath?: string | null;
  signaturePath?: string | null;
  primaryColor?: string | null;
  footerText?: string | null;
}

export interface RecipientInput {
  name: string;
  contactName?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  vatId?: string | null;
}

export interface PdfLineItem {
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents?: number; // Lieferscheine haben keine Preise
  vatRateBps?: number;
  lineTotalCents?: number;
}

export interface DocumentPdfInput {
  docTypeLabel: { de: string; en: string };
  documentNumber: string;
  issueDate: Date;
  dueDate?: Date | null;
  validUntil?: Date | null;
  deliveryDate?: Date | null; // Leistungs-/Lieferdatum, §14 Abs. 4 Nr. 6 UStG
  locale: "de" | "en";
  branding: BrandingInput;
  recipient: RecipientInput;
  items: PdfLineItem[];
  subtotalCents?: number;
  vatBreakdown?: Record<number, number>;
  vatTotalCents?: number;
  totalCents?: number;
  isSmallBusiness?: boolean;
  // Zusätzlicher Pflichthinweis, wenn aus anderem Grund als der Kleinunternehmerregelung
  // 0% USt. ausgewiesen wird (Reverse-Charge, Ausfuhrlieferung) - siehe tax/euVat.ts.
  vatNoticeText?: string | null;
  notes?: string | null;
  showPrices: boolean; // false für Lieferscheine
  showSepaQr?: boolean; // true für offene Rechnungen
  // Entwürfe sind noch keine rechtsgültigen Rechnungen (keine feste Nummer, jederzeit
  // änderbar) - ein deutlich sichtbarer Wasserzusatz verhindert, dass eine Vorschau-PDF
  // versehentlich als echte Rechnung verwendet/verschickt wird.
  isDraft?: boolean;
  // Stornorechnung/Korrekturbeleg: ersetzt nicht das Original, sondern verweist darauf.
  correctsDocumentNumber?: string | null;
}

const LABELS = {
  de: {
    invoiceNumber: "Nr.",
    date: "Datum",
    dueDate: "Fällig am",
    validUntil: "Gültig bis",
    position: "Pos.",
    description: "Beschreibung",
    quantity: "Menge",
    unitPrice: "Einzelpreis",
    total: "Summe",
    subtotal: "Zwischensumme (netto)",
    vat: "USt.",
    grandTotal: "Gesamtbetrag",
    page: "Seite",
    of: "von",
    payVia: "Zahlung per SEPA-Überweisung, QR-Code scannen:",
  },
  en: {
    invoiceNumber: "No.",
    date: "Date",
    dueDate: "Due date",
    validUntil: "Valid until",
    position: "Pos.",
    description: "Description",
    quantity: "Qty",
    unitPrice: "Unit price",
    total: "Total",
    subtotal: "Subtotal (net)",
    vat: "VAT",
    grandTotal: "Grand total",
    page: "Page",
    of: "of",
    payVia: "Pay via SEPA transfer, scan QR code:",
  },
} as const;

const DELIVERY_DATE_LABEL = { de: "Leistungsdatum", en: "Delivery/service date" } as const;
const TAX_ID_LABEL = { de: "Steuernr.", en: "Tax no." } as const;
const VAT_ID_LABEL = { de: "USt-IdNr.", en: "VAT ID" } as const;
const CORRECTS_LABEL = { de: "Korrektur zu Rechnung", en: "Correction of invoice" } as const;
const DRAFT_WATERMARK = { de: "ENTWURF", en: "DRAFT" } as const;

const PAGE_MARGIN = 50;

export async function renderDocumentPdf(input: DocumentPdfInput): Promise<Buffer> {
  const t = LABELS[input.locale];
  const color = input.branding.primaryColor || "#2563eb";

  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: {
      Title: `${input.docTypeLabel[input.locale]} ${input.documentNumber}`,
      Author: input.branding.name,
      // PDF/A-Hinweis: pdfkit erzeugt gültiges PDF 1.7 mit eingebetteten Standard-
      // Fonts und Metadaten. Für volle PDF/A-3b-Konformität (ICC-Farbprofil, XMP-
      // Metadatenschema) ist ein zusätzlicher Konvertierungsschritt nötig, siehe
      // docs/ARCHITECTURE.md ("PDF/A-Konformität").
      Creator: "Rechnungssoftware",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  // ---------- Kopfbereich ----------
  let cursorY = PAGE_MARGIN;
  if (input.branding.logoPath && fs.existsSync(input.branding.logoPath)) {
    try {
      doc.image(input.branding.logoPath, PAGE_MARGIN, cursorY, { fit: [140, 60] });
    } catch {
      // beschädigte/nicht unterstützte Bilddatei: Logo einfach auslassen
    }
  }

  doc
    .fillColor(color)
    .fontSize(20)
    .text(input.docTypeLabel[input.locale], PAGE_MARGIN, cursorY, { align: "right" });
  doc
    .fillColor("black")
    .fontSize(10)
    .text(`${t.invoiceNumber} ${input.documentNumber}`, { align: "right" })
    .text(`${t.date}: ${formatDate(input.issueDate, input.locale)}`, { align: "right" });
  if (input.dueDate) doc.text(`${t.dueDate}: ${formatDate(input.dueDate, input.locale)}`, { align: "right" });
  if (input.validUntil) doc.text(`${t.validUntil}: ${formatDate(input.validUntil, input.locale)}`, { align: "right" });
  // Leistungsdatum: eigene Pflichtangabe nach §14 Abs. 4 Nr. 6 UStG, getrennt vom
  // Rechnungsdatum auszuweisen (auch wenn beide Daten zufällig übereinstimmen).
  if (input.deliveryDate) {
    doc.text(`${DELIVERY_DATE_LABEL[input.locale]}: ${formatDate(input.deliveryDate, input.locale)}`, { align: "right" });
  }
  if (input.correctsDocumentNumber) {
    doc.fillColor("#b91c1c").text(`${CORRECTS_LABEL[input.locale]} ${input.correctsDocumentNumber}`, { align: "right" });
    doc.fillColor("black");
  }

  cursorY = 130;
  doc.fontSize(9).fillColor("#555");
  // Steuernummer/USt-IdNr. des leistenden Unternehmers: Pflichtangabe nach §14 Abs. 4
  // Nr. 2 UStG - ohne sie ist die Rechnung formal mangelhaft und dem Empfänger kann der
  // Vorsteuerabzug versagt werden.
  const taxIdLine = input.branding.vatId
    ? `${VAT_ID_LABEL[input.locale]} ${input.branding.vatId}`
    : input.branding.taxId
    ? `${TAX_ID_LABEL[input.locale]} ${input.branding.taxId}`
    : null;
  const senderLine = [
    input.branding.name,
    input.branding.street,
    [input.branding.postalCode, input.branding.city].filter(Boolean).join(" "),
    taxIdLine,
  ]
    .filter(Boolean)
    .join(" · ");
  doc.text(senderLine, PAGE_MARGIN, cursorY);

  cursorY += 20;
  doc.fillColor("black").fontSize(11);
  doc.text(input.recipient.name, PAGE_MARGIN, cursorY);
  if (input.recipient.contactName) doc.text(input.recipient.contactName);
  if (input.recipient.street) doc.text(input.recipient.street);
  const recipientCity = [input.recipient.postalCode, input.recipient.city].filter(Boolean).join(" ");
  if (recipientCity) doc.text(recipientCity);
  if (input.recipient.country && input.recipient.country !== "DE") doc.text(input.recipient.country);

  // ---------- Positionstabelle ----------
  cursorY = 240;
  const colX = {
    pos: PAGE_MARGIN,
    desc: PAGE_MARGIN + 30,
    qty: 330,
    unitPrice: 400,
    total: 470,
  };

  function drawTableHeader(y: number) {
    doc.fillColor(color).rect(PAGE_MARGIN, y, 495, 20).fill();
    doc.fillColor("white").fontSize(9);
    doc.text(t.position, colX.pos + 5, y + 6, { width: 25 });
    doc.text(t.description, colX.desc, y + 6, { width: 290 });
    doc.text(t.quantity, colX.qty, y + 6, { width: 60, align: "right" });
    if (input.showPrices) {
      doc.text(t.unitPrice, colX.unitPrice, y + 6, { width: 60, align: "right" });
      doc.text(t.total, colX.total, y + 6, { width: 65, align: "right" });
    }
    doc.fillColor("black");
    return y + 26;
  }

  cursorY = drawTableHeader(cursorY);

  for (const item of input.items) {
    const rowHeight = 18;
    if (cursorY + rowHeight > doc.page.height - PAGE_MARGIN - 100) {
      doc.addPage();
      cursorY = drawTableHeader(PAGE_MARGIN);
    }
    doc.fontSize(9);
    doc.text(String(item.position), colX.pos + 5, cursorY, { width: 25 });
    doc.text(item.description, colX.desc, cursorY, { width: 290 });
    doc.text(`${item.quantity} ${item.unit}`, colX.qty, cursorY, { width: 60, align: "right" });
    if (input.showPrices && item.unitPriceCents !== undefined) {
      doc.text(formatCents(item.unitPriceCents, "EUR", input.locale === "de" ? "de-DE" : "en-US"), colX.unitPrice, cursorY, {
        width: 60,
        align: "right",
      });
      doc.text(formatCents(item.lineTotalCents ?? 0, "EUR", input.locale === "de" ? "de-DE" : "en-US"), colX.total, cursorY, {
        width: 65,
        align: "right",
      });
    }
    cursorY += rowHeight;
    doc.moveTo(PAGE_MARGIN, cursorY - 4).lineTo(PAGE_MARGIN + 495, cursorY - 4).strokeColor("#e5e5e5").stroke();
  }

  // ---------- Summenblock ----------
  if (input.showPrices) {
    cursorY += 10;
    const summaryX = 350;
    doc.fontSize(9).fillColor("black");
    doc.text(t.subtotal, summaryX, cursorY, { width: 100 });
    doc.text(formatCents(input.subtotalCents ?? 0, "EUR", input.locale === "de" ? "de-DE" : "en-US"), summaryX + 100, cursorY, {
      width: 65,
      align: "right",
    });
    cursorY += 14;

    if (input.isSmallBusiness) {
      doc.fontSize(8).fillColor("#555").text(input.locale === "de" ? SMALL_BUSINESS_NOTICE_DE : SMALL_BUSINESS_NOTICE_EN, PAGE_MARGIN, cursorY, {
        width: 495,
      });
      cursorY += 20;
    } else if (input.vatNoticeText) {
      doc.fontSize(8).fillColor("#555").text(input.vatNoticeText, PAGE_MARGIN, cursorY, { width: 495 });
      cursorY += 20;
    } else if (input.vatBreakdown) {
      for (const [rateBps, amount] of Object.entries(input.vatBreakdown)) {
        const rate = Number(rateBps) / 100;
        doc.fontSize(9).fillColor("black");
        doc.text(`${t.vat} ${rate.toFixed(0)}%`, summaryX, cursorY, { width: 100 });
        doc.text(formatCents(amount, "EUR", input.locale === "de" ? "de-DE" : "en-US"), summaryX + 100, cursorY, { width: 65, align: "right" });
        cursorY += 14;
      }
    }

    doc.moveTo(summaryX, cursorY).lineTo(summaryX + 165, cursorY).strokeColor("#333").stroke();
    cursorY += 6;
    doc.fontSize(11).fillColor(color).text(t.grandTotal, summaryX, cursorY, { width: 100 });
    doc.text(formatCents(input.totalCents ?? 0, "EUR", input.locale === "de" ? "de-DE" : "en-US"), summaryX + 100, cursorY, {
      width: 65,
      align: "right",
    });
    doc.fillColor("black");
    cursorY += 30;
  }

  if (input.notes) {
    doc.fontSize(9).fillColor("black").text(input.notes, PAGE_MARGIN, cursorY, { width: 495 });
    cursorY += 30;
  }

  // ---------- SEPA-QR-Code für offene Rechnungen ----------
  if (input.showSepaQr && input.branding.iban && input.totalCents) {
    const payload = buildSepaQrPayload({
      name: input.branding.name,
      iban: input.branding.iban,
      bic: input.branding.bic ?? undefined,
      amountCents: input.totalCents,
      remittanceText: input.documentNumber,
    });
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 0 });
    const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
    if (cursorY + 100 > doc.page.height - PAGE_MARGIN) {
      doc.addPage();
      cursorY = PAGE_MARGIN;
    }
    doc.fontSize(9).text(t.payVia, PAGE_MARGIN, cursorY, { width: 300 });
    doc.image(qrBuffer, PAGE_MARGIN, cursorY + 14, { fit: [90, 90] });
    doc.fontSize(8).fillColor("#555").text(
      `IBAN: ${input.branding.iban}${input.branding.bic ? "  BIC: " + input.branding.bic : ""}`,
      PAGE_MARGIN + 100,
      cursorY + 40
    );
    cursorY += 120; // Höhe des QR-Blocks (14 Text + 90 Bild + Puffer), sonst überlappt der nächste Abschnitt
  }

  // ---------- Stempel & Unterschrift (automatisch, sofern in den Firmeneinstellungen hinterlegt) ----------
  if (input.branding.stampPath || input.branding.signaturePath) {
    const blockHeight = 90;
    if (cursorY + blockHeight > doc.page.height - PAGE_MARGIN - 30) {
      doc.addPage();
      cursorY = PAGE_MARGIN;
    } else {
      cursorY += 10;
    }
    const signatureX = PAGE_MARGIN;
    const stampX = PAGE_MARGIN + 220;

    if (input.branding.signaturePath && fs.existsSync(input.branding.signaturePath)) {
      try {
        doc.image(input.branding.signaturePath, signatureX, cursorY, { fit: [160, 60] });
      } catch {
        // beschädigte/nicht unterstützte Bilddatei: Unterschrift einfach auslassen
      }
      doc
        .moveTo(signatureX, cursorY + 62)
        .lineTo(signatureX + 160, cursorY + 62)
        .strokeColor("#999")
        .stroke();
      doc
        .fontSize(8)
        .fillColor("#555")
        .text(input.locale === "de" ? "Unterschrift" : "Signature", signatureX, cursorY + 66, { width: 160 });
    }

    if (input.branding.stampPath && fs.existsSync(input.branding.stampPath)) {
      try {
        doc.image(input.branding.stampPath, stampX, cursorY, { fit: [90, 90] });
      } catch {
        // beschädigte/nicht unterstützte Bilddatei: Stempel einfach auslassen
      }
    }

    cursorY += blockHeight;
  }

  // ---------- Fußzeile & Seitenzahlen ----------
  // Wichtig: Der Fußzeilentext wird bewusst UNTERHALB des unteren Seitenrands (margins.bottom)
  // platziert. PDFKit interpretiert eine Startposition unterhalb dieser Grenze standardmäßig
  // als Platzmangel und fügt automatisch eine neue (leere) Seite ein, bevor es zeichnet - mit
  // sichtbar falschem Ergebnis (leere Zusatzseiten, Fußzeile landet auf der letzten statt auf
  // jeder Seite). Der in der pdfkit-Dokumentation empfohlene Workaround: den unteren Rand für
  // die Dauer der Fußzeilen-Zeichnung auf 0 setzen und danach wiederherstellen.
  const range = doc.bufferedPageRange();
  const originalBottomMargin = doc.page.margins.bottom;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);

    if (input.isDraft) {
      doc.save();
      doc
        .rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] })
        .fontSize(90)
        .fillOpacity(0.12)
        .fillColor("#b91c1c")
        .text(DRAFT_WATERMARK[input.locale], 0, doc.page.height / 2 - 50, { width: doc.page.width, align: "center" });
      doc.restore();
      doc.fillOpacity(1).fillColor("black");
    }

    doc.page.margins.bottom = 0;
    doc
      .fontSize(8)
      .fillColor("#888")
      .text(input.branding.footerText || "", PAGE_MARGIN, doc.page.height - 40, { width: 350, lineBreak: false });
    doc.text(`${t.page} ${i + 1} ${t.of} ${range.count}`, doc.page.width - PAGE_MARGIN - 100, doc.page.height - 40, {
      width: 100,
      align: "right",
      lineBreak: false,
    });
    doc.page.margins.bottom = originalBottomMargin;
  }

  doc.end();
  return done;
}

function formatDate(date: Date, locale: "de" | "en"): string {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US").format(date);
}
