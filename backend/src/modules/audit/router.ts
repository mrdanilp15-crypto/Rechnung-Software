import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole("ADMIN"));

/**
 * Liest das (unveränderliche) Audit-Log der eigenen Firma - bisher wurde zwar bei jeder
 * schreibenden Aktion protokolliert (siehe writeAuditLog), es gab aber keine Möglichkeit,
 * diese Einträge tatsächlich einzusehen (Rechenschaftspflicht nach Art. 5 Abs. 2 DSGVO
 * ist praktisch wenig wert, wenn niemand die Protokolle je ansieht). Nur für ADMIN, da
 * das Log auch Handlungen anderer Benutzer (inkl. IP-Adressen) offenlegt.
 */
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  entityType: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().optional(),
});

auditRouter.get("/", async (req, res) => {
  const query = querySchema.parse(req.query);
  const where = {
    companyId: req.auth!.companyId,
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.action ? { action: { contains: query.action } } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit,
      skip: query.offset,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ entries, total, limit: query.limit, offset: query.offset });
});

// Für Filter-Dropdowns im Frontend - welche Aktionen/Entitätstypen kommen überhaupt vor.
auditRouter.get("/meta", async (req, res) => {
  const [actions, entityTypes] = await Promise.all([
    prisma.auditLog.findMany({ where: { companyId: req.auth!.companyId }, select: { action: true }, distinct: ["action"], orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ where: { companyId: req.auth!.companyId }, select: { entityType: true }, distinct: ["entityType"], orderBy: { entityType: "asc" } }),
  ]);
  res.json({ actions: actions.map((a) => a.action), entityTypes: entityTypes.map((e) => e.entityType) });
});
