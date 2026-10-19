import { Router } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { verifyPassword } from "../auth/password";
import { verifyTotpToken } from "../auth/twoFactor";
import { writeAuditLog } from "../audit/auditLog";
import { runBackup } from "../backup/runBackup";
import { sha256Hex } from "../../utils/crypto";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

/**
 * "Testdaten zurücksetzen": löscht Belege, Ausgaben, Bankbuchungen (und auf Wunsch auch Kunden, Produkte, Material) und setzt
 * die Nummernkreise zurück. Nur für den Moment VOR dem echten Start gedacht - danach verbietet das Aufbewahrungsrecht (GoBD,
 * § 147 AO, § 14b UStG: 8 Jahre bzw. 10 Jahre für Buchungsbelege) das Löschen von Rechnungen.
 *
 * Absicherung (alles serverseitig erzwungen, nicht nur im Browser):
 *  - nur Admin; kann per Umgebungsvariable DISABLE_DATA_RESET=true oder dauerhaft in der App gesperrt werden
 *  - Schritt 1 (/start): Passwort (+ 2FA-Code) -> kurzlebiger Einmal-Code
 *  - Schritt 2 (/execute): frühestens nach einer Wartezeit, erneut Passwort (+ 2FA), Firmenname und Bestätigungssatz als Text,
 *    alle Verständnis-Häkchen
 *  - vor dem Löschen wird ZWINGEND ein Backup erstellt - schlägt es fehl, wird nichts gelöscht
 *  - alles in einer Transaktion, Eintrag im Protokoll
 */

export const resetRouter = Router();
resetRouter.use(requireAuth, requireRole("ADMIN"));

const CONFIRM_PHRASE = "ALLES UNWIDERRUFLICH LÖSCHEN";
const WAIT_SECONDS = 30;
const TOKEN_TTL_MS = 10 * 60 * 1000;
const LOCK_KEY = "dataResetLocked";

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Zu viele Versuche. Bitte in einer Stunde erneut versuchen." },
});
resetRouter.use(limiter);

// Einmal-Codes nur im Arbeitsspeicher: ein Neustart des Servers macht jeden angefangenen Vorgang ungültig (gewollt).
const pending = new Map<string, { tokenHash: string; createdAt: number }>();

async function isLocked(companyId: string): Promise<boolean> {
  if (env.DISABLE_DATA_RESET) return true;
  const s = await prisma.setting.findUnique({ where: { companyId_key: { companyId, key: LOCK_KEY } } });
  return s?.value === "true";
}

async function assertIdentity(userId: string, password: string, totpToken?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, password))) throw new HttpError(401, "Passwort ist falsch");
  if (user.totpEnabled) {
    if (!totpToken) throw new HttpError(401, "2FA-Code erforderlich");
    if (!user.totpSecret || !verifyTotpToken(user.totpSecret, totpToken)) throw new HttpError(401, "2FA-Code ungültig");
  }
  return user;
}

async function counts(companyId: string) {
  const [invoicesTotal, invoicesFinal, quotes, confirmations, deliveryNotes, customers, products, materials, expenses, bank, recurring, dunnings] = await Promise.all([
    prisma.invoice.count({ where: { companyId } }),
    prisma.invoice.count({ where: { companyId, invoiceNumber: { not: null } } }),
    prisma.quote.count({ where: { companyId } }),
    prisma.orderConfirmation.count({ where: { companyId } }),
    prisma.deliveryNote.count({ where: { companyId } }),
    prisma.customer.count({ where: { companyId } }),
    prisma.product.count({ where: { companyId } }),
    prisma.material.count({ where: { companyId } }),
    prisma.expense.count({ where: { companyId } }),
    prisma.bankTransaction.count({ where: { companyId } }),
    prisma.recurringInvoice.count({ where: { companyId } }),
    prisma.dunning.count({ where: { companyId } }),
  ]);
  return { invoicesTotal, invoicesFinal, invoicesDraft: invoicesTotal - invoicesFinal, quotes, confirmations, deliveryNotes, customers, products, materials, expenses, bank, recurring, dunnings };
}

resetRouter.get("/preview", async (req, res) => {
  const companyId = req.auth!.companyId;
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub }, select: { totpEnabled: true } });
  res.json({
    locked: await isLocked(companyId),
    lockedByServer: env.DISABLE_DATA_RESET,
    companyName: company.name,
    totpEnabled: user.totpEnabled,
    waitSeconds: WAIT_SECONDS,
    confirmPhrase: CONFIRM_PHRASE,
    counts: await counts(companyId),
  });
});

const startSchema = z.object({ password: z.string().min(1), totpToken: z.string().optional() });

resetRouter.post("/start", async (req, res) => {
  const body = startSchema.parse(req.body);
  const companyId = req.auth!.companyId;
  if (await isLocked(companyId)) throw new HttpError(403, "Das Zurücksetzen ist gesperrt.");
  await assertIdentity(req.auth!.sub, body.password, body.totpToken);
  const token = crypto.randomBytes(24).toString("base64url");
  pending.set(req.auth!.sub, { tokenHash: sha256Hex(token), createdAt: Date.now() });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "reset.start", entityType: "Company", entityId: companyId });
  res.json({ token, waitSeconds: WAIT_SECONDS, expiresInSeconds: TOKEN_TTL_MS / 1000 });
});

const executeSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(1),
  totpToken: z.string().optional(),
  companyName: z.string(),
  phrase: z.string(),
  keepMasterData: z.boolean(),
  acknowledgements: z.object({ irreversible: z.literal(true), retention: z.literal(true), noRealInvoices: z.literal(true), backup: z.literal(true) }),
});

resetRouter.post("/execute", async (req, res) => {
  const body = executeSchema.parse(req.body);
  const companyId = req.auth!.companyId;
  const userId = req.auth!.sub;
  if (await isLocked(companyId)) throw new HttpError(403, "Das Zurücksetzen ist gesperrt.");

  const entry = pending.get(userId);
  if (!entry || entry.tokenHash !== sha256Hex(body.token) || Date.now() - entry.createdAt > TOKEN_TTL_MS) {
    pending.delete(userId);
    throw new HttpError(400, "Der Vorgang ist abgelaufen. Bitte von vorne beginnen.");
  }
  if (Date.now() - entry.createdAt < WAIT_SECONDS * 1000) throw new HttpError(400, `Bitte mindestens ${WAIT_SECONDS} Sekunden Bedenkzeit einhalten.`);

  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true } });
  if (body.companyName.trim() !== company.name.trim()) throw new HttpError(400, "Der eingegebene Firmenname stimmt nicht überein.");
  if (body.phrase.trim() !== CONFIRM_PHRASE) throw new HttpError(400, "Der Bestätigungssatz stimmt nicht überein.");
  await assertIdentity(userId, body.password, body.totpToken);
  pending.delete(userId); // jeder Code gilt nur für einen einzigen Versuch

  // 1) Sicherung ist Pflicht - ohne sie wird nichts gelöscht
  let backupFile: string;
  try {
    backupFile = path.basename(await runBackup());
  } catch (err: any) {
    logger.error({ err: err.message }, "Reset abgebrochen: Backup fehlgeschlagen");
    throw new HttpError(500, "Das Sicherheits-Backup ist fehlgeschlagen - es wurde NICHTS gelöscht. Bitte Backup-Einstellungen prüfen.");
  }

  const before = await counts(companyId);
  const invoicesWithPdf = await prisma.invoice.findMany({ where: { companyId, pdfPath: { not: null } }, select: { pdfPath: true } });

  // 2) Löschen in einer Transaktion (Reihenfolge wegen Fremdschlüsseln: abhängige Belege zuerst)
  await prisma.$transaction(
    async (tx) => {
      await tx.dunning.deleteMany({ where: { companyId } });
      await tx.recurringInvoice.deleteMany({ where: { companyId } });
      await tx.invoice.updateMany({ where: { companyId }, data: { correctsInvoiceId: null, finalInvoiceId: null } });
      await tx.invoice.deleteMany({ where: { companyId } });
      await tx.deliveryNote.deleteMany({ where: { companyId } });
      await tx.orderConfirmation.deleteMany({ where: { companyId } });
      await tx.quote.deleteMany({ where: { companyId } });
      await tx.expense.deleteMany({ where: { companyId } });
      await tx.bankTransaction.deleteMany({ where: { companyId } });
      if (!body.keepMasterData) {
        await tx.product.deleteMany({ where: { companyId } });
        await tx.material.deleteMany({ where: { companyId } });
        await tx.customer.deleteMany({ where: { companyId } });
      }
      await tx.numberSequence.deleteMany({ where: { companyId, ...(body.keepMasterData ? { docType: { not: "CUSTOMER" } } : {}) } });
    },
    { timeout: 60000 }
  );

  // 3) Archivierte Rechnungs-PDFs entfernen (nur innerhalb des Rechnungs-Ordners; sie stecken außerdem im Backup)
  const pdfRoot = path.resolve(env.UPLOAD_DIR, "invoices");
  for (const { pdfPath } of invoicesWithPdf) {
    const resolved = path.resolve(pdfPath!);
    if (resolved.startsWith(pdfRoot + path.sep) && resolved.endsWith(".pdf")) {
      try {
        fs.rmSync(resolved, { force: true });
      } catch {
        // nicht kritisch
      }
    }
  }

  await writeAuditLog({ req, companyId, userId, action: "reset.executed", entityType: "Company", entityId: companyId, metadata: { backupFile, keepMasterData: body.keepMasterData, deleted: before } });
  logger.warn({ companyId, userId, backupFile }, "Testdaten zurückgesetzt");
  res.json({ ok: true, backupFile, deleted: before });
});

const lockSchema = z.object({ password: z.string().min(1), totpToken: z.string().optional() });

// Sperrt das Zurücksetzen dauerhaft (empfohlen, sobald echte Rechnungen existieren). Die Sperre lässt sich in der App
// nicht wieder aufheben - nur direkt in der Datenbank (Tabelle "Setting", Schlüssel dataResetLocked).
resetRouter.post("/lock", async (req, res) => {
  const body = lockSchema.parse(req.body);
  const companyId = req.auth!.companyId;
  await assertIdentity(req.auth!.sub, body.password, body.totpToken);
  await prisma.setting.upsert({
    where: { companyId_key: { companyId, key: LOCK_KEY } },
    create: { companyId, key: LOCK_KEY, value: "true" },
    update: { value: "true" },
  });
  await writeAuditLog({ req, companyId, userId: req.auth!.sub, action: "reset.locked", entityType: "Company", entityId: companyId });
  res.json({ ok: true });
});
