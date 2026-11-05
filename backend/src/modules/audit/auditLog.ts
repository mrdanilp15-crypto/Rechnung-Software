import { Request } from "express";
import { prisma } from "../../db/prisma";

/**
 * Schreibt einen unveränderlichen Audit-Log-Eintrag. Wird von den Modul-Controllern
 * nach jeder erfolgreichen schreibenden Aktion aufgerufen (Create/Update/Delete/Login etc.).
 * Es werden nie Klartext-Passwörter oder Secrets im metadata-Feld gespeichert.
 */
/** Aktionen per API-Schlüssel haben keinen Benutzer: sie werden ohne Benutzer, aber mit dem Schlüssel in den Details protokolliert. */
function splitApiKey(userId?: string | null, metadata?: Record<string, unknown>): { userId: string | null; metadata?: Record<string, unknown> } {
  if (userId?.startsWith("apikey:")) return { userId: null, metadata: { ...(metadata ?? {}), apiKeyId: userId.slice(7) } };
  return { userId: userId ?? null, metadata };
}

export async function writeAuditLog(params: {
  req?: Request;
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const who = splitApiKey(params.userId, params.metadata);
  await prisma.auditLog.create({
    data: {
      companyId: params.companyId ?? null,
      userId: who.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      ipAddress: params.req?.ip ?? null,
      metadata: who.metadata ? JSON.stringify(who.metadata) : null,
    },
  });
}
