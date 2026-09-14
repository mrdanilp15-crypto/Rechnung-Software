import fs from "fs";
import path from "path";
import { zip } from "zip-a-folder";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

/**
 * Erstellt ein ZIP-Archiv mit der SQLite-Datenbankdatei und allen Uploads (Logos, PDFs).
 * Für PostgreSQL-Betrieb bitte zusätzlich `pg_dump` in die Backup-Pipeline einbinden
 * (siehe docs/INSTALL.md, Abschnitt "Backups unter PostgreSQL").
 *
 * Aufruf manuell: `npm run backup`
 * Automatisiert: per Cron (Linux/Mac) oder Windows Task Scheduler täglich einplanen,
 * siehe docs/INSTALL.md.
 */
export async function runBackup(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.mkdirSync(env.BACKUP_DIR, { recursive: true });

  const stagingDir = path.join(env.BACKUP_DIR, `staging-${timestamp}`);
  fs.mkdirSync(stagingDir, { recursive: true });

  const dbFile = resolveSqliteFilePath(env.DATABASE_URL);
  if (dbFile && fs.existsSync(dbFile)) {
    fs.copyFileSync(dbFile, path.join(stagingDir, path.basename(dbFile)));
  } else {
    logger.warn({ dbFile }, "Keine lokale SQLite-Datei gefunden - übersprungen (evtl. PostgreSQL im Einsatz)");
  }

  if (fs.existsSync(env.UPLOAD_DIR)) {
    fs.cpSync(env.UPLOAD_DIR, path.join(stagingDir, "uploads"), { recursive: true });
  }

  const zipPath = path.join(env.BACKUP_DIR, `backup-${timestamp}.zip`);
  await zip(stagingDir, zipPath);
  fs.rmSync(stagingDir, { recursive: true, force: true });

  await maybeUploadToS3(zipPath);
  cleanupOldBackups();

  logger.info({ zipPath }, "Backup erstellt");
  return zipPath;
}

/**
 * Prisma löst einen relativen SQLite-"file:"-Pfad in DATABASE_URL IMMER relativ zum
 * Verzeichnis von schema.prisma auf (nicht relativ zum aktuellen Arbeitsverzeichnis!).
 * "file:./data/app.db" liegt also tatsächlich unter backend/prisma/data/app.db, nicht
 * backend/data/app.db. Diese Funktion bildet dieselbe Auflösung nach, sonst würde das
 * Backup-Skript die Datenbank nie finden. Gilt nur für SQLite ("file:"-Präfix) - bei
 * PostgreSQL wird hier null zurückgegeben.
 */
function resolveSqliteFilePath(databaseUrl: string): string | null {
  if (!databaseUrl.startsWith("file:")) return null;
  const relativePath = databaseUrl.slice("file:".length);
  return path.resolve(process.cwd(), "prisma", relativePath);
}

function cleanupOldBackups() {
  const files = fs.readdirSync(env.BACKUP_DIR).filter((f) => f.endsWith(".zip"));
  const cutoff = Date.now() - env.BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const file of files) {
    const fullPath = path.join(env.BACKUP_DIR, file);
    if (fs.statSync(fullPath).mtimeMs < cutoff) fs.rmSync(fullPath);
  }
}

async function maybeUploadToS3(zipPath: string) {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID) return; // Cloud-Backup optional, siehe .env.example
  const AWS = await import("aws-sdk");
  const s3 = new AWS.S3({
    endpoint: env.S3_ENDPOINT || undefined,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    region: env.S3_REGION,
    s3ForcePathStyle: !!env.S3_ENDPOINT,
  });
  const body = fs.readFileSync(zipPath);
  await s3.putObject({ Bucket: env.S3_BUCKET, Key: `backups/${path.basename(zipPath)}`, Body: body }).promise();
  logger.info({ bucket: env.S3_BUCKET }, "Backup zusätzlich in S3-kompatiblen Speicher hochgeladen");
}

if (require.main === module) {
  runBackup()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, "Backup fehlgeschlagen");
      process.exit(1);
    });
}
