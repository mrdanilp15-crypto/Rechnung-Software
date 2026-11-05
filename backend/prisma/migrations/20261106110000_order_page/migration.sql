-- AlterTable
ALTER TABLE "OrderConfirmation" ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OrderComment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderConfirmationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderConfirmationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderComment_orderConfirmationId_createdAt_idx" ON "OrderComment"("orderConfirmationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFile_orderConfirmationId_documentId_key" ON "OrderFile"("orderConfirmationId", "documentId");

-- CreateIndex
CREATE INDEX "OrderFile_documentId_idx" ON "OrderFile"("documentId");

-- AddForeignKey
ALTER TABLE "OrderComment" ADD CONSTRAINT "OrderComment_orderConfirmationId_fkey" FOREIGN KEY ("orderConfirmationId") REFERENCES "OrderConfirmation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFile" ADD CONSTRAINT "OrderFile_orderConfirmationId_fkey" FOREIGN KEY ("orderConfirmationId") REFERENCES "OrderConfirmation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFile" ADD CONSTRAINT "OrderFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ArchiveDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
