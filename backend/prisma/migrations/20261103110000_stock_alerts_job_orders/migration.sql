-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "minStock" DOUBLE PRECISION,
ADD COLUMN     "lowStockNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PrinterJob" ADD COLUMN     "orderConfirmationId" TEXT;

-- AlterTable
ALTER TABLE "PrintPlan" ADD COLUMN     "orderConfirmationId" TEXT;

-- CreateIndex
CREATE INDEX "PrinterJob_orderConfirmationId_idx" ON "PrinterJob"("orderConfirmationId");

-- AddForeignKey
ALTER TABLE "PrinterJob" ADD CONSTRAINT "PrinterJob_orderConfirmationId_fkey" FOREIGN KEY ("orderConfirmationId") REFERENCES "OrderConfirmation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
