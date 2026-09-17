-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "smallBusinessCurrentYearThresholdCents" INTEGER NOT NULL DEFAULT 10000000,
ALTER COLUMN "smallBusinessThresholdCents" SET DEFAULT 2500000;

-- Bestehende Firmen, die noch den alten Default-Schwellenwert (22.000 EUR, vor der
-- Reform zum 1.1.2025) haben, auf den neuen gesetzlichen Wert (25.000 EUR) anheben.
-- Firmen mit einem bewusst abweichend konfigurierten Wert bleiben unangetastet.
UPDATE "Company" SET "smallBusinessThresholdCents" = 2500000 WHERE "smallBusinessThresholdCents" = 2200000;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "correctsInvoiceId" TEXT,
ADD COLUMN     "isCancellationDocument" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "invoiceNumber" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DeliveryNote" ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderConfirmation" ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_correctsInvoiceId_fkey" FOREIGN KEY ("correctsInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;