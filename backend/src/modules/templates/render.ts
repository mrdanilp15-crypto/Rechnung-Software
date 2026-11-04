import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { fillPlaceholders, type PlaceholderValues } from "../pdf/placeholders";

/**
 * Vorlagen für E-Mails: Art (kind), Platzhalter und die Daten, mit denen sie für einen konkreten Beleg gefüllt werden.
 * Die Platzhalter sind dieselben wie in den Beleg-Texten ({kunde}, {nummer}, {betrag} ...), dazu kommen für den Versandbescheid
 * {versanddienst}, {sendungsnummer} und {sendungslink}.
 */

export const EMAIL_KINDS = ["QUOTE", "ORDER_CONFIRMATION", "DELIVERY_NOTE", "INVOICE", "SHIPPED", "OTHER"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];
export const DOC_TYPES = ["QUOTE", "ORDER_CONFIRMATION", "DELIVERY_NOTE", "INVOICE"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const CARRIERS: { key: string; label: string }[] = [
  { key: "DHL", label: "DHL" },
  { key: "DPD", label: "DPD" },
  { key: "GLS", label: "GLS" },
  { key: "HERMES", label: "Hermes" },
  { key: "DEUTSCHE_POST", label: "Deutsche Post" },
  { key: "ABHOLUNG", label: "Abholung" },
  { key: "SONSTIGE", label: "Sonstiger Versand" },
];

export const carrierLabel = (key: string | null | undefined) => CARRIERS.find((c) => c.key === key)?.label ?? "";

/** Link zur Sendungsverfolgung des Versanddienstes; leer, wenn es keinen gibt (Abholung, Sonstige) oder keine Nummer vorliegt. */
export function trackingLink(carrier: string | null | undefined, number: string | null | undefined): string {
  const n = (number ?? "").trim();
  if (!n) return "";
  const q = encodeURIComponent(n);
  switch (carrier) {
    case "DHL":
    case "DEUTSCHE_POST":
      return `https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html?piececode=${q}`;
    case "DPD":
      return `https://tracking.dpd.de/status/de_DE/parcel/${q}`;
    case "GLS":
      return `https://gls-group.com/DE/de/paketverfolgung?match=${q}`;
    case "HERMES":
      return `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation#${q}`;
    default:
      return "";
  }
}

const money = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
const date = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d) : "");

interface Customerish {
  name: string;
  contactName: string | null;
}
interface DocBits {
  number: string;
  issueDate: Date;
  due: Date | null;
  totalCents: number;
  customer: Customerish;
  carrier?: string | null;
  trackingNumber?: string | null;
}

/** Werte für die Platzhalter eines Belegs. */
export function placeholderValues(doc: DocBits, companyName: string): PlaceholderValues {
  return {
    kunde: doc.customer.name,
    ansprechpartner: doc.customer.contactName || doc.customer.name,
    nummer: doc.number,
    datum: date(doc.issueDate),
    faellig: date(doc.due),
    betrag: money(doc.totalCents),
    firma: companyName,
    versanddienst: carrierLabel(doc.carrier),
    sendungsnummer: (doc.trackingNumber ?? "").trim(),
    sendungslink: trackingLink(doc.carrier, doc.trackingNumber),
  };
}

export async function loadPlaceholderValues(companyId: string, docType: DocType, docId: string): Promise<PlaceholderValues> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  const companyName = company?.name ?? "";
  const customer = { select: { name: true, contactName: true } };
  const notFound = () => new HttpError(404, "Beleg nicht gefunden");
  if (docType === "INVOICE") {
    const d = await prisma.invoice.findFirst({ where: { id: docId, companyId }, include: { customer } });
    if (!d) throw notFound();
    // Ein Entwurf hat noch keine Nummer - sie wird erst beim Senden vergeben; der Platzhalter bleibt stehen und wird dann vom Versand ersetzt
    return placeholderValues({ number: d.invoiceNumber ?? "{nummer}", issueDate: d.issueDate, due: d.dueDate, totalCents: d.totalCents, customer: d.customer }, companyName);
  }
  if (docType === "QUOTE") {
    const d = await prisma.quote.findFirst({ where: { id: docId, companyId }, include: { customer } });
    if (!d) throw notFound();
    return placeholderValues({ number: d.quoteNumber, issueDate: d.issueDate, due: d.validUntil, totalCents: d.totalCents, customer: d.customer }, companyName);
  }
  if (docType === "ORDER_CONFIRMATION") {
    const d = await prisma.orderConfirmation.findFirst({ where: { id: docId, companyId }, include: { customer } });
    if (!d) throw notFound();
    return placeholderValues({ number: d.confirmationNumber, issueDate: d.issueDate, due: d.expectedDeliveryDate, totalCents: d.totalCents, customer: d.customer, carrier: d.carrier, trackingNumber: d.trackingNumber }, companyName);
  }
  const d = await prisma.deliveryNote.findFirst({ where: { id: docId, companyId }, include: { customer } });
  if (!d) throw notFound();
  return placeholderValues({ number: d.noteNumber, issueDate: d.deliveryDate, due: null, totalCents: 0, customer: d.customer }, companyName);
}

export function renderText(text: string, values: PlaceholderValues): string {
  return fillPlaceholders(text, values);
}

/** Eingebauter Text des Versandbescheids, solange keine eigene Vorlage der Art SHIPPED als Standard festgelegt ist. */
export const BUILTIN_SHIPPED = {
  subject: "Ihre Bestellung {nummer} ist unterwegs",
  body: "Hallo {ansprechpartner},\n\nIhre Bestellung {nummer} haben wir heute versendet.\n\nVersanddienst: {versanddienst}\nSendungsnummer: {sendungsnummer}\nSendungsverfolgung: {sendungslink}\n\nBei Fragen melden Sie sich gern.\n\nMit freundlichen Grüßen\n{firma}",
};

/** Zeilen für Versandangaben, die leer sind (z.B. Abholung ohne Nummer), entfernen, damit keine leeren Hülsen wie "Sendungsnummer: " stehen bleiben. */
export function dropEmptyShippingLines(text: string): string {
  return text
    .split("\n")
    .filter((l) => !/^(Versanddienst|Sendungsnummer|Sendungsverfolgung|Carrier|Tracking)[^:]*:\s*$/i.test(l.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export const EXAMPLE_TEMPLATES: { kind: EmailKind; name: string; subject: string; body: string; isDefault: boolean }[] = [
  {
    kind: "QUOTE",
    name: "Angebot Standard",
    subject: "Ihr Angebot {nummer}",
    body: "Hallo {ansprechpartner},\n\nvielen Dank für Ihre Anfrage. Anbei erhalten Sie unser Angebot {nummer} über {betrag}, gültig bis {faellig}.\n\nBei Fragen oder Änderungswünschen melden Sie sich gern.\n\nMit freundlichen Grüßen\n{firma}",
    isDefault: true,
  },
  {
    kind: "ORDER_CONFIRMATION",
    name: "Auftragsbestätigung Standard",
    subject: "Auftragsbestätigung {nummer}",
    body: "Hallo {ansprechpartner},\n\nvielen Dank für Ihren Auftrag. Anbei die Auftragsbestätigung {nummer} über {betrag}. Wir beginnen jetzt mit der Fertigung und melden uns, sobald Ihre Bestellung versendet wird.\n\nMit freundlichen Grüßen\n{firma}",
    isDefault: true,
  },
  {
    kind: "DELIVERY_NOTE",
    name: "Lieferschein Standard",
    subject: "Lieferschein {nummer}",
    body: "Hallo {ansprechpartner},\n\nanbei der Lieferschein {nummer} zu Ihrer Bestellung.\n\nMit freundlichen Grüßen\n{firma}",
    isDefault: true,
  },
  {
    kind: "INVOICE",
    name: "Rechnung Standard",
    subject: "Rechnung {nummer}",
    body: "Hallo {ansprechpartner},\n\nvielen Dank für Ihren Auftrag. Anbei erhalten Sie die Rechnung {nummer} über {betrag}. Bitte überweisen Sie den Betrag bis zum {faellig}.\n\nMit freundlichen Grüßen\n{firma}",
    isDefault: true,
  },
  { kind: "SHIPPED", name: "Versandbescheid Standard", subject: BUILTIN_SHIPPED.subject, body: BUILTIN_SHIPPED.body, isDefault: true },
];
