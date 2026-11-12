-- AlterTable
ALTER TABLE "DispatchManifest" ADD COLUMN "receiptStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "DispatchManifest" ADD COLUMN "isReceiptClosed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DispatchManifest" ADD COLUMN "closedAt" DATETIME;
ALTER TABLE "DispatchManifest" ADD COLUMN "closedById" TEXT;
ALTER TABLE "DispatchManifest" ADD COLUMN "divergenceJustification" TEXT;

-- CreateTable
CREATE TABLE "SewingReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dispatchManifestId" TEXT NOT NULL,
    "opBatchId" TEXT NOT NULL,
    "receiptNumber" INTEGER NOT NULL DEFAULT 1,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operatorId" TEXT NOT NULL,
    "totalReceivedOk" INTEGER NOT NULL DEFAULT 0,
    "totalMissing" INTEGER NOT NULL DEFAULT 0,
    "totalDamaged" INTEGER NOT NULL DEFAULT 0,
    "digitalSignatureHash" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SewingReceipt_dispatchManifestId_fkey" FOREIGN KEY ("dispatchManifestId") REFERENCES "DispatchManifest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SewingReceipt_opBatchId_fkey" FOREIGN KEY ("opBatchId") REFERENCES "OpBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SewingReceipt_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SewingReceiptItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sewingReceiptId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "quantityReceivedOk" INTEGER NOT NULL DEFAULT 0,
    "quantityMissing" INTEGER NOT NULL DEFAULT 0,
    "quantityDamaged" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SewingReceiptItem_sewingReceiptId_fkey" FOREIGN KEY ("sewingReceiptId") REFERENCES "SewingReceipt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
