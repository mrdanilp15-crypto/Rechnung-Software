-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "email" TEXT,
ADD COLUMN     "managingDirector" TEXT,
ADD COLUMN     "paymentTermDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "registerCourt" TEXT,
ADD COLUMN     "registerNumber" TEXT,
ADD COLUMN     "website" TEXT;

