import type { Company, Customer, RecurringInvoice } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { logger } from "../../utils/logger";
import { buildInvoiceFinancials, defaultDueDate, InvoiceItemInput } from "../invoices/build";
import { deductMaterialStock } from "../materials/stock";

export type IntervalUnit = "WEEK" | "MONTH" | "QUARTER" | "YEAR";

/** Nächster Termin: addiert Wochen/Monate/Quartale/Jahre; endet ein Monat früher (31. -> 30./28.), bleibt es der letzte Tag. */
export function addInterval(date: Date, unit: IntervalUnit, count: number): Date {
  const d = new Date(date);
  if (unit === "WEEK") {
    d.setDate(d.getDate() + 7 * count);
    return d;
  }
  const months = unit === "MONTH" ? count : unit === "QUARTER" ? count * 3 : count * 12;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

export function parseItems(itemsJson: string): InvoiceItemInput[] {
  const raw = JSON.parse(itemsJson) as any[];
  return raw.map((i) => ({
    productId: i.productId ?? undefined,
    description: String(i.description),
    quantity: Number(i.quantity),
    unit: String(i.unit ?? "Stk."),
    unitPriceCents: Math.round(Number(i.unitPriceCents)),
    vatRateBps: Number(i.vatRateBps),
  }));
}

/** Erzeugt aus der Vorlage einen Rechnungs-Entwurf (Steuerbehandlung wie bei jeder neuen Rechnung, Materialabzug inklusive). */
export async function createDraftFromTemplate(tpl: RecurringInvoice, company: Company, customer: Customer) {
  const items = parseItems(tpl.itemsJson);
  const supplyType = (tpl.supplyType === "SERVICE" ? "SERVICE" : "GOODS") as "GOODS" | "SERVICE";
  const financials = buildInvoiceFinancials(company, customer, items, supplyType);
  const issueDate = new Date();
  return prisma.$transaction(async (tx) => {
    await deductMaterialStock(tx, items);
    return tx.invoice.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        issueDate,
        dueDate: defaultDueDate(company, issueDate),
        isSmallBusiness: financials.isSmallBusiness,
        vatNoticeKey: financials.vatNoticeKey,
        supplyType,
        notes: tpl.notes,
        introText: tpl.introText ?? company.invoiceIntroText,
        closingText: tpl.closingText ?? company.invoiceClosingText,
        footerText: company.invoiceFooterText,
        subtotalCents: financials.subtotalCents,
        vatTotalCents: financials.vatTotalCents,
        totalCents: financials.totalCents,
        items: { create: financials.itemsCreate },
      },
      include: { items: true, customer: true },
    });
  });
}

/**
 * Läuft regelmäßig (siehe index.ts): erzeugt für jede fällige, aktive Vorlage genau EINEN Entwurf - auch wenn der Server
 * mehrere Termine verpasst hat - und rückt den Termin auf das nächste Datum in der Zukunft vor. Es wird nie automatisch
 * eine Rechnung ausgestellt oder versendet.
 */
export async function runDueRecurringInvoices(now = new Date()): Promise<number> {
  const due = await prisma.recurringInvoice.findMany({
    where: { isActive: true, nextRunDate: { lte: now } },
    include: { customer: true, company: true },
    take: 200,
  });
  let created = 0;
  for (const tpl of due) {
    try {
      if (tpl.endDate && tpl.nextRunDate > tpl.endDate) {
        await prisma.recurringInvoice.update({ where: { id: tpl.id }, data: { isActive: false } });
        continue;
      }
      const invoice = await createDraftFromTemplate(tpl, tpl.company, tpl.customer);
      let next = addInterval(tpl.nextRunDate, tpl.intervalUnit as IntervalUnit, tpl.intervalCount);
      let guard = 0;
      while (next <= now && guard++ < 1000) next = addInterval(next, tpl.intervalUnit as IntervalUnit, tpl.intervalCount);
      await prisma.recurringInvoice.update({
        where: { id: tpl.id },
        data: {
          lastRunAt: now,
          lastInvoiceId: invoice.id,
          runCount: { increment: 1 },
          nextRunDate: next,
          isActive: tpl.endDate ? next <= tpl.endDate : true,
        },
      });
      await prisma.auditLog.create({
        data: { companyId: tpl.companyId, action: "recurring.draft_created", entityType: "Invoice", entityId: invoice.id, metadata: JSON.stringify({ recurringId: tpl.id, name: tpl.name }) },
      });
      created++;
    } catch (err) {
      logger.error({ err, recurringId: tpl.id }, "Wiederkehrende Rechnung konnte nicht erzeugt werden");
    }
  }
  if (created > 0) logger.info({ created }, "Wiederkehrende Rechnungen als Entwurf erzeugt");
  return created;
}
