import type { Request } from "express";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { logger } from "../../utils/logger";
import { writeAuditLog } from "../audit/auditLog";
import { buildAssignmentMessage, notifyUser, type AssignedKind } from "../notifications/service";

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
