/**
 * Spielt ein mit runBackup.ts erzeugtes Backup (ZIP oder verschlüsseltes .zip.enc) zurück
 * in die konfigurierte Datenbank (DATABASE_URL) und stellt die Uploads (Logos, Stempel,
 * Unterschrift) wieder her. Ein bislang nur automatisch erstelltes, aber nie tatsächlich
 * zurückgespieltes Backup ist im Ernstfall wertlos - dieses Skript macht "Wiederherstellen"
 * zu einem konkreten, dokumentierten und wiederholbaren Vorgang statt einer Theorie.
 *
 * ACHTUNG: Überschreibt bestehende Daten in der Zieldatenbank und im UPLOAD_DIR
 * unwiderruflich (der SQL-Dump enthält DROP ... IF EXISTS vor jedem CREATE, siehe
 * runBackup.ts). Nur mit --yes ausführen, wenn das wirklich gewollt ist - am besten gegen
 * eine separate/neue Datenbank testen, bevor man produktiv restauriert.
 *
 * Aufruf (im Portainer-Container-Terminal des Backend-Dienstes):
 *   npm run restore -- /app/backups/backup-2026-01-01T00-00-00-000Z.zip.enc --yes
 */
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { env } from "../src/config/env";
import { decryptFileAes256Gcm } from "../src/utils/fileCrypto";

const execFileAsync = promisify(execFile);

async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes("--yes");
  const backupPath = args.find((a) => !a.startsWith("--"));

  if (!backupPath) {
    console.error("Aufruf: npm run restore -- <Pfad-zum-Backup.zip[.enc]> --yes");
    process.exit(1);
  }
  if (!fs.existsSync(backupPath)) {
    console.error(`Backup-Datei nicht gefunden: ${backupPath}`);
    process.exit(1);
  }
  if (!confirmed) {
    console.error(
      "ACHTUNG: Dieser Vorgang überschreibt die aktuelle Datenbank und die Uploads unwiderruflich.\n" +
        "Zum Bestätigen erneut mit --yes aufrufen:\n" +
        `  npm run restore -- ${backupPath} --yes`
    );
    process.exit(1);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-"));
  try {
    let zipPath = backupPath;
    if (backupPath.endsWith(".enc")) {
      console.log("Entschlüssele Backup...");
      zipPath = path.join(workDir, "backup.zip");
      decryptFileAes256Gcm(backupPath, zipPath);
    }

    console.log("Entpacke Backup...");
    const extractDir = path.join(workDir, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });
    await execFileAsync("unzip", ["-o", zipPath, "-d", extractDir]);

    const sqlFile = path.join(extractDir, "database.sql");
    if (fs.existsSync(sqlFile)) {
      console.log("Spiele Datenbank-Dump ein...");
      await execFileAsync("psql", [env.DATABASE_URL, "-f", sqlFile]);
      console.log("Datenbank wiederhergestellt.");
    } else {
      console.warn("Kein database.sql im Backup gefunden - Datenbank wird übersprungen (SQLite-Backup? Bitte die kopierte .db-Datei manuell einspielen).");
    }

    const uploadsDir = path.join(extractDir, "uploads");
    if (fs.existsSync(uploadsDir)) {
      console.log(`Stelle Uploads nach ${env.UPLOAD_DIR} wieder her...`);
      fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
      fs.cpSync(uploadsDir, env.UPLOAD_DIR, { recursive: true });
      console.log("Uploads wiederhergestellt.");
    }

    console.log("Wiederherstellung abgeschlossen.");
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("Wiederherstellung fehlgeschlagen:", err);
  process.exit(1);
});
