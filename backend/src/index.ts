import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { prisma } from "./db/prisma";
import { registerPlugin } from "./modules/plugins/hooks";
import exampleTaxNotePlugin from "../plugins/example-tax-note";
import { markOverdueInvoices } from "./modules/invoices/overdueJob";
import { runBackup } from "./modules/backup/runBackup";

// Sicherheitsnetz: normale HTTP-Fehler (404, 400, ...) werden bereits über
// express-async-errors + middleware/errorHandler.ts korrekt behandelt (siehe app.ts).
// Diese Handler fangen nur wirklich unerwartete Fehler außerhalb des Request-Zyklus ab,
// damit ein einzelner Bug nicht den ganzen Prozess (und damit alle aktiven Nutzer) abschießt.
process.on("unhandledRejection", (err) => {
  logger.error({ err }, "Unbehandelte Promise-Rejection (Prozess läuft weiter)");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Unbehandelte Exception (Prozess läuft weiter)");
});

async function main() {
  registerPlugin(exampleTaxNotePlugin);

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API läuft auf Port ${env.PORT} (${env.NODE_ENV})`);
  });

  // Prüft stündlich auf überfällige Rechnungen (status SENT + dueDate in der Vergangenheit).
  const overdueInterval = setInterval(() => {
    markOverdueInvoices().catch((err) => logger.error({ err }, "Fehler beim Prüfen überfälliger Rechnungen"));
  }, 60 * 60 * 1000);
  markOverdueInvoices().catch((err) => logger.error({ err }, "Fehler beim Prüfen überfälliger Rechnungen"));

  // Automatisches Backup alle BACKUP_INTERVAL_HOURS Stunden (Standard: täglich). Läuft
  // im selben Prozess statt per externem Cron, damit ein reines "Compose hochladen und
  // starten" ohne zusätzliche Host-Konfiguration bereits regelmäßige Backups liefert.
  let backupInterval: ReturnType<typeof setInterval> | undefined;
  if (env.BACKUP_AUTO_ENABLED) {
    backupInterval = setInterval(() => {
      runBackup()
        .then((zipPath) => logger.info({ zipPath }, "Automatisches Backup erstellt"))
        .catch((err) => logger.error({ err }, "Automatisches Backup fehlgeschlagen"));
    }, env.BACKUP_INTERVAL_HOURS * 60 * 60 * 1000);
    logger.info(`Automatische Backups aktiv (alle ${env.BACKUP_INTERVAL_HOURS}h, Verzeichnis: ${env.BACKUP_DIR})`);
  }

  const shutdown = async (signal: string) => {
    logger.info(`${signal} empfangen, fahre Server geordnet herunter...`);
    clearInterval(overdueInterval);
    if (backupInterval) clearInterval(backupInterval);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Server konnte nicht gestartet werden");
  process.exit(1);
});
