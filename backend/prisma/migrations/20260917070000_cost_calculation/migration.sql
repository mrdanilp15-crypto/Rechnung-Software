-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "laborRateCentsPerHour" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "machineRateCentsPerHour" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "materialWastePercent" DOUBLE PRECISION NOT NULL DEFAULT 5,
ADD COLUMN     "targetMarginPercent" DOUBLE PRECISION NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "laborMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "printTimeMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0;


-- Bereits erzeugte Korrekturbelege (Storno) übernehmen Steuerhinweis und Leistungsart der Originalrechnung
UPDATE "Invoice" AS c
SET "vatNoticeKey" = o."vatNoticeKey", "supplyType" = o."supplyType"
FROM "Invoice" AS o
WHERE c."correctsInvoiceId" = o."id" AND c."isCancellationDocument" = true AND c."vatNoticeKey" IS NULL AND o."vatNoticeKey" IS NOT NULL;
