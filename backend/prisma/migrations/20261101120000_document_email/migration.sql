-- AlterTable
ALTER TABLE "DeliveryNote" ADD COLUMN     "emailSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderConfirmation" ADD COLUMN     "emailSentAt" TIMESTAMP(3);
