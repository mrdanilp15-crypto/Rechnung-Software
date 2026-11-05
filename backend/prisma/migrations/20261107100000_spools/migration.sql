-- CreateTable
CREATE TABLE "Spool" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "label" TEXT,
    "initialGrams" INTEGER NOT NULL DEFAULT 1000,
    "remainingGrams" INTEGER,
    "preBusiness" BOOLEAN NOT NULL DEFAULT false,
    "acquiredAt" TIMESTAMP(3),
    "note" TEXT,
    "isEmpty" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Spool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Spool_materialId_idx" ON "Spool"("materialId");

-- CreateIndex
CREATE INDEX "Spool_companyId_idx" ON "Spool"("companyId");

-- AddForeignKey
ALTER TABLE "Spool" ADD CONSTRAINT "Spool_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
