import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Prisma } from "@prisma/client";
import { zip } from "zip-a-folder";
import { prisma } from "../../db/prisma";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { writeAuditLog } from "../audit/auditLog";
import { env } from "../../config/env";
import { ALLOWED_EXTENSIONS, detectFileType, parseTags, safeFileName, snippetFor } from "./fileType";
import { absolutePath, extractText, importExpenseReceipt, pendingExpenseReceipts, root } from "./service";

/**
 * Belegarchiv: Ablage für Dokumente des Unternehmens (Eingangsrechnungen, Quittungen, Verträge, Bescheide ...) mit Suche
 * (inkl. Text innerhalb von PDFs), Filtern, Sortierung und ZIP-Export. Die Dateien liegen unter UPLOAD_DIR/archive/<Firma>/
 * (Pfad in der Datenbank relativ zu UPLOAD_DIR, damit Backup/Restore in ein anderes Verzeichnis funktioniert) und sind im
 * normalen Backup enthalten.
 */

export const archiveRouter = Router();
archiveRouter.use(requireAuth);

export const ARCHIVE_CATEGORIES = [
  "EINGANGSRECHNUNG",
  "AUSGANGSRECHNUNG",
  "QUITTUNG",
  "KONTOAUSZUG",
  "VERTRAG",
  "VERSICHERUNG",
  "STEUER",
  "KORRESPONDENZ",
  "ANGEBOT",
  "SONSTIGES",
] as const;

const TMP_DIR = path.join(env.UPLOAD_DIR, "archive", "_tmp");
fs.mkdirSync(TMP_DIR, { recursive: true });
const upload = multer({ dest: TMP_DIR, limits: { fileSize: env.ARCHIVE_MAX_UPLOAD_MB * 1024 * 1024, files: 20 } });

// ---------- Abfragen ----------

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.enum(ARCHIVE_CATEGORIES).optional(),
  year: z.coerce.number().int().min(1990).max(2200).optional(),
  from: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  to: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  tag: z.string().trim().max(30).optional(),
  sort: z.enum(["date", "title", "vendor", "amount", "added", "size"]).default("date"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
type ListQuery = z.infer<typeof listQuery>;

function searchWords(q?: string) {
  return (q ?? "").split(/\s+/).filter(Boolean).slice(0, 6);
}

function buildWhere(companyId: string, query: ListQuery): Prisma.ArchiveDocumentWhereInput {
  const and: Prisma.ArchiveDocumentWhereInput[] = [];
  for (const w of searchWords(query.q)) {
    const contains = { contains: w, mode: "insensitive" as const };
    and.push({ OR: [{ title: contains }, { vendor: contains }, { notes: contains }, { fileName: contains }, { contentText: contains }, { tags: { has: w.toLowerCase() } }] });
  }
  const date: Prisma.DateTimeFilter = {};
  if (query.year) {
    date.gte = new Date(query.year, 0, 1);
    date.lt = new Date(query.year + 1, 0, 1);
  }
  if (query.from) date.gte = query.from;
  if (query.to) date.lt = new Date(query.to.getTime() + 24 * 3600 * 1000);
  return {
    companyId,
    ...(query.category ? { category: query.category } : {}),
    ...(query.tag ? { tags: { has: query.tag.toLowerCase() } } : {}),
    ...(Object.keys(date).length ? { documentDate: date } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

function buildOrderBy(query: ListQuery): Prisma.ArchiveDocumentOrderByWithRelationInput[] {
  const dir = query.dir;
  const primary: Prisma.ArchiveDocumentOrderByWithRelationInput =
    query.sort === "title" ? { title: dir }
    : query.sort === "vendor" ? { vendor: { sort: dir, nulls: "last" } }
    : query.sort === "amount" ? { amountCents: { sort: dir, nulls: "last" } }
    : query.sort === "added" ? { createdAt: dir }
    : query.sort === "size" ? { sizeBytes: dir }
    : { documentDate: dir };
  return [primary, { createdAt: "desc" }];
}

const listSelect = {
  id: true, title: true, category: true, documentDate: true, vendor: true, amountCents: true, notes: true, tags: true,
  fileName: true, mimeType: true, sizeBytes: true, expenseId: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ArchiveDocumentSelect;

archiveRouter.get("/", async (req, res) => {
  const query = listQuery.parse(req.query);
  const companyId = req.auth!.companyId;
  const where = buildWhere(companyId, query);
  const [items, total] = await Promise.all([
    prisma.archiveDocument.findMany({ where, orderBy: buildOrderBy(query), skip: query.offset, take: query.limit, select: listSelect }),
    prisma.archiveDocument.count({ where }),
  ]);
  const words = searchWords(query.q);
  let snippets = new Map<string, string | null>();
  if (words.length && items.length) {
    const texts = await prisma.archiveDocument.findMany({ where: { id: { in: items.map((i) => i.id) } }, select: { id: true, contentText: true } });
    snippets = new Map(texts.map((t) => [t.id, snippetFor(t.contentText, words)]));
  }
  res.json({ items: items.map((i) => ({ ...i, snippet: snippets.get(i.id) ?? null })), total, limit: query.limit, offset: query.offset });
});

// Auswahlwerte für die Filter: Kategorien mit Anzahl, vorhandene Jahre, häufige Tags, Gesamtgröße
archiveRouter.get("/facets", async (req, res) => {
  const companyId = req.auth!.companyId;
  const [cats, years, tags, size, pending] = await Promise.all([
    prisma.archiveDocument.groupBy({ by: ["category"], where: { companyId }, _count: { _all: true } }),
    prisma.$queryRaw<{ y: number }[]>(Prisma.sql`SELECT DISTINCT EXTRACT(YEAR FROM "documentDate")::int AS y FROM "ArchiveDocument" WHERE "companyId" = ${companyId} ORDER BY y DESC`),
    prisma.$queryRaw<{ tag: string; n: bigint }[]>(Prisma.sql`SELECT tag, COUNT(*) AS n FROM (SELECT unnest(tags) AS tag FROM "ArchiveDocument" WHERE "companyId" = ${companyId}) t GROUP BY tag ORDER BY n DESC, tag LIMIT 50`),
    prisma.archiveDocument.aggregate({ where: { companyId }, _sum: { sizeBytes: true }, _count: { _all: true } }),
    pendingExpenseReceipts(companyId),
  ]);
  res.json({
    categories: Object.fromEntries(cats.map((c) => [c.category, c._count._all])),
    years: years.map((y) => y.y),
    tags: tags.map((t) => ({ tag: t.tag, count: Number(t.n) })),
    totalCount: size._count._all,
    pendingExpenseReceipts: pending.length,
    totalSizeBytes: size._sum.sizeBytes ?? 0,
    maxUploadMb: env.ARCHIVE_MAX_UPLOAD_MB,
    allowedExtensions: ALLOWED_EXTENSIONS,
  });
});

// Belege von Ausgaben (Finanzen → Ausgaben) ins Archiv übernehmen. Neue Ausgaben mit Beleg landen automatisch dort;
// dieser Aufruf holt die bisherigen nach (wiederholbar, bereits Übernommenes wird übersprungen).
archiveRouter.post("/import-expense-receipts", async (req, res) => {
  const companyId = req.auth!.companyId;
  const result = { created: 0, linked: 0, already: 0, missing: 0 };
  for (const expense of await pendingExpenseReceipts(companyId)) {
    result[await importExpenseReceipt(expense)]++;
  }
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "archive.import_expense_receipts", entityType: "Company", entityId: companyId, metadata: result });
  res.json(result);
});

// ---------- Hochladen ----------

const metaSchema = z.object({
  title: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  category: z.preprocess(emptyToUndefined, z.enum(ARCHIVE_CATEGORIES).default("SONSTIGES")),
  documentDate: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  vendor: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  amountCents: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(100_000_000_000).optional()),
  notes: z.preprocess(emptyToUndefined, z.string().trim().max(5000).optional()),
  tags: z.any().optional(),
});

archiveRouter.post("/", upload.array("files", 20), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const companyId = req.auth!.companyId;
  const created: unknown[] = [];
  const skipped: { fileName: string; reason: string; existingTitle?: string }[] = [];
  const rejected: { fileName: string; reason: string }[] = [];
  try {
    if (files.length === 0) throw new HttpError(400, "Bitte mindestens eine Datei auswählen.");
    const meta = metaSchema.parse(req.body);
    const tags = parseTags(req.body.tags);
    const dir = path.join(root(), "archive", companyId);
    fs.mkdirSync(dir, { recursive: true });

    for (const file of files) {
      const originalName = safeFileName(Buffer.from(file.originalname, "latin1").toString("utf8"));
      const fd = fs.openSync(file.path, "r");
      const head = Buffer.alloc(4096);
      const read = fs.readSync(fd, head, 0, 4096, 0);
      fs.closeSync(fd);
      const type = detectFileType(head.subarray(0, read), originalName);
      if (!type) {
        rejected.push({ fileName: originalName, reason: `Dateityp nicht erlaubt (erlaubt: ${ALLOWED_EXTENSIONS.join(", ")})` });
        continue;
      }
      const sha256 = crypto.createHash("sha256").update(fs.readFileSync(file.path)).digest("hex");
      const duplicate = await prisma.archiveDocument.findFirst({ where: { companyId, sha256 }, select: { title: true } });
      if (duplicate) {
        skipped.push({ fileName: originalName, reason: "Diese Datei ist bereits im Archiv", existingTitle: duplicate.title });
        continue;
      }
      const relative = path.join("archive", companyId, `${crypto.randomUUID()}${type.ext}`);
      fs.renameSync(file.path, absolutePath(relative));
      const contentText = await extractText(absolutePath(relative), type.mime, type.text);
      const baseName = originalName.replace(/\.[^.]*$/, "");
      const doc = await prisma.archiveDocument.create({
        data: {
          companyId,
          title: (files.length === 1 && meta.title) || baseName.slice(0, 200) || "Dokument",
          category: meta.category,
          documentDate: meta.documentDate ?? new Date(),
          vendor: meta.vendor,
          amountCents: files.length === 1 ? meta.amountCents : undefined,
          notes: meta.notes,
          tags,
          fileName: originalName,
          filePath: relative.split(path.sep).join("/"),
          mimeType: type.mime,
          sizeBytes: file.size,
          sha256,
          contentText,
        },
        select: listSelect,
      });
      await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "archive.create", entityType: "ArchiveDocument", entityId: doc.id, metadata: { fileName: originalName, category: meta.category } });
      created.push({ ...doc, snippet: null, hasText: !!contentText });
    }
  } finally {
    // übrig gebliebene Temp-Dateien (abgelehnt, doppelt, Fehler) entfernen
    for (const f of files) fs.rmSync(f.path, { force: true });
  }
  res.status(created.length ? 201 : 200).json({ created, skipped, rejected });
});

// ---------- Einzelne Dokumente ----------

async function findOwned(id: string, companyId: string) {
  const doc = await prisma.archiveDocument.findFirst({ where: { id, companyId } });
  if (!doc) throw new HttpError(404, "Dokument nicht gefunden");
  return doc;
}

archiveRouter.get("/:id/file", async (req, res) => {
  const doc = await findOwned(req.params.id, req.auth!.companyId);
  const abs = absolutePath(doc.filePath);
  if (!fs.existsSync(abs)) throw new HttpError(404, "Die Datei fehlt im Speicher (Backup einspielen?)");
  const inline = req.query.download !== "1" && (doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/"));
  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`);
  res.sendFile(abs);
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category: z.enum(ARCHIVE_CATEGORIES).optional(),
  documentDate: z.coerce.date().optional(),
  vendor: z.string().trim().max(200).nullish(),
  amountCents: z.number().int().min(0).max(100_000_000_000).nullish(),
  notes: z.string().trim().max(5000).nullish(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
});

archiveRouter.patch("/:id", async (req, res) => {
  const existing = await findOwned(req.params.id, req.auth!.companyId);
  const body = patchSchema.parse(req.body);
  const { tags, ...rest } = body;
  const updated = await prisma.archiveDocument.update({
    where: { id: existing.id },
    data: { ...rest, vendor: rest.vendor === undefined ? undefined : rest.vendor || null, notes: rest.notes === undefined ? undefined : rest.notes || null, ...(tags !== undefined ? { tags: parseTags(tags) } : {}) },
    select: listSelect,
  });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "archive.update", entityType: "ArchiveDocument", entityId: existing.id });
  res.json({ ...updated, snippet: null });
});

archiveRouter.delete("/:id", async (req, res) => {
  const existing = await findOwned(req.params.id, req.auth!.companyId);
  await prisma.archiveDocument.delete({ where: { id: existing.id } });
  fs.rmSync(absolutePath(existing.filePath), { force: true });
  await writeAuditLog({ req, companyId: req.auth!.companyId, userId: req.auth!.sub, action: "archive.delete", entityType: "ArchiveDocument", entityId: existing.id, metadata: { title: existing.title, fileName: existing.fileName } });
  res.status(204).send();
});

// ---------- ZIP-Export (mit den aktuellen Filtern) ----------

const csvCell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

archiveRouter.get("/export/zip", async (req, res) => {
  const query = listQuery.parse(req.query);
  const companyId = req.auth!.companyId;
  const docs = await prisma.archiveDocument.findMany({ where: buildWhere(companyId, query), orderBy: buildOrderBy(query) });
  if (docs.length === 0) throw new HttpError(404, "Keine Dokumente für diese Auswahl");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "archiv-"));
  const folder = path.join(tmp, "belegarchiv");
  fs.mkdirSync(folder);
  try {
    const used = new Set<string>();
    const rows = ["Datum;Titel;Kategorie;Aussteller;Betrag (EUR);Tags;Notizen;Datei"];
    for (const d of docs) {
      const date = d.documentDate.toISOString().slice(0, 10);
      const slug = d.title.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "dokument";
      const ext = path.extname(d.filePath);
      let name = `${date}_${slug}${ext}`;
      for (let n = 2; used.has(name); n++) name = `${date}_${slug}_${n}${ext}`;
      used.add(name);
      const abs = absolutePath(d.filePath);
      if (fs.existsSync(abs)) fs.copyFileSync(abs, path.join(folder, name));
      rows.push([date, d.title, d.category, d.vendor, d.amountCents == null ? "" : (d.amountCents / 100).toFixed(2).replace(".", ","), d.tags.join(", "), d.notes, name].map(csvCell).join(";"));
    }
    fs.writeFileSync(path.join(folder, "index.csv"), "﻿" + rows.join("\r\n"), "utf8");
    const zipPath = path.join(tmp, "belegarchiv.zip");
    await zip(folder, zipPath);
    res.download(zipPath, `belegarchiv-${new Date().toISOString().slice(0, 10)}.zip`, () => fs.rmSync(tmp, { recursive: true, force: true }));
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
});
