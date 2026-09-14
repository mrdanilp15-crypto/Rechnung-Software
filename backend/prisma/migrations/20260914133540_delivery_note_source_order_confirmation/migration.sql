-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DeliveryNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "noteNumber" TEXT NOT NULL,
    "deliveryDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "pdfPath" TEXT,
    "sourceOrderConfirmationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryNote_sourceOrderConfirmationId_fkey" FOREIGN KEY ("sourceOrderConfirmationId") REFERENCES "OrderConfirmation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DeliveryNote" ("companyId", "createdAt", "customerId", "deliveryDate", "id", "noteNumber", "notes", "pdfPath", "updatedAt") SELECT "companyId", "createdAt", "customerId", "deliveryDate", "id", "noteNumber", "notes", "pdfPath", "updatedAt" FROM "DeliveryNote";
DROP TABLE "DeliveryNote";
ALTER TABLE "new_DeliveryNote" RENAME TO "DeliveryNote";
CREATE INDEX "DeliveryNote_companyId_idx" ON "DeliveryNote"("companyId");
CREATE INDEX "DeliveryNote_sourceOrderConfirmationId_idx" ON "DeliveryNote"("sourceOrderConfirmationId");
CREATE UNIQUE INDEX "DeliveryNote_companyId_noteNumber_key" ON "DeliveryNote"("companyId", "noteNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
