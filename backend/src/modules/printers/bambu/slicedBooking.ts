import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { logger } from "../../../utils/logger";
import { gramsToUnit, mergeUsage, type UsageEntry } from "./amsBooking";
import type { PlateFilament } from "./printJob";
import type { JobResult, PrinterLiveStatus, Tray } from "./status";

/**
 * Materialabbuchung nach Slicer-Angabe für Spulen ohne Chip: Die 3MF-Datei enthält je Filament die vom Slicer berechneten Gramm.
 * Beim Senden eines Drucks aus der App merkt sich die Software, welches Filament in welchem AMS-Fach liegt (PrintPlan). Beginnt am
 * Drucker ein Auftrag mit demselben Namen, wandert der Plan an den Auftrag; bei Druckende wird das Material des Fachs abgebucht.
 * Fächer mit Chip-Spule bucht die AMS-Messung (amsBooking) - sie werden hier übersprungen, damit nichts doppelt gebucht wird.
 * Es sind Slicer-Werte: Spülmenge (Farbwechsel) und Abweichungen der Spule sind nicht enthalten.
 */

export interface PlanEntry {
  filament: number;
  slot: number; // AMS-Einheit * 4 + Fach
  grams: number;
}

const EXTERNAL_SPOOL = 254;
const PLAN_VALID_MS = 48 * 3600_000;

/** Dateiname/Auftragsname vergleichbar machen: ohne Pfad, ohne .gcode.3mf/.3mf/.gcode, kleingeschrieben. */
export function normalizeJobName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/\.gcode\.3mf$/i, "").replace(/\.3mf$/i, "").replace(/\.gcode$/i, "").trim().toLowerCase();
}

/** Plan aus den Filamenten der Platte und der gewählten Fach-Zuordnung; ohne Gramm oder ohne AMS-Fach (externe Spule) entfällt der Eintrag. */
export function buildPlanEntries(filaments: PlateFilament[], assignment: Record<number, number>): PlanEntry[] {
  const out: PlanEntry[] = [];
  for (const f of filaments) {
    const slot = assignment[f.id];
    if (slot === undefined || slot === EXTERNAL_SPOOL || f.usedGrams === null || f.usedGrams <= 0) continue;
    out.push({ filament: f.id, slot, grams: f.usedGrams });
  }
  return out;
}

/** Anteil des Plans, der abgebucht wird: fertig = alles, abgebrochen/fehlgeschlagen = Fortschritt, unklar = nichts. */
export function planFactor(result: JobResult, lastProgress: number | null): number {
  if (result === "FINISHED") return 1;
  if ((result === "FAILED" || result === "CANCELLED") && lastProgress !== null) return Math.max(0, Math.min(100, lastProgress)) / 100;
  return 0;
}

export interface MappedSlot {
  slot: number;
  materialId: string;
  materialName: string;
  materialUnit: string;
}
export interface PlanBooking {
  materialId: string;
  name: string;
  grams: number;
  amount: number | null; // in der Einheit des Materials; null = Einheit nicht umrechenbar
  unit: string;
}

/** Rechnet den Plan in Abbuchungen je Material um. Fächer mit Chip-Spule und nicht zugeordnete Fächer werden übersprungen. */
export function computePlanBookings(entries: PlanEntry[], factor: number, trays: Tray[], mapped: MappedSlot[]): PlanBooking[] {
  const byMaterial = new Map<string, PlanBooking>();
  if (factor <= 0) return [];
  for (const e of entries) {
    const m = mapped.find((s) => s.slot === e.slot);
    if (!m) continue;
    const tray = trays.find((t) => t.amsSlot === e.slot);
    if (tray?.rfid) continue; // Chip-Spule: die AMS-Messung bucht
    const grams = e.grams * factor;
    const hit = byMaterial.get(m.materialId);
    if (hit) hit.grams += grams;
    else byMaterial.set(m.materialId, { materialId: m.materialId, name: m.materialName, grams, amount: null, unit: m.materialUnit });
  }
  const list = [...byMaterial.values()];
  for (const b of list) {
    b.grams = Math.round(b.grams * 100) / 100;
    b.amount = gramsToUnit(b.grams, b.unit);
  }
  return list.filter((b) => b.grams > 0);
}

/** Beim Senden eines Drucks merken (auch bei "Nur senden", der Start erfolgt dann am Drucker). Alte Pläne desselben Namens werden ersetzt. */
export async function savePrintPlan(companyId: string, printerId: string, fileName: string, entries: PlanEntry[], orderConfirmationId: string | null = null) {
  const jobName = normalizeJobName(fileName);
  await prisma.printPlan.deleteMany({ where: { printerId, OR: [{ jobName }, { createdAt: { lt: new Date(Date.now() - PLAN_VALID_MS) } }] } });
  if (entries.length === 0 && !orderConfirmationId) return;
  await prisma.printPlan.create({ data: { companyId, printerId, jobName, entries: entries as unknown as object[], orderConfirmationId } });
}

/** Beginnt ein Auftrag am Drucker: passenden Plan (gleicher Name, höchstens 48 h alt) an den Auftrag hängen. */
export async function attachPlanToJob(printerId: string, jobId: string, jobName: string | null) {
  if (!jobName) return;
  const plan = await prisma.printPlan.findFirst({ where: { printerId, jobName: normalizeJobName(jobName), createdAt: { gte: new Date(Date.now() - PLAN_VALID_MS) } }, orderBy: { createdAt: "desc" } });
  if (!plan) return;
  const entries = Array.isArray(plan.entries) ? (plan.entries as unknown[]) : [];
  await prisma.$transaction([
    prisma.printerJob.update({ where: { id: jobId }, data: { ...(entries.length > 0 ? { slicedPlan: entries as object[] } : {}), ...(plan.orderConfirmationId ? { orderConfirmationId: plan.orderConfirmationId } : {}) } }),
    prisma.printPlan.delete({ where: { id: plan.id } }),
  ]);
}

const warnedUnits = new Set<string>();

/** Bei Druckende: Plan des Auftrags abbuchen (einmalig - der Plan wird danach vom Auftrag entfernt). Gibt die gebuchten Mengen zurück. */
export async function bookPlanAtEnd(printerId: string, jobId: string, result: JobResult, lastProgress: number | null, status: PrinterLiveStatus): Promise<UsageEntry[]> {
  const job = await prisma.printerJob.findUnique({ where: { id: jobId }, select: { slicedPlan: true, materialUsage: true } });
  if (!job || !Array.isArray(job.slicedPlan)) return [];
  const entries = job.slicedPlan as unknown as PlanEntry[];
  const rows = await prisma.amsSlotMapping.findMany({ where: { printerId }, include: { material: { select: { name: true, unit: true } } } });
  const mapped: MappedSlot[] = rows.map((r) => ({ slot: r.slot, materialId: r.materialId, materialName: r.material.name, materialUnit: r.material.unit }));
  const bookings = computePlanBookings(entries, planFactor(result, lastProgress), status.ams.units.flatMap((u) => u.trays), mapped);

  const booked: UsageEntry[] = [];
  await prisma.$transaction(async (tx) => {
    let usage: unknown = job.materialUsage;
    for (const b of bookings) {
      if (b.amount === null) {
        if (!warnedUnits.has(b.materialId)) {
          warnedUnits.add(b.materialId);
          logger.warn({ materialId: b.materialId, unit: b.unit }, "Material hat keine Einheit g/kg - Verbrauch kann nicht abgebucht werden");
        }
        continue;
      }
      const material = await tx.material.update({ where: { id: b.materialId }, data: { stockQuantity: { decrement: b.amount } }, select: { costPerUnitCents: true } });
      const cents = b.amount * material.costPerUnitCents;
      usage = mergeUsage(usage, { materialId: b.materialId, name: b.name, grams: b.grams, cents });
      booked.push({ materialId: b.materialId, name: b.name, grams: b.grams, cents });
    }
    await tx.printerJob.update({ where: { id: jobId }, data: { slicedPlan: Prisma.DbNull, ...(booked.length > 0 ? { materialUsage: usage as object[] } : {}) } });
  });
  return booked;
}
