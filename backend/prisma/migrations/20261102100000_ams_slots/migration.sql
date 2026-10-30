-- AlterTable
ALTER TABLE "PrinterJob" ADD COLUMN     "materialUsage" JSONB;

-- CreateTable
CREATE TABLE "AmsSlotMapping" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "spoolGrams" INTEGER NOT NULL DEFAULT 1000,
    "lastRemain" INTEGER,
    "lastTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmsSlotMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AmsSlotMapping_printerId_slot_key" ON "AmsSlotMapping"("printerId", "slot");

-- CreateIndex
CREATE INDEX "AmsSlotMapping_materialId_idx" ON "AmsSlotMapping"("materialId");

-- CreateIndex
CREATE INDEX "AmsSlotMapping_companyId_idx" ON "AmsSlotMapping"("companyId");

-- AddForeignKey
ALTER TABLE "AmsSlotMapping" ADD CONSTRAINT "AmsSlotMapping_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmsSlotMapping" ADD CONSTRAINT "AmsSlotMapping_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
