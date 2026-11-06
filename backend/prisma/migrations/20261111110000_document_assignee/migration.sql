-- Zuständiger Mitarbeiter auch für Angebote und Rechnungen (wird aus Angebot/Auftrag in Folgebelege übernommen)
ALTER TABLE "Quote" ADD COLUMN "assigneeId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "assigneeId" TEXT;
