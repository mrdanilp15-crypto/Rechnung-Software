-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "invoiceClosingText" TEXT NOT NULL DEFAULT 'Bitte überweisen Sie den Betrag bis zum {faellig} unter Angabe der Rechnungsnummer. Bei Fragen melden Sie sich gern.

Mit freundlichen Grüßen
{firma}',
ADD COLUMN     "invoiceIntroText" TEXT NOT NULL DEFAULT 'Sehr geehrte Damen und Herren,

vielen Dank für Ihren Auftrag. Wir berechnen Ihnen folgende Leistungen:',
ADD COLUMN     "pdfLayout" TEXT NOT NULL DEFAULT 'CLEAR',
ADD COLUMN     "quoteClosingText" TEXT NOT NULL DEFAULT 'Dieses Angebot gilt bis zum {faellig}. Wir freuen uns auf Ihren Auftrag.

Mit freundlichen Grüßen
{firma}',
ADD COLUMN     "quoteIntroText" TEXT NOT NULL DEFAULT 'Sehr geehrte Damen und Herren,

vielen Dank für Ihre Anfrage. Wir unterbreiten Ihnen folgendes Angebot:';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "closingText" TEXT,
ADD COLUMN     "introText" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "closingText" TEXT,
ADD COLUMN     "introText" TEXT;

