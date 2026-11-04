import { prisma } from "../../db/prisma";
import { logger } from "../../utils/logger";
import { notify } from "../notifications/service";

/**
 * Wartungsplan der Drucker: Aufgaben mit Intervall in Betriebsstunden und/oder Tagen. Fällig ist eine Aufgabe, sobald seit der letzten
 * Erledigung eines der beiden Intervalle erreicht ist. Die Meldung kommt einmal; beim Erledigen wird sie zurückgesetzt.
 */

export interface TaskLike {
  intervalHours: number | null;
  intervalDays: number | null;
  lastDoneHours: number;
  lastDoneAt: Date;
}

export interface TaskStatus {
  hoursSince: number;
  daysSince: number;
  remainingHours: number | null;
  remainingDays: number | null;
  due: boolean;
  /** Fortschritt bis zur Fälligkeit, 0 bis 1 (über 1 = überfällig); das größere der beiden Intervalle zählt */
  progress: number;
}

const DAY_MS = 86_400_000;

export function taskStatus(t: TaskLike, currentHours: number, now: Date = new Date()): TaskStatus {
  const hoursSince = Math.max(0, currentHours - t.lastDoneHours);
  const daysSince = Math.max(0, (now.getTime() - t.lastDoneAt.getTime()) / DAY_MS);
  const remainingHours = t.intervalHours && t.intervalHours > 0 ? t.intervalHours - hoursSince : null;
  const remainingDays = t.intervalDays && t.intervalDays > 0 ? t.intervalDays - daysSince : null;
  const ratios = [t.intervalHours && t.intervalHours > 0 ? hoursSince / t.intervalHours : 0, t.intervalDays && t.intervalDays > 0 ? daysSince / t.intervalDays : 0];
  return {
    hoursSince,
    daysSince,
    remainingHours,
    remainingDays,
    due: (remainingHours !== null && remainingHours <= 0) || (remainingDays !== null && remainingDays <= 0),
    progress: Math.max(...ratios),
  };
}

/** Richtwerte für typische Wartungsaufgaben; die Herstellerangaben des jeweiligen Druckers gehen vor. */
export const PRESETS: { name: string; intervalHours: number | null; intervalDays: number | null }[] = [
  { name: "Druckplatte reinigen", intervalHours: 50, intervalDays: null },
  { name: "Lüfter und Staub reinigen", intervalHours: 200, intervalDays: null },
  { name: "Linearführungen schmieren", intervalHours: 200, intervalDays: null },
  { name: "Düse und Hotend prüfen", intervalHours: 300, intervalDays: null },
  { name: "AMS und Spulenführung reinigen", intervalHours: 300, intervalDays: 90 },
  { name: "Riemenspannung prüfen", intervalHours: 500, intervalDays: null },
  { name: "Trockenmittel (Silica-Gel) tauschen", intervalHours: null, intervalDays: 60 },
  { name: "Gesamtwartung", intervalHours: null, intervalDays: 90 },
];

/** Betriebsstunden je Drucker: vorher gelaufene Stunden plus die Dauer der erkannten Druckaufträge. */
export async function printerHours(companyId: string, printerId?: string): Promise<Map<string, number>> {
  const printers = await prisma.printer.findMany({ where: { companyId, ...(printerId ? { id: printerId } : {}) }, select: { id: true, usedHoursBefore: true } });
  const sums = await prisma.printerJob.groupBy({ by: ["printerId"], where: { companyId, endedAt: { not: null }, ...(printerId ? { printerId } : {}) }, _sum: { minutes: true } });
  const minutes = new Map(sums.map((s) => [s.printerId, s._sum.minutes ?? 0]));
  return new Map(printers.map((p) => [p.id, Math.max(0, p.usedHoursBefore ?? 0) + (minutes.get(p.id) ?? 0) / 60]));
}

const hoursText = (h: number) => `${(Math.round(h * 10) / 10).toLocaleString("de-DE")} h`;

export function dueMessage(printerName: string, taskName: string, t: TaskLike, s: TaskStatus): { title: string; body: string } {
  const parts: string[] = [];
  if (t.intervalHours) parts.push(`${hoursText(s.hoursSince)} Betrieb seit der letzten Wartung (Intervall ${hoursText(t.intervalHours)})`);
  if (t.intervalDays) parts.push(`${Math.floor(s.daysSince)} Tage seit der letzten Wartung (Intervall ${t.intervalDays} Tage)`);
  return { title: `${printerName}: Wartung fällig - ${taskName}`, body: `"${taskName}" an ${printerName} ist fällig: ${parts.join("; ")}. Nach der Wartung unter Katalog, Drucker als erledigt markieren.` };
}

/** Prüft die Aufgaben (einer Firma oder aller): neu fällige melden, nicht mehr fällige zurücksetzen. Fehler werden nur protokolliert. */
export async function checkMaintenance(companyId?: string): Promise<number> {
  try {
    const tasks = await prisma.maintenanceTask.findMany({ where: companyId ? { companyId } : {}, include: { printer: { select: { name: true, isArchived: true } } } });
    if (tasks.length === 0) return 0;
    const companies = [...new Set(tasks.map((t) => t.companyId))];
    let notified = 0;
    for (const cid of companies) {
      const hours = await printerHours(cid);
      for (const t of tasks.filter((x) => x.companyId === cid)) {
        if (t.printer.isArchived) continue;
        const s = taskStatus(t, hours.get(t.printerId) ?? 0);
        if (!s.due && t.notifiedAt) {
          await prisma.maintenanceTask.update({ where: { id: t.id }, data: { notifiedAt: null } });
        } else if (s.due && !t.notifiedAt) {
          // erst als gemeldet markieren (nur wenn noch nicht), dann melden - so entsteht auch bei gleichzeitigen Prüfungen nur eine Meldung
          const claimed = await prisma.maintenanceTask.updateMany({ where: { id: t.id, notifiedAt: null }, data: { notifiedAt: new Date() } });
          if (claimed.count === 0) continue;
          const { title, body } = dueMessage(t.printer.name, t.name, t, s);
          try {
            await notify(cid, "MAINTENANCE_DUE", title, body, t.printerId);
            notified++;
          } catch (err) {
            await prisma.maintenanceTask.update({ where: { id: t.id }, data: { notifiedAt: null } });
            throw err;
          }
        }
      }
    }
    return notified;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Wartungsplan konnte nicht geprüft werden");
    return 0;
  }
}
