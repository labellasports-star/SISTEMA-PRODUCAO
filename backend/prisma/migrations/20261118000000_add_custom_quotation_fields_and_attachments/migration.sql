-- AlterTable
ALTER TABLE "QuotationAttachment" ADD COLUMN "originalName" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "isCustomModel" BOOLEAN NOT NULL DEFAULT false,
    "customModelName" TEXT,
    "isCustomFabric" BOOLEAN NOT NULL DEFAULT false,
    "customFabricName" TEXT,
    "isCustomCollar" BOOLEAN NOT NULL DEFAULT false,
    "customCollarName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_QuotationItem" ("catalogProductId", "collarType", "createdAt", "customName", "customNumber", "customizationNotes", "fabricType", "gender", "id", "productModel", "quantity", "quotationId", "size", "subtotal", "unitPrice") SELECT "catalogProductId", "collarType", "createdAt", "customName", "customNumber", "customizationNotes", "fabricType", "gender", "id", "productModel", "quantity", "quotationId", "size", "subtotal", "unitPrice" FROM "QuotationItem";
DROP TABLE "QuotationItem";
ALTER TABLE "new_QuotationItem" RENAME TO "QuotationItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
