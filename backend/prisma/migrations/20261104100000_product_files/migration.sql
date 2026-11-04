-- CreateTable
CREATE TABLE "ProductFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "note" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductFile_productId_documentId_key" ON "ProductFile"("productId", "documentId");

-- CreateIndex
CREATE INDEX "ProductFile_productId_idx" ON "ProductFile"("productId");

-- CreateIndex
CREATE INDEX "ProductFile_documentId_idx" ON "ProductFile"("documentId");

-- CreateIndex
CREATE INDEX "ProductFile_companyId_idx" ON "ProductFile"("companyId");

-- AddForeignKey
ALTER TABLE "ProductFile" ADD CONSTRAINT "ProductFile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFile" ADD CONSTRAINT "ProductFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ArchiveDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
