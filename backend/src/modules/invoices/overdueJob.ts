import { prisma } from "../../db/prisma";
import { logger } from "../../utils/logger";
import { notify } from "../notifications/service";
import { emitEvent } from "../plugins/hooks";

export interface OverdueInfo {
  number: string | null;
  customer: string;
  totalCents: number;
}

const eur = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100).replace(/ /g, " ");

/** Text der Meldung, wenn Rechnungen überfällig geworden sind (eine Rechnung genau, mehrere zusammengefasst). */
export function overdueMessage(list: OverdueInfo[]): { title: string; body: string } {
  if (list.length === 1) {
    const i = list[0];
    return {
      title: `Rechnung ${i.number ?? ""} ist überfällig`.replace("  ", " "),
      body: `${i.customer} hat die Rechnung ${i.number ?? ""} über ${eur(i.totalCents)} nicht rechtzeitig bezahlt. Auf der Startseite unter "Heute zu tun" kannst du Erinnerung oder Mahnung vorbereiten.`.replace("  ", " "),
    };
  }
  const total = list.reduce((a, i) => a + i.totalCents, 0);
  return {
    title: `${list.length} Rechnungen sind überfällig`,
    body: `${list.slice(0, 3).map((i) => `${i.number ?? "Rechnung"} (${i.customer})`).join(", ")}${list.length > 3 ? ` und ${list.length - 3} weitere` : ""} - zusammen ${eur(total)}. Auf der Startseite unter "Heute zu tun" kannst du Erinnerungen vorbereiten.`,
  };
}

/** Setzt fällige Rechnungen auf "Überfällig" und meldet es (einmal je Lauf und Firma, nur für Rechnungen, die gerade neu überfällig wurden). */
export async function markOverdueInvoices() {
  const due = await prisma.invoice.findMany({
    where: { status: "SENT", dueDate: { lt: new Date() }, isCancellationDocument: false },
    select: { id: true, companyId: true, invoiceNumber: true, totalCents: true, customer: { select: { name: true } } },
  });
  // auch Korrekturbelege o.ä. mit Status SENT, die nicht in die Meldung gehören, werden wie bisher umgestellt
  const result = await prisma.invoice.updateMany({ where: { status: "SENT", dueDate: { lt: new Date() } }, data: { status: "OVERDUE" } });
  if (result.count > 0) logger.info({ count: result.count }, "Rechnungen als überfällig markiert");

  const byCompany = new Map<string, OverdueInfo[]>();
  for (const i of due) {
    const list = byCompany.get(i.companyId) ?? [];
    list.push({ number: i.invoiceNumber, customer: i.customer.name, totalCents: i.totalCents });
    byCompany.set(i.companyId, list);
  }
  for (const i of due) {
    void emitEvent("invoice.overdue", { companyId: i.companyId, invoice: { id: i.id, number: i.invoiceNumber, customer: i.customer.name, totalCents: i.totalCents } }).catch(() => undefined);
  }
  for (const [companyId, list] of byCompany) {
    try {
      const { title, body } = overdueMessage(list);
      await notify(companyId, "INVOICE_OVERDUE", title, body);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "Meldung zu überfälligen Rechnungen fehlgeschlagen");
    }
  }
}
