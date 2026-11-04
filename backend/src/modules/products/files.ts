import { Router, type Request } from "express";
import fs from "fs";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { absolutePath } from "../archive/service";
import { inspect3mf } from "../printers/bambu/printJob";

/**
 * Produktdateien mit Versionen: Dateien aus dem Belegarchiv werden einem Produkt als Revision 1, 2, 3 ... zugeordnet (mit Änderungsnotiz);
 * eine Revision ist die aktuelle Druckdatei. Aus einer fertig geslicten 3MF lassen sich Druckzeit und Materialverbrauch für die Kalkulation lesen.
 * Wird in products/router.ts unter /products/:id/files eingehängt (Authentifizierung dort).
 */

export const productFilesRouter = Router({ mergeParams: true });
// Pfadparameter des übergeordneten Routers (mergeParams) sind in den Typen nicht enthalten
const pid = (req: Request) => (req.params as Record<string, string>).id;
const fid = (req: Request) => (req.params as Record<string, string>).fileId;

const MAX_ANALYSIS_FILE = 150 * 1024 * 1024;

export const nextRevision = (revisions: number[]) => (revisions.length === 0 ? 1 : Math.max(...revisions) + 1);

const docSelect = { id: true, title: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } as const;

async function ownedProduct(productId: string, companyId: string) {
  const p = await prisma.product.findFirst({ where: { id: productId, companyId }, select: { id: true } });
  if (!p) throw new HttpError(404, "Produkt nicht gefunden");
  return p;
}

async function ownedFile(productId: string, fileId: string, companyId: string) {
  const f = await prisma.productFile.findFirst({ where: { id: fileId, productId, companyId }, include: { document: { select: { ...docSelect, filePath: true } } } });
  if (!f) throw new HttpError(404, "Datei nicht gefunden");
  return f;
}

const present = (f: { id: string; revision: number; note: string | null; isCurrent: boolean; createdAt: Date; document: { id: string; title: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: Date } }) => ({
  id: f.id,
  revision: f.revision,
  note: f.note,
  isCurrent: f.isCurrent,
  addedAt: f.createdAt,
  documentId: f.document.id,
  title: f.document.title,
  fileName: f.document.fileName,
  mimeType: f.document.mimeType,
  sizeBytes: f.document.sizeBytes,
});

productFilesRouter.get("/", async (req, res) => {
  const companyId = req.auth!.companyId;
  await ownedProduct(pid(req), companyId);
  const files = await prisma.productFile.findMany({ where: { productId: pid(req), companyId }, include: { document: { select: docSelect } }, orderBy: { revision: "desc" } });
  res.json(files.map(present));
});

// Archivdokumente, die sich als Datei zuordnen lassen (noch nicht an diesem Produkt)
productFilesRouter.get("/candidates", async (req, res) => {
  const companyId = req.auth!.companyId;
  await ownedProduct(pid(req), companyId);
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const docs = await prisma.archiveDocument.findMany({
    where: {
      companyId,
      productFiles: { none: { productId: pid(req) } },
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { fileName: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: docSelect,
  });
  res.json(docs);
});

const addSchema = z.object({ documentId: z.string().min(1), note: z.string().trim().max(500).nullish(), makeCurrent: z.boolean().default(true) });

productFilesRouter.post("/", async (req, res) => {
  const companyId = req.auth!.companyId;
  const body = addSchema.parse(req.body);
  await ownedProduct(pid(req), companyId);
  const doc = await prisma.archiveDocument.findFirst({ where: { id: body.documentId, companyId }, select: { id: true } });
  if (!doc) throw new HttpError(404, "Dokument nicht im Archiv gefunden");
  if (await prisma.productFile.findFirst({ where: { productId: pid(req), documentId: doc.id }, select: { id: true } })) throw new HttpError(409, "Diese Datei ist dem Produkt schon zugeordnet.");

  const created = await prisma.$transaction(async (tx) => {
    const revisions = (await tx.productFile.findMany({ where: { productId: pid(req) }, select: { revision: true } })).map((r) => r.revision);
    // die erste Datei ist immer die aktuelle
    const makeCurrent = body.makeCurrent || revisions.length === 0;
    if (makeCurrent) await tx.productFile.updateMany({ where: { productId: pid(req) }, data: { isCurrent: false } });
    return tx.productFile.create({
      data: { companyId, productId: pid(req), documentId: doc.id, revision: nextRevision(revisions), note: body.note || null, isCurrent: makeCurrent },
      include: { document: { select: docSelect } },
    });
  });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "product.file.add", entityType: "Product", entityId: pid(req), metadata: { documentId: doc.id, revision: created.revision } });
  res.status(201).json(present(created));
});

const patchSchema = z.object({ note: z.string().trim().max(500).nullish(), isCurrent: z.literal(true).optional() });

productFilesRouter.patch("/:fileId", async (req, res) => {
  const companyId = req.auth!.companyId;
  const body = patchSchema.parse(req.body);
  const file = await ownedFile(pid(req), fid(req), companyId);
  await prisma.$transaction(async (tx) => {
    if (body.isCurrent) await tx.productFile.updateMany({ where: { productId: file.productId, id: { not: file.id } }, data: { isCurrent: false } });
    await tx.productFile.update({ where: { id: file.id }, data: { ...(body.note !== undefined ? { note: body.note || null } : {}), ...(body.isCurrent ? { isCurrent: true } : {}) } });
  });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "product.file.update", entityType: "Product", entityId: pid(req), metadata: { fileId: file.id, ...body } });
  res.json({ ok: true });
});

// Nur die Zuordnung wird gelöst - die Datei bleibt im Archiv
productFilesRouter.delete("/:fileId", async (req, res) => {
  const companyId = req.auth!.companyId;
  const file = await ownedFile(pid(req), fid(req), companyId);
  await prisma.$transaction(async (tx) => {
    await tx.productFile.delete({ where: { id: file.id } });
    if (file.isCurrent) {
      const latest = await tx.productFile.findFirst({ where: { productId: file.productId }, orderBy: { revision: "desc" }, select: { id: true } });
      if (latest) await tx.productFile.update({ where: { id: latest.id }, data: { isCurrent: true } });
    }
  });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "product.file.remove", entityType: "Product", entityId: pid(req), metadata: { fileId: file.id, revision: file.revision } });
  res.status(204).send();
});

// Druckzeit und Materialverbrauch aus einer fertig geslicten 3MF (G-Code 3MF aus Bambu Studio) für die Kalkulation
productFilesRouter.get("/:fileId/analysis", async (req, res) => {
  const file = await ownedFile(pid(req), fid(req), req.auth!.companyId);
  if (!/\.3mf$/i.test(file.document.fileName)) throw new HttpError(422, "Nur 3MF-Dateien lassen sich auswerten (fertig geslict, als G-Code 3MF exportiert).");
  const abs = absolutePath(file.document.filePath);
  if (!fs.existsSync(abs)) throw new HttpError(404, "Die Datei fehlt im Speicher (Backup einspielen?)");
  if (fs.statSync(abs).size > MAX_ANALYSIS_FILE) throw new HttpError(413, "Die Datei ist zu groß für die Auswertung (maximal 150 MB).");
  try {
    res.json({ fileName: file.document.fileName, plates: inspect3mf(fs.readFileSync(abs)) });
  } catch (err) {
    throw new HttpError(422, (err as Error).message);
  }
});
