-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "finalInvoiceId" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "deductsInvoiceId" TEXT,
ADD COLUMN     "isDownPaymentDeduction" BOOLEAN NOT NULL DEFAULT false;

