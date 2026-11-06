import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { PLACEHOLDER_HELP, SHIPPING_PLACEHOLDER_HELP } from "../pdf/placeholders";
import { DOC_TEXT_LIBRARY, EMAIL_LIBRARY } from "./library";
import { CARRIERS, DOC_TYPES, EMAIL_KINDS, EXAMPLE_TEMPLATES, carrierLabel, dropEmptyShippingLines, loadPlaceholderValues, renderText, trackingLink } from "./render";

/**
 * E-Mail-Vorlagen und Textbausteine. Lesen darf jeder angemeldete Benutzer (der Versanddialog braucht die Vorlagen),
 * anlegen/ändern/löschen nur ein Administrator.
 */

export const templatesRouter = Router();
templatesRouter.use(requireAuth);

const adminOnly = (role: string) => {
  if (role !== "ADMIN") throw new HttpError(403, "Nur ein Administrator darf Vorlagen ändern.");
};

templatesRouter.get("/meta", (_req, res) => {
  res.json({ placeholders: [...PLACEHOLDER_HELP, ...SHIPPING_PLACEHOLDER_HELP], carriers: CARRIERS, kinds: EMAIL_KINDS });
});

// Fertige Formulierungen in mehreren Tonlagen zum Ausprobieren (E-Mails und Begrüßung/Schlusstext der Belege) - nur Vorschläge, nichts wird automatisch verwendet
templatesRouter.get("/library", (_req, res) => {
  res.json({ email: EMAIL_LIBRARY, documents: DOC_TEXT_LIBRARY });
});

// ---------- E-Mail-Vorlagen ----------

templatesRouter.get("/email", async (req, res) => {
  const kind = typeof req.query.kind === "string" && (EMAIL_KINDS as readonly string[]).includes(req.query.kind) ? req.query.kind : undefined;
  const list = await prisma.emailTemplate.findMany({ where: { companyId: req.auth!.companyId, ...(kind ? { kind } : {}) }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  res.json(list);
});

const emailSchema = z.object({
  kind: z.enum(EMAIL_KINDS),
  name: z.string().trim().min(1).max(80),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  isDefault: z.boolean().default(false),
});

templatesRouter.post("/email", async (req, res) => {
  adminOnly(req.auth!.role);
  const companyId = req.auth!.companyId;
  const body = emailSchema.parse(req.body);
  const created = await prisma.$transaction(async (tx) => {
    if (body.isDefault) await tx.emailTemplate.updateMany({ where: { companyId, kind: body.kind }, data: { isDefault: false } });
    return tx.emailTemplate.create({ data: { ...body, companyId } });
  });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "template.email.create", entityType: "EmailTemplate", entityId: created.id });
  res.status(201).json(created);
});

templatesRouter.patch("/email/:id", async (req, res) => {
  adminOnly(req.auth!.role);
  const companyId = req.auth!.companyId;
  const body = emailSchema.partial().parse(req.body);
  const existing = await prisma.emailTemplate.findFirst({ where: { id: req.params.id, companyId } });
  if (!existing) throw new HttpError(404, "Vorlage nicht gefunden");
  const kind = body.kind ?? existing.kind;
  const updated = await prisma.$transaction(async (tx) => {
    if (body.isDefault) await tx.emailTemplate.updateMany({ where: { companyId, kind, id: { not: existing.id } }, data: { isDefault: false } });
    return tx.emailTemplate.update({ where: { id: existing.id }, data: body });
  });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "template.email.update", entityType: "EmailTemplate", entityId: existing.id });
  res.json(updated);
});

templatesRouter.delete("/email/:id", async (req, res) => {
  adminOnly(req.auth!.role);
  const companyId = req.auth!.companyId;
  const existing = await prisma.emailTemplate.findFirst({ where: { id: req.params.id, companyId } });
  if (!existing) throw new HttpError(404, "Vorlage nicht gefunden");
  await prisma.emailTemplate.delete({ where: { id: existing.id } });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "template.email.delete", entityType: "EmailTemplate", entityId: existing.id });
  res.status(204).send();
});

// Beispielvorlagen für alle Anlässe anlegen - nur für Arten, zu denen es noch keine Vorlage gibt
templatesRouter.post("/email/examples", async (req, res) => {
  adminOnly(req.auth!.role);
  const companyId = req.auth!.companyId;
  const have = new Set((await prisma.emailTemplate.findMany({ where: { companyId }, select: { kind: true } })).map((t) => t.kind));
  const toCreate = EXAMPLE_TEMPLATES.filter((t) => !have.has(t.kind));
  if (toCreate.length > 0) await prisma.emailTemplate.createMany({ data: toCreate.map((t) => ({ ...t, companyId })) });
  res.json({ created: toCreate.length });
});

// Text einer Vorlage mit den Daten eines Belegs füllen (für den Versanddialog und die Vorschau in den Einstellungen)
const renderSchema = z.object({
  subject: z.string().max(300).default(""),
  body: z.string().max(5000).default(""),
  docType: z.enum(DOC_TYPES),
  docId: z.string().min(1),
  // Versandangaben aus dem Dialog (noch nicht gespeichert) für die Versandplatzhalter
  carrier: z.string().max(40).nullish(),
  tracking: z.string().max(100).nullish(),
});
templatesRouter.post("/render", async (req, res) => {
  const body = renderSchema.parse(req.body);
  const values = await loadPlaceholderValues(req.auth!.companyId, body.docType, body.docId);
  if (body.carrier !== undefined || body.tracking !== undefined) {
    if (body.carrier !== undefined) values.versanddienst = carrierLabel(body.carrier);
    if (body.tracking !== undefined) values.sendungsnummer = (body.tracking ?? "").trim();
    values.sendungslink = trackingLink(body.carrier ?? undefined, body.tracking ?? undefined);
  }
  res.json({ subject: renderText(body.subject, values), body: dropEmptyShippingLines(renderText(body.body, values)) });
});

// ---------- Textbausteine ----------

templatesRouter.get("/snippets", async (req, res) => {
  res.json(await prisma.textSnippet.findMany({ where: { companyId: req.auth!.companyId }, orderBy: { name: "asc" } }));
});

const snippetSchema = z.object({ name: z.string().trim().min(1).max(60), text: z.string().trim().min(1).max(2000) });

templatesRouter.post("/snippets", async (req, res) => {
  adminOnly(req.auth!.role);
  const body = snippetSchema.parse(req.body);
  const created = await prisma.textSnippet.create({ data: { ...body, companyId: req.auth!.companyId } });
  res.status(201).json(created);
});

templatesRouter.patch("/snippets/:id", async (req, res) => {
  adminOnly(req.auth!.role);
  const body = snippetSchema.partial().parse(req.body);
  const existing = await prisma.textSnippet.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Textbaustein nicht gefunden");
  res.json(await prisma.textSnippet.update({ where: { id: existing.id }, data: body }));
});

templatesRouter.delete("/snippets/:id", async (req, res) => {
  adminOnly(req.auth!.role);
  const existing = await prisma.textSnippet.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) throw new HttpError(404, "Textbaustein nicht gefunden");
  await prisma.textSnippet.delete({ where: { id: existing.id } });
  res.status(204).send();
});
