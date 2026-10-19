import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import { formatCents, SMALL_BUSINESS_NOTICE_DE, SMALL_BUSINESS_NOTICE_EN } from "../tax/calculator";
import { buildSepaQrPayload } from "./sepaQr";
import { resolvePdfFonts } from "./fonts";
import { fillPlaceholders } from "./placeholders";

export interface BrandingInput {
  name: string;
  legalForm?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  taxId?: string | null;
  vatId?: string | null;
  iban?: string | null;
  bic?: string | null;
  bankName?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  registerCourt?: string | null;
  registerNumber?: string | null;
  managingDirector?: string | null;
  logoPath?: string | null;
  stampPath?: string | null;
  signaturePath?: string | null;
  primaryColor?: string | null;
  footerText?: string | null;
}

export interface RecipientInput {
  name: string;
  customerNumber?: string | null;
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
  numberLabel?: { de: string; en: string }; // z.B. "Rechnungsnr.", Standard: "Nr."
  documentNumber: string;
  issueDate: Date;
  dueDate?: Date | null;
  validUntil?: Date | null;
  deliveryDate?: Date | null; // Leistungs-/Lieferdatum, §14 Abs. 4 Nr. 6 UStG
  deliveryDateLabel?: { de: string; en: string }; // z.B. "Voraussichtl. Lieferung" bei der Auftragsbestätigung
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
  // Zahlungsaufforderung (z.B. "Zahlbar bis ..."), wird neben dem SEPA-QR-Code bzw. allein
  // unter den Summen ausgegeben.
  paymentTermsText?: string | null;
  showPrices: boolean; // false für Lieferscheine
  showSepaQr?: boolean; // true für offene Rechnungen
  // Entwürfe sind noch keine rechtsgültigen Rechnungen (keine feste Nummer, jederzeit
  // änderbar) - ein deutlich sichtbarer Wasserzusatz verhindert, dass eine Vorschau-PDF
  // versehentlich als echte Rechnung verwendet/verschickt wird.
  isDraft?: boolean;
  // Stornorechnung/Korrekturbeleg: ersetzt nicht das Original, sondern verweist darauf.
  correctsDocumentNumber?: string | null;
  // ZUGFeRD/Factur-X: strukturierte Rechnung (XML), die als Anhang ins PDF/A-3 eingebettet wird. Braucht eingebettete Schriften.
  embeddedXml?: { xml: string; filename: string; description: string; xmp: string };
  // Optisches Layout (siehe PDF_LAYOUTS) - rein gestalterisch, alle Pflichtangaben stehen in jedem Layout.
  layout?: PdfLayout | null;
  // Für Mahnungen: keine Netto-/USt.-Aufschlüsselung (Forderungen und Zinsen sind keine umsatzsteuerpflichtigen Entgelte),
  // stattdessen eine einzelne Summenzeile mit eigener Bezeichnung (z.B. "Gesamtforderung")
  hideVatSummary?: boolean;
  totalLabel?: { de: string; en: string };
  // Frei änderbare Begrüßung (über der Positionstabelle) und Schlusstext (unter den Summen).
  // Platzhalter wie {kunde} oder {faellig} werden beim Rendern ersetzt (siehe pdf/placeholders.ts).
  introText?: string | null;
  closingText?: string | null;
}

export type PdfLayout = "CLEAR" | "BAND" | "COMPACT";
export const PDF_LAYOUTS: PdfLayout[] = ["CLEAR", "BAND", "COMPACT"];

const LABELS = {
  de: {
    number: "Nr.",
    date: "Datum",
    details: "Details",
    dueDate: "Fällig am",
    validUntil: "Gültig bis",
    deliveryDate: "Leistungsdatum",
    customerNumber: "Kunden-Nr.",
    position: "Pos.",
    description: "Beschreibung",
    quantity: "Menge",
    unitPrice: "Einzelpreis",
    vat: "USt.",
    total: "Betrag",
    subtotal: "Nettobetrag",
    plusVat: "zzgl.",
    vatOn: "USt. auf",
    grandTotal: "Gesamtbetrag",
    page: "Seite",
    of: "von",
    payQr: "Bequem bezahlen: QR-Code mit der Banking-App scannen",
    recipient: "Empfänger",
    reference: "Verwendungszweck",
    amount: "Betrag",
    taxNo: "Steuernr.",
    vatId: "USt-IdNr.",
    phone: "Tel.",
    email: "E-Mail",
    web: "Web",
    bank: "Bankverbindung",
    managing: "Geschäftsführer",
    notes: "Hinweise",
    signature: "Unterschrift",
    receipt: "Ware/Leistung vollständig und unbeschädigt erhalten - Datum, Unterschrift Empfänger",
    corrects: (n: string) => `Dieser Beleg korrigiert die Rechnung Nr. ${n} und hebt sie in voller Höhe auf.`,
    draft: "ENTWURF",
  },
  en: {
    number: "No.",
    date: "Date",
    details: "Details",
    dueDate: "Due date",
    validUntil: "Valid until",
    deliveryDate: "Delivery/service date",
    customerNumber: "Customer no.",
    position: "Pos.",
    description: "Description",
    quantity: "Qty",
    unitPrice: "Unit price",
    vat: "VAT",
    total: "Amount",
    subtotal: "Net amount",
    plusVat: "plus",
    vatOn: "VAT on",
    grandTotal: "Total amount",
    page: "Page",
    of: "of",
    payQr: "Pay easily: scan the QR code with your banking app",
    recipient: "Payee",
    reference: "Reference",
    amount: "Amount",
    taxNo: "Tax no.",
    vatId: "VAT ID",
    phone: "Phone",
    email: "Email",
    web: "Web",
    bank: "Bank details",
    managing: "Managing director",
    notes: "Notes",
    signature: "Signature",
    receipt: "Goods/services received complete and undamaged - date, signature of recipient",
    corrects: (n: string) => `This document corrects invoice no. ${n} and cancels it in full.`,
    draft: "DRAFT",
  },
} as const;

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 495;
const PAGE_HEIGHT = 841.89;
// Alles unterhalb dieser Linie gehört der Fußzeile - Inhalte müssen davor umbrechen.
const CONTENT_BOTTOM = PAGE_HEIGHT - 120;
const FOOTER_TOP = PAGE_HEIGHT - 100;
const DEFAULT_COLOR = "#2563eb";

/** Akzeptiert nur #rrggbb/#rgb - ein ungültiger, vom Nutzer eingegebener Wert würde sonst
 * die gesamte PDF-Erzeugung abbrechen lassen. */
function normalizeColor(value?: string | null): string {
  if (!value) return DEFAULT_COLOR;
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return "#" + v.slice(1).split("").map((c) => c + c).join("");
  return DEFAULT_COLOR;
}

/** Weiß oder Fast-Schwarz, je nachdem, was auf dem Farbfeld besser lesbar ist (eine helle
 * Firmenfarbe würde mit weißer Schrift sonst unlesbar). WCAG-Relative-Luminanz. */
function readableTextColor(hex: string): string {
  return relativeLuminance(hex) > 0.5 ? "#111827" : "#ffffff";
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Firmenfarbe als Schriftfarbe auf weißem Papier: zu helle Töne (z.B. Gelb) werden
 * abgedunkelt, damit Titel und Firmenname lesbar bleiben. */
function accentOnWhite(hex: string): string {
  if (relativeLuminance(hex) <= 0.3) return hex;
  const mix = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.45).toString(16).padStart(2, "0");
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

/** Mischt eine Farbe mit Weiß (strength 1 = volle Farbe, 0 = Weiß) - für zarte Flächen aus der Firmenfarbe. */
function tint(hex: string, strength: number): string {
  const ch = (i: number) => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * strength).toString(16).padStart(2, "0");
  return `#${ch(1)}${ch(3)}${ch(5)}`;
}

function countryName(code: string, intl: string): string {
  try {
    return new Intl.DisplayNames([intl], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export async function renderDocumentPdf(input: DocumentPdfInput): Promise<Buffer> {
  const t = LABELS[input.locale];
  const intl = input.locale === "de" ? "de-DE" : "en-US";
  const color = normalizeColor(input.branding.primaryColor);
  const onColor = readableTextColor(color);
  const accent = accentOnWhite(color);
  const fonts = resolvePdfFonts();
  const money = (cents: number) => formatCents(cents, "EUR", intl);
  const qtyFormat = new Intl.NumberFormat(intl, { maximumFractionDigits: 4 });
  const rateFormat = new Intl.NumberFormat(intl, { maximumFractionDigits: 2 });

  // Mit eingebetteter Schrift entsteht ein PDF/A-3b-Dokument (inkl. ICC-Farbprofil und
  // XMP-Metadaten, siehe pdfkit "subset") - die Standard-Schriften (Helvetica) sind bei
  // PDF/A nicht erlaubt, weil sie nicht eingebettet werden. Ohne gefundene Schriftdatei
  // fällt die Vorlage auf ein normales, gültiges PDF 1.7 zurück.
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    bufferPages: true,
    pdfVersion: "1.7",
    lang: input.locale === "de" ? "de-DE" : "en-US",
    displayTitle: true,
    ...(fonts.embedded ? { subset: "PDF/A-3b" } : {}),
    font: fonts.regular,
    info: {
      Title: `${input.docTypeLabel[input.locale]} ${input.documentNumber}`,
      Author: input.branding.name,
      Subject: `${input.docTypeLabel[input.locale]} ${input.documentNumber}`,
      Creator: "Rechnungssoftware",
      Producer: "Rechnungssoftware (PDFKit)",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const setFont = (bold: boolean) => doc.font(bold ? fonts.bold : fonts.regular);

  // ---------- Kopfbereich (je nach Layout) ----------
  const layout: PdfLayout = input.layout && PDF_LAYOUTS.includes(input.layout) ? input.layout : "CLEAR";
  const numberLabelText = (input.numberLabel ?? { de: t.number, en: t.number })[input.locale];
  const docTitle = input.docTypeLabel[input.locale];

  const metaRows: [string, string][] = [[t.date, formatDate(input.issueDate, intl)]];
  if (input.deliveryDate) metaRows.push([input.deliveryDateLabel?.[input.locale] ?? t.deliveryDate, formatDate(input.deliveryDate, intl)]);
  if (input.recipient.customerNumber) metaRows.push([t.customerNumber, input.recipient.customerNumber]);
  if (input.dueDate) metaRows.push([t.dueDate, formatDate(input.dueDate, intl)]);
  if (input.validUntil) metaRows.push([t.validUntil, formatDate(input.validUntil, intl)]);

  const drawLogo = (x: number, y: number, w: number, h: number): boolean => {
    if (!input.branding.logoPath || !fs.existsSync(input.branding.logoPath)) return false;
    try {
      doc.image(input.branding.logoPath, x, y, { fit: [w, h] });
      return true;
    } catch {
      // beschädigte/nicht unterstützte Bilddatei (pdfkit kann nur PNG/JPEG): Logo auslassen
      return false;
    }
  };
  const drawMetaRows = (labelX: number, labelW: number, valueX: number, valueW: number, startY: number) => {
    let y = startY;
    for (const [label, value] of metaRows) {
      setFont(false);
      doc.fontSize(9).fillColor("#6b7280").text(label, labelX, y, { width: labelW, lineBreak: false });
      setFont(true);
      doc.fillColor("#111827").text(value, valueX, y, { width: valueW, align: "right", lineBreak: false });
      y += 13;
    }
  };

  // Anschriftenfeld: DIN 5008 Form B (Fensterumschlag) - im Layout "COMPACT" liegt es in einer Karte.
  const addrX = layout === "COMPACT" ? PAGE_MARGIN + 12 : PAGE_MARGIN;
  const addrW = layout === "COMPACT" ? 226 : 250;

  if (layout === "CLEAR") {
    if (!drawLogo(PAGE_MARGIN, PAGE_MARGIN, 170, 60)) {
      doc.roundedRect(PAGE_MARGIN, PAGE_MARGIN, 30, 30, 7).fill(color);
      setFont(true);
      doc.fillColor(onColor).fontSize(15).text((input.branding.name.trim()[0] ?? "R").toUpperCase(), PAGE_MARGIN, PAGE_MARGIN + 8, { width: 30, align: "center", lineBreak: false });
      doc.fillColor("#111827").fontSize(10).text(input.branding.name, PAGE_MARGIN, PAGE_MARGIN + 38, { width: 240 });
    }
    setFont(false);
    doc.fillColor("#111827").fontSize(22).text(docTitle, 300, PAGE_MARGIN, { width: 245, align: "right", lineBreak: false });
    doc.fillColor("#6b7280").fontSize(10).text(`${numberLabelText} ${input.documentNumber}`, 300, PAGE_MARGIN + 28, { width: 245, align: "right", lineBreak: false });
    const boxH = metaRows.length * 13 + 14;
    doc.roundedRect(345, 128, 200, boxH, 6).fill("#f3f4f6");
    drawMetaRows(355, 85, 440, 95, 135);
  } else if (layout === "BAND") {
    doc.rect(0, 0, 595.28, 72).fill(color);
    if (input.branding.logoPath && fs.existsSync(input.branding.logoPath)) {
      doc.roundedRect(44, 12, 168, 48, 6).fill("#ffffff");
    }
    if (!drawLogo(49, 17, 158, 38)) {
      setFont(true);
      doc.fillColor(onColor).fontSize(16).text(input.branding.name, PAGE_MARGIN, 26, { width: 240, lineBreak: false });
    }
    setFont(false);
    doc.fillColor(onColor).fontSize(9).text(`${docTitle} · ${numberLabelText}`, 300, 20, { width: 245, align: "right", lineBreak: false });
    setFont(true);
    doc.fontSize(17).text(input.documentNumber, 300, 33, { width: 245, align: "right", lineBreak: false });
    drawMetaRows(335, 100, 435, 110, 96);
  } else {
    if (!drawLogo(PAGE_MARGIN, PAGE_MARGIN, 150, 50)) {
      setFont(true);
      doc.fillColor(accent).fontSize(14).text(input.branding.name, PAGE_MARGIN, PAGE_MARGIN + 4, { width: 250, lineBreak: false });
    }
    setFont(true);
    doc.fontSize(10);
    const pillText = `${docTitle} ${input.documentNumber}`;
    const pillW = Math.min(doc.widthOfString(pillText) + 24, 245);
    doc.roundedRect(PAGE_MARGIN + CONTENT_WIDTH - pillW, 48, pillW, 22, 11).fill(tint(color, 0.15));
    doc.fillColor(accent).text(pillText, PAGE_MARGIN + CONTENT_WIDTH - pillW + 12, 54, { width: pillW - 24, lineBreak: false });
    doc.roundedRect(PAGE_MARGIN, 124, 250, 100, 8).lineWidth(0.6).fillAndStroke("#ffffff", "#e5e7eb");
    doc.roundedRect(312, 124, 233, 100, 8).lineWidth(0.6).fillAndStroke("#ffffff", "#e5e7eb");
    setFont(false);
    doc.fontSize(8).fillColor("#9ca3af").text(t.details, 324, 131, { width: 200, lineBreak: false });
    drawMetaRows(324, 85, 409, 124, 146);
  }

  // ---------- Anschriftenfeld (DIN 5008 Form B, passt in Fensterumschläge) ----------
  // Absenderzeile in der Rücksendeangabe, darunter der Empfänger. Steuernummer/USt-IdNr.
  // gehören nicht in diese Zeile, sondern in die Fußzeile (Pflichtangabe §14 Abs. 4 Nr. 2 UStG).
  const returnLine = [
    input.branding.name,
    input.branding.street,
    [input.branding.postalCode, input.branding.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
  setFont(false);
  doc.fontSize(7).fillColor("#6b7280").text(returnLine, addrX, 132, { width: addrW, lineBreak: false });
  doc.moveTo(addrX, 142).lineTo(addrX + addrW, 142).lineWidth(0.4).strokeColor("#9ca3af").stroke();

  let addressY = 150;
  setFont(true);
  doc.fillColor("#111827").fontSize(11).text(input.recipient.name, addrX, addressY, { width: addrW });
  setFont(false);
  if (input.recipient.contactName) doc.text(input.recipient.contactName, { width: addrW });
  if (input.recipient.street) doc.text(input.recipient.street, { width: addrW });
  const recipientCity = [input.recipient.postalCode, input.recipient.city].filter(Boolean).join(" ");
  if (recipientCity) doc.text(recipientCity, { width: addrW });
  if (input.recipient.country && input.recipient.country !== "DE") doc.text(countryName(input.recipient.country, intl), { width: addrW });
  // USt-IdNr. des Leistungsempfängers: bei Reverse-Charge/innergemeinschaftlichen Leistungen
  // zwingend auf der Rechnung (§14a UStG), bei Geschäftskunden generell üblich.
  if (input.recipient.vatId) {
    doc.fontSize(9).fillColor("#4b5563").text(`${t.vatId}: ${input.recipient.vatId}`, { width: addrW });
  }
  addressY = doc.y;

  let cursorY = Math.max(addressY + 20, 250);

  // Hinweis bei Korrekturbelegen direkt über der Positionstabelle
  if (input.correctsDocumentNumber) {
    setFont(true);
    doc.fontSize(10).fillColor("#b91c1c").text(t.corrects(input.correctsDocumentNumber), PAGE_MARGIN, cursorY - 16, { width: CONTENT_WIDTH });
    cursorY = doc.y + 12;
  }

  // Begrüßung (frei änderbar, Platzhalter siehe pdf/placeholders.ts)
  const placeholderValues = {
    kunde: input.recipient.name,
    ansprechpartner: input.recipient.contactName || input.recipient.name,
    nummer: input.documentNumber,
    datum: formatDate(input.issueDate, intl),
    faellig: input.dueDate ? formatDate(input.dueDate, intl) : input.validUntil ? formatDate(input.validUntil, intl) : "",
    betrag: money(input.totalCents ?? 0),
    firma: input.branding.name,
  };
  const introText = fillPlaceholders(input.introText, placeholderValues).trim();
  const closingText = fillPlaceholders(input.closingText, placeholderValues).trim();
  if (introText) {
    setFont(false);
    doc.fontSize(9.5).fillColor("#111827").text(introText, PAGE_MARGIN, cursorY, { width: CONTENT_WIDTH });
    cursorY = doc.y + 12;
  }

  // ---------- Positionstabelle ----------
  const showVatColumn = input.showPrices && !input.isSmallBusiness && !input.hideVatSummary && input.items.some((i) => i.vatRateBps !== undefined);
  const col = input.showPrices
    ? {
        pos: { x: PAGE_MARGIN + 4, w: 22 },
        desc: { x: PAGE_MARGIN + 30, w: showVatColumn ? 200 : 235 },
        qty: showVatColumn ? { x: 285, w: 65 } : { x: 320, w: 60 },
        unitPrice: showVatColumn ? { x: 355, w: 62 } : { x: 385, w: 70 },
        vat: { x: 420, w: 35 },
        total: { x: 462, w: 79 },
      }
    : {
        pos: { x: PAGE_MARGIN + 4, w: 22 },
        desc: { x: PAGE_MARGIN + 30, w: 335 },
        qty: { x: 420, w: 125 },
        unitPrice: { x: 0, w: 0 },
        vat: { x: 0, w: 0 },
        total: { x: 0, w: 0 },
      };

  function drawTableHeader(y: number) {
    let textColor: string = onColor;
    let textY = y + 6;
    if (layout === "BAND") {
      doc.roundedRect(PAGE_MARGIN, y, CONTENT_WIDTH, 20, 3).fill(tint(color, 0.14));
      textColor = accent;
    } else if (layout === "CLEAR") {
      doc.moveTo(PAGE_MARGIN, y + 18).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y + 18).lineWidth(1.2).strokeColor(accent).stroke();
      textColor = accent;
      textY = y + 4;
    } else {
      doc.moveTo(PAGE_MARGIN, y + 18).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y + 18).lineWidth(0.6).strokeColor("#d1d5db").stroke();
      textColor = "#6b7280";
      textY = y + 4;
    }
    setFont(true);
    doc.fillColor(textColor).fontSize(8.5);
    doc.text(t.position, col.pos.x, textY, { width: col.pos.w, lineBreak: false });
    doc.text(t.description, col.desc.x, textY, { width: col.desc.w, lineBreak: false });
    doc.text(t.quantity, col.qty.x, textY, { width: col.qty.w, align: "right", lineBreak: false });
    if (input.showPrices) {
      doc.text(t.unitPrice, col.unitPrice.x, textY, { width: col.unitPrice.w, align: "right", lineBreak: false });
      if (showVatColumn) doc.text(t.vat, col.vat.x, textY, { width: col.vat.w, align: "right", lineBreak: false });
      doc.text(t.total, col.total.x, textY, { width: col.total.w, align: "right", lineBreak: false });
    }
    doc.fillColor("#111827");
    return y + 24;
  }

  cursorY = drawTableHeader(cursorY);

  input.items.forEach((item, index) => {
    // Zeilenhöhe richtet sich nach dem tatsächlich benötigten Platz der Beschreibung -
    // lange/mehrzeilige Texte dürfen die Folgezeile nicht überlagern.
    setFont(false);
    doc.fontSize(9);
    const descHeight = Math.min(doc.heightOfString(item.description || " ", { width: col.desc.w }), 260);
    const rowHeight = Math.max(descHeight, 11) + 9;

    if (cursorY + rowHeight > CONTENT_BOTTOM) {
      doc.addPage();
      cursorY = drawTableHeader(PAGE_MARGIN);
    }

    if (layout === "BAND" && index % 2 === 1) {
      doc.save().fillColor("#f9fafb").rect(PAGE_MARGIN, cursorY - 3, CONTENT_WIDTH, rowHeight).fill().restore();
    }
    doc.fillColor("#111827").fontSize(9);
    setFont(false);
    doc.text(String(item.position), col.pos.x, cursorY + 1, { width: col.pos.w, lineBreak: false });
    doc.text(item.description, col.desc.x, cursorY + 1, { width: col.desc.w, height: 260, ellipsis: true });
    doc.text(`${qtyFormat.format(item.quantity)} ${item.unit}`, col.qty.x, cursorY + 1, { width: col.qty.w, align: "right", lineBreak: false });
    if (input.showPrices && item.unitPriceCents !== undefined) {
      doc.text(money(item.unitPriceCents), col.unitPrice.x, cursorY + 1, { width: col.unitPrice.w, align: "right", lineBreak: false });
      if (showVatColumn && item.vatRateBps !== undefined) {
        doc.text(`${rateFormat.format(item.vatRateBps / 100)} %`, col.vat.x, cursorY + 1, { width: col.vat.w, align: "right", lineBreak: false });
      }
      setFont(true);
      doc.text(money(item.lineTotalCents ?? 0), col.total.x, cursorY + 1, { width: col.total.w, align: "right", lineBreak: false });
      setFont(false);
    }
    cursorY += rowHeight;
    doc.moveTo(PAGE_MARGIN, cursorY - 3).lineTo(PAGE_MARGIN + CONTENT_WIDTH, cursorY - 3).lineWidth(0.4).strokeColor("#e5e7eb").stroke();
  });

  // Hilfsfunktion: neuer Block nur, wenn er nicht mehr auf die Seite passt
  function ensureSpace(height: number) {
    if (cursorY + height > CONTENT_BOTTOM) {
      doc.addPage();
      cursorY = PAGE_MARGIN;
    }
  }

  // ---------- Summenblock ----------
  if (input.showPrices) {
    // Entgelt je Steuersatz (§14 Abs. 4 Nr. 7 UStG verlangt die nach Steuersätzen
    // aufgeschlüsselten Entgelte, nicht nur die Steuerbeträge).
    const netByRate = new Map<number, number>();
    for (const item of input.items) {
      if (item.vatRateBps === undefined) continue;
      netByRate.set(item.vatRateBps, (netByRate.get(item.vatRateBps) ?? 0) + (item.lineTotalCents ?? 0));
    }
    const rates = [...netByRate.keys()].sort((a, b) => b - a);
    const showVatLines = !input.isSmallBusiness && !input.hideVatSummary && !input.vatNoticeText && rates.length > 0;

    const noticeText = input.isSmallBusiness
      ? input.locale === "de"
        ? SMALL_BUSINESS_NOTICE_DE
        : SMALL_BUSINESS_NOTICE_EN
      : input.vatNoticeText ?? null;
    setFont(false);
    doc.fontSize(8);
    const noticeHeight = noticeText ? doc.heightOfString(noticeText, { width: CONTENT_WIDTH }) + 10 : 0;
    const summaryRows = (input.isSmallBusiness || input.hideVatSummary ? 0 : 1) + (showVatLines ? rates.length : 0);
    ensureSpace(summaryRows * 15 + 34 + noticeHeight + 12);

    cursorY += 10;
    const labelX = 310;
    const labelW = 150;
    const valueX = 455;
    const valueW = 86;
    const row = (label: string, value: string) => {
      setFont(false);
      doc.fontSize(9).fillColor("#374151").text(label, labelX, cursorY, { width: labelW, lineBreak: false });
      doc.fillColor("#111827").text(value, valueX, cursorY, { width: valueW, align: "right", lineBreak: false });
      cursorY += 15;
    };

    if (!input.isSmallBusiness && !input.hideVatSummary) row(t.subtotal, money(input.subtotalCents ?? 0));
    if (showVatLines) {
      for (const rate of rates) {
        const vat = input.vatBreakdown?.[rate] ?? 0;
        row(`${t.plusVat} ${rateFormat.format(rate / 100)} % ${t.vatOn} ${money(netByRate.get(rate) ?? 0)}`, money(vat));
      }
    }

    cursorY += 3;
    const barX = labelX - 6;
    const barW = PAGE_MARGIN + CONTENT_WIDTH - barX;
    if (layout === "COMPACT") {
      doc.roundedRect(PAGE_MARGIN, cursorY, CONTENT_WIDTH, 30, 8).fill(tint(color, 0.1));
      setFont(true);
      doc.fillColor("#4b5563").fontSize(9).text(input.totalLabel?.[input.locale] ?? t.grandTotal, PAGE_MARGIN + 14, cursorY + 11, { width: 150, lineBreak: false });
      doc.fillColor(accent).fontSize(15).text(money(input.totalCents ?? 0), valueX - 60, cursorY + 8, { width: valueW + 60, align: "right", lineBreak: false });
      cursorY += 30 + 10;
    } else {
      const isBand = layout === "BAND";
      doc.roundedRect(barX, cursorY, barW, 22, isBand ? 11 : 4).fill(isBand ? color : tint(color, 0.1));
      const totalColor = isBand ? onColor : accent;
      setFont(true);
      doc.fillColor(totalColor).fontSize(11).text(input.totalLabel?.[input.locale] ?? t.grandTotal, labelX + (isBand ? 6 : 0), cursorY + 6, { width: labelW, lineBreak: false });
      doc.text(money(input.totalCents ?? 0), valueX, cursorY + 6, { width: valueW - (isBand ? 6 : 0), align: "right", lineBreak: false });
      cursorY += 22 + 10;
    }

    if (noticeText) {
      setFont(false);
      doc.fontSize(8).fillColor("#4b5563").text(noticeText, PAGE_MARGIN, cursorY, { width: CONTENT_WIDTH });
      cursorY = doc.y + 8;
    }
  } else {
    // Lieferschein: Empfangsbestätigung
    ensureSpace(60);
    cursorY += 24;
    doc.moveTo(PAGE_MARGIN, cursorY + 28).lineTo(PAGE_MARGIN + 260, cursorY + 28).lineWidth(0.5).strokeColor("#9ca3af").stroke();
    setFont(false);
    doc.fontSize(8).fillColor("#6b7280").text(t.receipt, PAGE_MARGIN, cursorY + 32, { width: 300 });
    cursorY = doc.y + 10;
  }

  // Schlusstext (frei änderbar)
  if (closingText) {
    setFont(false);
    doc.fontSize(9.5);
    ensureSpace(doc.heightOfString(closingText, { width: CONTENT_WIDTH }) + 12);
    doc.fillColor("#111827").text(closingText, PAGE_MARGIN, cursorY, { width: CONTENT_WIDTH });
    cursorY = doc.y + 12;
  }

  // ---------- Hinweise / Anmerkungen ----------
  if (input.notes) {
    setFont(false);
    doc.fontSize(9);
    const notesHeight = doc.heightOfString(input.notes, { width: CONTENT_WIDTH }) + 20;
    ensureSpace(Math.min(notesHeight, 150));
    setFont(true);
    doc.fillColor("#111827").fontSize(9).text(t.notes, PAGE_MARGIN, cursorY, { width: CONTENT_WIDTH });
    setFont(false);
    doc.fillColor("#374151").text(input.notes, PAGE_MARGIN, doc.y + 2, { width: CONTENT_WIDTH });
    cursorY = doc.y + 12;
  }

  // ---------- Zahlungsinformationen mit SEPA-QR-Code ----------
  const canShowQr = !!(input.showSepaQr && input.branding.iban && input.totalCents);
  if (canShowQr) {
    const payload = buildSepaQrPayload({
      name: input.branding.name,
      iban: input.branding.iban!,
      bic: input.branding.bic ?? undefined,
      amountCents: input.totalCents!,
      remittanceText: input.documentNumber,
    });
    const qrDataUrl = await QRCode.toDataURL(payload, { margin: 0, errorCorrectionLevel: "M" });
    const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
    ensureSpace(104);

    const boxTop = cursorY;
    doc.save().roundedRect(PAGE_MARGIN, boxTop, CONTENT_WIDTH, 94, 4).fillAndStroke("#f9fafb", "#e5e7eb").restore();
    doc.image(qrBuffer, PAGE_MARGIN + 8, boxTop + 7, { fit: [80, 80] });

    const textX = PAGE_MARGIN + 100;
    const textW = CONTENT_WIDTH - 110;
    let ty = boxTop + 8;
    setFont(true);
    doc.fillColor("#111827").fontSize(9).text(t.payQr, textX, ty, { width: textW });
    ty = doc.y + 3;
    if (input.paymentTermsText) {
      setFont(false);
      doc.fillColor("#374151").fontSize(8.5).text(input.paymentTermsText, textX, ty, { width: textW });
      ty = doc.y + 3;
    }
    const lines: [string, string][] = [
      [t.recipient, input.branding.name],
      ["IBAN", input.branding.iban!],
      ...(input.branding.bic ? ([["BIC", input.branding.bic]] as [string, string][]) : []),
      [t.reference, input.documentNumber],
    ];
    doc.fontSize(8.5);
    for (const [label, value] of lines) {
      setFont(false);
      doc.fillColor("#6b7280").text(label, textX, ty, { width: 80, lineBreak: false });
      setFont(true);
      doc.fillColor("#111827").text(value, textX + 82, ty, { width: textW - 82, lineBreak: false });
      ty += 11;
    }
    cursorY = boxTop + 94 + 12;
  } else if (input.paymentTermsText) {
    setFont(false);
    doc.fontSize(9);
    ensureSpace(doc.heightOfString(input.paymentTermsText, { width: CONTENT_WIDTH }) + 16);
    doc.fillColor("#374151").text(input.paymentTermsText, PAGE_MARGIN, cursorY, { width: CONTENT_WIDTH });
    cursorY = doc.y + 12;
  }

  // ---------- Stempel & Unterschrift (automatisch, sofern in den Firmeneinstellungen hinterlegt) ----------
  if (input.branding.stampPath || input.branding.signaturePath) {
    const blockHeight = 90;
    ensureSpace(blockHeight + 10);
    const signatureX = PAGE_MARGIN;
    const stampX = PAGE_MARGIN + 175; // direkt rechts neben der Unterschriftslinie
    const lineY = cursorY + 62;

    if (input.branding.signaturePath && fs.existsSync(input.branding.signaturePath)) {
      try {
        // unten an der Linie ausrichten - sonst schwebt eine (zugeschnittene) flache Unterschrift mit Abstand darüber
        doc.image(input.branding.signaturePath, signatureX, cursorY, { fit: [160, 60], valign: "bottom" });
      } catch {
        // beschädigte/nicht unterstützte Bilddatei: Unterschrift einfach auslassen
      }
      doc.moveTo(signatureX, lineY).lineTo(signatureX + 160, lineY).lineWidth(0.5).strokeColor("#9ca3af").stroke();
      setFont(false);
      doc.fontSize(8).fillColor("#6b7280").text(t.signature, signatureX, cursorY + 66, { width: 160 });
    }

    if (input.branding.stampPath && fs.existsSync(input.branding.stampPath)) {
      try {
        // Stempel steht auf Höhe der Beschriftung "Unterschrift" (Unterkante), direkt neben der Linie
        doc.image(input.branding.stampPath, stampX, cursorY, { fit: [80, 76], valign: "bottom" });
      } catch {
        // beschädigte/nicht unterstützte Bilddatei: Stempel einfach auslassen
      }
    }

    cursorY += blockHeight;
  }

  // ---------- Fußzeile (jede Seite): Firmen-, Bank- und Registerangaben + Seitenzahl ----------
  // Rechtsform, Sitz, Registergericht/-nummer und Geschäftsführer sind auf Geschäftsbriefen und
  // Rechnungen von Kapitalgesellschaften Pflicht (§35a GmbHG, §37a HGB), Steuernummer bzw.
  // USt-IdNr. des Leistenden Pflicht nach §14 Abs. 4 Nr. 2 UStG.
  //
  // Wichtig: Der Fußzeilentext liegt bewusst UNTERHALB des unteren Seitenrands (margins.bottom).
  // PDFKit interpretiert das sonst als Platzmangel und fügt automatisch eine leere Seite ein.
  // Workaround laut pdfkit-Dokumentation: unteren Rand für die Dauer der Zeichnung auf 0 setzen.
  const b = input.branding;
  const footerCols: string[][] = [
    [
      // Rechtsform nur anhängen, wenn sie nicht ohnehin schon im Firmennamen steht ("X GmbH" + "GmbH")
      b.legalForm && !b.name.toLowerCase().includes(b.legalForm.toLowerCase()) ? `${b.name} ${b.legalForm}` : b.name,
      b.street ?? "",
      [b.postalCode, b.city].filter(Boolean).join(" "),
      b.country && b.country !== "DE" ? b.country : "",
    ].filter(Boolean),
    [
      b.phone ? `${t.phone} ${b.phone}` : "",
      b.email ? `${t.email} ${b.email}` : "",
      b.website ?? "",
    ].filter(Boolean),
    [b.bankName ?? "", b.iban ? `IBAN ${formatIban(b.iban)}` : "", b.bic ? `BIC ${b.bic}` : ""].filter(Boolean),
    [
      [b.registerCourt, b.registerNumber].filter(Boolean).join(", "),
      b.managingDirector ? `${t.managing}: ${b.managingDirector}` : "",
      b.taxId ? `${t.taxNo} ${b.taxId}` : "",
      b.vatId ? `${t.vatId} ${b.vatId}` : "",
    ].filter(Boolean),
  ];
  const footerColWidths = [104, 112, 140, 131];
  const footerColGap = (CONTENT_WIDTH - footerColWidths.reduce((a, c) => a + c, 0)) / 3;

  const range = doc.bufferedPageRange();
  const originalBottomMargin = doc.page.margins.bottom;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);

    if (input.isDraft) {
      doc.save();
      setFont(true);
      doc
        .rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] })
        .fontSize(90)
        .fillOpacity(0.12)
        .fillColor("#b91c1c")
        .text(t.draft, 0, doc.page.height / 2 - 50, { width: doc.page.width, align: "center", lineBreak: false });
      doc.restore();
      doc.fillOpacity(1);
    }

    doc.page.margins.bottom = 0;
    if (i > 0) {
      // Laufkopf auf Folgeseiten, damit lose Einzelseiten eindeutig zuordenbar bleiben
      setFont(false);
      doc.fontSize(7.5).fillColor("#6b7280").text(`${input.docTypeLabel[input.locale]} ${input.documentNumber} · ${input.recipient.name}`, PAGE_MARGIN, 30, { width: CONTENT_WIDTH, lineBreak: false });
    }
    doc.moveTo(PAGE_MARGIN, FOOTER_TOP - 6).lineTo(PAGE_MARGIN + CONTENT_WIDTH, FOOTER_TOP - 6).lineWidth(0.5).strokeColor("#d1d5db").stroke();
    footerCols.forEach((lines, idx) => {
      const x = PAGE_MARGIN + footerColWidths.slice(0, idx).reduce((a, c) => a + c, 0) + idx * footerColGap;
      let y = FOOTER_TOP;
      lines.forEach((line, lineIdx) => {
        setFont(idx === 0 && lineIdx === 0);
        doc.fontSize(7.5).fillColor(idx === 0 && lineIdx === 0 ? "#374151" : "#6b7280").text(line, x, y, { width: footerColWidths[idx], height: 20, ellipsis: true });
        y = Math.max(doc.y, y + 10);
      });
    });
    if (b.footerText) {
      setFont(false);
      doc.fontSize(7.5).fillColor("#6b7280").text(b.footerText, PAGE_MARGIN, PAGE_HEIGHT - 42, { width: CONTENT_WIDTH - 90, height: 20, ellipsis: true });
    }
    setFont(false);
    doc.fontSize(7.5).fillColor("#6b7280").text(`${t.page} ${i + 1} ${t.of} ${range.count}`, PAGE_MARGIN + CONTENT_WIDTH - 90, PAGE_HEIGHT - 42, {
      width: 90,
      align: "right",
      lineBreak: false,
    });
    doc.page.margins.bottom = originalBottomMargin;
  }

  if (input.embeddedXml) {
    if (!fonts.embedded) throw new Error("ZUGFeRD braucht eine eingebettete Schrift (PDF/A-3) - keine Schriftdatei gefunden");
    const now = new Date();
    doc.file(Buffer.from(input.embeddedXml.xml, "utf8"), {
      name: input.embeddedXml.filename,
      type: "text/xml",
      description: input.embeddedXml.description,
      relationship: "Alternative", // in den Typen von pdfkit noch nicht enthalten, zur Laufzeit vorhanden
      creationDate: now,
      modifiedDate: now,
    } as any);
    (doc as any).appendXML(input.embeddedXml.xmp);
  }

  doc.end();
  return done;
}

function formatDate(date: Date, intl: string): string {
  return new Intl.DateTimeFormat(intl, { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** IBAN in Vierergruppen ("DE89 3704 0044 ...") - leichter lesbar, entspricht der
 * Papierform-Schreibweise nach DIN 5008. */
function formatIban(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}
