-- CreateTable
CREATE TABLE "PackageVolume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opBatchId" TEXT NOT NULL,
    "volumeNumber" INTEGER NOT NULL,
    "labelQrCode" TEXT NOT NULL,
    "sizeBreakdown" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "weightKg" REAL,
    "createdById" TEXT NOT NULL,
    "deliveryManifestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PackageVolume_opBatchId_fkey" FOREIGN KEY ("opBatchId") REFERENCES "OpBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PackageVolume_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PackageVolume_deliveryManifestId_fkey" FOREIGN KEY ("deliveryManifestId") REFERENCES "DeliveryManifest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryManifest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "manifestNumber" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "opBatchId" TEXT,
    "customerId" TEXT NOT NULL,
    "totalQuantity" INTEGER NOT NULL,
    "sizeGridBreakdown" TEXT NOT NULL,
    "carrierName" TEXT NOT NULL,
    "carrierDocument" TEXT,
    "carrierPhone" TEXT,
    "notes" TEXT,
    "digitalSignatureHash" TEXT,
    "qrPayload" TEXT,
    "reprintCount" INTEGER NOT NULL DEFAULT 0,
    "lastReprintAt" DATETIME,
    "lastReprintById" TEXT,
    "isDelivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" DATETIME,
    "deliveredRecipient" TEXT,
    "deliveredNotes" TEXT,
    "dispatchedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryManifest_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryManifest_opBatchId_fkey" FOREIGN KEY ("opBatchId") REFERENCES "OpBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryManifest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryManifest_lastReprintById_fkey" FOREIGN KEY ("lastReprintById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryManifest_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryManifest_manifestNumber_key" ON "DeliveryManifest"("manifestNumber");
