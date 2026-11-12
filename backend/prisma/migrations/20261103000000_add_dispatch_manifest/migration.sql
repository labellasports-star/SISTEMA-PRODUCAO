-- CreateTable
CREATE TABLE "DispatchManifest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "manifestNumber" TEXT NOT NULL,
    "opBatchId" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "sewingPartnerId" TEXT NOT NULL,
    "totalQuantity" INTEGER NOT NULL,
    "sizeGridBreakdown" TEXT NOT NULL,
    "expectedReturnDate" DATETIME NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "reprintCount" INTEGER NOT NULL DEFAULT 0,
    "lastReprintAt" DATETIME,
    "lastReprintById" TEXT,
    "digitalSignatureHash" TEXT,
    "qrPayload" TEXT,
    "notes" TEXT,
    CONSTRAINT "DispatchManifest_opBatchId_fkey" FOREIGN KEY ("opBatchId") REFERENCES "OpBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DispatchManifest_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DispatchManifest_sewingPartnerId_fkey" FOREIGN KEY ("sewingPartnerId") REFERENCES "SewingPartner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DispatchManifest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DispatchManifest_lastReprintById_fkey" FOREIGN KEY ("lastReprintById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DispatchManifest_manifestNumber_key" ON "DispatchManifest"("manifestNumber");
