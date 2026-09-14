import { Request } from "express";
import { prisma } from "../../db/prisma";

/**
 * Schreibt einen unveränderlichen Audit-Log-Eintrag. Wird von den Modul-Controllern
 * nach jeder erfolgreichen schreibenden Aktion aufgerufen (Create/Update/Delete/Login etc.).
 * Es werden nie Klartext-Passwörter oder Secrets im metadata-Feld gespeichert.
 */
export async function writeAuditLog(params: {
  req?: Request;
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      companyId: params.companyId ?? null,
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      ipAddress: params.req?.ip ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}
