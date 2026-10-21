-- AlterTable
ALTER TABLE "ArchiveDocument" ADD COLUMN     "expenseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveDocument_expenseId_key" ON "ArchiveDocument"("expenseId");
