-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "baseInterestRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 1.27,
ADD COLUMN     "dunningDeadlineDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "dunningFee2Cents" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "dunningFee3Cents" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "dunningText1" TEXT NOT NULL DEFAULT 'Sehr geehrte Damen und Herren,

bei der Durchsicht unserer Buchhaltung ist uns aufgefallen, dass die Rechnung {nummer} noch nicht beglichen wurde. Bitte überweisen Sie den offenen Betrag bis zum {faellig}.

Sollten Sie bereits gezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.

Mit freundlichen Grüßen
{firma}',
ADD COLUMN     "dunningText2" TEXT NOT NULL DEFAULT 'Sehr geehrte Damen und Herren,

trotz unserer Zahlungserinnerung konnten wir bisher keinen Zahlungseingang zur Rechnung {nummer} feststellen. Wir bitten Sie, den offenen Betrag einschließlich der aufgeführten Verzugskosten bis zum {faellig} zu überweisen.

Mit freundlichen Grüßen
{firma}',
ADD COLUMN     "dunningText3" TEXT NOT NULL DEFAULT 'Sehr geehrte Damen und Herren,

dies ist unsere letzte Mahnung zur Rechnung {nummer}. Bitte überweisen Sie den Gesamtbetrag bis zum {faellig}. Geht die Zahlung bis dahin nicht ein, müssen wir ohne weitere Ankündigung rechtliche Schritte einleiten (z.B. ein gerichtliches Mahnverfahren), wodurch Ihnen weitere Kosten entstehen.

Mit freundlichen Grüßen
{firma}';

-- CreateTable
CREATE TABLE "Dunning" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "principalCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "interestCents" INTEGER NOT NULL,
    "flatFeeCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "interestRateBps" INTEGER NOT NULL,
    "daysOverdue" INTEGER NOT NULL,
    "newDueDate" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "pdfPath" TEXT,
    "sentByEmail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dunning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dunning_invoiceId_idx" ON "Dunning"("invoiceId");

-- CreateIndex
CREATE INDEX "Dunning_companyId_createdAt_idx" ON "Dunning"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "Dunning" ADD CONSTRAINT "Dunning_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dunning" ADD CONSTRAINT "Dunning_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

