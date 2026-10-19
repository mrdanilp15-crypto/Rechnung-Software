import { Router } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import type { Company, Customer, Dunning, Invoice } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { env } from "../../config/env";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { renderDocumentPdf } from "../pdf/documentTemplate";
import { resolvePdfLayout } from "../pdf/layout";
import { fillPlaceholders } from "../pdf/placeholders";
import { formatCents } from "../tax/calculator";
import { isSmtpConfigured, sendMailForCompany } from "../email/mailer";
import { computeDunning, DunningResult, LEVEL_LABEL } from "./calc";

export const dunningRouter = Router();
dunningRouter.use(requireAuth);

const dayMs = 86_400_000;
const dateDe = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

function companyText(company: Company, level: number): string {
  return level === 1 ? company.dunningText1 : level === 2 ? company.dunningText2 : company.dunningText3;
}

/** Berechnung für die nächste (oder gewünschte) Stufe einer offenen Rechnung. */
async function prepare(companyId: string, invoiceId: string, requestedLevel?: number) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId },
    include: { customer: true, company: true, dunnings: { orderBy: { createdAt: "desc" } } },
  });
  if (!invoice) throw new HttpError(404, "Rechnung nicht gefunden");
  if (invoice.isCancellationDocument || (invoice.status !== "SENT" && invoice.status !== "OVERDUE")) {
    throw new HttpError(409, "Mahnungen sind nur für versendete, noch offene Rechnungen möglich.");
  }
  const lastLevel = invoice.dunnings[0]?.level ?? 0;
  if (lastLevel >= 3) throw new HttpError(409, "Die letzte Mahnstufe wurde bereits erzeugt. Weitere Schritte (Inkasso, gerichtliches Mahnverfahren) erfolgen außerhalb der Software.");
  const level = (requestedLevel ?? lastLevel + 1) as 1 | 2 | 3;
  if (![1, 2, 3].includes(level)) throw new HttpError(400, "Ungültige Mahnstufe.");
  if (level <= lastLevel) throw new HttpError(409, `Für diese Rechnung wurde bereits Stufe ${lastLevel} erzeugt - die nächste Stufe ist ${Math.min(3, lastLevel + 1)}.`);

  const dueDate = invoice.dueDate ?? invoice.issueDate;
  const result = computeDunning({
    principalCents: invoice.totalCents,
    dueDate,
    asOf: new Date(),
    level,
    isBusiness: invoice.customer.type === "GEWERBLICH",
    baseInterestRatePercent: invoice.company.baseInterestRatePercent,
    fee2Cents: invoice.company.dunningFee2Cents,
    fee3Cents: invoice.company.dunningFee3Cents,
    deadlineDays: invoice.company.dunningDeadlineDays,
    previous: invoice.dunnings[0] ? { feeCents: invoice.dunnings[0].feeCents, flatFeeCents: invoice.dunnings[0].flatFeeCents } : null,
  });
  return { invoice, result, level };
}

function letterText(company: Company, invoice: Invoice & { customer: Customer }, level: number, result: DunningResult, override?: string) {
  const raw = override?.trim() ? override : companyText(company, level);
  return fillPlaceholders(raw, {
    kunde: invoice.customer.name,
    ansprechpartner: invoice.customer.contactName || invoice.customer.name,
    nummer: invoice.invoiceNumber ?? "",
    datum: dateDe(new Date()),
    faellig: dateDe(result.newDueDate),
    betrag: formatCents(result.totalCents),
    firma: company.name,
  }).trim();
}

async function renderDunningPdf(company: Company, invoice: Invoice & { customer: Customer }, level: number, result: DunningResult, text: string): Promise<Buffer> {
  const locale = company.defaultLocale === "en" ? "en" : "de";
  const items = [
    {
      position: 1,
      description: `Rechnung ${invoice.invoiceNumber} vom ${dateDe(invoice.issueDate)}, fällig am ${dateDe(invoice.dueDate ?? invoice.issueDate)}`,
      quantity: 1,
      unit: "",
      unitPriceCents: result.principalCents,
      lineTotalCents: result.principalCents,
    },
  ];
  if (result.feeCents > 0) items.push({ position: items.length + 1, description: "Mahngebühren (Ersatz entstandener Auslagen)", quantity: 1, unit: "", unitPriceCents: result.feeCents, lineTotalCents: result.feeCents });
  if (result.interestCents > 0) {
    items.push({
      position: items.length + 1,
      description: `Verzugszinsen ${(result.interestRateBps / 100).toLocaleString("de-DE")} % p.a. für ${result.daysOverdue} Tage seit Fälligkeit`,
      quantity: 1,
      unit: "",
      unitPriceCents: result.interestCents,
      lineTotalCents: result.interestCents,
    });
  }
  if (result.flatFeeCents > 0) items.push({ position: items.length + 1, description: "Verzugskostenpauschale gem. §288 Abs. 5 BGB", quantity: 1, unit: "", unitPriceCents: result.flatFeeCents, lineTotalCents: result.flatFeeCents });

  return renderDocumentPdf({
    docTypeLabel: LEVEL_LABEL[level],
    numberLabel: { de: "Zur Rechnung", en: "Re: invoice" },
    documentNumber: invoice.invoiceNumber ?? "",
    issueDate: new Date(),
    dueDate: result.newDueDate,
    locale,
    branding: company,
    recipient: invoice.customer,
    items,
    totalCents: result.totalCents,
    subtotalCents: result.totalCents,
    showPrices: true,
    hideVatSummary: true,
    totalLabel: { de: "Gesamtforderung", en: "Total amount due" },
    showSepaQr: true,
    paymentTermsText: locale === "de" ? `Bitte überweisen Sie ${formatCents(result.totalCents)} bis zum ${dateDe(result.newDueDate)} unter Angabe der Rechnungsnummer.` : `Please transfer ${formatCents(result.totalCents)} by ${dateDe(result.newDueDate)}, quoting the invoice number.`,
    layout: resolvePdfLayout(company.pdfLayout),
    introText: text,
  });
}

function publicDunning(d: Dunning) {
  const { pdfPath, text, ...rest } = d;
  return { ...rest, hasPdf: !!pdfPath };
}

/** Rechnungen, bei denen eine (weitere) Mahnstufe fällig ist - Grundlage des Hinweises auf der Startseite. */
dunningRouter.get("/suggestions", async (req, res) => {
  const companyId = req.auth!.companyId;
  const now = new Date();
  const invoices = await prisma.invoice.findMany({
    where: { companyId, isCancellationDocument: false, status: { in: ["SENT", "OVERDUE"] }, dueDate: { lt: now } },
    include: { customer: { select: { name: true } }, dunnings: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { dueDate: "asc" },
    take: 100,
  });
  const out = invoices
    .map((inv) => {
      const last = inv.dunnings[0];
      const daysOverdue = Math.floor((now.getTime() - (inv.dueDate as Date).getTime()) / dayMs);
      // Die nächste Stufe ist erst dran, wenn die Frist der vorigen Mahnung abgelaufen ist
      const due = !last || last.newDueDate < now;
      const nextLevel = (last?.level ?? 0) + 1;
      return { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, customerName: inv.customer.name, totalCents: inv.totalCents, daysOverdue, lastLevel: last?.level ?? 0, nextLevel, due };
    })
    .filter((x) => x.due && x.nextLevel <= 3);
  res.json(out);
});

dunningRouter.get("/invoice/:invoiceId", async (req, res) => {
  const history = await prisma.dunning.findMany({ where: { invoiceId: req.params.invoiceId, companyId: req.auth!.companyId }, orderBy: { createdAt: "asc" } });
  let next: ReturnType<typeof serializeNext> | null = null;
  try {
    const p = await prepare(req.auth!.companyId, req.params.invoiceId);
    next = serializeNext(p.invoice, p.level, p.result);
  } catch {
    next = null; // nicht mahnbar (bezahlt, Entwurf, höchste Stufe erreicht ...)
  }
  res.json({ history: history.map(publicDunning), next });
});

function serializeNext(invoice: Invoice & { customer: Customer; company: Company }, level: number, result: DunningResult) {
  return {
    levelLabel: LEVEL_LABEL[level].de,
    ...result,
    text: letterText(invoice.company, invoice, level, result),
    canEmail: !!invoice.customer.email && isSmtpConfigured(invoice.company),
    customerEmail: invoice.customer.email,
    notYetOverdue: invoice.dueDate ? invoice.dueDate > new Date() : false,
  };
}

const createSchema = z.object({
  level: z.number().int().min(1).max(3).optional(),
  send: z.boolean().optional(),
  text: z.string().max(5000).optional(),
});

dunningRouter.post("/invoice/:invoiceId", requireRole("ADMIN", "BUCHHALTUNG"), async (req, res) => {
  const body = createSchema.parse(req.body);
  const { invoice, result, level } = await prepare(req.auth!.companyId, req.params.invoiceId, body.level);
  const text = letterText(invoice.company, invoice, level, result, body.text);
  const pdf = await renderDunningPdf(invoice.company, invoice, level, result, text);

  const dir = path.join(env.UPLOAD_DIR, "dunning");
  fs.mkdirSync(dir, { recursive: true });
  const pdfPath = path.join(dir, `${(invoice.invoiceNumber ?? invoice.id).replace(/[^\w.-]+/g, "_")}-M${level}.pdf`);
  fs.writeFileSync(pdfPath, pdf);

  let sentByEmail = false;
  if (body.send) {
    if (!invoice.customer.email) throw new HttpError(400, "Beim Kunden ist keine E-Mail-Adresse hinterlegt.");
    await sendMailForCompany(invoice.company, {
      to: invoice.customer.email,
      subject: `${LEVEL_LABEL[level].de}: Rechnung ${invoice.invoiceNumber}`,
      text,
      attachments: [{ filename: `${LEVEL_LABEL[level].de.split(" (")[0].replace(/\W+/g, "_")}-${invoice.invoiceNumber}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    sentByEmail = true;
  }

  const dunning = await prisma.$transaction(async (tx) => {
    const d = await tx.dunning.create({
      data: {
        companyId: invoice.companyId,
        invoiceId: invoice.id,
        level,
        principalCents: result.principalCents,
        feeCents: result.feeCents,
        interestCents: result.interestCents,
        flatFeeCents: result.flatFeeCents,
        totalCents: result.totalCents,
        interestRateBps: result.interestRateBps,
        daysOverdue: result.daysOverdue,
        newDueDate: result.newDueDate,
        text,
        pdfPath,
        sentByEmail,
      },
    });
    await tx.invoice.update({ where: { id: invoice.id }, data: { reminderCount: level, lastReminderAt: new Date(), status: "OVERDUE" } });
    return d;
  });
  await writeAuditLog({ req, companyId: invoice.companyId, userId: req.auth!.sub, action: "dunning.create", entityType: "Invoice", entityId: invoice.id, metadata: { level, totalCents: result.totalCents, sentByEmail } });
  res.status(201).json(publicDunning(dunning));
});

dunningRouter.get("/:id/pdf", async (req, res) => {
  const d = await prisma.dunning.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId }, include: { invoice: true } });
  if (!d || !d.pdfPath || !fs.existsSync(d.pdfPath)) throw new HttpError(404, "Mahnung nicht gefunden");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${path.basename(d.pdfPath)}"`);
  res.send(fs.readFileSync(d.pdfPath));
});
