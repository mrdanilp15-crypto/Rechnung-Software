import type { Request } from "express";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { logger } from "../../utils/logger";
import { writeAuditLog } from "../audit/auditLog";
import { buildAssignmentMessage, notifyUser, type AssignedKind } from "../notifications/service";

const itemsSelect = { select: { description: true }, orderBy: { position: "asc" as const }, take: 3 };

/**
 * Wer soll für einen neu angelegten Beleg zuständig sein? Wer den Beleg gerade anlegt, ist es automatisch -
 * außer es wird ausdrücklich jemand anderes (oder niemand: null) gewählt. Gibt die ID zurück, die direkt beim Anlegen gesetzt wird.
 * Eine fremde oder deaktivierte Person wird abgelehnt; ist der eigene Benutzer nicht mehr aktiv (z.B. API-Schlüssel), bleibt es leer.
 */
export async function defaultAssigneeId(req: Request, requested?: string | null): Promise<string | null> {
  if (requested === null) return null;
  const id = requested ?? req.auth!.sub;
  const user = await prisma.user.findFirst({ where: { id, companyId: req.auth!.companyId, isActive: true }, select: { id: true } });
  if (!user) {
    if (requested) throw new HttpError(400, "Mitarbeiter nicht gefunden oder deaktiviert.");
    return null;
  }
  return user.id;
}

/**
 * Nach dem Anlegen: wurde jemand anderes als man selbst gewählt, bekommt diese Person Bescheid (wie bei jeder Zuweisung).
 * Der Beleg selbst wurde schon mit der richtigen Person angelegt.
 */
export async function notifyAssigneeOnCreate(req: Request, kind: AssignedKind, id: string, assigneeId: string | null): Promise<void> {
  if (!assigneeId || assigneeId === req.auth!.sub) return;
  try {
    const companyId = req.auth!.companyId;
    const by = await prisma.user.findUnique({ where: { id: req.auth!.sub }, select: { name: true } });
    const doc =
      kind === "QUOTE"
        ? await prisma.quote.findFirst({ where: { id, companyId }, select: { quoteNumber: true, customer: { select: { name: true } }, items: itemsSelect } })
        : kind === "INVOICE"
          ? await prisma.invoice.findFirst({ where: { id, companyId }, select: { invoiceNumber: true, customer: { select: { name: true } }, items: itemsSelect } })
          : await prisma.orderConfirmation.findFirst({ where: { id, companyId }, select: { confirmationNumber: true, customer: { select: { name: true } }, items: itemsSelect } });
    if (!doc) return;
    const number = "quoteNumber" in doc ? doc.quoteNumber : "invoiceNumber" in doc ? doc.invoiceNumber : doc.confirmationNumber;
    const msg = buildAssignmentMessage({ kind, orderNumber: number, customerName: doc.customer.name, items: doc.items.map((i) => i.description), byName: by?.name ?? null });
    await notifyUser(companyId, assigneeId, msg.title, msg.body, kind === "QUOTE" ? `/quotes/${id}` : kind === "INVOICE" ? `/invoices/${id}` : `/orders/${id}`);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Benachrichtigung zur Zuweisung fehlgeschlagen");
  }
}

/**
 * Zuständigen Mitarbeiter für Angebot oder Rechnung setzen/ändern (jederzeit, auch bei fertigen Belegen - das ist kein Beleginhalt).
 * Dem neuen Zuständigen wird Bescheid gegeben, außer man weist sich selbst zu.
 */
export async function assignDocument(req: Request, kind: "QUOTE" | "INVOICE", id: string, assigneeId: string | null): Promise<void> {
  const companyId = req.auth!.companyId;
  const doc =
    kind === "QUOTE"
      ? await prisma.quote.findFirst({ where: { id, companyId }, select: { id: true, assigneeId: true, quoteNumber: true, customer: { select: { name: true } }, items: { select: { description: true }, orderBy: { position: "asc" }, take: 3 } } })
      : await prisma.invoice.findFirst({ where: { id, companyId }, select: { id: true, assigneeId: true, invoiceNumber: true, customer: { select: { name: true } }, items: { select: { description: true }, orderBy: { position: "asc" }, take: 3 } } });
  if (!doc) throw new HttpError(404, kind === "QUOTE" ? "Angebot nicht gefunden" : "Rechnung nicht gefunden");
  if ((doc.assigneeId ?? null) === assigneeId) return;
  let toName: string | null = null;
  if (assigneeId) {
    const user = await prisma.user.findFirst({ where: { id: assigneeId, companyId, isActive: true }, select: { name: true } });
    if (!user) throw new HttpError(400, "Mitarbeiter nicht gefunden oder deaktiviert.");
    toName = user.name;
  }
  if (kind === "QUOTE") await prisma.quote.update({ where: { id }, data: { assigneeId } });
  else await prisma.invoice.update({ where: { id }, data: { assigneeId } });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: kind === "QUOTE" ? "quote.assign" : "invoice.assign", entityType: kind === "QUOTE" ? "Quote" : "Invoice", entityId: id, metadata: { from: doc.assigneeId, to: assigneeId, toName } });
  if (assigneeId && assigneeId !== req.auth!.sub) {
    try {
      const by = await prisma.user.findUnique({ where: { id: req.auth!.sub }, select: { name: true } });
      const number = kind === "QUOTE" ? (doc as { quoteNumber: string | null }).quoteNumber : (doc as { invoiceNumber: string | null }).invoiceNumber;
      const msg = buildAssignmentMessage({ kind: kind as AssignedKind, orderNumber: number, customerName: doc.customer.name, items: doc.items.map((i) => i.description), byName: by?.name ?? null });
      await notifyUser(companyId, assigneeId, msg.title, msg.body, kind === "QUOTE" ? `/quotes/${id}` : `/invoices/${id}`);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "Benachrichtigung zur Zuweisung fehlgeschlagen");
    }
  }
}
