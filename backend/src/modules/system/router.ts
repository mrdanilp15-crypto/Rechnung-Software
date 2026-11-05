import { Router } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../../db/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { env } from "../../config/env";
import { isSmtpConfigured } from "../email/mailer";
import { bambuMonitor } from "../printers/bambu/monitor";
import { buildChecks, buildSetup, type Check } from "./checks";

/**
 * Einstellungen -> Verbindungen: zeigt an einer Stelle, ob E-Mail, Drucker, Push, Adresse für QR-Codes und Backup gerade in Ordnung sind,
 * und die Einrichtungs-Checkliste für eine neue Installation. Nur lesend; Testknöpfe nutzen die vorhandenen Funktionen (E-Mail testen, Backup jetzt).
 */
export const systemRouter = Router();
systemRouter.use(requireAuth, requireRole("ADMIN"));

function lastBackup(): { at: Date; name: string } | null {
  try {
    const files = fs
      .readdirSync(env.BACKUP_DIR)
      .filter((f) => f.endsWith(".zip") || f.endsWith(".zip.enc"))
      .map((f) => ({ name: f, at: fs.statSync(path.join(env.BACKUP_DIR, f)).mtime }))
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    return files[0] ?? null;
  } catch {
    return null;
  }
}

function freeDiskBytes(): number | null {
  try {
    const s = fs.statfsSync(path.resolve(env.UPLOAD_DIR));
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

const STARTED_AT = new Date();

systemRouter.get("/status", async (req, res) => {
  const companyId = req.auth!.companyId;
  const [company, printers, pushCount, failedMails, products, customers, backup] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    prisma.printer.findMany({ where: { companyId, isArchived: false }, select: { id: true, name: true, connectionType: true, liveEnabled: true } }),
    prisma.pushSubscription.count({ where: { companyId } }),
    prisma.invoice.count({ where: { companyId, emailStatus: "FAILED", updatedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    prisma.product.count({ where: { companyId, isArchived: false } }),
    prisma.customer.count({ where: { companyId } }),
    Promise.resolve(lastBackup()),
  ]);

  const live = printers.filter((p) => p.connectionType === "BAMBU_LAN" && p.liveEnabled).map((p) => {
    const s = bambuMonitor.getStatus(p.id);
    return { name: p.name, connection: s.connection as string, message: s.message };
  });

  const checks: Check[] = buildChecks({
    now: new Date(),
    smtpConfigured: isSmtpConfigured(company),
    smtpUser: company.smtpUser,
    failedMails,
    printers: live,
    pushSubscriptions: pushCount,
    publicUrl: env.PUBLIC_APP_URL,
    backup: { enabled: env.BACKUP_AUTO_ENABLED, intervalHours: env.BACKUP_INTERVAL_HOURS, lastAt: backup?.at ?? null, s3: !!(env.S3_ENDPOINT && env.S3_BUCKET) },
    freeDiskBytes: freeDiskBytes(),
  });

  const setup = buildSetup({
    companyDataComplete: !!(company.street && company.postalCode && company.city && (company.taxId || company.vatId || company.isSmallBusiness)),
    hasBank: !!company.iban,
    hasLogo: !!company.logoPath,
    smtpConfigured: isSmtpConfigured(company),
    hasPrinter: printers.length > 0,
    hasProduct: products > 0,
    hasCustomer: customers > 0,
    hasBackup: !!backup,
  });

  res.json({ checks, setup, server: { startedAt: STARTED_AT.toISOString() } });
});
