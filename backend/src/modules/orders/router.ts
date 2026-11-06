import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { activityLabel, hm } from "../timetracking/calc";
import { buildTimeline, type TimelineEvent } from "./timeline";
import { avatarOf } from "../users/avatar";
import { buildAssignmentMessage, notifyUser } from "../notifications/service";
import { logger } from "../../utils/logger";

/**
 * Auftragsseite (Auftragsbestätigung als zentrales Objekt): Stammdaten, Positionen, verknüpfte Belege, Drucke, Zeiten, Dateien, Kommentare
 * und ein gemeinsamer Verlauf. Dateien liegen im Belegarchiv und werden hier nur zugeordnet.
 */

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

async function owned(id: string, companyId: string) {
  const o = await prisma.orderConfirmation.findFirst({ where: { id, companyId } });
  if (!o) throw new HttpError(404, "Auftrag nicht gefunden");
  return o;
}

const PRIORITY_LABEL = ["normal", "hoch", "dringend"];

ordersRouter.get("/:id", async (req, res) => {
  const companyId = req.auth!.companyId;
  const order = await prisma.orderConfirmation.findFirst({
    where: { id: req.params.id, companyId },
    include: { customer: { select: { id: true, name: true, contactName: true, email: true, phone: true } }, items: { orderBy: { position: "asc" } } },
  });
  if (!order) throw new HttpError(404, "Auftrag nicht gefunden");

  const [quote, deliveryNotes, invoices, jobs, times, files, comments, audits, users] = await Promise.all([
    order.sourceQuoteId ? prisma.quote.findFirst({ where: { id: order.sourceQuoteId, companyId }, select: { id: true, quoteNumber: true, status: true, totalCents: true } }) : null,
    prisma.deliveryNote.findMany({ where: { sourceOrderConfirmationId: order.id, companyId }, select: { id: true, noteNumber: true, status: true }, orderBy: { createdAt: "asc" } }),
    prisma.invoice.findMany({ where: { sourceOrderConfirmationId: order.id, companyId }, select: { id: true, invoiceNumber: true, status: true, totalCents: true, isCancellationDocument: true }, orderBy: { createdAt: "asc" } }),
    prisma.printerJob.findMany({ where: { orderConfirmationId: order.id }, include: { printer: { select: { name: true } } }, orderBy: { startedAt: "asc" } }),
    prisma.timeEntry.findMany({ where: { orderConfirmationId: order.id, endedAt: { not: null } }, orderBy: { startedAt: "asc" } }),
    prisma.orderFile.findMany({ where: { orderConfirmationId: order.id }, include: { document: { select: { id: true, title: true, fileName: true, sizeBytes: true, mimeType: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.orderComment.findMany({ where: { orderConfirmationId: order.id }, orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({ where: { companyId, entityType: "OrderConfirmation", entityId: order.id, action: { in: ["production.status", "production.shipped_mail", "order.assign"] } }, orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ where: { companyId }, select: { id: true, name: true, avatarPath: true, avatarPreset: true, avatarColor: true, avatarUpdatedAt: true } }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const nameOf = (id: string | null | undefined) => (id ? names.get(id) ?? "Ehemaliger Benutzer" : null);

  const events: TimelineEvent[] = [{ at: order.createdAt, kind: "created", text: "Auftrag angelegt", by: null }];
  for (const c of comments) events.push({ at: c.createdAt, kind: "comment", text: c.text, by: nameOf(c.userId) });
  for (const a of audits) {
    let meta: { from?: string; to?: string; to_?: string } = {};
    try { meta = a.metadata ? JSON.parse(a.metadata) : {}; } catch { /* ohne Zusatzangaben */ }
    events.push({ at: a.createdAt, kind: "status", text: a.action === "production.shipped_mail" ? "Versandmail gesendet" : a.action === "order.assign" ? ((meta as { toName?: string }).toName ? `Zuständig: ${(meta as { toName?: string }).toName}` : "Zuständigkeit aufgehoben") : `Status: ${meta.from ?? "?"} → ${meta.to ?? "?"}`, by: nameOf(a.userId), raw: meta });
  }
  for (const j of jobs) {
    events.push({ at: j.startedAt, kind: "print", text: `Druck gestartet: ${j.name ?? "Druckauftrag"} (${j.printer.name})`, by: null });
    if (j.endedAt) events.push({ at: j.endedAt, kind: "print", text: `Druck ${j.result === "FINISHED" ? "fertig" : j.result === "FAILED" ? "fehlgeschlagen" : j.result === "CANCELLED" ? "abgebrochen" : "beendet"}: ${j.name ?? "Druckauftrag"}`, by: null });
  }
  for (const t of times) events.push({ at: t.startedAt, kind: "time", text: `Zeit erfasst: ${hm(t.minutes ?? 0)} h, ${activityLabel(t.activity)}${t.note ? ` (${t.note})` : ""}`, by: nameOf(t.userId) });
  for (const f of files) events.push({ at: f.createdAt, kind: "file", text: `Datei zugeordnet: ${f.document.fileName}`, by: null });

  // Was lässt sich für diesen Auftrag drucken? Direkt zugeordnete 3MF-Dateien und die aktuelle 3MF der Produkte, deren Name einer Position entspricht
  const norm = (t: string) => t.trim().toLowerCase();
  const itemNames = new Set(order.items.map((i) => norm(i.description)));
  const productFiles = await prisma.productFile.findMany({
    where: { companyId, isCurrent: true, document: { fileName: { endsWith: ".3mf", mode: "insensitive" } } },
    select: { revision: true, product: { select: { name: true } }, document: { select: { id: true, fileName: true, title: true } } },
  });
  const printables = [
    ...files.filter((f) => /\.3mf$/i.test(f.document.fileName)).map((f) => ({ documentId: f.document.id, fileName: f.document.fileName, label: f.document.title, source: "order" as const, revision: null as number | null })),
    ...productFiles.filter((p) => itemNames.has(norm(p.product.name))).map((p) => ({ documentId: p.document.id, fileName: p.document.fileName, label: p.product.name, source: "product" as const, revision: p.revision })),
  ].filter((p, i, all) => all.findIndex((x) => x.documentId === p.documentId) === i);

  res.json({
    printables,
    order: {
      id: order.id,
      number: order.confirmationNumber,
      documentStatus: order.status,
      productionStatus: order.productionStatus,
      priority: order.priority,
      issueDate: order.issueDate,
      expectedDeliveryDate: order.expectedDeliveryDate,
      totalCents: order.totalCents,
      subtotalCents: order.subtotalCents,
      notes: order.notes,
      productionNote: order.productionNote,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      shippedAt: order.shippedAt,
      shippedMailAt: order.shippedMailAt,
      voided: !!order.voidedAt,
      customer: order.customer,
      assignee: order.assigneeId ? (() => { const u = users.find((x) => x.id === order.assigneeId); return u ? { id: u.id, name: u.name, avatar: avatarOf(u) } : { id: order.assigneeId, name: "Ehemaliger Benutzer", avatar: null }; })() : null,
      items: order.items.map((i) => ({ description: i.description, quantity: i.quantity, unit: i.unit, unitPriceCents: i.unitPriceCents, lineTotalCents: i.lineTotalCents })),
    },
    links: { quote, deliveryNotes, invoices },
    jobs: jobs.map((j) => ({ id: j.id, name: j.name, printerName: j.printer.name, startedAt: j.startedAt, endedAt: j.endedAt, minutes: j.minutes, result: j.result, materialUsage: Array.isArray(j.materialUsage) ? j.materialUsage : null })),
    timeMinutes: times.reduce((a, t) => a + (t.minutes ?? 0), 0),
    files: files.map((f) => ({ id: f.id, note: f.note, addedAt: f.createdAt, documentId: f.document.id, title: f.document.title, fileName: f.document.fileName, sizeBytes: f.document.sizeBytes })),
    comments: comments.map((c) => ({ id: c.id, text: c.text, createdAt: c.createdAt, userId: c.userId, userName: nameOf(c.userId), mine: c.userId === req.auth!.sub })),
    timeline: buildTimeline(events),
    priorityLabels: PRIORITY_LABEL,
  });
});

// Priorität und/oder Zuständigen ändern
const patchSchema = z.object({ priority: z.number().int().min(0).max(2).optional(), assigneeId: z.string().min(1).nullable().optional() });
ordersRouter.patch("/:id", async (req, res) => {
  const companyId = req.auth!.companyId;
  const body = patchSchema.parse(req.body);
  const order = await owned(req.params.id, companyId);
  if (body.priority !== undefined) {
    await prisma.orderConfirmation.update({ where: { id: order.id }, data: { priority: body.priority } });
    await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "order.priority", entityType: "OrderConfirmation", entityId: order.id, metadata: { from: order.priority, to: body.priority } });
  }
  if (body.assigneeId !== undefined && body.assigneeId !== order.assigneeId) {
    let toName: string | null = null;
    if (body.assigneeId) {
      const user = await prisma.user.findFirst({ where: { id: body.assigneeId, companyId, isActive: true }, select: { name: true } });
      if (!user) throw new HttpError(400, "Mitarbeiter nicht gefunden oder deaktiviert.");
      toName = user.name;
    }
    await prisma.orderConfirmation.update({ where: { id: order.id }, data: { assigneeId: body.assigneeId } });
    await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "order.assign", entityType: "OrderConfirmation", entityId: order.id, metadata: { from: order.assigneeId, to: body.assigneeId, toName } });
    // Dem zugewiesenen Mitarbeiter Bescheid geben (nicht, wenn man sich den Auftrag selbst gibt)
    if (body.assigneeId && body.assigneeId !== req.auth!.sub) {
      try {
        const [full, by] = await Promise.all([
          prisma.orderConfirmation.findUnique({ where: { id: order.id }, select: { confirmationNumber: true, customer: { select: { name: true } }, items: { select: { description: true }, orderBy: { position: "asc" }, take: 3 } } }),
          prisma.user.findUnique({ where: { id: req.auth!.sub }, select: { name: true } }),
        ]);
        const msg = buildAssignmentMessage({ orderNumber: full?.confirmationNumber ?? null, customerName: full?.customer.name ?? "", items: (full?.items ?? []).map((i) => i.description), byName: by?.name ?? null });
        await notifyUser(companyId, body.assigneeId, msg.title, msg.body, `/orders/${order.id}`);
      } catch (err) {
        logger.warn({ err: (err as Error).message }, "Benachrichtigung zur Zuweisung fehlgeschlagen");
      }
    }
  }
  res.json({ ok: true });
});

const commentSchema = z.object({ text: z.string().trim().min(1).max(2000) });
ordersRouter.post("/:id/comments", async (req, res) => {
  const companyId = req.auth!.companyId;
  const { text } = commentSchema.parse(req.body);
  const order = await owned(req.params.id, companyId);
  const c = await prisma.orderComment.create({ data: { companyId, orderConfirmationId: order.id, userId: req.auth!.sub, text } });
  res.status(201).json({ id: c.id });
});

ordersRouter.delete("/:id/comments/:cid", async (req, res) => {
  const companyId = req.auth!.companyId;
  const order = await owned(req.params.id, companyId);
  const c = await prisma.orderComment.findFirst({ where: { id: req.params.cid, orderConfirmationId: order.id, companyId } });
  if (!c) throw new HttpError(404, "Kommentar nicht gefunden");
  if (c.userId !== req.auth!.sub && req.auth!.role !== "ADMIN") throw new HttpError(403, "Du darfst nur eigene Kommentare löschen.");
  await prisma.orderComment.delete({ where: { id: c.id } });
  res.status(204).send();
});

const fileSchema = z.object({ documentId: z.string().min(1), note: z.string().trim().max(300).nullish() });
ordersRouter.post("/:id/files", async (req, res) => {
  const companyId = req.auth!.companyId;
  const body = fileSchema.parse(req.body);
  const order = await owned(req.params.id, companyId);
  const doc = await prisma.archiveDocument.findFirst({ where: { id: body.documentId, companyId }, select: { id: true } });
  if (!doc) throw new HttpError(404, "Dokument nicht im Archiv gefunden");
  if (await prisma.orderFile.findFirst({ where: { orderConfirmationId: order.id, documentId: doc.id }, select: { id: true } })) throw new HttpError(409, "Diese Datei ist dem Auftrag schon zugeordnet.");
  const f = await prisma.orderFile.create({ data: { companyId, orderConfirmationId: order.id, documentId: doc.id, note: body.note || null } });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "order.file.add", entityType: "OrderConfirmation", entityId: order.id, metadata: { documentId: doc.id } });
  res.status(201).json({ id: f.id });
});

// Archivdokumente, die sich zuordnen lassen (noch nicht an diesem Auftrag)
ordersRouter.get("/:id/files/candidates", async (req, res) => {
  const companyId = req.auth!.companyId;
  const order = await owned(req.params.id, companyId);
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  res.json(
    await prisma.archiveDocument.findMany({
      where: { companyId, orderFiles: { none: { orderConfirmationId: order.id } }, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { fileName: { contains: q, mode: "insensitive" } }] } : {}) },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, title: true, fileName: true, sizeBytes: true },
    }),
  );
});

ordersRouter.delete("/:id/files/:fid", async (req, res) => {
  const companyId = req.auth!.companyId;
  const order = await owned(req.params.id, companyId);
  const f = await prisma.orderFile.findFirst({ where: { id: req.params.fid, orderConfirmationId: order.id, companyId } });
  if (!f) throw new HttpError(404, "Datei nicht gefunden");
  await prisma.orderFile.delete({ where: { id: f.id } });
  res.status(204).send();
});
