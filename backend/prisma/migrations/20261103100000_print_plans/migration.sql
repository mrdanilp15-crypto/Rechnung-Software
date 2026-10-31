-- AlterTable
ALTER TABLE "PrinterJob" ADD COLUMN     "slicedPlan" JSONB;

-- CreateTable
CREATE TABLE "PrintPlan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "entries" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrintPlan_printerId_jobName_idx" ON "PrintPlan"("printerId", "jobName");

-- CreateIndex
CREATE INDEX "PrintPlan_companyId_idx" ON "PrintPlan"("companyId");
