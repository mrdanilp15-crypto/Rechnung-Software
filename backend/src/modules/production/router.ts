import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { itemProductKey, machineCost, usageWithCosts, type MaterialPrice } from "./actuals";

/**
 * Produktionsboard: Aufträge (Auftragsbestätigungen) als Karten in vier Spalten
 * Erstellt -> In Produktion -> Versandbereit -> Versendet. Der Produktionsstatus ist unabhängig vom Belegstatus
 * (Entwurf/Fertig) - man kann also auch einen noch nicht versendeten Auftrag schon in Produktion geben.
 */

export const productionRouter = Router();
productionRouter.use(requireAuth);

export const PRODUCTION_STATUSES = ["CREATED", "IN_PRODUCTION", "READY_TO_SHIP", "SHIPPED"] as const;
const SHIPPED_VISIBLE_DAYS = 14;

productionRouter.get("/", async (req, res) => {
  const companyId = req.auth!.companyId;
  const includeShipped = req.query.includeShipped === "1";
  const cutoff = new Date(Date.now() - SHIPPED_VISIBLE_DAYS * 24 * 3600 * 1000);

  const orders = await prisma.orderConfirmation.findMany({
    where: {
      companyId,
      voidedAt: null,
      ...(includeShipped ? {} : { OR: [{ productionStatus: { not: "SHIPPED" } }, { shippedAt: { gte: cutoff } }, { shippedAt: null }] }),
    },
    include: { customer: { select: { name: true } }, items: { orderBy: { position: "asc" } } },
    orderBy: [{ expectedDeliveryDate: { sort: "asc", nulls: "last" } }, { issueDate: "desc" }],
    take: 500,
  });

  // Druckzeit je Auftrag schätzen: Positionen, deren Text genau einem Produktnamen entspricht, mal Stückzeit des Produkts
  const products = await prisma.product.findMany({ where: { companyId, printTimeMinutes: { gt: 0 } }, select: { name: true, printTimeMinutes: true } });
  const minutesByName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p.printTimeMinutes]));

  // Zugeordnete Drucke je Auftrag (Anzahl, Zeit, Verbrauch) für die Anzeige auf der Karte
  const prices = await materialPrices(companyId);
  const printed = await prisma.printerJob.findMany({ where: { orderConfirmationId: { in: orders.map((o) => o.id) } }, select: { orderConfirmationId: true, minutes: true, materialUsage: true } });
  const printsByOrder = new Map<string, { count: number; minutes: number; grams: number; materialCents: number }>();
  for (const j of printed) {
    const agg = printsByOrder.get(j.orderConfirmationId!) ?? { count: 0, minutes: 0, grams: 0, materialCents: 0 };
    agg.count += 1;
    agg.minutes += j.minutes ?? 0;
    for (const u of usageWithCosts(j.materialUsage, prices)) {
      agg.grams += u.grams;
      agg.materialCents += u.cents;
    }
    printsByOrder.set(j.orderConfirmationId!, agg);
  }

  res.json({
    shippedVisibleDays: SHIPPED_VISIBLE_DAYS,
    items: orders.map((o) => {
      let printMinutes = 0;
      for (const it of o.items) printMinutes += (minutesByName.get(it.description.trim().toLowerCase()) ?? 0) * it.quantity;
      const prints = printsByOrder.get(o.id);
      return {
        prints: prints ? { count: prints.count, minutes: Math.round(prints.minutes), grams: Math.round(prints.grams), materialCents: Math.round(prints.materialCents) } : null,
        id: o.id,
        number: o.confirmationNumber,
        customerName: o.customer.name,
        documentStatus: o.status,
        productionStatus: o.productionStatus,
        issueDate: o.issueDate,
        expectedDeliveryDate: o.expectedDeliveryDate,
        totalCents: o.totalCents,
        notes: o.productionNote,
        shippedAt: o.shippedAt,
        itemCount: o.items.length,
        itemSummary: o.items.slice(0, 3).map((i) => `${Number.isInteger(i.quantity) ? i.quantity : String(i.quantity).replace(".", ",")}× ${i.description.split("\n")[0]}`),
        printMinutes: Math.round(printMinutes),
      };
    }),
  });
});

/** Offene Aufträge (nicht versendet, nicht storniert) zur Auswahl, z.B. beim Zuordnen eines Drucks. */
productionRouter.get("/open", async (req, res) => {
  const orders = await prisma.orderConfirmation.findMany({
    where: { companyId: req.auth!.companyId, voidedAt: null, productionStatus: { not: "SHIPPED" } },
    select: { id: true, confirmationNumber: true, customer: { select: { name: true } } },
    orderBy: { issueDate: "desc" },
    take: 200,
  });
  res.json(orders.map((o) => ({ id: o.id, number: o.confirmationNumber, customerName: o.customer.name })));
});

async function materialPrices(companyId: string) {
  const rows = await prisma.material.findMany({ where: { companyId }, select: { id: true, unit: true, costPerUnitCents: true } });
  return new Map<string, MaterialPrice>(rows.map((m) => [m.id, { unit: m.unit, costPerUnitCents: m.costPerUnitCents }]));
}

/** Ist-Kosten eines Auftrags aus den zugeordneten Drucken: Zeit, Material (Einkaufspreis bei der Abbuchung) und Maschine. */
productionRouter.get("/:id/costs", async (req, res) => {
  const companyId = req.auth!.companyId;
  const order = await prisma.orderConfirmation.findFirst({
    where: { id: req.params.id, companyId },
    include: { customer: { select: { name: true } }, items: { orderBy: { position: "asc" } } },
  });
  if (!order) throw new HttpError(404, "Auftrag nicht gefunden");
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { electricityCentsPerKwh: true } });
  const electricity = company?.electricityCentsPerKwh ?? 35;
  const prices = await materialPrices(companyId);
  const jobs = await prisma.printerJob.findMany({ where: { orderConfirmationId: order.id }, orderBy: { startedAt: "asc" }, include: { printer: true } });

  const totals = { jobCount: jobs.length, minutes: 0, grams: 0, materialCents: 0, machine: { electricity: 0, depreciation: 0, wear: 0, total: 0 } };
  const rows = jobs.map((j) => {
    const usage = usageWithCosts(j.materialUsage, prices);
    const materialCents = usage.reduce((s, u) => s + u.cents, 0);
    const machine = machineCost(j.minutes, j.printer, electricity);
    totals.minutes += j.minutes ?? 0;
    totals.grams += usage.reduce((s, u) => s + u.grams, 0);
    totals.materialCents += materialCents;
    for (const k of ["electricity", "depreciation", "wear", "total"] as const) totals.machine[k] += machine[k];
    return { id: j.id, name: j.name, printerName: j.printer.name, startedAt: j.startedAt, endedAt: j.endedAt, minutes: j.minutes, result: j.result, usage, materialCents, machine };
  });

  res.json({
    order: {
      id: order.id,
      number: order.confirmationNumber,
      customerName: order.customer.name,
      netCents: order.subtotalCents,
      items: order.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPriceCents: i.unitPriceCents })),
    },
    jobs: rows,
    totals,
  });
});

/**
 * Ist-Kosten je Produkt aus abgeschlossenen Drucken: Berücksichtigt werden Aufträge mit zugeordneten Drucken, in denen genau eine
 * Position einem Produkt aus dem Katalog entspricht (Name gleich) - deren Drucke werden diesem Produkt zugerechnet.
 */
productionRouter.get("/product-actuals", async (req, res) => {
  const companyId = req.auth!.companyId;
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { electricityCentsPerKwh: true } });
  const electricity = company?.electricityCentsPerKwh ?? 35;
  const prices = await materialPrices(companyId);
  const products = await prisma.product.findMany({ where: { companyId }, select: { id: true, name: true } });
  const byKey = new Map<string, { id: string; name: string }>();
  for (const p of products) if (!byKey.has(itemProductKey(p.name))) byKey.set(itemProductKey(p.name), p);

  const orders = await prisma.orderConfirmation.findMany({
    where: { companyId, voidedAt: null, printerJobs: { some: { endedAt: { not: null } } } },
    include: { items: true, printerJobs: { where: { endedAt: { not: null } }, include: { printer: true } } },
    take: 1000,
  });

  const out = new Map<string, { productId: string; name: string; orders: number; quantity: number; minutes: number; grams: number; materialCents: number; machineCents: number }>();
  for (const o of orders) {
    const matched = o.items.filter((i) => byKey.has(itemProductKey(i.description)));
    if (matched.length !== 1 || matched[0].quantity <= 0) continue;
    const product = byKey.get(itemProductKey(matched[0].description))!;
    const agg = out.get(product.id) ?? { productId: product.id, name: product.name, orders: 0, quantity: 0, minutes: 0, grams: 0, materialCents: 0, machineCents: 0 };
    agg.orders += 1;
    agg.quantity += matched[0].quantity;
    for (const j of o.printerJobs) {
      agg.minutes += j.minutes ?? 0;
      for (const u of usageWithCosts(j.materialUsage, prices)) {
        agg.grams += u.grams;
        agg.materialCents += u.cents;
      }
      agg.machineCents += machineCost(j.minutes, j.printer, electricity).total;
    }
    out.set(product.id, agg);
  }
  res.json([...out.values()].map((a) => ({ ...a, minutes: Math.round(a.minutes), grams: Math.round(a.grams), materialCents: Math.round(a.materialCents), machineCents: Math.round(a.machineCents) })));
});

const patchSchema = z.object({
  productionStatus: z.enum(PRODUCTION_STATUSES).optional(),
  productionNote: z.string().trim().max(500).nullish(),
});

productionRouter.patch("/:id", async (req, res) => {
  const body = patchSchema.parse(req.body);
  const existing = await prisma.orderConfirmation.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId, voidedAt: null } });
  if (!existing) throw new HttpError(404, "Auftrag nicht gefunden");
  const statusChanged = body.productionStatus !== undefined && body.productionStatus !== existing.productionStatus;
  const updated = await prisma.orderConfirmation.update({
    where: { id: existing.id },
    data: {
      ...(body.productionStatus !== undefined ? { productionStatus: body.productionStatus } : {}),
      ...(body.productionNote !== undefined ? { productionNote: body.productionNote || null } : {}),
      ...(statusChanged ? { productionUpdatedAt: new Date(), shippedAt: body.productionStatus === "SHIPPED" ? new Date() : null } : {}),
    },
    select: { id: true, productionStatus: true, productionNote: true, shippedAt: true },
  });
  if (statusChanged) {
    await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "production.status", entityType: "OrderConfirmation", entityId: existing.id, metadata: { from: existing.productionStatus, to: body.productionStatus } });
  }
  res.json(updated);
});
