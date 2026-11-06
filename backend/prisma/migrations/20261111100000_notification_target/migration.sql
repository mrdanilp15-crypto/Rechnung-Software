-- Persönliche Meldungen: userId = nur für diesen Mitarbeiter (leer = für alle), link = Seite, die beim Antippen geöffnet wird
ALTER TABLE "Notification" ADD COLUMN "userId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "link" TEXT;
CREATE INDEX "Notification_companyId_userId_createdAt_idx" ON "Notification"("companyId", "userId", "createdAt");
