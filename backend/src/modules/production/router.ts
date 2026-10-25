import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";

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

  res.json({
    shippedVisibleDays: SHIPPED_VISIBLE_DAYS,
    items: orders.map((o) => {
      let printMinutes = 0;
      for (const it of o.items) printMinutes += (minutesByName.get(it.description.trim().toLowerCase()) ?? 0) * it.quantity;
      return {
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
