const API_URL = "/api";

export function getToken(): string | null {
  return localStorage.getItem("pcp_auth_token");
}

export function setToken(token: string): void {
  localStorage.setItem("pcp_auth_token", token);
}

export function removeToken(): void {
  localStorage.removeItem("pcp_auth_token");
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      removeToken();
    }
    throw new Error(data.error || `Erro HTTP ${response.status}`);
  }

  return data as T;
}

export const api = {
  // Generic HTTP helpers
  get: <T = any>(endpoint: string) => request<T>(endpoint),
  post: <T = any>(endpoint: string, data?: any) =>
    request<T>(endpoint, {
      method: "POST",
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),
  put: <T = any>(endpoint: string, data?: any) =>
    request<T>(endpoint, {
      method: "PUT",
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),
  patch: <T = any>(endpoint: string, data?: any) =>
    request<T>(endpoint, {
      method: "PATCH",
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),
  delete: <T = any>(endpoint: string) =>
    request<T>(endpoint, {
      method: "DELETE",
    }),

  // Auth
  login: (credentials: { email: string; password: string }) =>
    request<{ token: string; user: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    }),
  getMe: () => request<{ user: any }>("/auth/me"),
  verifyPin: (pin: string) =>
    request<{ success: boolean; message: string }>("/auth/verify-pin", {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),
  setPin: (pin: string) =>
    request<{ success: boolean; message: string }>("/auth/set-pin", {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),

  // Sectors
  getSectors: () => request<any[]>("/sectors"),
  getSectorOperators: (sectorId: string) => request<any[]>(`/sectors/${sectorId}/operators`),

  // Users
  getUsers: () => request<any[]>("/users"),
  createUser: (userData: any) =>
    request<any>("/users", {
      method: "POST",
      body: JSON.stringify(userData),
    }),
  updateUser: (id: string, userData: any) =>
    request<any>(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(userData),
    }),

  // Sewing
  getSewingPartners: () => request<any[]>("/sewing-partners"),
  createSewingPartner: (partnerData: any) =>
    request<any>("/sewing-partners", {
      method: "POST",
      body: JSON.stringify(partnerData),
    }),

  // Audit Logs
  getAuditLogs: (limit = 100) => request<any[]>(`/audit-logs?limit=${limit}`),

  // System Health
  checkHealth: () => request<any>("/health"),

  // --- ETAPA 2: MÓDULO COMERCIAL, DESIGN E SAC ---
  // Customers
  getCustomers: (search = "") => request<any[]>(`/customers?search=${encodeURIComponent(search)}`),
  createCustomer: (customerData: any) =>
    request<any>("/customers", {
      method: "POST",
      body: JSON.stringify(customerData),
    }),

  // Quotations & Kanban
  getQuotations: (status = "", search = "") =>
    request<any[]>(`/quotations?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`),
  getQuotationDetails: (id: string) => request<any>(`/quotations/${id}`),
  createQuotation: (quotationData: any) =>
    request<any>("/quotations", {
      method: "POST",
      body: JSON.stringify(quotationData),
    }),
  updateQuotationStatus: (id: string, data: { status: string; notes?: string; rejectionReason?: string }) =>
    request<any>(`/quotations/${id}/status`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  attachQuotationFile: (id: string, fileData: { fileName: string; fileType: string; fileUrl: string; fileSize?: number }) =>
    request<any>(`/quotations/${id}/attachments`, {
      method: "POST",
      body: JSON.stringify(fileData),
    }),

  // Design
  getDesignQueue: () => request<any[]>("/design/queue"),
  claimDesign: (quotationId: string) =>
    request<any>(`/design/${quotationId}/claim`, {
      method: "POST",
    }),
  submitArtworkVersion: (quotationId: string, versionData: { previewUrl: string; vectorUrl?: string; changeNotes?: string }) =>
    request<any>(`/design/${quotationId}/versions`, {
      method: "POST",
      body: JSON.stringify(versionData),
    }),

  // Uploads Seguros com FormData
  uploadReferenceFile: async (file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_URL}/files/upload/reference`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Falha no upload do arquivo de referência.");
    return data;
  },

  uploadArtworkFile: async (file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_URL}/files/upload/artwork`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Falha no upload do arquivo de arte.");
    return data;
  },

  // Client Approval
  submitClientApproval: (quotationId: string, data: { decision: "APPROVED" | "REVISION_REQUESTED"; approvedByPerson?: string; feedbackNotes: string }) =>
    request<any>(`/quotations/${quotationId}/client-approval`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Conversion to OP
  convertToOp: (quotationId: string, data: { promisedDeliveryDate: string; finalNegotiatedAmount?: number; technicalNotes?: string }) =>
    request<any>(`/quotations/${quotationId}/convert-to-op`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // SAC Interno
  getSacQueue: () => request<any[]>("/sac/queue"),
  approveSacOp: (opId: string, data: { pin: string; notes?: string }) =>
    request<any>(`/sac/${opId}/approve`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  rejectSacOp: (opId: string, data: { pin: string; reason: string }) =>
    request<any>(`/sac/${opId}/reject`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  resubmitToSac: (opId: string, data: { correctionNotes: string }) =>
    request<any>(`/sac/${opId}/resubmit`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // --- ETAPA 3: FLUXO INDUSTRIAL DE PRODUÇÃO (SETORES 05 A 10) ---
  getProductionQueue: (sectorCode: string) =>
    request<{
      sector: any;
      totalBatches: number;
      waitingCount: number;
      inProgressCount: number;
      completedCount: number;
      reworkCount: number;
      batches: any[];
    }>(`/production/queue/${encodeURIComponent(sectorCode)}`),

  startProductionBatch: (batchId: string, data?: { pin?: string; notes?: string } | string) => {
    const payload = typeof data === "string" ? { notes: data } : data || {};
    return request<any>(`/production/batches/${batchId}/start`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  attachDiagramFile: (
    batchId: string,
    data: { fileName: string; fileUrl: string; fileVersion?: number; notes?: string }
  ) =>
    request<any>(`/production/batches/${batchId}/attach-diagram`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  completeAndForwardBatch: (batchId: string, data: any) =>
    request<any>(`/production/batches/${batchId}/complete-and-forward`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  returnProductionBatch: (
    batchId: string,
    data: { pin: string; targetSectorCode: string; reason: string }
  ) =>
    request<any>(`/production/batches/${batchId}/return`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getBatchHistory: (batchId: string) =>
    request<any>(`/production/batches/${batchId}/history`),

  splitProductionBatch: (batchId: string, data: { splitQuantity: number; pin?: string; notes?: string }) =>
    request<any>(`/batches/${batchId}/split`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Ficha Universal do Pedido (Acesso Multi-Setorial 01 a 14)
  getUniversalSheetByOrder: (opId: string) =>
    request<any>(`/universal-sheet/orders/${encodeURIComponent(opId)}`),

  getUniversalSheetByBatch: (batchId: string) =>
    request<any>(`/universal-sheet/by-batch/${encodeURIComponent(batchId)}`),

  getUniversalSheetByQuotation: (quotationId: string) =>
    request<any>(`/universal-sheet/quotations/${encodeURIComponent(quotationId)}`),

  // Dashboard & Riscos (Administrador Geral e Gestor)
  getDashboardOverview: (period: "days" | "weeks" | "months" | "years" = "days") =>
    request<any>(`/dashboard/overview?period=${encodeURIComponent(period)}`),

  // Catálogo Oficial Labella Sports & Orçamentos Inteligentes
  getCatalogCategories: () => request<any[]>("/catalog/categories"),
  getCatalogProducts: (categoryId?: string, search?: string) => {
    const params = new URLSearchParams();
    if (categoryId) params.append("categoryId", categoryId);
    if (search) params.append("search", search);
    const qs = params.toString();
    return request<any[]>(`/catalog/products${qs ? `?${qs}` : ""}`);
  },
  getCatalogProduct: (id: string) =>
    request<any>(`/catalog/products/${encodeURIComponent(id)}`),
  calculateCatalogBudget: (data: {
    items: Array<{
      productId: string;
      quantity: number;
      customizations?: Array<{ name: string; additionalPrice: number; quantity?: number }>;
    }>;
    discountAmount?: number;
  }) =>
    request<any>("/catalog/calculate-budget", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Desmembramento / Subdivisão de OP
  subdivideOrder: (
    opId: string,
    data: {
      subdivisions: Array<{
        quantity: number;
        notes?: string;
        sizeGrid?: Record<string, number>;
      }>;
      pin: string;
      notes?: string;
    }
  ) =>
    request<any>(`/batches/production-orders/${encodeURIComponent(opId)}/subdivide`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
