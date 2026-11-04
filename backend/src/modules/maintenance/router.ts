import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { PRESETS, checkMaintenance, printerHours, taskStatus } from "./service";

/** Wartungsplan der Drucker. Lesen und "Erledigt" darf jeder angemeldete Benutzer, Aufgaben anlegen/ändern/löschen nur ein Administrator. */

export const maintenanceRouter = Router();
maintenanceRouter.use(requireAuth);

const adminOnly = (role: string) => {
  if (role !== "ADMIN") throw new HttpError(403, "Nur ein Administrator darf den Wartungsplan ändern.");
};

type TaskRow = Awaited<ReturnType<typeof prisma.maintenanceTask.findMany>>[number];
function present(t: TaskRow, hours: number) {
  const s = taskStatus(t, hours);
  return {
    id: t.id,
    printerId: t.printerId,
    name: t.name,
    intervalHours: t.intervalHours,
    intervalDays: t.intervalDays,
    notes: t.notes,
    lastDoneAt: t.lastDoneAt,
    hoursSince: Math.round(s.hoursSince * 10) / 10,
    daysSince: Math.floor(s.daysSince),
    remainingHours: s.remainingHours === null ? null : Math.round(s.remainingHours * 10) / 10,
    remainingDays: s.remainingDays === null ? null : Math.ceil(s.remainingDays),
    due: s.due,
    progress: Math.round(s.progress * 100) / 100,
  };
}

maintenanceRouter.get("/presets", (_req, res) => {
  res.json(PRESETS);
});

/** Alle Aufgaben mit Zustand (Betriebsstunden aus vorher gelaufenen Stunden plus erkannten Druckaufträgen). */
maintenanceRouter.get("/", async (req, res) => {
  const companyId = req.auth!.companyId;
  const tasks = await prisma.maintenanceTask.findMany({ where: { companyId, printer: { isArchived: false } }, orderBy: [{ printerId: "asc" }, { createdAt: "asc" }] });
  const hours = await printerHours(companyId);
  res.json(tasks.map((t) => present(t, hours.get(t.printerId) ?? 0)));
});

const taskSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    intervalHours: z.number().positive().max(1_000_000).nullish(),
    intervalDays: z.number().int().positive().max(3650).nullish(),
    notes: z.string().trim().max(500).nullish(),
  })
  .refine((v) => !!v.intervalHours || !!v.intervalDays, "Bitte ein Intervall in Betriebsstunden oder in Tagen angeben.");

maintenanceRouter.post("/", async (req, res) => {
  adminOnly(req.auth!.role);
  const companyId = req.auth!.companyId;
  const { printerId, ...rest } = z.object({ printerId: z.string().min(1) }).and(taskSchema).parse(req.body) as { printerId: string } & z.infer<typeof taskSchema>;
  const printer = await prisma.printer.findFirst({ where: { id: printerId, companyId, isArchived: false }, select: { id: true } });
  if (!printer) throw new HttpError(404, "Drucker nicht gefunden");
  const hours = (await printerHours(companyId, printer.id)).get(printer.id) ?? 0;
  // Zählung beginnt jetzt: die erste Fälligkeit liegt ein Intervall in der Zukunft
  const created = await prisma.maintenanceTask.create({
    data: { companyId, printerId: printer.id, name: rest.name, intervalHours: rest.intervalHours || null, intervalDays: rest.intervalDays || null, notes: rest.notes || null, lastDoneHours: hours },
  });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "maintenance.create", entityType: "MaintenanceTask", entityId: created.id, metadata: { name: created.name } });
  res.status(201).json(present(created, hours));
});

maintenanceRouter.patch("/:id", async (req, res) => {
  adminOnly(req.auth!.role);
  const companyId = req.auth!.companyId;
  const existing = await prisma.maintenanceTask.findFirst({ where: { id: req.params.id, companyId } });
  if (!existing) throw new HttpError(404, "Wartungsaufgabe nicht gefunden");
  const body = taskSchema.parse({ name: req.body.name ?? existing.name, intervalHours: req.body.intervalHours === undefined ? existing.intervalHours : req.body.intervalHours, intervalDays: req.body.intervalDays === undefined ? existing.intervalDays : req.body.intervalDays, notes: req.body.notes === undefined ? existing.notes : req.body.notes });
  const updated = await prisma.maintenanceTask.update({ where: { id: existing.id }, data: { name: body.name, intervalHours: body.intervalHours || null, intervalDays: body.intervalDays || null, notes: body.notes || null } });
  void checkMaintenance(companyId);
  const hours = (await printerHours(companyId, existing.printerId)).get(existing.printerId) ?? 0;
  res.json(present(updated, hours));
});

// Erledigt: Zählung beginnt neu (Stunden- und Datumsstand), die Meldung wird zurückgesetzt
maintenanceRouter.post("/:id/done", async (req, res) => {
  const companyId = req.auth!.companyId;
  const existing = await prisma.maintenanceTask.findFirst({ where: { id: req.params.id, companyId } });
  if (!existing) throw new HttpError(404, "Wartungsaufgabe nicht gefunden");
  const hours = (await printerHours(companyId, existing.printerId)).get(existing.printerId) ?? 0;
  const updated = await prisma.maintenanceTask.update({ where: { id: existing.id }, data: { lastDoneHours: hours, lastDoneAt: new Date(), notifiedAt: null } });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "maintenance.done", entityType: "MaintenanceTask", entityId: existing.id, metadata: { name: existing.name } });
  res.json(present(updated, hours));
});

maintenanceRouter.delete("/:id", async (req, res) => {
  adminOnly(req.auth!.role);
  const companyId = req.auth!.companyId;
  const existing = await prisma.maintenanceTask.findFirst({ where: { id: req.params.id, companyId } });
  if (!existing) throw new HttpError(404, "Wartungsaufgabe nicht gefunden");
  await prisma.maintenanceTask.delete({ where: { id: existing.id } });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "maintenance.delete", entityType: "MaintenanceTask", entityId: existing.id });
  res.status(204).send();
});
