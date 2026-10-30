import { Router } from "express";
import { z } from "zod";
import { Parser as CsvParser } from "json2csv";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { nextDocumentNumber } from "../shared/numbering";
import { formatCents } from "../tax/calculator";
import { buildInvoiceFinancials, defaultDueDate } from "./build";
import { previewSchema, renderInvoicePreview } from "./preview";
import { previewRateLimiter } from "../../middleware/rateLimit";
import type { Prisma, PrismaClient } from "@prisma/client";
import { emitEvent } from "../plugins/hooks";
import { generateAndStoreInvoicePdf } from "./pdfHelper";
import { buildXRechnungXml, getXRechnungBlockers } from "../einvoice/xrechnung";
import { buildFacturXml, FACTURX_XMP } from "../einvoice/facturx";
import { getInvoiceComplianceWarnings } from "../tax/compliance";
import { sendMailForCompany, isSmtpConfigured, buildInvoiceEmailText, buildReminderEmailText } from "../email/mailer";
import { deductMaterialStock, restoreMaterialStock } from "../materials/stock";

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

const lineItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().default("Stk."),
  unitPriceCents: z.number().int(),
  vatRateBps: z.number().int().min(0).max(10000),
  isDownPaymentDeduction: z.boolean().optional(),
  deductsInvoiceId: z.string().optional(),
});

const createInvoiceSchema = z.object({
  customerId: z.string(),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  deliveryDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  supplyType: z.enum(["GOODS", "SERVICE"]).optional(),
  introText: z.string().max(3000).optional(),
  closingText: z.string().max(3000).optional(),
  items: z.array(lineItemSchema).min(1),
  sourceQuoteId: z.string().optional(),
});

invoicesRouter.get("/", async (req, res) => {
  const { status, customerId, q } = req.query as Record<string, string | undefined>;
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId: req.auth!.companyId,
      ...(status ? { status: status as any } : {}),
      ...(customerId ? { customerId } : {}),
      ...(q ? { invoiceNumber: { contains: q } } : {}),
    },
    include: { customer: true },
    orderBy: { issueDate: "desc" },
  });
  res.json(invoices);
});

invoicesRouter.get("/:id", async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { items: true, customer: true, company: true, correctsInvoice: true, corrections: true },
  });
  if (!invoice) throw new HttpError(404, "Rechnung nicht gefunden");
  const complianceWarnings = getInvoiceComplianceWarnings(invoice.company, invoice, invoice.customer);
  const { company, ...rest } = invoice;
  res.json({ ...rest, complianceWarnings });
});

// Vergibt die endgültige, fortlaufende Rechnungsnummer erst beim ersten Verlassen von
// DRAFT (Versenden bzw. direktes "als bezahlt markieren"). Wird ein Entwurf vorher
// gelöscht, ohne je eine Nummer bekommen zu haben, entsteht dadurch KEINE Lücke in der
// Nummernfolge - eine lückenlose Rechnungsnummerierung ist eine GoBD-Kernanforderung.
async function finalizeInvoiceNumber(tx: Prisma.TransactionClient | PrismaClient, invoice: { id: string; companyId: string; invoiceNumber: string | null }) {
  if (invoice.invoiceNumber) return invoice.invoiceNumber;
  const invoiceNumber = await nextDocumentNumber(invoice.companyId, "INVOICE", tx);
  await tx.invoice.update({ where: { id: invoice.id }, data: { invoiceNumber } });
  return invoiceNumber;
}

invoicesRouter.post("/", async (req, res) => {
  const body = createInvoiceSchema.parse(req.body);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });
  const customer = await prisma.customer.findFirst({ where: { id: body.customerId, companyId: company.id } });
  if (!customer) throw new HttpError(404, "Kunde nicht gefunden");

  const supplyType = body.supplyType ?? "GOODS";
  const financials = buildInvoiceFinancials(company, customer, body.items, supplyType);
  const issueDate = body.issueDate ?? new Date();

  const invoice = await prisma.$transaction(async (tx) => {
    await deductMaterialStock(tx, body.items);
    return tx.invoice.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        // Nummer wird bewusst erst bei finalizeInvoiceNumber() vergeben (siehe dort).
        issueDate,
        // Ohne ausdrückliches Fälligkeitsdatum gilt das in den Firmeneinstellungen hinterlegte
        // Standard-Zahlungsziel - sonst fehlt auf dem PDF jede Zahlungsfrist.
        dueDate: body.dueDate ?? defaultDueDate(company, issueDate),
        deliveryDate: body.deliveryDate,
        isSmallBusiness: financials.isSmallBusiness,
        vatNoticeKey: financials.vatNoticeKey,
        supplyType,
        notes: body.notes,
        // Texte werden beim Anlegen aus den Firmeneinstellungen übernommen (am Beleg änderbar, solange Entwurf)
        introText: body.introText ?? company.invoiceIntroText,
        closingText: body.closingText ?? company.invoiceClosingText,
        footerText: company.invoiceFooterText,
        sourceQuoteId: body.sourceQuoteId,
        subtotalCents: financials.subtotalCents,
        vatTotalCents: financials.vatTotalCents,
        totalCents: financials.totalCents,
        items: { create: financials.itemsCreate },
      },
      include: { items: true, customer: true },
    });
  });

  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "invoice.create", entityType: "Invoice", entityId: invoice.id });
  await emitEvent("invoice.created", { companyId: company.id, invoice });
  res.status(201).json(invoice);
});

// Live-Vorschau des (noch nicht gespeicherten) Formularstands als Entwurfs-PDF - speichert nichts.
invoicesRouter.post("/preview-pdf", previewRateLimiter, async (req, res) => {
  const body = previewSchema.parse(req.body);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });
  const customer = body.customerId ? await prisma.customer.findFirst({ where: { id: body.customerId, companyId: company.id } }) : null;
  const pdf = await renderInvoicePreview(company, customer, body);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "no-store");
  res.send(pdf);
});

invoicesRouter.patch("/:id", async (req, res) => {
  const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId }, include: { items: true } });
  if (!existing) throw new HttpError(404, "Rechnung nicht gefunden");
  if (existing.status !== "DRAFT") {
    throw new HttpError(409, "Nur Entwürfe können bearbeitet werden. Bereits versendete Rechnungen sind aus GoBD-Gründen unveränderlich - bitte stornieren und neu erstellen.");
  }
  const body = createInvoiceSchema.partial().parse(req.body);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });

  let updateData: any = {
    customerId: body.customerId,
    issueDate: body.issueDate,
    dueDate: body.dueDate,
    deliveryDate: body.deliveryDate,
    notes: body.notes,
    supplyType: body.supplyType,
    introText: body.introText,
    closingText: body.closingText,
  };

  // Ein anderer Kunde kann eine andere USt.-Behandlung bedeuten (Reverse-Charge/Ausfuhr) -
  // die Beträge lassen sich aber nur aus den ursprünglichen Positionssätzen neu berechnen,
  // die bei 0%-Behandlung nicht mehr vorliegen. Deshalb müssen die Positionen mitgeschickt werden.
  if (body.customerId && body.customerId !== existing.customerId && !body.items) {
    throw new HttpError(400, "Beim Wechsel des Kunden müssen die Positionen mitgesendet werden, damit die Umsatzsteuer neu berechnet werden kann.");
  }

  if (body.items) {
    const customer = await prisma.customer.findFirstOrThrow({ where: { id: body.customerId ?? existing.customerId, companyId: company.id } });
    const financials = buildInvoiceFinancials(company, customer, body.items, (body.supplyType ?? existing.supplyType) as "GOODS" | "SERVICE");
    updateData = {
      ...updateData,
      isSmallBusiness: financials.isSmallBusiness,
      vatNoticeKey: financials.vatNoticeKey,
      subtotalCents: financials.subtotalCents,
      vatTotalCents: financials.vatTotalCents,
      totalCents: financials.totalCents,
      items: { deleteMany: {}, create: financials.itemsCreate },
    };
  }

  // Bei geänderten Positionen: Materialbestand neu berechnen - alte Positionen
  // gutschreiben, neue Positionen abziehen, atomar zusammen mit dem Update.
  const updated = await prisma.$transaction(async (tx) => {
    if (body.items) {
      await restoreMaterialStock(tx, existing.items);
      await deductMaterialStock(tx, body.items);
    }
    return tx.invoice.update({ where: { id: existing.id }, data: updateData, include: { items: true, customer: true } });
  });
  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "invoice.update", entityType: "Invoice", entityId: existing.id });
  res.json(updated);
});

// Entwürfe dürfen hart gelöscht werden (kein GoBD-Konflikt, da noch keine Ausgabe an den
// Kunden erfolgt ist). Bereits versendete Rechnungen können nur storniert werden (siehe unten).
invoicesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId }, include: { items: true } });
  if (!existing) throw new HttpError(404, "Rechnung nicht gefunden");
  if (existing.status !== "DRAFT") {
    throw new HttpError(409, "Nur Entwürfe können gelöscht werden. Bereits versendete Rechnungen bitte stornieren.");
  }
  await prisma.$transaction(async (tx) => {
    await restoreMaterialStock(tx, existing.items);
    // Anzahlungen, die in diesem Entwurf abgezogen werden sollten, stehen für eine neue Schlussrechnung wieder bereit
    await tx.invoice.updateMany({ where: { finalInvoiceId: existing.id }, data: { finalInvoiceId: null } });
    await tx.invoice.delete({ where: { id: existing.id } });
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "invoice.delete_draft", entityType: "Invoice", entityId: existing.id });
  res.status(204).send();
});

// Löscht mehrere Entwürfe auf einmal (Mehrfachauswahl in der Liste). Bereits versendete/
// bezahlte Rechnungen werden IMMER übersprungen und in skippedIds zurückgemeldet - es
// gibt bewusst keine Möglichkeit (auch nicht für Admins), einen bereits ausgegebenen
// Beleg endgültig zu löschen (GoBD/§147 AO). Zum Korrigieren/Stornieren siehe
// POST /:id/cancel, das einen echten Korrekturbeleg erzeugt statt zu löschen.
invoicesRouter.post("/bulk-delete", async (req, res) => {
  const body = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
  const candidates = await prisma.invoice.findMany({
    where: { id: { in: body.ids }, companyId: req.auth!.companyId },
    select: { id: true, status: true },
  });
  const deletableIds = candidates.filter((inv) => inv.status === "DRAFT").map((inv) => inv.id);
  const skippedIds = body.ids.filter((id) => !deletableIds.includes(id));

  if (deletableIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      const draftItems = await tx.invoiceItem.findMany({ where: { invoiceId: { in: deletableIds } } });
      await restoreMaterialStock(tx, draftItems);
      await tx.invoice.updateMany({ where: { finalInvoiceId: { in: deletableIds } }, data: { finalInvoiceId: null } });
      await tx.invoice.deleteMany({ where: { id: { in: deletableIds } } });
    });
    await writeAuditLog({
      req,
      companyId: req.auth!.companyId,
      userId: req.auth!.sub,
      action: "invoice.bulk_delete_draft",
      entityType: "Invoice",
      entityId: deletableIds.join(","),
      metadata: { deletedIds: deletableIds },
    });
  }

  res.json({ deletedCount: deletableIds.length, skippedIds });
});

invoicesRouter.post("/:id/send", async (req, res) => {
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!invoice) throw new HttpError(404, "Rechnung nicht gefunden");
  if (invoice.status !== "DRAFT") throw new HttpError(409, "Nur Entwürfe können versendet werden");
  const updated = await prisma.$transaction(async (tx) => {
    await finalizeInvoiceNumber(tx, invoice);
    return tx.invoice.update({ where: { id: invoice.id }, data: { status: "SENT" } });
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "invoice.send", entityType: "Invoice", entityId: invoice.id, metadata: { invoiceNumber: updated.invoiceNumber } });
  await emitEvent("invoice.sent", { companyId: req.auth!.companyId, invoice: updated });
  res.json(updated);
});

invoicesRouter.post("/:id/mark-paid", requireRole("ADMIN", "BUCHHALTUNG"), async (req, res) => {
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!invoice) throw new HttpError(404, "Rechnung nicht gefunden");
  if (invoice.status === "CANCELLED") throw new HttpError(409, "Stornierte Rechnung kann nicht als bezahlt markiert werden");
  const updated = await prisma.$transaction(async (tx) => {
    // Direktes "als bezahlt markieren" aus dem Entwurf heraus (z.B. Barverkauf ohne
    // separaten Versand-Schritt) verlässt DRAFT genauso endgültig wie ein Versand -
    // auch hier muss also die Rechnungsnummer final vergeben werden.
    await finalizeInvoiceNumber(tx, invoice);
    return tx.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAt: new Date() } });
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "invoice.mark_paid", entityType: "Invoice", entityId: invoice.id, metadata: { invoiceNumber: updated.invoiceNumber } });
  await emitEvent("invoice.paid", { companyId: req.auth!.companyId, invoice: updated });
  res.json(updated);
});

// Storno/Rechnungskorrektur: Eine bereits versendete/bezahlte Rechnung wird NIE
// nachträglich verändert oder gelöscht (GoBD-Unveränderbarkeit), sondern durch einen
// eigenständigen Korrekturbeleg (Gutschrift) mit negierten Beträgen, eigener
// fortlaufender Nummer und explizitem Verweis auf das Original ausgeglichen. Das
// Original bleibt vollständig erhalten und wird nur als CANCELLED markiert.
invoicesRouter.post("/:id/cancel", requireRole("ADMIN", "BUCHHALTUNG"), async (req, res) => {
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId }, include: { items: true, customer: true } });
  if (!invoice) throw new HttpError(404, "Rechnung nicht gefunden");
  if (invoice.status === "DRAFT") throw new HttpError(409, "Entwürfe bitte direkt löschen, nicht stornieren.");
  if (invoice.status === "CANCELLED") throw new HttpError(409, "Rechnung ist bereits storniert.");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: req.auth!.companyId } });

  const creditNote = await prisma.$transaction(async (tx) => {
    await restoreMaterialStock(tx, invoice.items);
    // In dieser Rechnung abgezogene Anzahlungen werden wieder frei - eine neue Schlussrechnung muss sie erneut abziehen
    await tx.invoice.updateMany({ where: { finalInvoiceId: invoice.id }, data: { finalInvoiceId: null } });
    const creditNoteNumber = await nextDocumentNumber(company.id, "INVOICE", tx);
    const note = await tx.invoice.create({
      data: {
        companyId: company.id,
        customerId: invoice.customerId,
        invoiceNumber: creditNoteNumber,
        status: "SENT",
        isSmallBusiness: invoice.isSmallBusiness,
        // Der Korrekturbeleg bildet die Originalrechnung 1:1 ab - auch den Steuerhinweis (z.B. innergemeinschaftliche
        // Lieferung, Reverse-Charge, Ausfuhr) und die Leistungsart, sonst fehlt er im PDF, in der XRechnung und in der USt-Übersicht
        vatNoticeKey: invoice.vatNoticeKey,
        supplyType: invoice.supplyType,
        footerText: company.invoiceFooterText,
        correctsInvoiceId: invoice.id,
        isCancellationDocument: true,
        kind: invoice.kind,
        subtotalCents: -invoice.subtotalCents,
        vatTotalCents: -invoice.vatTotalCents,
        totalCents: -invoice.totalCents,
        notes: req.body?.reason ? String(req.body.reason).slice(0, 500) : undefined,
        items: {
          create: invoice.items.map((item) => ({
            position: item.position,
            productId: item.productId,
            description: item.description,
            quantity: -item.quantity,
            unit: item.unit,
            unitPriceCents: item.unitPriceCents,
            vatRateBps: item.vatRateBps,
            lineTotalCents: -item.lineTotalCents,
            isDownPaymentDeduction: item.isDownPaymentDeduction,
            deductsInvoiceId: item.deductsInvoiceId,
          })),
        },
      },
      include: { items: true, customer: true },
    });
    await tx.invoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED" } });
    return note;
  });

  await writeAuditLog({
    req,
    companyId: req.auth!.companyId,
    userId: req.auth!.sub,
    action: "invoice.cancel",
    entityType: "Invoice",
    entityId: invoice.id,
    metadata: { creditNoteId: creditNote.id, creditNoteNumber: creditNote.invoiceNumber },
  });
  res.status(201).json(creditNote);
});

invoicesRouter.get("/:id/pdf", async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { items: true, customer: true, company: true, correctsInvoice: true },
  });
  if (!invoice) throw new HttpError(404, "Rechnung nicht gefunden");
  const locale = (req.query.lang as "de" | "en") || (invoice.company.defaultLocale as "de" | "en") || "de";

  const pdfBuffer = await generateAndStoreInvoicePdf(invoice, locale, req.query.layout);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNumber ?? "entwurf"}.pdf"`);
  res.send(pdfBuffer);
});

// E-Rechnung (XRechnung, UBL 2.1/EN16931) - siehe modules/einvoice/xrechnung.ts für
// Details und wichtige Hinweise zur Validierung vor dem produktiven Einsatz. Nur für
// bereits finalisierte Rechnungen (mit Nummer) möglich, ein Entwurf kann sich noch
// ändern und ist ohnehin noch kein rechtsgültiger Beleg.
invoicesRouter.get("/:id/xrechnung", async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { items: true, customer: true, company: true, correctsInvoice: { select: { invoiceNumber: true } } },
  });
  if (!invoice) throw new HttpError(404, "Rechnung nicht gefunden");
  if (!invoice.invoiceNumber) {
    throw new HttpError(409, "Nur bereits versendete/finalisierte Rechnungen können als XRechnung exportiert werden.");
  }
  const deductedIds = [...new Set(invoice.items.map((i) => i.deductsInvoiceId).filter((x): x is string => !!x))];
  const preceding = deductedIds.length ? await prisma.invoice.findMany({ where: { id: { in: deductedIds } }, select: { invoiceNumber: true } }) : [];
  const blockers = getXRechnungBlockers(invoice);
  if (blockers.length > 0) {
    throw new HttpError(422, `Für die XRechnung fehlen Pflichtangaben: ${blockers.join("; ")}.`);
  }
  const xml = buildXRechnungXml({ ...invoice, precedingInvoiceNumbers: preceding.map((p) => p.invoiceNumber).filter((n): n is string => !!n) });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "invoice.xrechnung_export", entityType: "Invoice", entityId: invoice.id });
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.xml"`);
  res.send(xml);
});

// ZUGFeRD / Factur-X (Profil EN 16931): normales PDF (PDF/A-3) mit eingebetteter strukturierter Rechnung (CII-XML).
// Wie die XRechnung nur für finalisierte Rechnungen; die archivierte Standard-PDF bleibt unverändert.
invoicesRouter.get("/:id/zugferd", async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { items: true, customer: true, company: true, correctsInvoice: true },
  });
  if (!invoice) throw new HttpError(404, "Rechnung nicht gefunden");
  if (!invoice.invoiceNumber) throw new HttpError(409, "Nur bereits finalisierte Rechnungen können als ZUGFeRD-PDF exportiert werden.");
  const blockers = getXRechnungBlockers(invoice);
  if (blockers.length > 0) throw new HttpError(422, `Für die E-Rechnung fehlen Pflichtangaben: ${blockers.join("; ")}.`);
  const deductedIds = [...new Set(invoice.items.map((i) => i.deductsInvoiceId).filter((x): x is string => !!x))];
  const preceding = deductedIds.length ? await prisma.invoice.findMany({ where: { id: { in: deductedIds } }, select: { invoiceNumber: true } }) : [];
  const xml = buildFacturXml({ ...invoice, precedingInvoiceNumbers: preceding.map((p) => p.invoiceNumber).filter((n): n is string => !!n) });
  const locale = (req.query.lang as "de" | "en") || (invoice.company.defaultLocale as "de" | "en") || "de";
  const pdf = await generateAndStoreInvoicePdf(invoice, locale, req.query.layout, {
    xml,
    filename: "factur-x.xml",
    description: "Factur-X Invoice (EN 16931)",
    xmp: FACTURX_XMP,
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "invoice.zugferd_export", entityType: "Invoice", entityId: invoice.id });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}-zugferd.pdf"`);
  res.send(pdf);
});

// ---------- E-Mail-Versand & Zahlungserinnerung ----------

const sendEmailSchema = z.object({
  to: z.string().email().optional(),
  subject: z.string().optional(),
  message: z.string().optional(),
  copyToSelf: z.boolean().optional(),
});

invoicesRouter.post("/:id/send-email", async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { items: true, customer: true, company: true, correctsInvoice: true },
  });
  if (!invoice) throw new HttpError(404, "Rechnung nicht gefunden");
  if (invoice.status === "CANCELLED") {
    throw new HttpError(409, "Stornierte Rechnungen können nicht per E-Mail verschickt werden (den Korrekturbeleg schicken Sie stattdessen).");
  }
  const body = sendEmailSchema.parse(req.body);
  const to = body.to || invoice.customer.email;
  if (!to) throw new HttpError(400, "Keine E-Mail-Adresse hinterlegt. Bitte beim Kunden eine E-Mail-Adresse eintragen oder eine Empfängeradresse angeben.");

  // Der tatsächliche Versand ist der Moment, an dem der Entwurf zur echten Rechnung
  // wird - die fortlaufende Nummer muss also VOR PDF/E-Mail feststehen, nicht erst danach.
  if (invoice.status === "DRAFT") {
    invoice.invoiceNumber = await finalizeInvoiceNumber(prisma, invoice);
  }
  const invoiceNumber = invoice.invoiceNumber!;

  const locale = (invoice.company.defaultLocale as "de" | "en") || "de";
  const pdfBuffer = await generateAndStoreInvoicePdf(invoice, locale);
  const text =
    body.message ||
    buildInvoiceEmailText({
      customerName: invoice.customer.contactName || invoice.customer.name,
      companyName: invoice.company.name,
      documentLabel: locale === "en" ? "invoice" : "die Rechnung",
      documentNumber: invoiceNumber,
      locale,
    });

  try {
    await sendMailForCompany(invoice.company, {
      to,
      bcc: body.copyToSelf ? invoice.company.smtpFromEmail || invoice.company.smtpUser || undefined : undefined,
      subject: body.subject || `${locale === "en" ? "Invoice" : "Rechnung"} ${invoiceNumber}`,
      text,
      attachments: [{ filename: `${invoiceNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
    });
  } catch (err) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { emailStatus: "FAILED", lastEmailError: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      emailStatus: "SENT",
      emailSentAt: new Date(),
      lastEmailError: null,
      status: invoice.status === "DRAFT" ? "SENT" : invoice.status,
    },
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "invoice.send_email", entityType: "Invoice", entityId: invoice.id, metadata: { to } });
  if (invoice.status === "DRAFT") await emitEvent("invoice.sent", { companyId: req.auth!.companyId, invoice: updated });
  res.json({ ...updated, sentTo: to });
});

invoicesRouter.post("/:id/remind", async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, companyId: req.auth!.companyId },
    include: { customer: true, company: true },
  });
  if (!invoice) throw new HttpError(404, "Rechnung nicht gefunden");
  if (invoice.status !== "SENT" && invoice.status !== "OVERDUE") {
    throw new HttpError(409, "Zahlungserinnerungen sind nur für versendete, offene Rechnungen möglich.");
  }

  const nextLevel = invoice.reminderCount + 1;
  // Status ist hier bereits als SENT/OVERDUE geprüft (siehe oben) - die Nummer wurde
  // beim Verlassen von DRAFT bereits final vergeben (finalizeInvoiceNumber), ist an
  // dieser Stelle also garantiert gesetzt.
  const invoiceNumber = invoice.invoiceNumber!;
  const text = buildReminderEmailText({
    customerName: invoice.customer.contactName || invoice.customer.name,
    companyName: invoice.company.name,
    invoiceNumber,
    totalFormatted: formatCents(invoice.totalCents),
    dueDateFormatted: invoice.dueDate ? new Intl.DateTimeFormat("de-DE").format(invoice.dueDate) : undefined,
    reminderLevel: nextLevel,
  });

  let emailSent = false;
  if (invoice.customer.email && isSmtpConfigured(invoice.company)) {
    await sendMailForCompany(invoice.company, {
      to: invoice.customer.email,
      subject: `Zahlungserinnerung: Rechnung ${invoiceNumber}`,
      text,
    });
    emailSent = true;
  }

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { reminderCount: nextLevel, lastReminderAt: new Date() },
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "invoice.remind", entityType: "Invoice", entityId: invoice.id, metadata: { level: nextLevel, emailSent } });
  res.json({ invoice: updated, emailSent, reminderText: text });
});

// ---------- Export (CSV/JSON) ----------

invoicesRouter.get("/export/all", async (req, res) => {
  const format = (req.query.format as string) || "json";
  const invoices = await prisma.invoice.findMany({
    where: { companyId: req.auth!.companyId },
    include: { customer: true, items: true },
    orderBy: { issueDate: "desc" },
  });

  if (format === "csv") {
    const rows = invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      customer: inv.customer.name,
      issueDate: inv.issueDate.toISOString().slice(0, 10),
      dueDate: inv.dueDate?.toISOString().slice(0, 10) ?? "",
      status: inv.status,
      subtotalEur: (inv.subtotalCents / 100).toFixed(2),
      vatEur: (inv.vatTotalCents / 100).toFixed(2),
      totalEur: (inv.totalCents / 100).toFixed(2),
    }));
    const parser = new CsvParser();
    const csv = parser.parse(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="rechnungen.csv"');
    return res.send(csv);
  }

  res.setHeader("Content-Disposition", 'attachment; filename="rechnungen.json"');
  res.json(invoices);
});

// Rechnung als neuen Entwurf kopieren (Kunde, Positionen, Anmerkung, Texte) - mit heutigem Datum, ohne Nummer.
// Steuerbehandlung und Materialbestand werden wie bei jeder neuen Rechnung neu berechnet bzw. abgezogen.
invoicesRouter.post("/:id/duplicate", async (req, res) => {
  const source = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId }, include: { items: true, customer: true } });
  if (!source) throw new HttpError(404, "Rechnung nicht gefunden");
  if (source.isCancellationDocument) throw new HttpError(400, "Ein Korrekturbeleg kann nicht kopiert werden.");
  const company = await prisma.company.findUniqueOrThrow({ where: { id: source.companyId } });
  const supplyType = (source.supplyType === "SERVICE" ? "SERVICE" : "GOODS") as "GOODS" | "SERVICE";
  const financials = buildInvoiceFinancials(company, source.customer, source.items.map((i) => ({ productId: i.productId, description: i.description, quantity: i.quantity, unit: i.unit, unitPriceCents: i.unitPriceCents, vatRateBps: i.vatRateBps })), supplyType);
  const issueDate = new Date();
  const copy = await prisma.$transaction(async (tx) => {
    await deductMaterialStock(tx, source.items);
    return tx.invoice.create({
      data: {
        companyId: company.id,
        customerId: source.customerId,
        issueDate,
        dueDate: defaultDueDate(company, issueDate),
        isSmallBusiness: financials.isSmallBusiness,
        vatNoticeKey: financials.vatNoticeKey,
        supplyType,
        notes: source.notes,
        introText: source.introText ?? company.invoiceIntroText,
        closingText: source.closingText ?? company.invoiceClosingText,
        footerText: company.invoiceFooterText,
        subtotalCents: financials.subtotalCents,
        vatTotalCents: financials.vatTotalCents,
        totalCents: financials.totalCents,
        items: { create: financials.itemsCreate },
      },
      include: { items: true, customer: true },
    });
  });
  await writeAuditLog({ req, companyId: company.id, userId: req.auth!.sub, action: "invoice.duplicate", entityType: "Invoice", entityId: source.id, metadata: { newInvoiceId: copy.id } });
  res.status(201).json(copy);
});
