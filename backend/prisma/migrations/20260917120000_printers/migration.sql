-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "electricityCentsPerKwh" DOUBLE PRECISION NOT NULL DEFAULT 35,
ADD COLUMN     "overheadPercent" DOUBLE PRECISION NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "printerId" TEXT;

-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purchasePriceCents" INTEGER NOT NULL DEFAULT 0,
    "lifetimeHours" DOUBLE PRECISION NOT NULL DEFAULT 5000,
    "powerWatts" DOUBLE PRECISION NOT NULL DEFAULT 120,
    "wearCentsPerHour" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Printer_companyId_idx" ON "Printer"("companyId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Printer" ADD CONSTRAINT "Printer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

