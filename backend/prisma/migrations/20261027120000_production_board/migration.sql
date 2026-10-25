-- AlterTable
ALTER TABLE "OrderConfirmation" ADD COLUMN     "productionNote" TEXT,
ADD COLUMN     "productionStatus" TEXT NOT NULL DEFAULT 'CREATED',
ADD COLUMN     "productionUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "shippedAt" TIMESTAMP(3);
