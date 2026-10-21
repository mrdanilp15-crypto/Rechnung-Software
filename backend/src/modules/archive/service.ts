import crypto from "crypto";
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { prisma } from "../../db/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import { detectFileType, parseTags, safeFileName } from "./fileType";

/** Gemeinsame Bausteine des Belegarchivs (Upload-Route und Übernahme von Ausgaben-Belegen). */

const MAX_TEXT_CHARS = 100_000;

export const root = () => path.resolve(env.UPLOAD_DIR);

/** Pfad aus der Datenbank (relativ zu UPLOAD_DIR) in einen absoluten, auf UPLOAD_DIR beschränkten Pfad umwandeln. */
export function absolutePath(relative: string): string {
  const abs = path.resolve(root(), relative);
  if (!abs.startsWith(root() + path.sep)) throw new HttpError(400, "Ungültiger Dateipfad");
  return abs;
}

/** Text aus PDFs/Textdateien für die Volltextsuche. Scans ohne Textebene liefern nichts - die Datei bleibt trotzdem über Titel/Tags/Notizen auffindbar. */
export async function extractText(filePath: string, mime: string, isText: boolean): Promise<string | null> {
  try {
    const data = fs.readFileSync(filePath);
    let text = "";
    if (mime === "application/pdf") {
      const parsed = await Promise.race([
        pdfParse(data),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Zeitüberschreitung beim Lesen des PDFs")), 20_000)),
      ]);
      text = parsed.text;
    } else if (isText) {
      text = data.toString("utf8");
    }
    text = text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    return text ? text.slice(0, MAX_TEXT_CHARS) : null;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Text aus Archivdatei konnte nicht gelesen werden");
    return null;
  }
}

export type ReceiptImportResult = "created" | "linked" | "already" | "missing";

interface ExpenseForImport {
  id: string;
  companyId: string;
  date: Date;
  vendor: string;
  category: string;
  amountCents: number;
  description: string | null;
  receiptPath: string | null;
}

/**
 * Übernimmt den Beleg einer Ausgabe ins Archiv (als Kopie - die Datei an der Ausgabe bleibt unverändert).
 * Idempotent: Eine Ausgabe wird nur einmal übernommen; liegt dieselbe Datei schon im Archiv (z.B. manuell hochgeladen),
 * wird sie nur mit der Ausgabe verknüpft.
 */
export async function importExpenseReceipt(expense: ExpenseForImport): Promise<ReceiptImportResult> {
  if (!expense.receiptPath) return "missing";
  const source = path.resolve(expense.receiptPath);
  if (!fs.existsSync(source)) return "missing";
  if (await prisma.archiveDocument.findUnique({ where: { expenseId: expense.id }, select: { id: true } })) return "already";

  const data = fs.readFileSync(source);
  const type = detectFileType(data.subarray(0, 4096), path.basename(source));
  if (!type) return "missing";
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");

  const duplicate = await prisma.archiveDocument.findFirst({ where: { companyId: expense.companyId, sha256 }, select: { id: true, expenseId: true } });
  if (duplicate) {
    if (!duplicate.expenseId) await prisma.archiveDocument.update({ where: { id: duplicate.id }, data: { expenseId: expense.id } });
    return "linked";
  }

  const relative = path.join("archive", expense.companyId, `${crypto.randomUUID()}${type.ext}`);
  fs.mkdirSync(path.dirname(absolutePath(relative)), { recursive: true });
  fs.copyFileSync(source, absolutePath(relative));
  const contentText = await extractText(absolutePath(relative), type.mime, type.text);
  const label = expense.description?.trim() || expense.category;
  try {
    await prisma.archiveDocument.create({
      data: {
        companyId: expense.companyId,
        title: `${expense.vendor} - ${label}`.slice(0, 200),
        category: "EINGANGSRECHNUNG",
        documentDate: expense.date,
        vendor: expense.vendor.slice(0, 200),
        amountCents: expense.amountCents,
        notes: expense.description?.slice(0, 5000) || null,
        tags: parseTags(["ausgabe", expense.category]),
        fileName: safeFileName(`${expense.vendor}-${expense.date.toISOString().slice(0, 10)}${type.ext}`),
        filePath: relative.split(path.sep).join("/"),
        mimeType: type.mime,
        sizeBytes: data.length,
        sha256,
        contentText,
        expenseId: expense.id,
      },
    });
  } catch (err) {
    fs.rmSync(absolutePath(relative), { force: true });
    throw err;
  }
  return "created";
}

/** Ausgaben mit Beleg, die noch nicht im Archiv liegen (weder übernommen noch als gleiche Datei verknüpft). */
export async function pendingExpenseReceipts(companyId: string) {
  const [withReceipt, linked] = await Promise.all([
    prisma.expense.findMany({ where: { companyId, receiptPath: { not: null } } }),
    prisma.archiveDocument.findMany({ where: { companyId, expenseId: { not: null } }, select: { expenseId: true } }),
  ]);
  const done = new Set(linked.map((l) => l.expenseId));
  return withReceipt.filter((e) => !done.has(e.id));
}
