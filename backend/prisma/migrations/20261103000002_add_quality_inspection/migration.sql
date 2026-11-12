-- CreateTable
CREATE TABLE "DefectType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "QualityInspection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opBatchId" TEXT NOT NULL,
    "dispatchManifestId" TEXT,
    "sewingPartnerId" TEXT,
    "inspectorId" TEXT NOT NULL,
    "inspectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "totalInspected" INTEGER NOT NULL,
    "totalApproved" INTEGER NOT NULL,
    "totalDefective" INTEGER NOT NULL,
    "digitalSignatureHash" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QualityInspection_opBatchId_fkey" FOREIGN KEY ("opBatchId") REFERENCES "OpBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QualityInspection_dispatchManifestId_fkey" FOREIGN KEY ("dispatchManifestId") REFERENCES "DispatchManifest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "QualityInspection_sewingPartnerId_fkey" FOREIGN KEY ("sewingPartnerId") REFERENCES "SewingPartner" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "QualityInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityInspectionDefect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "qualityInspectionId" TEXT NOT NULL,
    "defectTypeId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "QualityInspectionDefect_qualityInspectionId_fkey" FOREIGN KEY ("qualityInspectionId") REFERENCES "QualityInspection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QualityInspectionDefect_defectTypeId_fkey" FOREIGN KEY ("defectTypeId") REFERENCES "DefectType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DefectType_code_key" ON "DefectType"("code");
