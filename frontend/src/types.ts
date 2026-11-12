export type Role = "ADMIN" | "GESTOR" | "OPERADOR" | "VENDEDOR" | "DESIGNER";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  sectorId: string | null;
  sectorCode?: string | null;
  sectorName?: string | null;
  sector?: {
    id: string;
    name: string;
    code: string;
    sequenceOrder: number;
  };
  isActive: boolean;
  phone?: string | null;
  hasPin: boolean;
  createdAt?: string;
}

export interface Sector {
  id: string;
  sequenceOrder: number;
  code: string;
  name: string;
  description: string;
  allowsExternalDispatch: boolean;
  allowsReworkOrigin: boolean;
  isActive: boolean;
  activeUsersCount: number;
  totalBatches: number;
  metrics: {
    waiting: number;
    inProgress: number;
    rework: number;
    completed: number;
  };
}

export interface SewingPartner {
  id: string;
  type: "INTERNAL" | "EXTERNAL";
  name: string;
  documentNumber?: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
  basePricePerPc: number;
  isActive: boolean;
  notes?: string;
  _count?: {
    dispatches: number;
  };
}

export interface AuditLog {
  id: string;
  userId?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  action: string;
  entityName: string;
  entityId?: string;
  oldValues?: string;
  newValues?: string;
  ipAddress?: string;
  createdAt: string;
}

export interface DispatchManifest {
  id: string;
  manifestNumber: string;
  opBatchId: string;
  productionOrderId: string;
  sewingPartnerId: string;
  totalQuantity: number;
  sizeGridBreakdown: string;
  expectedReturnDate: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  reprintCount: number;
  lastReprintAt?: string | null;
  lastReprintById?: string | null;
  digitalSignatureHash?: string | null;
  qrPayload?: string | null;
  notes?: string | null;
  receiptStatus?: string;
  isReceiptClosed?: boolean;
  closedAt?: string | null;
  divergenceJustification?: string | null;
  sewingPartner?: SewingPartner;
  createdBy?: { id: string; name: string; role: string; email?: string };
  lastReprintBy?: { id: string; name: string; role: string };
  productionOrder?: {
    id: string;
    opNumber: string;
    title: string;
    customer?: { companyName: string; contactName: string; phone: string };
    quotation?: { quotationNumber: string; teamName: string };
  };
  opBatch?: {
    id: string;
    batchNumber: string;
    quantity: number;
    currentSector?: { code: string; name: string };
  };
}

export interface SewingReceiptItem {
  id?: string;
  size: string;
  quantityReceivedOk: number;
  quantityMissing: number;
  quantityDamaged: number;
}

export interface SewingReceipt {
  id: string;
  dispatchManifestId: string;
  opBatchId: string;
  receiptNumber: number;
  receivedAt: string;
  operatorId: string;
  totalReceivedOk: number;
  totalMissing: number;
  totalDamaged: number;
  digitalSignatureHash?: string | null;
  notes?: string | null;
  items: SewingReceiptItem[];
  operator?: { id: string; name: string; role: string };
  createdAt: string;
  updatedAt: string;
}

export interface SewingYieldPartnerReport {
  sewingPartnerId: string;
  sewingPartnerName: string;
  totalDispatches: number;
  totalSent: number;
  totalReceivedOk: number;
  totalMissing: number;
  totalDamaged: number;
  yieldPercentage: number;
  delayedDispatchesCount: number;
  manifests: {
    id: string;
    manifestNumber: string;
    totalQuantity: number;
    receivedOk: number;
    missing: number;
    damaged: number;
    expectedReturnDate: string;
    isReceiptClosed: boolean;
    receiptStatus: string;
    isDelayed: boolean;
  }[];
}

export interface DefectType {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QualityInspectionDefect {
  id?: string;
  defectTypeId: string;
  defectType?: DefectType;
  size: string;
  quantity: number;
}

export interface QualityInspection {
  id: string;
  opBatchId: string;
  dispatchManifestId?: string | null;
  sewingPartnerId?: string | null;
  inspectorId: string;
  inspectedAt: string;
  result: "APPROVED_TOTAL" | "APPROVED_PARTIAL" | "REJECTED_TOTAL";
  totalInspected: number;
  totalApproved: number;
  totalDefective: number;
  digitalSignatureHash?: string | null;
  notes?: string | null;
  defects?: QualityInspectionDefect[];
  inspector?: { id: string; name: string };
  sewingPartner?: { id: string; name: string; type: string };
}

export interface QualityDefectReport {
  summary: {
    totalInspections: number;
    totalInspected: number;
    totalApproved: number;
    totalDefective: number;
    defectRate: number;
  };
  workshops: {
    partnerId: string | null;
    partnerName: string;
    partnerType: string | null;
    totalInspected: number;
    totalApproved: number;
    totalDefective: number;
    defectRate: number;
    topDefects: {
      code: string;
      name: string;
      count: number;
    }[];
  }[];
}

export interface PackageVolume {
  id: string;
  opBatchId: string;
  volumeNumber: number;
  labelQrCode: string;
  sizeBreakdown: string;
  quantity: number;
  weightKg?: number | null;
  createdById: string;
  createdBy?: { id: string; name: string };
  deliveryManifestId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryManifest {
  id: string;
  manifestNumber: string;
  productionOrderId: string;
  opBatchId?: string | null;
  customerId: string;
  totalQuantity: number;
  sizeGridBreakdown: string;
  carrierName: string;
  carrierDocument?: string | null;
  carrierPhone?: string | null;
  notes?: string | null;
  digitalSignatureHash?: string | null;
  qrPayload?: string | null;
  reprintCount: number;
  lastReprintAt?: string | null;
  lastReprintById?: string | null;
  lastReprintBy?: { id: string; name: string; role: string } | null;
  isDelivered: boolean;
  deliveredAt?: string | null;
  deliveredRecipient?: string | null;
  deliveredNotes?: string | null;
  dispatchedById: string;
  dispatchedBy?: { id: string; name: string; role: string };
  customer?: { id: string; companyName: string; contactName: string; phone: string };
  productionOrder?: { id: string; opNumber: string; title: string; status: string };
  opBatch?: { id: string; batchNumber: string; quantity: number };
  volumes?: PackageVolume[];
  createdAt: string;
  updatedAt: string;
}


