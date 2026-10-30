import { prisma } from "../../../db/prisma";
import { logger } from "../../../utils/logger";
import type { PrinterLiveStatus, Tray } from "./status";

/**
 * Automatische Materialabbuchung aus dem AMS: Bambu-Spulen mit Chip melden ihren Füllstand in Prozent. Sinkt er gegenüber dem
 * zuletzt verbuchten Stand, wird die Differenz (Prozent mal Spulengewicht) vom Materialbestand abgezogen. Gebucht wird laufend
 * (nicht erst am Druckende) und immer gegen den zuletzt verbuchten Stand - so geht auch bei vielen kleinen Drucken nichts durch die
 * Rundung auf ganze Prozent verloren, und ein Neustart des Servers bucht nichts doppelt.
 */

export interface SlotState {
  id: string;
  slot: number;
  materialId: string;
  spoolGrams: number;
  lastRemain: number | null;
  lastTag: string | null;
}

export interface SlotUpdate {
  id: string;
  materialId: string;
  deductGrams: number;
  lastRemain: number | null;
  lastTag: string | null;
  spoolChanged: boolean;
}

/** Vergleicht den gemeldeten Stand mit dem zuletzt verbuchten und liefert nur die Fächer, bei denen sich etwas ändert. */
export function computeAmsDeductions(slots: SlotState[], trays: Tray[]): SlotUpdate[] {
  const updates: SlotUpdate[] = [];
  for (const s of slots) {
    const tray = trays.find((t) => t.amsSlot === s.slot);
    // Ohne Chip (Fremdspule) oder ohne Messwert gibt es keinen verlässlichen Füllstand - nichts buchen
    if (!tray || !tray.rfid || tray.remainPercent === null) continue;
    const remain = Math.round(tray.remainPercent);
    const tag = tray.tag;
    if (s.lastTag !== null && tag !== null && s.lastTag !== tag) {
      updates.push({ id: s.id, materialId: s.materialId, deductGrams: 0, lastRemain: remain, lastTag: tag, spoolChanged: true });
    } else if (s.lastRemain === null) {
      updates.push({ id: s.id, materialId: s.materialId, deductGrams: 0, lastRemain: remain, lastTag: tag, spoolChanged: false });
    } else if (remain < s.lastRemain) {
      updates.push({ id: s.id, materialId: s.materialId, deductGrams: ((s.lastRemain - remain) / 100) * s.spoolGrams, lastRemain: remain, lastTag: tag ?? s.lastTag, spoolChanged: false });
    } else if (remain > s.lastRemain || (tag !== null && s.lastTag === null)) {
      // Füllstand gestiegen (Spule aufgefüllt/getauscht ohne neue Kennung): nur neuen Ausgangswert merken
      updates.push({ id: s.id, materialId: s.materialId, deductGrams: 0, lastRemain: remain, lastTag: tag ?? s.lastTag, spoolChanged: false });
    }
  }
  return updates;
}

/** Gramm in die Einheit des Materials umrechnen; null, wenn die Einheit nicht umrechenbar ist. */
export function gramsToUnit(grams: number, unit: string): number | null {
  const u = unit.trim().toLowerCase();
  if (u === "g" || u === "gramm") return grams;
  if (u === "kg") return grams / 1000;
  return null;
}

export interface UsageEntry {
  materialId: string;
  name: string;
  grams: number;
}

export function mergeUsage(existing: unknown, add: UsageEntry): UsageEntry[] {
  const list: UsageEntry[] = Array.isArray(existing) ? (existing as UsageEntry[]).map((e) => ({ ...e })) : [];
  const hit = list.find((e) => e.materialId === add.materialId);
  if (hit) hit.grams = Math.round((hit.grams + add.grams) * 100) / 100;
  else list.push({ ...add, grams: Math.round(add.grams * 100) / 100 });
  return list;
}

type SlotWithMaterial = SlotState & { materialName: string; materialUnit: string };

class AmsBooking {
  private cache = new Map<string, SlotWithMaterial[]>();
  private warnedUnits = new Set<string>();

  private async load(printerId: string): Promise<SlotWithMaterial[]> {
    const hit = this.cache.get(printerId);
    if (hit) return hit;
    const rows = await prisma.amsSlotMapping.findMany({ where: { printerId }, include: { material: { select: { name: true, unit: true } } } });
    const slots = rows.map((r) => ({ id: r.id, slot: r.slot, materialId: r.materialId, spoolGrams: r.spoolGrams, lastRemain: r.lastRemain, lastTag: r.lastTag, materialName: r.material.name, materialUnit: r.material.unit }));
    this.cache.set(printerId, slots);
    return slots;
  }

  /** Nach Änderung der Zuordnungen neu aus der Datenbank laden. */
  invalidate(printerId: string) {
    this.cache.delete(printerId);
  }

  /** Mit jedem Druckerbericht aufgerufen (nacheinander je Drucker). jobId = gerade laufender Auftrag, falls vorhanden. */
  async onStatus(printerId: string, status: PrinterLiveStatus, jobId: string | null) {
    if (status.connection !== "online" || status.ams.units.length === 0) return;
    const slots = await this.load(printerId);
    if (slots.length === 0) return;
    const trays = status.ams.units.flatMap((u) => u.trays);
    const updates = computeAmsDeductions(slots, trays);
    if (updates.length === 0) return;

    for (const u of updates) {
      const slot = slots.find((s) => s.id === u.id)!;
      const amount = u.deductGrams > 0 ? gramsToUnit(u.deductGrams, slot.materialUnit) : null;
      if (u.deductGrams > 0 && amount === null && !this.warnedUnits.has(slot.materialId)) {
        this.warnedUnits.add(slot.materialId);
        logger.warn({ materialId: slot.materialId, unit: slot.materialUnit }, "Material hat keine Einheit g/kg - AMS-Verbrauch kann nicht abgebucht werden");
      }
      await prisma.$transaction(async (tx) => {
        await tx.amsSlotMapping.update({ where: { id: u.id }, data: { lastRemain: u.lastRemain, lastTag: u.lastTag } });
        if (amount !== null && amount > 0) {
          await tx.material.update({ where: { id: slot.materialId }, data: { stockQuantity: { decrement: amount } } });
          if (jobId) {
            const job = await tx.printerJob.findUnique({ where: { id: jobId }, select: { materialUsage: true } });
            await tx.printerJob.update({ where: { id: jobId }, data: { materialUsage: mergeUsage(job?.materialUsage, { materialId: slot.materialId, name: slot.materialName, grams: u.deductGrams }) as object[] } });
          }
        }
      });
      slot.lastRemain = u.lastRemain;
      slot.lastTag = u.lastTag;
    }
  }
}

export const amsBooking = new AmsBooking();
