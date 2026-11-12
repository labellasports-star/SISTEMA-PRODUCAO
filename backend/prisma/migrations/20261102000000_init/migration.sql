-- CreateTable
CREATE TABLE "Sector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequenceOrder" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "allowsExternalDispatch" BOOLEAN NOT NULL DEFAULT false,
    "allowsReworkOrigin" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "signaturePinHash" TEXT,
    "sectorId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SewingPartner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentNumber" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "basePricePerPc" REAL NOT NULL DEFAULT 0.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "cityState" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOVA_SOLICITACAO',
    "productsSummary" TEXT,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "budgetAmount" REAL NOT NULL DEFAULT 0.0,
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

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationId" TEXT NOT NULL,
    "productModel" TEXT NOT NULL,
    "gender" TEXT NOT NULL DEFAULT 'UNISSEX',
    "size" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "customName" TEXT,
    "customNumber" TEXT,
    "fabricType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuotationAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileExtension" TEXT NOT NULL,
    "fileSize" INTEGER,
    "fileUrl" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuotationAttachment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuotationAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DesignBrief" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationId" TEXT NOT NULL,
    "briefingText" TEXT NOT NULL,
    "predominantColors" TEXT,
    "printType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DesignBrief_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArtworkVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "designBriefId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "previewUrl" TEXT,
    "vectorUrl" TEXT,
    "changeNotes" TEXT,
    "designerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtworkVersion_designBriefId_fkey" FOREIGN KEY ("designBriefId") REFERENCES "DesignBrief" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArtworkVersion_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuotationTimeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuotationTimeline_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuotationTimeline_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "quotationId" TEXT,
    "title" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "totalQuantityOrdered" INTEGER NOT NULL,
    "totalQuantityDone" INTEGER NOT NULL DEFAULT 0,
    "totalQuantityRework" INTEGER NOT NULL DEFAULT 0,
    "totalQuantityDelivered" INTEGER NOT NULL DEFAULT 0,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "promisedDeliveryDate" DATETIME,
    "technicalNotes" TEXT,
    "artworkUrl" TEXT,
    "sacApprovalStatus" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "sacRejectionReason" TEXT,
    "sacReviewedById" TEXT,
    "sacReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrder_sacReviewedById_fkey" FOREIGN KEY ("sacReviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchNumber" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "currentSectorId" TEXT NOT NULL,
    "assignedOperatorId" TEXT,
    "batchStatus" TEXT NOT NULL DEFAULT 'WAITING',
    "isUnderRework" BOOLEAN NOT NULL DEFAULT false,
    "reworkOriginSectorId" TEXT,
    "reworkReason" TEXT,
    "reworkNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpBatch_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpBatch_currentSectorId_fkey" FOREIGN KEY ("currentSectorId") REFERENCES "Sector" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OpBatch_assignedOperatorId_fkey" FOREIGN KEY ("assignedOperatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OpBatch_reworkOriginSectorId_fkey" FOREIGN KEY ("reworkOriginSectorId") REFERENCES "Sector" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opBatchId" TEXT NOT NULL,
    "fromSectorId" TEXT NOT NULL,
    "toSectorId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "managerAuthorizerId" TEXT,
    "movementType" TEXT NOT NULL DEFAULT 'FORWARD',
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "digitalSignatureHash" TEXT NOT NULL,
    "signerPinVerified" BOOLEAN NOT NULL DEFAULT true,
    "reworkDefectType" TEXT,
    "reworkTargetSectorId" TEXT,
    "reworkQuantity" INTEGER,
    "reworkPhotosJson" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OpMovement_opBatchId_fkey" FOREIGN KEY ("opBatchId") REFERENCES "OpBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpMovement_fromSectorId_fkey" FOREIGN KEY ("fromSectorId") REFERENCES "Sector" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OpMovement_toSectorId_fkey" FOREIGN KEY ("toSectorId") REFERENCES "Sector" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OpMovement_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OpMovement_managerAuthorizerId_fkey" FOREIGN KEY ("managerAuthorizerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OpMovement_reworkTargetSectorId_fkey" FOREIGN KEY ("reworkTargetSectorId") REFERENCES "Sector" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SewingDispatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dispatchNumber" TEXT NOT NULL,
    "opBatchId" TEXT NOT NULL,
    "sewingPartnerId" TEXT NOT NULL,
    "quantitySent" INTEGER NOT NULL,
    "dispatchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedReturnDate" DATETIME,
    "pricePerPiece" REAL NOT NULL DEFAULT 0.0,
    "totalPrice" REAL NOT NULL DEFAULT 0.0,
    "quantityReceived" INTEGER NOT NULL DEFAULT 0,
    "quantityApproved" INTEGER NOT NULL DEFAULT 0,
    "quantityRejected" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SewingDispatch_opBatchId_fkey" FOREIGN KEY ("opBatchId") REFERENCES "OpBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SewingDispatch_sewingPartnerId_fkey" FOREIGN KEY ("sewingPartnerId") REFERENCES "SewingPartner" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValues" TEXT,
    "newValues" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Sector_sequenceOrder_key" ON "Sector"("sequenceOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Sector_code_key" ON "Sector"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_quotationNumber_key" ON "Quotation"("quotationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DesignBrief_quotationId_key" ON "DesignBrief"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_opNumber_key" ON "ProductionOrder"("opNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_quotationId_key" ON "ProductionOrder"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "OpBatch_batchNumber_key" ON "OpBatch"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SewingDispatch_dispatchNumber_key" ON "SewingDispatch"("dispatchNumber");
