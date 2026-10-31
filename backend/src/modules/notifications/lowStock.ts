import { prisma } from "../../db/prisma";
import { logger } from "../../utils/logger";
import { notify } from "./service";

/**
 * Mindestbestand bei Material: Fällt der Bestand auf die eingestellte Grenze oder darunter, kommt einmal eine Meldung (Startseite, Push,
 * optional E-Mail). Danach wird nicht erneut gemeldet, bis der Bestand wieder über der Grenze lag (z.B. nach einer Nachbestellung).
 */

export interface StockRow {
  id: string;
  companyId: string;
  name: string;
  unit: string;
  stockQuantity: number;
  minStock: number | null;
  lowStockNotifiedAt: Date | null;
  supplierName: string | null;
}

export function lowStockDecisions(rows: StockRow[]): { notify: StockRow[]; reset: string[] } {
  const out = { notify: [] as StockRow[], reset: [] as string[] };
  for (const r of rows) {
    const watched = r.minStock !== null && r.minStock > 0;
    const low = watched && r.stockQuantity <= r.minStock!;
    if (low && r.lowStockNotifiedAt === null) out.notify.push(r);
    else if (!low && r.lowStockNotifiedAt !== null) out.reset.push(r.id);
  }
  return out;
}

export function formatQuantity(value: number, unit: string): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${unit}`;
}

export function lowStockMessage(r: StockRow): { title: string; body: string } {
  const empty = r.stockQuantity <= 0;
  return {
    title: empty ? `${r.name} ist aufgebraucht` : `${r.name}: Bestand wird knapp`,
    body: `Von "${r.name}" ${empty ? "ist nichts mehr da" : `sind nur noch ${formatQuantity(r.stockQuantity, r.unit)} übrig`} (Mindestbestand ${formatQuantity(r.minStock!, r.unit)}).${r.supplierName ? ` Lieferant: ${r.supplierName}.` : ""} Im Katalog unter Material kannst du nachbestellen.`,
  };
}

/** Prüft die Materialien (einer Firma oder aller) und meldet neu unterschrittene Mindestbestände. Fehler werden nur protokolliert. */
export async function checkLowStock(companyId?: string): Promise<number> {
  try {
    const materials = await prisma.material.findMany({
      where: { isArchived: false, ...(companyId ? { companyId } : {}), OR: [{ minStock: { gt: 0 } }, { lowStockNotifiedAt: { not: null } }] },
      include: { supplier: { select: { name: true } } },
    });
    const rows: StockRow[] = materials.map((m) => ({ id: m.id, companyId: m.companyId, name: m.name, unit: m.unit, stockQuantity: m.stockQuantity, minStock: m.minStock, lowStockNotifiedAt: m.lowStockNotifiedAt, supplierName: m.supplier?.name ?? null }));
    const { notify: toNotify, reset } = lowStockDecisions(rows);
    if (reset.length > 0) await prisma.material.updateMany({ where: { id: { in: reset } }, data: { lowStockNotifiedAt: null } });
    for (const r of toNotify) {
      // Erst als gemeldet markieren (nur wenn noch nicht markiert), dann melden - so entsteht auch bei gleichzeitigen Prüfungen nur eine Meldung
      const claimed = await prisma.material.updateMany({ where: { id: r.id, lowStockNotifiedAt: null }, data: { lowStockNotifiedAt: new Date() } });
      if (claimed.count === 0) continue;
      const { title, body } = lowStockMessage(r);
      try {
        await notify(r.companyId, "LOW_STOCK", title, body);
      } catch (err) {
        // Meldung nicht angelegt: Markierung zurücknehmen, damit die nächste Prüfung es erneut versucht
        await prisma.material.update({ where: { id: r.id }, data: { lowStockNotifiedAt: null } });
        throw err;
      }
    }
    return toNotify.length;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Mindestbestand konnte nicht geprüft werden");
    return 0;
  }
}
