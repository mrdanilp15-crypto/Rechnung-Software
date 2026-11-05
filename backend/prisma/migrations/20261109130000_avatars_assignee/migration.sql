-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarPath" TEXT,
ADD COLUMN     "avatarPreset" TEXT,
ADD COLUMN     "avatarColor" TEXT,
ADD COLUMN     "avatarUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderConfirmation" ADD COLUMN     "assigneeId" TEXT;

-- CreateIndex
CREATE INDEX "OrderConfirmation_assigneeId_idx" ON "OrderConfirmation"("assigneeId");
