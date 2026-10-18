-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "deliveryNoteClosingText" TEXT NOT NULL DEFAULT 'Bitte prüfen Sie die Lieferung auf Vollständigkeit und Unversehrtheit.

Mit freundlichen Grüßen
{firma}',
ADD COLUMN     "deliveryNoteIntroText" TEXT NOT NULL DEFAULT 'Sehr geehrte Damen und Herren,

wir liefern Ihnen folgende Positionen:',
ADD COLUMN     "orderConfirmationClosingText" TEXT NOT NULL DEFAULT 'Wir kümmern uns um die Ausführung und melden uns bei Rückfragen.

Mit freundlichen Grüßen
{firma}',
ADD COLUMN     "orderConfirmationIntroText" TEXT NOT NULL DEFAULT 'Sehr geehrte Damen und Herren,

vielen Dank für Ihren Auftrag. Wir bestätigen Ihnen folgende Positionen:';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "sourceOrderConfirmationId" TEXT;

-- AlterTable
ALTER TABLE "DeliveryNote" ADD COLUMN     "closingText" TEXT,
ADD COLUMN     "introText" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "OrderConfirmation" ADD COLUMN     "closingText" TEXT,
ADD COLUMN     "introText" TEXT,
ADD COLUMN     "sourceQuoteId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT';

-- Bestehende Auftragsbestätigungen und Lieferscheine sind bereits ausgestellt, keine Entwürfe
UPDATE "OrderConfirmation" SET "status" = 'SENT';
UPDATE "DeliveryNote" SET "status" = 'SENT';
