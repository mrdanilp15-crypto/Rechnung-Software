-- AlterTable
ALTER TABLE "Printer" ADD COLUMN     "accessCodeEncrypted" TEXT,
ADD COLUMN     "connectionType" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "host" TEXT,
ADD COLUMN     "liveEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "serial" TEXT;

-- CreateTable
CREATE TABLE "PrinterJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "name" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "result" TEXT,
    "minutes" INTEGER,

    CONSTRAINT "PrinterJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrinterJob_printerId_startedAt_idx" ON "PrinterJob"("printerId", "startedAt");

-- CreateIndex
CREATE INDEX "PrinterJob_companyId_idx" ON "PrinterJob"("companyId");

-- AddForeignKey
ALTER TABLE "PrinterJob" ADD CONSTRAINT "PrinterJob_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
