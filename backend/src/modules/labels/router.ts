import { Router } from "express";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { resolvePdfFonts } from "../pdf/fonts";

/**
 * Versandetikett (Adressaufkleber): Empfänger groß, Absender klein in der Kopfzeile. Als PDF in gängigen Etikettengrößen - das
 * Drucken läuft über den normalen Druckdialog des Browsers/Betriebssystems (jeder Etikettendrucker mit Treiber, auch Brother QL,
 * Dymo, Zebra; Papiergröße im Druckdialog passend wählen). Es werden keine Versandmarken von DHL/DPD o.ä. erzeugt - dafür braucht
 * es einen Geschäftskunden-Zugang des Versanddienstes.
 */
export const labelsRouter = Router();
labelsRouter.use(requireAuth);

const MM = 72 / 25.4;
export const LABEL_SIZES = {
  a6: { label: "A6 (105 × 148 mm)", w: 105 * MM, h: 148 * MM },
  "10x15": { label: "10 × 15 cm (Versandetikett)", w: 100 * MM, h: 150 * MM },
  "62x100": { label: "62 × 100 mm (Brother QL, Endlosrolle)", w: 62 * MM, h: 100 * MM },
} as const;
export type LabelSize = keyof typeof LABEL_SIZES;

export interface LabelAddress {
  name: string;
  contactName?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
}

const COUNTRY_NAMES: Record<string, string> = { DE: "DEUTSCHLAND", AT: "ÖSTERREICH", CH: "SCHWEIZ", NL: "NIEDERLANDE", FR: "FRANKREICH", IT: "ITALIEN", ES: "SPANIEN", PL: "POLEN", BE: "BELGIEN", LU: "LUXEMBURG", DK: "DÄNEMARK", CZ: "TSCHECHIEN", GB: "VEREINIGTES KÖNIGREICH", US: "USA" };

/** Adresszeilen des Empfängers; das Land steht nur bei Auslandsversand dabei (in Großbuchstaben). */
export function recipientLines(a: LabelAddress): string[] {
  const lines = [a.name];
  if (a.contactName && a.contactName !== a.name) lines.push(`z. H. ${a.contactName}`);
  if (a.street) lines.push(a.street);
  const cityLine = [a.postalCode, a.city].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  const c = (a.country ?? "DE").toUpperCase();
  if (c !== "DE") lines.push(COUNTRY_NAMES[c] ?? c);
  return lines;
}

export function senderLine(c: { name: string; street?: string | null; postalCode?: string | null; city?: string | null }): string {
  return [c.name, c.street, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
}

export function renderLabelPdf(input: { size: LabelSize; sender: string; to: LabelAddress; ref?: string; note?: string }): Promise<Buffer> {
  const { w, h } = LABEL_SIZES[input.size];
  const fonts = resolvePdfFonts();
  const margin = Math.max(10, w * 0.07);
  const doc = new PDFDocument({ size: [w, h], margin, font: fonts.regular, info: { Title: "Versandetikett" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const inner = w - 2 * margin;

  // Absender (klein, unterstrichen)
  doc.font(fonts.regular).fontSize(Math.max(6, w / 36)).fillColor("#000").text(input.sender, margin, margin, { width: inner, underline: true });
  doc.moveDown(1.5);

  // Empfänger: so groß, dass die längste Zeile in die Breite passt
  const lines = recipientLines(input.to);
  let size = Math.min(22, w / 12);
  doc.font(fonts.bold);
  while (size > 8 && Math.max(...lines.map((l) => doc.fontSize(size).widthOfString(l))) > inner) size -= 0.5;
  doc.fontSize(size);
  lines.forEach((l, i) => {
    doc.font(i === 0 ? fonts.bold : fonts.regular).fontSize(size).text(l, { width: inner });
  });

  // Fußzeile: Beleg-Bezug und Hinweis
  const footer = [input.ref, input.note].filter(Boolean).join("   ·   ");
  if (footer) doc.font(fonts.regular).fontSize(Math.max(6, w / 34)).text(footer, margin, h - margin - 12, { width: inner, align: "left" });
  doc.end();
  return done;
}

const querySchema = z.object({
  size: z.enum(["a6", "10x15", "62x100"]).default("10x15"),
  ref: z.string().max(80).optional(),
  note: z.string().max(80).optional(),
});

async function sendLabel(req: { auth?: { companyId: string } }, res: import("express").Response, customerId: string, query: unknown, defaultRef?: string) {
  const q = querySchema.parse(query);
  const [company, customer] = await Promise.all([
    prisma.company.findUnique({ where: { id: req.auth!.companyId } }),
    prisma.customer.findFirst({ where: { id: customerId, companyId: req.auth!.companyId } }),
  ]);
  if (!company || !customer) throw new HttpError(404, "Kunde nicht gefunden");
  if (!customer.street && !customer.city) throw new HttpError(422, "Beim Kunden ist keine Adresse hinterlegt.");
  const pdf = await renderLabelPdf({ size: q.size, sender: senderLine(company), to: customer, ref: q.ref ?? defaultRef, note: q.note });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="versandetikett.pdf"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(pdf);
}

labelsRouter.get("/sizes", (_req, res) => {
  res.json(Object.entries(LABEL_SIZES).map(([key, v]) => ({ key, label: v.label })));
});

labelsRouter.get("/customer/:id", (req, res) => sendLabel(req, res, req.params.id, req.query));

const DOC_TYPES = {
  invoices: (id: string, companyId: string) => prisma.invoice.findFirst({ where: { id, companyId }, select: { customerId: true, invoiceNumber: true } }).then((d) => d && { customerId: d.customerId, ref: d.invoiceNumber ? `Rechnung ${d.invoiceNumber}` : undefined }),
  "delivery-notes": (id: string, companyId: string) => prisma.deliveryNote.findFirst({ where: { id, companyId }, select: { customerId: true, noteNumber: true } }).then((d) => d && { customerId: d.customerId, ref: d.noteNumber ? `Lieferschein ${d.noteNumber}` : undefined }),
  "order-confirmations": (id: string, companyId: string) => prisma.orderConfirmation.findFirst({ where: { id, companyId }, select: { customerId: true, confirmationNumber: true } }).then((d) => d && { customerId: d.customerId, ref: d.confirmationNumber ? `Auftrag ${d.confirmationNumber}` : undefined }),
} as const;

labelsRouter.get("/document/:type/:id", async (req, res) => {
  const finder = DOC_TYPES[req.params.type as keyof typeof DOC_TYPES];
  if (!finder) throw new HttpError(404, "Unbekannter Belegtyp");
  const doc = await finder(req.params.id, req.auth!.companyId);
  if (!doc) throw new HttpError(404, "Beleg nicht gefunden");
  await sendLabel(req, res, doc.customerId, req.query, doc.ref);
});
