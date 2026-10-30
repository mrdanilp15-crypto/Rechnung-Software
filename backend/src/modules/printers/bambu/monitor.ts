import { prisma } from "../../../db/prisma";
import { decryptField } from "../../../utils/crypto";
import { logger } from "../../../utils/logger";
import { BambuMonitorCore, testBambuConnection as testCore, type ConnectionTestResult, type JobStore } from "./monitorCore";
import type { PrinterLiveStatus } from "./status";
import { amsBooking } from "./amsBooking";
import { notifyPrinterEvent } from "../../notifications/service";

/**
 * Anbindung des Monitor-Kerns an Datenbank und Einstellungen: lädt die Drucker mit aktiver Live-Verbindung, entschlüsselt die
 * Zugangscodes und legt erkannte Druckaufträge (PrinterJob) in der Datenbank ab.
 */

export type { ConnectionTestResult };

const prismaJobStore: JobStore = {
  findOpen: (printerId) => prisma.printerJob.findFirst({ where: { printerId, endedAt: null }, orderBy: { startedAt: "desc" }, select: { id: true, name: true, startedAt: true } }),
  create: (data) => prisma.printerJob.create({ data, select: { id: true, name: true, startedAt: true } }),
  close: async (id, data) => {
    await prisma.printerJob.update({ where: { id }, data });
  },
};

const core = new BambuMonitorCore({
  store: prismaJobStore,
  log: logger,
  onReport: (target, status, jobId) => amsBooking.onStatus(target.printerId, status, jobId),
  onJobEnd: async (target, info) => {
    if (info.result !== "FINISHED" && info.result !== "FAILED") return; // abgebrochen oder unbekannt: keine Meldung
    const printer = await prisma.printer.findUnique({ where: { id: target.printerId }, select: { name: true } });
    const job = info.jobId ? await prisma.printerJob.findUnique({ where: { id: info.jobId }, select: { materialUsage: true } }) : null;
    await notifyPrinterEvent(target.companyId, {
      type: info.result === "FINISHED" ? "PRINT_FINISHED" : "PRINT_FAILED",
      printerId: target.printerId,
      printerName: printer?.name ?? "Drucker",
      jobName: info.name,
      minutes: info.minutes,
      materialUsage: Array.isArray(job?.materialUsage) ? (job!.materialUsage as { name: string; grams: number }[]) : undefined,
    });
  },
  onPrinterError: async (target, info) => {
    const printer = await prisma.printer.findUnique({ where: { id: target.printerId }, select: { name: true } });
    await notifyPrinterEvent(target.companyId, { type: "PRINTER_ERROR", printerId: target.printerId, printerName: printer?.name ?? "Drucker", jobName: info.name, errorCode: info.code });
  },
});

type PrinterRow = { id: string; companyId: string; host: string | null; serial: string | null; accessCodeEncrypted: string | null };

function startFromRow(p: PrinterRow) {
  if (!p.host || !p.serial || !p.accessCodeEncrypted) return;
  try {
    core.startTarget({ printerId: p.id, companyId: p.companyId, host: p.host, serial: p.serial, accessCode: decryptField(p.accessCodeEncrypted) });
  } catch {
    logger.warn({ printerId: p.id }, "Zugangscode des Druckers nicht lesbar (Schlüssel geändert?)");
  }
}

export const bambuMonitor = {
  /** Beim Serverstart: alle Drucker mit aktiver Live-Verbindung verbinden. */
  async init() {
    const printers = await prisma.printer.findMany({ where: { isArchived: false, liveEnabled: true, connectionType: "BAMBU_LAN" } });
    for (const p of printers) startFromRow(p);
    core.startStaleCheck();
    logger.info({ count: printers.length }, "Drucker-Live-Verbindung gestartet");
  },
  /** Nach dem Anlegen/Ändern/Löschen eines Druckers: Verbindung neu aufbauen bzw. beenden. */
  async sync(printerId: string) {
    core.stop(printerId);
    const p = await prisma.printer.findUnique({ where: { id: printerId } });
    if (p && !p.isArchived && p.liveEnabled && p.connectionType === "BAMBU_LAN") startFromRow(p);
  },
  getStatus: (printerId: string): PrinterLiveStatus => core.getStatus(printerId),
  /** Nach Änderung der Fach-Zuordnungen (AMS -> Material) */
  refreshAmsMappings: (printerId: string) => amsBooking.invalidate(printerId),
  stopAll: () => core.stopAll(),
};

export const testBambuConnection = (target: { host: string; serial: string; accessCode: string }): Promise<ConnectionTestResult> => testCore(target);
