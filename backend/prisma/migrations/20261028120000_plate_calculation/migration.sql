-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "extraCosts" JSONB,
ADD COLUMN     "piecesPerPlate" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ProductMaterial" ADD COLUMN     "costOverrideCents" DOUBLE PRECISION;
