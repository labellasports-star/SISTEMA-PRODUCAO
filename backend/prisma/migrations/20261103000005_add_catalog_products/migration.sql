-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "minQuantity" INTEGER NOT NULL DEFAULT 10,
    "basePrice" REAL NOT NULL,
    "priceEffectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imageUrl" TEXT,
    "availableFabrics" TEXT NOT NULL,
    "availableCollars" TEXT,
    "availableGenders" TEXT NOT NULL DEFAULT '["UNISSEX","MASCULINO","FEMININO","INFANTIL"]',
    "availableCustomizations" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CatalogProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_code_key" ON "ProductCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_code_key" ON "CatalogProduct"("code");

-- AlterTable
ALTER TABLE "OpBatch" ADD COLUMN "parentBatchId" TEXT;
ALTER TABLE "OpBatch" ADD COLUMN "sizeGridJson" TEXT;
ALTER TABLE "OpBatch" ADD COLUMN "subdivisionCode" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "cityState" TEXT,
    "notes" TEXT,
    "sellerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Customer" ("cityState", "companyName", "contactName", "createdAt", "email", "id", "notes", "phone", "sellerId", "updatedAt") SELECT "cityState", "companyName", "contactName", "createdAt", "email", "id", "notes", "phone", "sellerId", "updatedAt" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE TABLE "new_DispatchManifest" (
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
    "receiptStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "isReceiptClosed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" DATETIME,
    "closedById" TEXT,
    "divergenceJustification" TEXT,
    CONSTRAINT "DispatchManifest_opBatchId_fkey" FOREIGN KEY ("opBatchId") REFERENCES "OpBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DispatchManifest_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DispatchManifest_sewingPartnerId_fkey" FOREIGN KEY ("sewingPartnerId") REFERENCES "SewingPartner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DispatchManifest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DispatchManifest_lastReprintById_fkey" FOREIGN KEY ("lastReprintById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DispatchManifest_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DispatchManifest" ("closedAt", "closedById", "createdAt", "createdById", "digitalSignatureHash", "divergenceJustification", "expectedReturnDate", "id", "isReceiptClosed", "lastReprintAt", "lastReprintById", "manifestNumber", "notes", "opBatchId", "productionOrderId", "qrPayload", "receiptStatus", "reprintCount", "sewingPartnerId", "sizeGridBreakdown", "totalQuantity", "updatedAt") SELECT "closedAt", "closedById", "createdAt", "createdById", "digitalSignatureHash", "divergenceJustification", "expectedReturnDate", "id", "isReceiptClosed", "lastReprintAt", "lastReprintById", "manifestNumber", "notes", "opBatchId", "productionOrderId", "qrPayload", "receiptStatus", "reprintCount", "sewingPartnerId", "sizeGridBreakdown", "totalQuantity", "updatedAt" FROM "DispatchManifest";
DROP TABLE "DispatchManifest";
ALTER TABLE "new_DispatchManifest" RENAME TO "DispatchManifest";
CREATE UNIQUE INDEX "DispatchManifest_manifestNumber_key" ON "DispatchManifest"("manifestNumber");
CREATE TABLE "new_Quotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOVA_SOLICITACAO',
    "productsSummary" TEXT,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "budgetAmount" REAL NOT NULL DEFAULT 0.0,
    "discountAmount" REAL NOT NULL DEFAULT 0.0,
    "frozenPriceSnapshot" TEXT,
    "desiredDeadline" DATETIME,
    "observations" TEXT,
    "rejectionReason" TEXT,
    "sellerId" TEXT NOT NULL,
    "designerId" TEXT,
    "isArtworkApproved" BOOLEAN NOT NULL DEFAULT false,
    "artworkApprovalDate" DATETIME,
    "artworkApprovedBy" TEXT,
    "artworkApprovalNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quotation_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quotation_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Quotation" ("artworkApprovalDate", "artworkApprovalNotes", "artworkApprovedBy", "budgetAmount", "createdAt", "customerId", "designerId", "desiredDeadline", "id", "isArtworkApproved", "observations", "productsSummary", "quotationNumber", "rejectionReason", "sellerId", "status", "teamName", "totalQuantity", "updatedAt") SELECT "artworkApprovalDate", "artworkApprovalNotes", "artworkApprovedBy", "budgetAmount", "createdAt", "customerId", "designerId", "desiredDeadline", "id", "isArtworkApproved", "observations", "productsSummary", "quotationNumber", "rejectionReason", "sellerId", "status", "teamName", "totalQuantity", "updatedAt" FROM "Quotation";
DROP TABLE "Quotation";
ALTER TABLE "new_Quotation" RENAME TO "Quotation";
CREATE UNIQUE INDEX "Quotation_quotationNumber_key" ON "Quotation"("quotationNumber");
CREATE TABLE "new_QuotationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationId" TEXT NOT NULL,
    "productModel" TEXT NOT NULL,
    "catalogProductId" TEXT,
    "gender" TEXT NOT NULL DEFAULT 'UNISSEX',
    "size" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL DEFAULT 0.0,
    "subtotal" REAL NOT NULL DEFAULT 0.0,
    "customName" TEXT,
    "customNumber" TEXT,
    "fabricType" TEXT,
    "collarType" TEXT,
    "customizationNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_QuotationItem" ("createdAt", "customName", "customNumber", "fabricType", "gender", "id", "productModel", "quantity", "quotationId", "size") SELECT "createdAt", "customName", "customNumber", "fabricType", "gender", "id", "productModel", "quantity", "quotationId", "size" FROM "QuotationItem";
DROP TABLE "QuotationItem";
ALTER TABLE "new_QuotationItem" RENAME TO "QuotationItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
