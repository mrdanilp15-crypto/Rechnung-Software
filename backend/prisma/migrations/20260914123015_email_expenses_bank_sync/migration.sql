-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendor" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Sonstiges',
    "amountCents" INTEGER NOT NULL,
    "vatRateBps" INTEGER NOT NULL DEFAULT 1900,
    "description" TEXT,
    "receiptPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "bookingDate" DATETIME NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "purpose" TEXT,
    "counterparty" TEXT,
    "matchedInvoiceId" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "legalForm" TEXT,
    "street" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'DE',
    "taxId" TEXT,
    "vatId" TEXT,
    "isSmallBusiness" BOOLEAN NOT NULL DEFAULT false,
    "defaultVatRateBps" INTEGER NOT NULL DEFAULT 1900,
    "iban" TEXT,
    "bic" TEXT,
    "bankName" TEXT,
    "logoPath" TEXT,
    "stampPath" TEXT,
    "signaturePath" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "invoiceFooterText" TEXT,
    "defaultLocale" TEXT NOT NULL DEFAULT 'de',
    "smtpHost" TEXT,
    "smtpPort" INTEGER DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "smtpFromEmail" TEXT,
    "smtpFromName" TEXT,
    "smallBusinessThresholdCents" INTEGER NOT NULL DEFAULT 2200000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Company" ("bankName", "bic", "city", "country", "createdAt", "defaultLocale", "defaultVatRateBps", "iban", "id", "invoiceFooterText", "isSmallBusiness", "legalForm", "logoPath", "name", "postalCode", "primaryColor", "signaturePath", "stampPath", "street", "taxId", "updatedAt", "vatId") SELECT "bankName", "bic", "city", "country", "createdAt", "defaultLocale", "defaultVatRateBps", "iban", "id", "invoiceFooterText", "isSmallBusiness", "legalForm", "logoPath", "name", "postalCode", "primaryColor", "signaturePath", "stampPath", "street", "taxId", "updatedAt", "vatId" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME,
    "deliveryDate" DATETIME,
    "isSmallBusiness" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "vatTotalCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "paidAt" DATETIME,
    "notes" TEXT,
    "footerText" TEXT,
    "sourceQuoteId" TEXT,
    "pdfPath" TEXT,
    "emailStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',
    "emailSentAt" DATETIME,
    "lastEmailError" TEXT,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("companyId", "createdAt", "currency", "customerId", "deliveryDate", "dueDate", "footerText", "id", "invoiceNumber", "isSmallBusiness", "issueDate", "notes", "paidAt", "pdfPath", "sourceQuoteId", "status", "subtotalCents", "totalCents", "updatedAt", "vatTotalCents") SELECT "companyId", "createdAt", "currency", "customerId", "deliveryDate", "dueDate", "footerText", "id", "invoiceNumber", "isSmallBusiness", "issueDate", "notes", "paidAt", "pdfPath", "sourceQuoteId", "status", "subtotalCents", "totalCents", "updatedAt", "vatTotalCents" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");
CREATE UNIQUE INDEX "Invoice_companyId_invoiceNumber_key" ON "Invoice"("companyId", "invoiceNumber");
CREATE TABLE "new_Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATETIME,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "vatTotalCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "pdfPath" TEXT,
    "emailStatus" TEXT NOT NULL DEFAULT 'NOT_SENT',
    "emailSentAt" DATETIME,
    "lastEmailError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Quote" ("companyId", "createdAt", "customerId", "id", "issueDate", "notes", "pdfPath", "quoteNumber", "status", "subtotalCents", "totalCents", "updatedAt", "validUntil", "vatTotalCents") SELECT "companyId", "createdAt", "customerId", "id", "issueDate", "notes", "pdfPath", "quoteNumber", "status", "subtotalCents", "totalCents", "updatedAt", "validUntil", "vatTotalCents" FROM "Quote";
DROP TABLE "Quote";
ALTER TABLE "new_Quote" RENAME TO "Quote";
CREATE INDEX "Quote_companyId_status_idx" ON "Quote"("companyId", "status");
CREATE UNIQUE INDEX "Quote_companyId_quoteNumber_key" ON "Quote"("companyId", "quoteNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Expense_companyId_date_idx" ON "Expense"("companyId", "date");

-- CreateIndex
CREATE INDEX "BankTransaction_companyId_bookingDate_idx" ON "BankTransaction"("companyId", "bookingDate");
