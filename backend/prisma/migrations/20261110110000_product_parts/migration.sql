-- CreateTable
CREATE TABLE "ProductPart" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "documentId" TEXT,
    "fileName" TEXT,
    "quantityPerProduct" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "piecesPerPlate" INTEGER NOT NULL DEFAULT 1,
    "printMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "materials" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "ProductPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPart_productId_idx" ON "ProductPart"("productId");

-- AddForeignKey
ALTER TABLE "ProductPart" ADD CONSTRAINT "ProductPart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
