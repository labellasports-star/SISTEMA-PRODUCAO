import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Search,
  Calendar,
  DollarSign,
  Users,
  Clock,
  ArrowRight,
  FileText,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Eye,
  Edit,
  Trash2,
  Download,
  UploadCloud,
  FileCheck,
  XCircle,
  Shield,
  ShieldCheck,
  KeyRound,
  Layers,
  Paperclip,
  Palette,
  CheckCircle2,
  RotateCcw,
  Send,
} from "lucide-react";
import { api } from "../services/api.js";
import { getSocket } from "../services/socket.js";
import { UniversalOrderSheetModal } from "./UniversalOrderSheetModal.js";

const KANBAN_COLUMNS = [
  { id: "NOVA_SOLICITACAO", title: "Nova Solicitação", color: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
  { id: "ORCAMENTO_PREPARACAO", title: "Em Preparação", color: "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" },
  { id: "ORCAMENTO_ENVIADO", title: "Orçamento Enviado", color: "bg-amber-500/10 border-amber-500/30 text-amber-400" },
  { id: "AGUARDANDO_RESPOSTA", title: "Aguard. Resposta", color: "bg-orange-500/10 border-orange-500/30 text-orange-400" },
  { id: "ORCAMENTO_APROVADO", title: "Orçamento Aprovado", color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" },
  { id: "SOLICITACAO_ARTE", title: "Solicitação de Arte", color: "bg-purple-500/10 border-purple-500/30 text-purple-400" },
  { id: "DESENVOLVIMENTO_ARTE", title: "Em Desenvolvimento", color: "bg-pink-500/10 border-pink-500/30 text-pink-400" },
  { id: "AGUARDANDO_APROVACAO_ARTE", title: "Aguard. Aprov. Arte", color: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" },
  { id: "ARTE_EM_ALTERACAO", title: "Arte em Alteração", color: "bg-rose-500/10 border-rose-500/30 text-rose-400" },
  { id: "CONVERTIDA_VENDA", title: "Convertida em OP", color: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" },
  { id: "PERDIDA", title: "Perdida", color: "bg-slate-700/20 border-slate-700/40 text-slate-400" },
];

interface UploadQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  status: "idle" | "uploading" | "success" | "error";
  error?: string;
  fileUrl?: string;
  uploadedFileName?: string;
}

export function PreVendaKanban({ currentUser }: { currentUser?: any }) {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<any | null>(null);
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [sheetQuotationId, setSheetQuotationId] = useState<string | null>(null);

  // Form states
  const [customerName, setCustomerName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [teamName, setTeamName] = useState("");
  const [productsSummary, setProductsSummary] = useState("");
  const [totalQuantity, setTotalQuantity] = useState("50");
  const [budgetAmount, setBudgetAmount] = useState("1945.00");
  const [desiredDeadline, setDesiredDeadline] = useState("");
  const [briefingText, setBriefingText] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Catálogo Oficial Labella Sports
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  // Controle de "Outros"
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  const [customProductName, setCustomProductName] = useState("");
  const [customUnitPrice, setCustomUnitPrice] = useState<string>("38,90");
  const [selectedFabric, setSelectedFabric] = useState<string>("");
  const [isCustomFabric, setIsCustomFabric] = useState(false);
  const [customFabricName, setCustomFabricName] = useState("");
  const [selectedCollar, setSelectedCollar] = useState<string>("");
  const [isCustomCollar, setIsCustomCollar] = useState(false);
  const [customCollarName, setCustomCollarName] = useState("");

  // Autorização Gerencial por PIN (< 10 peças)
  const [eligibleManagers, setEligibleManagers] = useState<any[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState<string>("");
  const [managerPin, setManagerPin] = useState<string>("");
  const [currentApproval, setCurrentApproval] = useState<any | null>(null);

  // Modais de Alteração e Aprovação da Arte
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [revisionError, setRevisionError] = useState("");
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);

  const [isReviewApproveModalOpen, setIsReviewApproveModalOpen] = useState(false);
  const [approvedByPerson, setApprovedByPerson] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [forwardToProduction, setForwardToProduction] = useState(true);
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState("");
  const [technicalNotes, setTechnicalNotes] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const selectedQuotationRef = useRef<string | null>(null);

  useEffect(() => {
    selectedQuotationRef.current = selectedQuotation?.id || null;
  }, [selectedQuotation]);

  const loadEligibleManagers = async () => {
    try {
      const managers = await api.getEligibleManagers();
      setEligibleManagers(Array.isArray(managers) ? managers : []);
    } catch (err) {
      console.warn("Não foi possível carregar gestores elegíveis:", err);
    }
  };

  const parseMonetaryInput = (val: string | number | undefined | null): number => {
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const str = String(val).trim();
    if (str.includes(",")) {
      const normalized = str.replace(/\./g, "").replace(",", ".");
      const num = parseFloat(normalized);
      return isNaN(num) ? 0 : num;
    }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  };

  // Opcionais: TPU 3D (+R$ 15). Nome e Número sem custo (R$ 0).
  const [selectedCustomizations, setSelectedCustomizations] = useState<{ [key: string]: boolean }>({
    "Escudo TPU 3D": false,
    "Nome Individual": false,
    "Número Individual": false,
  });

  // Fila de múltiplos uploads com progresso, falhas e retry
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parseOptionsList = (val: any): string[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string" && val.trim() !== "") {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return val.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    return [];
  };

  const loadQuotations = async () => {
    setIsLoading(true);
    try {
      const data = await api.getQuotations("", searchTerm);
      setQuotations(data);
    } catch (err) {
      console.error("Erro ao carregar orçamentos:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCatalog = async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const prods: any = await api.getCatalogProducts();
      const list = Array.isArray(prods) ? prods : prods?.products || [];
      setCatalogProducts(list);
      if (list.length > 0 && !selectedProduct && !isCustomProduct) {
        setSelectedProduct(list[0]);
        const fabrics = parseOptionsList(list[0].availableFabrics);
        if (fabrics.length > 0) setSelectedFabric(fabrics[0]);
        const collars = parseOptionsList(list[0].availableCollars);
        if (collars.length > 0) setSelectedCollar(collars[0]);
      }
    } catch (err: any) {
      console.error("Erro ao carregar catálogo:", err);
      setCatalogError(err.message || "Erro de conexão ao carregar catálogo.");
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    loadQuotations();
  }, [searchTerm]);

  useEffect(() => {
    loadCatalog();
  }, []);

  useEffect(() => {
    if (isModalOpen && catalogProducts.length === 0) {
      loadCatalog();
    }
  }, [isModalOpen, catalogProducts.length]);

  // Recálculo dinâmico do orçamento:
  // - Produtos do catálogo oficial ou modelo 'Outros' com preço unitário e quantidade
  // - Nome e Número são sem custo adicional (+R$ 0)
  // - Escudo TPU 3D mantém a cobrança de +R$ 15 por peça
  useEffect(() => {
    const qty = parseInt(totalQuantity, 10) || 0;
    const tpuExtra = selectedCustomizations["Escudo TPU 3D"] ? 15.0 : 0;

    if (!isCustomProduct && selectedProduct) {
      const baseUnit = selectedProduct.basePrice || 0;
      const effectiveUnit = baseUnit + tpuExtra;
      const total = effectiveUnit * qty;
      setBudgetAmount(total.toFixed(2));
      const fabricDisplay = isCustomFabric ? customFabricName : selectedFabric;
      setProductsSummary(
        `${qty}x ${selectedProduct.name}${fabricDisplay ? ` (${fabricDisplay})` : ""}`
      );
    } else if (isCustomProduct) {
      const baseUnit = parseMonetaryInput(customUnitPrice);
      const effectiveUnit = baseUnit + tpuExtra;
      const total = effectiveUnit * qty;
      setBudgetAmount(total.toFixed(2));
      const modelDisplay = customProductName.trim() || "Modelo Personalizado";
      const fabricDisplay = isCustomFabric ? customFabricName : selectedFabric;
      setProductsSummary(
        `${qty}x ${modelDisplay}${fabricDisplay ? ` (${fabricDisplay})` : ""}`
      );
    }
  }, [
    isCustomProduct,
    customProductName,
    customUnitPrice,
    selectedProduct,
    totalQuantity,
    selectedCustomizations,
    selectedFabric,
    isCustomFabric,
    customFabricName,
  ]);

  useEffect(() => {
    const socket = getSocket();
    const handleUpdate = () => {
      loadQuotations();
      if (selectedQuotationRef.current) {
        api
          .getQuotationDetails(selectedQuotationRef.current)
          .then((fresh) => {
            setSelectedQuotation(fresh);
          })
          .catch(() => {});
      }
    };

    socket.on("quotation_status_changed", handleUpdate);
    socket.on("artwork_version_submitted", handleUpdate);
    socket.on("client_approval_updated", handleUpdate);

    return () => {
      socket.off("quotation_status_changed", handleUpdate);
      socket.off("artwork_version_submitted", handleUpdate);
      socket.off("client_approval_updated", handleUpdate);
    };
  }, []);

  const handleSelectProduct = (val: string) => {
    if (val === "OUTROS") {
      setIsCustomProduct(true);
      setSelectedProduct(null);
      if (!customUnitPrice || parseMonetaryInput(customUnitPrice) <= 0) {
        setCustomUnitPrice("38,90");
      }
    } else {
      setIsCustomProduct(false);
      const prod = catalogProducts.find((p) => p.id === val);
      if (prod) {
        setSelectedProduct(prod);
        const fabrics = parseOptionsList(prod.availableFabrics);
        if (fabrics.length > 0 && !isCustomFabric) setSelectedFabric(fabrics[0]);
        const collars = parseOptionsList(prod.availableCollars);
        if (collars.length > 0 && !isCustomCollar) setSelectedCollar(collars[0]);
      }
    }
  };

  const handleSelectFabric = (val: string) => {
    if (val === "OUTROS") {
      setIsCustomFabric(true);
    } else {
      setIsCustomFabric(false);
      setSelectedFabric(val);
    }
  };

  const handleSelectCollar = (val: string) => {
    if (val === "OUTROS") {
      setIsCustomCollar(true);
    } else {
      setIsCustomCollar(false);
      setSelectedCollar(val);
    }
  };

  // Upload assíncrono de múltiplos arquivos com controle de progresso e falhas
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: UploadQueueItem[] = Array.from(files).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      file: f,
      name: f.name,
      size: f.size,
      progress: 0,
      status: "idle",
    }));

    setUploadQueue((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Iniciar upload imediatamente para os arquivos adicionados
    newItems.forEach((item) => executeUpload(item));
  };

  const executeUpload = async (item: UploadQueueItem) => {
    setUploadQueue((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: "uploading", progress: 0, error: undefined } : i))
    );

    try {
      const res = await api.uploadReferenceFileWithProgress(item.file, (pct) => {
        setUploadQueue((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, progress: pct } : i))
        );
      });

      setUploadQueue((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: "success",
                progress: 100,
                fileUrl: res.fileUrl,
                uploadedFileName: res.fileName,
              }
            : i
        )
      );
    } catch (err: any) {
      setUploadQueue((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: "error",
                progress: 0,
                error: err.message || "Falha no envio do arquivo.",
              }
            : i
        )
      );
    }
  };

  const handleRetryUpload = (itemId: string) => {
    const item = uploadQueue.find((i) => i.id === itemId);
    if (item) executeUpload(item);
  };

  const handleRemoveQueueItem = (itemId: string) => {
    setUploadQueue((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleDeleteExistingAttachment = async (attachmentId: string) => {
    if (!editingQuotationId) return;
    if (!confirm("Deseja realmente remover este anexo da ficha?")) return;
    try {
      await api.deleteQuotationAttachment(editingQuotationId, attachmentId);
      setExistingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      if (selectedQuotation && selectedQuotation.id === editingQuotationId) {
        const updated = await api.getQuotationDetails(editingQuotationId);
        setSelectedQuotation(updated);
      }
    } catch (err: any) {
      alert(err.message || "Erro ao excluir anexo.");
    }
  };

  const openCreateModal = () => {
    setIsEditMode(false);
    setEditingQuotationId(null);
    setCustomerName("");
    setContactName("");
    setPhone("");
    setTeamName("");
    setProductsSummary("");
    setTotalQuantity("50");
    setBudgetAmount("1945.00");
    setDesiredDeadline("");
    setBriefingText("");
    setIsCustomProduct(false);
    setCustomProductName("");
    setCustomUnitPrice("38,90");
    setIsCustomFabric(false);
    setCustomFabricName("");
    setIsCustomCollar(false);
    setCustomCollarName("");
    setManagerPin("");
    setSelectedManagerId("");
    setCurrentApproval(null);
    loadEligibleManagers();
    setSelectedCustomizations({
      "Escudo TPU 3D": false,
      "Nome Individual": false,
      "Número Individual": false,
    });
    setUploadQueue([]);
    setExistingAttachments([]);
    setFormError("");
    setIsModalOpen(true);
  };

  const openEditModal = (quotation: any) => {
    setIsEditMode(true);
    setEditingQuotationId(quotation.id);
    setCustomerName(quotation.customer?.companyName || "");
    setContactName(quotation.customer?.contactName || "");
    setPhone(quotation.customer?.phone || "");
    setTeamName(quotation.teamName || "");
    setProductsSummary(quotation.productsSummary || "");
    setTotalQuantity(String(quotation.totalQuantity || 50));
    setBudgetAmount(Number(quotation.budgetAmount || 0).toFixed(2));
    setDesiredDeadline(
      quotation.desiredDeadline ? quotation.desiredDeadline.substring(0, 10) : ""
    );
    setBriefingText(quotation.designBrief?.briefingText || quotation.observations || "");

    setManagerPin("");
    setSelectedManagerId(quotation.minQtyAuthorizedById || "");
    if (quotation.minQtyApprovedQuantity) {
      setCurrentApproval({
        qty: quotation.minQtyApprovedQuantity,
        by: quotation.minQtyAuthorizedBy?.name,
        at: quotation.minQtyAuthorizedAt,
        byId: quotation.minQtyAuthorizedById,
      });
    } else {
      setCurrentApproval(null);
    }
    loadEligibleManagers();

    const firstItem = quotation.items?.[0];
    if (firstItem) {
      const notes = firstItem.customizationNotes || "";
      const hasTpu = notes.includes("TPU 3D") || notes.includes("Escudo");

      if (firstItem.isCustomModel || !firstItem.catalogProductId) {
        setIsCustomProduct(true);
        setCustomProductName(firstItem.customModelName || firstItem.productModel || "");
        setSelectedProduct(null);

        const savedUnit =
          typeof firstItem.unitPrice === "number" && firstItem.unitPrice > 0
            ? firstItem.unitPrice
            : firstItem.subtotal && firstItem.quantity
            ? firstItem.subtotal / firstItem.quantity
            : 38.9;
        const baseUnit = hasTpu ? Math.max(0.01, savedUnit - 15) : savedUnit;
        setCustomUnitPrice(baseUnit.toFixed(2).replace(".", ","));
      } else {
        setIsCustomProduct(false);
        setCustomProductName("");
        setCustomUnitPrice("38,90");
        const prod = catalogProducts.find((p) => p.id === firstItem.catalogProductId);
        if (prod) setSelectedProduct(prod);
      }

      if (firstItem.isCustomFabric) {
        setIsCustomFabric(true);
        setCustomFabricName(firstItem.customFabricName || firstItem.fabricType || "");
      } else {
        setIsCustomFabric(false);
        setCustomFabricName("");
        setSelectedFabric(firstItem.fabricType || "");
      }

      if (firstItem.isCustomCollar) {
        setIsCustomCollar(true);
        setCustomCollarName(firstItem.customCollarName || firstItem.collarType || "");
      } else {
        setIsCustomCollar(false);
        setCustomCollarName("");
        setSelectedCollar(firstItem.collarType || "");
      }

      setSelectedCustomizations({
        "Escudo TPU 3D": hasTpu,
        "Nome Individual": notes.includes("Nome") || !!firstItem.customName,
        "Número Individual": notes.includes("Número") || notes.includes("Numero") || !!firstItem.customNumber,
      });
    }

    setUploadQueue([]);
    setExistingAttachments(quotation.attachments || []);
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSaveQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // Validação de campos "Outros" obrigatórios
    if (isCustomProduct) {
      if (!customProductName.trim()) {
        setFormError("Informe o nome do modelo desejado quando 'Outros' for selecionado.");
        return;
      }
      const unitVal = parseMonetaryInput(customUnitPrice);
      if (unitVal <= 0) {
        setFormError("Informe um valor unitário maior que zero para o modelo personalizado.");
        return;
      }
      const qtyVal = Number(totalQuantity);
      if (isNaN(qtyVal) || !Number.isInteger(qtyVal) || qtyVal < 1) {
        setFormError("A quantidade de peças deve ser um número inteiro de no mínimo 1 unidade.");
        return;
      }
    }
    if (isCustomFabric && !customFabricName.trim()) {
      setFormError("Informe o tecido desejado quando 'Outros' for selecionado.");
      return;
    }
    if (isCustomCollar && !customCollarName.trim()) {
      setFormError("Informe o tipo de gola desejado quando 'Outros' for selecionado.");
      return;
    }

    const qty = Number(totalQuantity);
    if (isNaN(qty) || !Number.isInteger(qty) || qty < 1) {
      setFormError("A quantidade total de peças deve ser um número inteiro maior ou igual a 1.");
      return;
    }

    // Regra de autorização por PIN para vendas abaixo de 10 peças
    if (qty < 10) {
      const isAlreadyApproved = isEditMode && currentApproval && currentApproval.qty === qty;
      if (!isAlreadyApproved && !managerPin.trim()) {
        setFormError("Para pedidos abaixo de 10 peças, informe o PIN de um Gestor ou Administrador para autorizar.");
        return;
      }
    }

    // Verificar se há uploads em andamento
    const hasUploading = uploadQueue.some((i) => i.status === "uploading");
    if (hasUploading) {
      setFormError("Aguarde a conclusão do envio de todos os arquivos antes de salvar.");
      return;
    }

    setIsSubmitting(true);
    try {
      let baseUnit = 0;
      let tpuExtra = 0;
      if (selectedCustomizations["Escudo TPU 3D"]) tpuExtra = 15.0;

      if (isCustomProduct) {
        baseUnit = parseMonetaryInput(customUnitPrice);
      } else {
        baseUnit = selectedProduct?.basePrice || 0;
      }

      const effectiveUnit = Number((baseUnit + tpuExtra).toFixed(2));
      const calculatedBudget = Number((effectiveUnit * qty).toFixed(2));

      const customs: string[] = [];
      if (selectedCustomizations["Escudo TPU 3D"]) customs.push("Escudo TPU 3D");
      if (selectedCustomizations["Nome Individual"]) customs.push("Nome Individual");
      if (selectedCustomizations["Número Individual"]) customs.push("Número Individual");

      const finalProductModel = isCustomProduct
        ? customProductName.trim()
        : (selectedProduct?.name || "Modelo Esportivo");
      const finalFabric = isCustomFabric ? customFabricName.trim() : selectedFabric;
      const finalCollar = isCustomCollar ? customCollarName.trim() : selectedCollar;

      const itemsPayload = [
        {
          catalogProductId: isCustomProduct ? null : selectedProduct?.id || null,
          productModel: finalProductModel,
          isCustomModel: isCustomProduct,
          customModelName: isCustomProduct ? customProductName.trim() : null,
          isCustomFabric: isCustomFabric,
          customFabricName: isCustomFabric ? customFabricName.trim() : null,
          isCustomCollar: isCustomCollar,
          customCollarName: isCustomCollar ? customCollarName.trim() : null,
          gender: "UNISSEX",
          size: "G",
          quantity: qty,
          unitPrice: effectiveUnit,
          subtotal: calculatedBudget,
          fabricType: finalFabric || undefined,
          collarType: finalCollar || undefined,
          customizationNotes: customs.length > 0 ? customs.join(", ") : undefined,
        },
      ];

      // Anexos concluídos com sucesso para vincular à ficha
      const newAttachmentsPayload = uploadQueue
        .filter((i) => i.status === "success" && i.fileUrl)
        .map((i) => ({
          fileName: i.uploadedFileName || i.name,
          originalName: i.name,
          fileType: "REFERENCE" as const,
          fileUrl: i.fileUrl!,
          fileSize: i.size,
        }));

      if (isEditMode && editingQuotationId) {
        // Atualização da cotação
        const updated = await api.updateQuotation(editingQuotationId, {
          customer: {
            companyName: customerName,
            contactName,
            phone,
          },
          teamName,
          productsSummary,
          totalQuantity: qty,
          budgetAmount: calculatedBudget,
          desiredDeadline: desiredDeadline ? new Date(desiredDeadline).toISOString() : undefined,
          briefingText,
          managerPin: managerPin.trim() || undefined,
          managerId: selectedManagerId || undefined,
          items: itemsPayload,
          attachments: newAttachmentsPayload.length > 0 ? newAttachmentsPayload : undefined,
        });

        setIsModalOpen(false);
        await loadQuotations();
        if (selectedQuotation && selectedQuotation.id === editingQuotationId) {
          const freshDetails = await api.getQuotationDetails(editingQuotationId);
          setSelectedQuotation(freshDetails);
        }
      } else {
        // Criação de nova oportunidade
        await api.createQuotation({
          customer: {
            companyName: customerName,
            contactName,
            phone,
          },
          teamName,
          productsSummary,
          totalQuantity: qty,
          budgetAmount: calculatedBudget,
          desiredDeadline: desiredDeadline ? new Date(desiredDeadline).toISOString() : undefined,
          briefingText,
          managerPin: managerPin.trim() || undefined,
          managerId: selectedManagerId || undefined,
          items: itemsPayload,
          attachments: newAttachmentsPayload,
        });

        setIsModalOpen(false);
        await loadQuotations();
      }
    } catch (err: any) {
      setFormError(err.message || "Erro ao salvar oportunidade comercial.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMoveStatus = async (quotationId: string, nextStatus: string) => {
    try {
      await api.updateQuotationStatus(quotationId, { status: nextStatus });
      await loadQuotations();
      if (selectedQuotation && selectedQuotation.id === quotationId) {
        const updated = await api.getQuotationDetails(quotationId);
        setSelectedQuotation(updated);
      }
    } catch (err: any) {
      alert(err.message || "Erro ao movimentar oportunidade.");
    }
  };

  const openDetails = async (id: string) => {
    try {
      const details = await api.getQuotationDetails(id);
      setSelectedQuotation(details);
    } catch (err: any) {
      alert(err.message || "Erro ao abrir detalhes da ficha.");
    }
  };

  const handleOpenRevisionModal = (quotation: any) => {
    setSelectedQuotation(quotation);
    setRevisionNotes("");
    setRevisionError("");
    setIsRevisionModalOpen(true);
  };

  const handleSubmitRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuotation) return;
    setRevisionError("");
    setIsSubmittingRevision(true);
    try {
      await api.submitClientApproval(selectedQuotation.id, {
        decision: "REVISION_REQUESTED",
        feedbackNotes: revisionNotes,
      });

      setIsRevisionModalOpen(false);
      setRevisionNotes("");
      await loadQuotations();
      const fresh = await api.getQuotationDetails(selectedQuotation.id);
      setSelectedQuotation(fresh);
      alert("Solicitação de alteração registrada com sucesso! A ficha foi devolvida à fila do Designer.");
    } catch (err: any) {
      setRevisionError(err.message || "Erro ao registrar solicitação de alteração.");
    } finally {
      setIsSubmittingRevision(false);
    }
  };

  const handleOpenReviewApproveModal = (quotation: any, forwardImmediately = true) => {
    setSelectedQuotation(quotation);
    setApprovedByPerson(quotation.customer?.contactName || "Cliente");
    setApprovalNotes("Arte conferida e aprovada sem ressalvas pelo cliente.");
    setForwardToProduction(forwardImmediately);
    setPromisedDeliveryDate(
      quotation.desiredDeadline
        ? quotation.desiredDeadline.substring(0, 10)
        : new Date(Date.now() + 15 * 86400000).toISOString().substring(0, 10)
    );
    setTechnicalNotes("");
    setApprovalError("");
    setIsReviewApproveModalOpen(true);
  };

  const handleSubmitReviewApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuotation) return;
    setApprovalError("");
    setIsSubmittingApproval(true);
    try {
      // 1. Registrar aprovação formal da versão de arte pelo cliente
      await api.submitClientApproval(selectedQuotation.id, {
        decision: "APPROVED",
        approvedByPerson,
        feedbackNotes: approvalNotes || "Arte aprovada pelo cliente.",
      });

      // 2. Se marcado para encaminhar imediatamente para produção, converter em OP
      if (forwardToProduction) {
        await api.convertToOp(selectedQuotation.id, {
          promisedDeliveryDate: new Date(promisedDeliveryDate).toISOString(),
          finalNegotiatedAmount: selectedQuotation.budgetAmount,
          technicalNotes,
        });
      }

      setIsReviewApproveModalOpen(false);
      await loadQuotations();
      try {
        const fresh = await api.getQuotationDetails(selectedQuotation.id);
        setSelectedQuotation(fresh);
      } catch {
        setSelectedQuotation(null);
      }
      alert(
        forwardToProduction
          ? "Arte aprovada e Ficha encaminhada ao SAC Interno com sucesso! Ordem de Produção (OP) gerada."
          : "Arte aprovada com sucesso! Ficha atualizada para 'Orçamento Aprovado'."
      );
    } catch (err: any) {
      setApprovalError(err.message || "Erro ao processar aprovação da arte.");
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="space-y-6">
      {/* HEADER DE AÇÕES */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Kanban Comercial — Pré-Venda
          </h2>
          <p className="text-xs text-slate-400">
            Acompanhamento contínuo de oportunidades, orçamentos e briefs de arte em 11 estágios.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar equipe, cliente ou ORC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-800 pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition shadow-lg shadow-sky-600/30 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Nova Pré-Venda
          </button>
        </div>
      </div>

      {/* KANBAN BOARD */}
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
        {KANBAN_COLUMNS.map((col) => {
          const colQuotations = quotations.filter((q) => q.status === col.id);
          return (
            <div key={col.id} className="w-80 shrink-0 flex flex-col rounded-2xl bg-slate-900/60 border border-slate-800/80 p-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 mb-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${col.color}`}>
                  {col.title}
                </span>
                <span className="text-xs font-mono font-bold text-slate-400">
                  {colQuotations.length}
                </span>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto max-h-[70vh] pr-1">
                {colQuotations.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => openDetails(q.id)}
                    className="group cursor-pointer rounded-xl bg-slate-950 border border-slate-800 p-3.5 hover:border-sky-500/50 hover:shadow-lg transition space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-sky-400">
                        {q.quotationNumber}
                      </span>
                      {q.desiredDeadline && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-300">
                          <Calendar className="h-3 w-3" />
                          {new Date(q.desiredDeadline).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-semibold text-white group-hover:text-sky-300 transition line-clamp-1">
                      {q.teamName}
                    </h4>

                    <p className="text-xs text-slate-400 line-clamp-1">
                      {q.customer?.companyName || "Cliente"} · {q.customer?.contactName}
                    </p>

                    <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-900">
                      <span className="flex items-center gap-1 font-mono font-semibold text-slate-200">
                        {q.totalQuantity} pcs
                      </span>
                      <span className="font-mono font-bold text-emerald-400">
                        R$ {Number(q.budgetAmount || 0).toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                      <span>Vendedor: {q.seller?.name || "Eu"}</span>
                      {q.attachments && q.attachments.length > 0 && (
                        <span className="flex items-center gap-1 text-sky-400 font-medium">
                          <Paperclip className="h-3 w-3" />
                          {q.attachments.length}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {colQuotations.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-600">
                    Nenhuma ficha nesta etapa.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL CRIAÇÃO / EDIÇÃO DE PRÉ-VENDA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {isEditMode ? <Edit className="h-5 w-5 text-sky-400" /> : <Plus className="h-5 w-5 text-sky-400" />}
                {isEditMode ? `Editar Pré-Venda — ${teamName || "Ficha Comercial"}` : "Nova Oportunidade Comercial (Pré-Venda)"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mb-4 rounded-lg bg-rose-500/15 p-3 text-xs text-rose-300 border border-rose-500/30 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveQuotation} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">Cliente / Empresa *</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    placeholder="Ex: Atlética Medicina ou Loja X"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">Contato Responsável *</label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    placeholder="Nome do cliente"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">Telefone / WhatsApp *</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    placeholder="(11) 98888-7777"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">Nome do Time / Equipe *</label>
                  <input
                    type="text"
                    required
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    placeholder="Ex: Flamengo do Bairro ou Turma 2026"
                  />
                </div>
              </div>

              {/* SELEÇÃO DO PRODUTO DO CATÁLOGO OFICIAL COM OPÇÃO 'OUTROS' */}
              <div className="rounded-xl border border-sky-900/40 bg-sky-950/20 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                    Catálogo Oficial Labella Sports
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-sky-900/60 text-sky-300">
                    Pedido Mínimo: 10 peças
                  </span>
                </div>

                {/* Dropdown Modelo do Catálogo */}
                <div>
                  <label className="text-xs text-slate-300 font-medium">Modelo do Catálogo *</label>
                  <select
                    value={isCustomProduct ? "OUTROS" : selectedProduct?.id || ""}
                    onChange={(e) => handleSelectProduct(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  >
                    {catalogProducts.map((p) => (
                      <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                        {p.name} — R$ {Number(p.basePrice).toFixed(2)} (Ref: {p.code})
                      </option>
                    ))}
                    <option value="OUTROS" className="bg-slate-900 text-amber-300 font-semibold">
                      Outros (Modelo Fora do Catálogo / Especial)
                    </option>
                  </select>
                </div>

                {/* Campos para Modelo = Outros com Cálculo Automático */}
                {isCustomProduct && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                    <div>
                      <label className="text-xs text-amber-300 font-semibold block mb-1">
                        Nome do modelo *
                      </label>
                      <input
                        type="text"
                        required
                        value={customProductName}
                        onChange={(e) => setCustomProductName(e.target.value)}
                        placeholder="Ex: Camisa Retrô Gola Padre, Jaqueta Corta-Vento Dupla Face..."
                        className="w-full rounded-lg bg-slate-950 border border-amber-500/50 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none placeholder-slate-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-amber-300 font-semibold block mb-1">
                          Valor unitário (R$) *
                        </label>
                        <input
                          type="text"
                          required
                          value={customUnitPrice}
                          onChange={(e) => setCustomUnitPrice(e.target.value)}
                          placeholder="Ex: 38,90"
                          className="w-full rounded-lg bg-slate-950 border border-amber-500/50 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none placeholder-slate-500"
                        />
                        <span className="text-[10px] text-amber-400/80">Aceita valores em reais com vírgula (ex: 38,90)</span>
                      </div>

                      <div>
                        <label className="text-xs text-amber-300 font-semibold block mb-1">
                          Quantidade de peças *
                        </label>
                        <input
                          type="number"
                          required
                          min={1}
                          step={1}
                          value={totalQuantity}
                          onChange={(e) => setTotalQuantity(e.target.value)}
                          placeholder="Mínimo 1 peça"
                          className="w-full rounded-lg bg-slate-950 border border-amber-500/50 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                        />
                        <span className="text-[10px] text-amber-400/80">
                          {parseInt(totalQuantity, 10) < 10
                            ? "Abaixo de 10 peças requer autorização por PIN"
                            : "Mínimo padrão: 10 unidades"}
                        </span>
                      </div>
                    </div>

                    {/* Resumo visual do cálculo automático */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2 rounded bg-amber-950/40 border border-amber-500/20 text-xs">
                      <span className="text-amber-200">
                        Cálculo automático: {parseInt(totalQuantity, 10) || 0} peças × R${" "}
                        {parseMonetaryInput(customUnitPrice).toFixed(2).replace(".", ",")}
                        {selectedCustomizations["Escudo TPU 3D"] && " (+ R$ 15,00 TPU 3D/peça)"}
                      </span>
                      <span className="font-bold text-amber-300">
                        Subtotal: R${" "}
                        {(
                          (parseInt(totalQuantity, 10) || 0) *
                          (parseMonetaryInput(customUnitPrice) +
                            (selectedCustomizations["Escudo TPU 3D"] ? 15.0 : 0))
                        )
                          .toFixed(2)
                          .replace(".", ",")}
                      </span>
                    </div>
                  </div>
                )}

                {/* Tecido e Tipo de Gola com opção "Outros" */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Tecido */}
                  <div>
                    <label className="text-xs text-slate-300 font-medium">Tecido Recomendado *</label>
                    <select
                      value={isCustomFabric ? "OUTROS" : selectedFabric}
                      onChange={(e) => handleSelectFabric(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                    >
                      {(() => {
                        const fabrics = selectedProduct ? parseOptionsList(selectedProduct.availableFabrics) : [];
                        return (
                          <>
                            {fabrics.map((f: string) => (
                              <option key={f} value={f} className="bg-slate-900 text-white">
                                {f}
                              </option>
                            ))}
                            {!fabrics.includes("Dry Fit Tradicional") && (
                              <option value="Dry Fit Tradicional" className="bg-slate-900 text-white">
                                Dry Fit Tradicional
                              </option>
                            )}
                            <option value="OUTROS" className="bg-slate-900 text-amber-300 font-semibold">
                              Outros (Informar Tecido)
                            </option>
                          </>
                        );
                      })()}
                    </select>

                    {isCustomFabric && (
                      <input
                        type="text"
                        required
                        value={customFabricName}
                        onChange={(e) => setCustomFabricName(e.target.value)}
                        placeholder="Informe o tecido desejado *"
                        className="mt-2 w-full rounded-lg bg-slate-950 border border-amber-500/50 px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none placeholder-slate-500"
                      />
                    )}
                  </div>

                  {/* Gola */}
                  <div>
                    <label className="text-xs text-slate-300 font-medium">Tipo de Gola *</label>
                    <select
                      value={isCustomCollar ? "OUTROS" : selectedCollar}
                      onChange={(e) => handleSelectCollar(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                    >
                      {(() => {
                        const collars = selectedProduct ? parseOptionsList(selectedProduct.availableCollars) : [];
                        return (
                          <>
                            {collars.map((c: string) => (
                              <option key={c} value={c} className="bg-slate-900 text-white">
                                {c}
                              </option>
                            ))}
                            {!collars.includes("Gola Careca") && (
                              <option value="Gola Careca" className="bg-slate-900 text-white">
                                Gola Careca
                              </option>
                            )}
                            <option value="OUTROS" className="bg-slate-900 text-amber-300 font-semibold">
                              Outros (Informar Tipo de Gola)
                            </option>
                          </>
                        );
                      })()}
                    </select>

                    {isCustomCollar && (
                      <input
                        type="text"
                        required
                        value={customCollarName}
                        onChange={(e) => setCustomCollarName(e.target.value)}
                        placeholder="Informe o tipo de gola desejado *"
                        className="mt-2 w-full rounded-lg bg-slate-950 border border-amber-500/50 px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none placeholder-slate-500"
                      />
                    )}
                  </div>
                </div>

                {/* Opcionais e Personalizações */}
                <div>
                  <label className="text-xs text-slate-300 font-medium block mb-1.5">
                    Opcionais e Personalizações:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 cursor-pointer hover:border-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedCustomizations["Escudo TPU 3D"]}
                        onChange={(e) =>
                          setSelectedCustomizations((prev) => ({
                            ...prev,
                            "Escudo TPU 3D": e.target.checked,
                          }))
                        }
                        className="rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <span>Escudo TPU 3D (+R$ 15)</span>
                    </label>

                    {/* Nome: Opcional sem custo */}
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 cursor-pointer hover:border-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedCustomizations["Nome Individual"]}
                        onChange={(e) =>
                          setSelectedCustomizations((prev) => ({
                            ...prev,
                            "Nome Individual": e.target.checked,
                          }))
                        }
                        className="rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <span>Nome</span>
                    </label>

                    {/* Número: Opcional sem custo */}
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 cursor-pointer hover:border-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedCustomizations["Número Individual"]}
                        onChange={(e) =>
                          setSelectedCustomizations((prev) => ({
                            ...prev,
                            "Número Individual": e.target.checked,
                          }))
                        }
                        className="rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <span>Número</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Quantidade, Valor Orçado e Prazo Desejado */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">Qtd. Total de Peças *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={totalQuantity}
                    onChange={(e) => setTotalQuantity(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium flex items-center justify-between">
                    <span>Valor Orçado (R$) *</span>
                    <span className="text-[10px] text-sky-400 font-normal">Cálculo automático</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">Prazo Desejado</label>
                  <input
                    type="date"
                    value={desiredDeadline}
                    onChange={(e) => setDesiredDeadline(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Autorização por PIN para pedidos abaixo de 10 peças */}
              {Number(totalQuantity) >= 1 && Number(totalQuantity) < 10 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                      <KeyRound className="h-4 w-4 text-amber-400 shrink-0" />
                      <span>Autorização Gerencial Obrigatória ({totalQuantity} peças &lt; 10)</span>
                    </div>
                    {isEditMode && currentApproval && currentApproval.qty === Number(totalQuantity) ? (
                      <span className="flex items-center gap-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 text-[11px] font-bold">
                        <ShieldCheck className="h-3.5 w-3.5" /> Aprovado
                      </span>
                    ) : (
                      <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 text-[11px] font-bold">
                        Requer PIN
                      </span>
                    )}
                  </div>

                  {isEditMode && currentApproval && currentApproval.qty === Number(totalQuantity) ? (
                    <div className="text-[11px] text-emerald-200/90 bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-800/50">
                      Esta quantidade já possui aprovação registrada por <strong>{currentApproval.by || "Gestor/Administrador"}</strong>
                      {currentApproval.at && ` em ${new Date(currentApproval.at).toLocaleString("pt-BR")}`}. Se a quantidade não for alterada, não é necessário redigitar o PIN.
                    </div>
                  ) : (
                    <>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Pedidos com menos de 10 peças exigem a validação de um Gestor ou Administrador através do seu PIN de segurança.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="text-[11px] text-slate-400 block mb-1">Gestor / Administrador:</label>
                          <select
                            value={selectedManagerId}
                            onChange={(e) => setSelectedManagerId(e.target.value)}
                            className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none"
                          >
                            <option value="">Qualquer Gestor ou Administrador</option>
                            {eligibleManagers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.role})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-400 block mb-1">PIN de Autorização *:</label>
                          <input
                            type="password"
                            maxLength={8}
                            placeholder="Digite o PIN (4 a 6 dígitos)"
                            value={managerPin}
                            onChange={(e) => setManagerPin(e.target.value)}
                            className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs text-slate-300 font-medium">Produtos Solicitados</label>
                <input
                  type="text"
                  value={productsSummary}
                  onChange={(e) => setProductsSummary(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  placeholder="Ex: 50x Regata Confort Esportiva (Dry Fit Tradicional)"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">Briefing Inicial para o Designer</label>
                <textarea
                  rows={3}
                  value={briefingText}
                  onChange={(e) => setBriefingText(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  placeholder="Descreva cores desejadas, escudo, referências visuais e ideias do cliente..."
                />
              </div>

              {/* SEÇÃO DE ARQUIVOS ANEXOS MULTIPLOS COM PROGRESSO E RETRY */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Paperclip className="h-4 w-4 text-sky-400" />
                      Anexar Arquivos e Referências Visuais
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Formatos: PNG, JPG, JPEG, PDF, CDR, PSD, AI e outros | Limite: até 3GB por arquivo
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-950 hover:bg-sky-900 border border-sky-800 text-xs font-semibold text-sky-300 cursor-pointer transition w-fit">
                    <UploadCloud className="h-3.5 w-3.5" />
                    Selecionar Arquivos
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleFilesSelected}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Anexos já existentes da ficha (modo edição) */}
                {existingAttachments.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-slate-400 block">
                      Anexos Já Vinculados ({existingAttachments.length}):
                    </span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {existingAttachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                            <span className="text-slate-200 truncate font-mono text-[11px]" title={att.fileName}>
                              {att.originalName || att.fileName}
                            </span>
                            {att.fileSize && (
                              <span className="text-[10px] text-slate-500">
                                ({formatFileSize(att.fileSize)})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => api.downloadFile(att.fileUrl, att.originalName || att.fileName)}
                              className="text-sky-400 hover:text-sky-300 p-1"
                              title="Baixar arquivo original"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteExistingAttachment(att.id)}
                              className="text-rose-400 hover:text-rose-300 p-1"
                              title="Remover anexo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fila de arquivos selecionados para envio com barra de progresso */}
                {uploadQueue.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[11px] font-semibold text-slate-400 block">
                      Novos Arquivos Selecionados ({uploadQueue.length}):
                    </span>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {uploadQueue.map((item) => (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 truncate">
                              <Paperclip className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="text-slate-200 truncate font-mono text-[11px]" title={item.name}>
                                {item.name}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                ({formatFileSize(item.size)})
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.status === "uploading" && (
                                <span className="text-[10px] text-sky-400 font-mono animate-pulse">
                                  Enviando {item.progress}%
                                </span>
                              )}
                              {item.status === "success" && (
                                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                                  <CheckCircle className="h-3 w-3" /> Concluído
                                </span>
                              )}
                              {item.status === "error" && (
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-semibold text-rose-400">Falha</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRetryUpload(item.id)}
                                    className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-medium transition"
                                  >
                                    Reenviar
                                  </button>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveQueueItem(item.id)}
                                className="text-slate-500 hover:text-rose-400 p-0.5"
                                title="Remover da lista"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Barra de progresso */}
                          {item.status === "uploading" && (
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-sky-500 h-full transition-all duration-200"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                          )}

                          {item.status === "error" && item.error && (
                            <p className="text-[10px] text-rose-300">{item.error}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition shadow-lg shadow-sky-600/30 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  {isEditMode ? "Salvar Alterações" : "Criar Solicitação"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETALHES COMPLETOS DA OPORTUNIDADE (EXIBE TODOS OS DADOS DA IMAGEM) */}
      {selectedQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-sky-400 bg-sky-950 px-2 py-0.5 rounded border border-sky-800">
                    {selectedQuotation.quotationNumber}
                  </span>
                  <span className="text-xs font-semibold text-slate-400">
                    Status: <strong className="text-sky-300">{selectedQuotation.status}</strong>
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white mt-1.5">{selectedQuotation.teamName}</h3>
                <p className="text-xs text-slate-400">
                  Vendedor Responsável: <strong className="text-slate-200">{selectedQuotation.seller?.name || "Eu"}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(selectedQuotation)}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition"
                >
                  <Edit className="h-3.5 w-3.5 text-sky-400" />
                  Editar Ficha
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSheetQuotationId(selectedQuotation.id);
                    setIsSheetModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-sky-950 hover:bg-sky-900 border border-sky-800 px-3 py-1.5 text-xs font-semibold text-sky-300 transition"
                  title="Abrir Ficha Universal do Pedido"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver Ficha Completa
                </button>

                <button
                  onClick={() => setSelectedQuotation(null)}
                  className="rounded-lg bg-slate-800 p-2 text-slate-400 hover:text-white transition"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* AÇÕES DE AVANÇO RÁPIDO DO KANBAN */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 mr-2">Mover Status:</span>
              {selectedQuotation.status === "NOVA_SOLICITACAO" && (
                <button
                  onClick={() => handleMoveStatus(selectedQuotation.id, "ORCAMENTO_PREPARACAO")}
                  className="rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 text-xs font-medium hover:bg-indigo-600 hover:text-white transition"
                >
                  Em Preparação →
                </button>
              )}
              {selectedQuotation.status === "ORCAMENTO_PREPARACAO" && (
                <button
                  onClick={() => handleMoveStatus(selectedQuotation.id, "ORCAMENTO_ENVIADO")}
                  className="rounded bg-amber-600/20 text-amber-300 border border-amber-500/30 px-3 py-1 text-xs font-medium hover:bg-amber-600 hover:text-white transition"
                >
                  Orçamento Enviado →
                </button>
              )}
              {selectedQuotation.status === "ORCAMENTO_ENVIADO" && (
                <button
                  onClick={() => handleMoveStatus(selectedQuotation.id, "SOLICITACAO_ARTE")}
                  className="rounded bg-purple-600/20 text-purple-300 border border-purple-500/30 px-3 py-1 text-xs font-medium hover:bg-purple-600 hover:text-white transition"
                >
                  Enviar ao Designer (Solicitação de Arte) →
                </button>
              )}

              {/* AGUARDANDO APROVAÇÃO DA ARTE: Decisão do cliente */}
              {selectedQuotation.status === "AGUARDANDO_APROVACAO_ARTE" && (
                (!currentUser || currentUser.role === "ADMIN" || currentUser.role === "GESTOR" || selectedQuotation.sellerId === currentUser.id) ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenRevisionModal(selectedQuotation)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600/20 text-rose-300 border border-rose-500/40 hover:bg-rose-600 hover:text-white px-3 py-1.5 text-xs font-semibold shadow-sm transition"
                      title="Solicitar alterações ao designer responsável com base no parecer do cliente"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Alteração de arte
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenReviewApproveModal(selectedQuotation)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600 hover:text-white px-3 py-1.5 text-xs font-semibold shadow-sm transition"
                      title="Revisar ficha e registrar aprovação formal da arte pelo cliente"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Arte aprovada
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500 italic">
                    Apenas o vendedor responsável ({selectedQuotation.seller?.name || "titular"}) ou Gestão podem registrar a decisão sobre a arte.
                  </span>
                )
              )}

              {/* ARTE EM ALTERAÇÃO */}
              {selectedQuotation.status === "ARTE_EM_ALTERACAO" && (
                <span className="text-xs text-rose-400 font-medium flex items-center gap-1.5 bg-rose-950/40 border border-rose-800/60 px-3 py-1 rounded-lg">
                  <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                  Arte em Alteração: Devolvida para a fila do Designer ({selectedQuotation.designer?.name || "Designer"})
                </span>
              )}

              {/* ORCAMENTO APROVADO */}
              {selectedQuotation.status === "ORCAMENTO_APROVADO" && (
                <>
                  {selectedQuotation.isArtworkApproved ? (
                    (!currentUser || currentUser.role === "ADMIN" || currentUser.role === "GESTOR" || selectedQuotation.sellerId === currentUser.id) && (
                      <button
                        type="button"
                        onClick={() => handleOpenReviewApproveModal(selectedQuotation, true)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 text-xs font-semibold shadow-md shadow-emerald-600/30 transition"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        Encaminhar ao Próximo Setor (Gerar OP)
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => handleMoveStatus(selectedQuotation.id, "SOLICITACAO_ARTE")}
                      className="rounded bg-purple-600/20 text-purple-300 border border-purple-500/30 px-3 py-1 text-xs font-medium hover:bg-purple-600 hover:text-white transition"
                    >
                      Solicitar Arte →
                    </button>
                  )}
                </>
              )}

              {selectedQuotation.status === "CONVERTIDA_VENDA" && (
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1 bg-emerald-950/40 border border-emerald-800/60 px-3 py-1 rounded-lg">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Convertida em OP e encaminhada ao SAC Interno
                </span>
              )}
            </div>

            {/* SEÇÃO DA ARTE DESENVOLVIDA / VERSÕES ENVIADAS PARA APROVAÇÃO */}
            {selectedQuotation.designBrief?.versions && selectedQuotation.designBrief.versions.length > 0 && (() => {
              const versions = selectedQuotation.designBrief.versions;
              const latestVersion = versions[0];
              const previousVersions = versions.slice(1);

              return (
                <div className="rounded-xl border border-purple-500/30 bg-purple-950/15 p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-purple-900/40 pb-2">
                    <div className="flex items-center gap-2">
                      <Palette className="h-4 w-4 text-purple-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">
                        Versão da Arte Enviada para Aprovação
                      </h4>
                    </div>
                    <span className="rounded bg-purple-900/60 border border-purple-700/50 px-2 py-0.5 text-[11px] font-bold text-purple-200">
                      v{latestVersion.versionNumber} ({versions.length} {versions.length === 1 ? "versão" : "versões"})
                    </span>
                  </div>

                  {/* Card da Versão Atual */}
                  <div className="rounded-lg bg-slate-950/80 border border-slate-800 p-3.5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-white bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">
                          Versão {latestVersion.versionNumber}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            latestVersion.status === "APPROVED"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : latestVersion.status === "REVISION_REQUESTED"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                          }`}
                        >
                          {latestVersion.status === "APPROVED"
                            ? "Arte Aprovada"
                            : latestVersion.status === "REVISION_REQUESTED"
                            ? "Alteração Solicitada"
                            : "Aguardando Aprovação do Cliente"}
                        </span>
                      </div>

                      {latestVersion.previewUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            api.downloadFile(
                              latestVersion.previewUrl,
                              `arte-v${latestVersion.versionNumber}-${selectedQuotation.teamName || selectedQuotation.quotationNumber}.png`
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 text-xs font-semibold shadow-md shadow-sky-600/30 transition self-start sm:self-auto"
                          title="Baixar arte original em alta resolução para apresentar ao cliente"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Baixar arte (v{latestVersion.versionNumber})
                        </button>
                      )}
                    </div>

                    <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                      <span>
                        Arte-finalista / Designer:{" "}
                        <strong className="text-slate-200">
                          {latestVersion.designer?.name || selectedQuotation.designer?.name || "Designer"}
                        </strong>
                      </span>
                      <span>
                        Data de envio:{" "}
                        <strong className="text-slate-200">
                          {new Date(latestVersion.createdAt).toLocaleString("pt-BR")}
                        </strong>
                      </span>
                    </div>

                    {latestVersion.changeNotes && (
                      <div className="text-xs bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 text-slate-300">
                        <span className="text-slate-400 font-semibold block text-[11px] mb-0.5">Notas do Designer:</span>
                        {latestVersion.changeNotes}
                      </div>
                    )}

                    {/* Preview Thumbnail */}
                    {latestVersion.previewUrl && (
                      <div className="flex justify-center p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                        <img
                          src={api.getAuthenticatedFileUrl(latestVersion.previewUrl)}
                          alt={`Mockup da Arte v${latestVersion.versionNumber}`}
                          className="max-h-60 rounded object-contain border border-slate-700 bg-slate-950"
                        />
                      </div>
                    )}
                  </div>

                  {/* Histórico das Versões Anteriores */}
                  {previousVersions.length > 0 && (
                    <div className="pt-2 border-t border-purple-900/40 space-y-2">
                      <span className="text-[11px] font-semibold text-slate-400 block">
                        Histórico de Versões Anteriores ({previousVersions.length}):
                      </span>
                      <div className="space-y-2">
                        {previousVersions.map((prevVer: any) => (
                          <div
                            key={prevVer.id}
                            className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                                v{prevVer.versionNumber}
                              </span>
                              <div>
                                <p className="text-slate-200 font-medium">{prevVer.changeNotes || "Versão enviada"}</p>
                                <span className="text-[11px] text-slate-500">
                                  {prevVer.designer?.name || "Designer"} · {new Date(prevVer.createdAt).toLocaleDateString("pt-BR")}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                  prevVer.status === "APPROVED"
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : prevVer.status === "REVISION_REQUESTED"
                                    ? "bg-rose-500/20 text-rose-300"
                                    : "bg-slate-700 text-slate-300"
                                }`}
                              >
                                {prevVer.status === "APPROVED"
                                  ? "Aprovada"
                                  : prevVer.status === "REVISION_REQUESTED"
                                  ? "Ajustada"
                                  : "Submetida"}
                              </span>
                              {prevVer.previewUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    api.downloadFile(
                                      prevVer.previewUrl,
                                      `arte-v${prevVer.versionNumber}-${selectedQuotation.teamName || selectedQuotation.quotationNumber}.png`
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-1 text-[11px] text-sky-400 font-semibold transition"
                                  title="Baixar esta versão anterior"
                                >
                                  <Download className="h-3 w-3" />
                                  Baixar
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* DADOS COMPLETOS DA FICHA DE PRÉ-VENDA (CONFORME IMAGEM DE REFERÊNCIA) */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 border-b border-slate-800 pb-2">
                Dados da Pré-Venda
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">Cliente / Empresa</span>
                  <strong className="text-white text-sm">{selectedQuotation.customer?.companyName || "N/A"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Contato Responsável</span>
                  <strong className="text-white text-sm">{selectedQuotation.customer?.contactName || "N/A"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Telefone / WhatsApp</span>
                  <strong className="text-white text-sm">{selectedQuotation.customer?.phone || "N/A"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Nome do Time / Equipe</span>
                  <strong className="text-white text-sm">{selectedQuotation.teamName}</strong>
                </div>
              </div>

              {/* Especificações do Modelo e Opcionais */}
              {selectedQuotation.items && selectedQuotation.items.length > 0 && (() => {
                const item = selectedQuotation.items[0];
                return (
                  <div className="pt-2 border-t border-slate-800/80 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 block mb-0.5">Modelo do Catálogo</span>
                        <strong className="text-white">
                          {item.isCustomModel
                            ? `Outros: ${item.customModelName || item.productModel}`
                            : item.productModel}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 block mb-0.5">Tecido Recomendado</span>
                        <strong className="text-white">
                          {item.isCustomFabric
                            ? `Outros: ${item.customFabricName || item.fabricType}`
                            : item.fabricType || "Dry Fit Tradicional"}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-slate-400 block mb-0.5">Tipo de Gola</span>
                        <strong className="text-white">
                          {item.isCustomCollar
                            ? `Outros: ${item.customCollarName || item.collarType}`
                            : item.collarType || "Gola Careca"}
                        </strong>
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-400 text-xs block mb-1">Opcionais e Personalizações:</span>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {item.customizationNotes ? (
                          item.customizationNotes.split(",").map((c: string, idx: number) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-medium"
                            >
                              {c.trim()}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 italic text-xs">Nenhum opcional selecionado</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Quantidade, Valor e Prazo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80 text-xs">
                <div>
                  <span className="text-slate-400 block">Qtd. Total de Peças</span>
                  <strong className="text-white text-base">{selectedQuotation.totalQuantity} pcs</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Valor Orçado</span>
                  <strong className="text-emerald-400 text-base">
                    R$ {Number(selectedQuotation.budgetAmount || 0).toFixed(2)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Prazo Desejado</span>
                  <strong className="text-amber-300 text-sm">
                    {selectedQuotation.desiredDeadline
                      ? new Date(selectedQuotation.desiredDeadline).toLocaleDateString("pt-BR")
                      : "A definir"}
                  </strong>
                </div>
              </div>

              {/* Produtos Solicitados */}
              {selectedQuotation.productsSummary && (
                <div className="pt-2 border-t border-slate-800/80 text-xs">
                  <span className="text-slate-400 block mb-1 font-medium">Produtos Solicitados:</span>
                  <p className="text-slate-200 bg-slate-900 p-2 rounded-lg border border-slate-800">
                    {selectedQuotation.productsSummary}
                  </p>
                </div>
              )}

              {/* Briefing Inicial para o Designer */}
              <div className="pt-2 border-t border-slate-800/80 text-xs">
                <span className="text-slate-400 block mb-1 font-medium">Briefing Inicial para o Designer:</span>
                <p className="text-slate-300 bg-slate-900 p-2.5 rounded-lg border border-slate-800 whitespace-pre-wrap leading-relaxed">
                  {selectedQuotation.designBrief?.briefingText || selectedQuotation.observations || "Sem briefing detalhado."}
                </p>
              </div>

              {/* Anexos da Ficha com Download Seguro */}
              <div className="pt-2 border-t border-slate-800/80 text-xs space-y-2">
                <span className="text-slate-400 block font-medium">
                  Arquivos Anexados ({selectedQuotation.attachments?.length || 0}):
                </span>
                {selectedQuotation.attachments && selectedQuotation.attachments.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedQuotation.attachments.map((att: any) => (
                      <div
                        key={att.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileCheck className="h-4 w-4 text-sky-400 shrink-0" />
                          <span className="text-slate-200 truncate font-mono text-[11px]" title={att.fileName}>
                            {att.originalName || att.fileName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => api.downloadFile(att.fileUrl, att.originalName || att.fileName)}
                          className="flex items-center gap-1 rounded bg-sky-950 hover:bg-sky-900 border border-sky-800 px-2 py-1 text-[11px] font-semibold text-sky-300 transition shrink-0 ml-2"
                          title="Baixar arquivo original"
                        >
                          <Download className="h-3 w-3" />
                          Baixar
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 italic text-xs">Nenhum arquivo anexado a esta pré-venda.</p>
                )}
              </div>

              {/* Autorização Gerencial para menos de 10 peças */}
              {selectedQuotation.minQtyApprovedQuantity ? (
                <div className="pt-2 border-t border-slate-800/80 text-xs">
                  <span className="text-slate-400 block mb-1 font-medium">Autorização Gerencial (Pedido &lt; 10 peças):</span>
                  <div className="rounded-lg bg-emerald-950/40 border border-emerald-800/60 p-2.5 text-emerald-300 space-y-1">
                    <div className="flex items-center gap-2 font-semibold">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      <span>Autorizado para {selectedQuotation.minQtyApprovedQuantity} peças</span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Autorizado por <strong>{selectedQuotation.minQtyAuthorizedBy?.name || "Gestor/Administrador"}</strong>
                      {selectedQuotation.minQtyAuthorizedAt && ` em ${new Date(selectedQuotation.minQtyAuthorizedAt).toLocaleString("pt-BR")}`}
                      {selectedQuotation.minQtyRequestedBy?.name && ` · Solicitado por ${selectedQuotation.minQtyRequestedBy.name}`}
                    </p>
                  </div>
                </div>
              ) : selectedQuotation.totalQuantity < 10 ? (
                <div className="pt-2 border-t border-slate-800/80 text-xs">
                  <span className="text-slate-400 block mb-1 font-medium">Autorização Gerencial (Pedido &lt; 10 peças):</span>
                  <div className="rounded-lg bg-amber-950/40 border border-amber-800/60 p-2.5 text-amber-300 flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-amber-400 shrink-0" />
                    <span>Pendente de autorização por PIN de Gestor/Admin para {selectedQuotation.totalQuantity} peças.</span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* TIMELINE DE HISTÓRICO COM USUÁRIO, DATA E HORA */}
            <div className="border-t border-slate-800 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-sky-400" />
                Histórico & Auditoria de Encaminhamentos
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {selectedQuotation.timeline?.map((t: any) => (
                  <div key={t.id} className="text-xs border-l-2 border-sky-500 pl-3 py-1 bg-slate-950/40 rounded-r-lg">
                    <div className="flex items-center gap-2 text-slate-400">
                      <span className="font-semibold text-white">{t.user?.name || "Sistema"}</span>
                      <span>•</span>
                      <span>{new Date(t.createdAt).toLocaleString("pt-BR")}</span>
                    </div>
                    <p className="text-slate-300 mt-0.5">{t.notes}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SOLICITAÇÃO DE ALTERAÇÃO DE ARTE PELO CLIENTE */}
      {isRevisionModalOpen && selectedQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-rose-900/60 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-rose-500/10 p-2 border border-rose-500/30">
                  <RotateCcw className="h-5 w-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Solicitar Alteração na Arte</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {selectedQuotation.quotationNumber} — {selectedQuotation.teamName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRevisionModalOpen(false)}
                className="rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {revisionError && (
              <div className="rounded-lg bg-rose-500/15 p-3 text-xs text-rose-300 border border-rose-500/30 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{revisionError}</span>
              </div>
            )}

            <div className="rounded-lg bg-slate-950/70 border border-slate-800 p-3 text-xs space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>Versão avaliada:</span>
                <strong className="text-white font-mono">
                  v{selectedQuotation.designBrief?.versions?.[0]?.versionNumber || 1}
                </strong>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Arte-finalista registrado:</span>
                <strong className="text-purple-300">
                  {selectedQuotation.designer?.name ||
                    selectedQuotation.designBrief?.versions?.[0]?.designer?.name ||
                    "Designer responsável"}
                </strong>
              </div>
            </div>

            <form onSubmit={handleSubmitRevision} className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1">
                  Descreva detalhadamente o ajuste solicitado pelo cliente: *
                </label>
                <textarea
                  required
                  rows={4}
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  placeholder="Ex: O cliente solicitou alterar o tom do azul para royal, mover o logotipo do peito 3cm para cima e ajustar a tipografia do número..."
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none placeholder-slate-500"
                />
                <span className="text-[11px] text-slate-500 block mt-1">
                  A ficha retornará para a fila do mesmo arte-finalista em "Arte em Alteração".
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRevisionModalOpen(false)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                  disabled={isSubmittingRevision}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRevision || revisionNotes.trim().length < 3}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-600/30 transition"
                >
                  {isSubmittingRevision ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Devolver ao Designer para Alteração
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REVISÃO DA FICHA & APROVAÇÃO DA ARTE */}
      {isReviewApproveModalOpen && selectedQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-emerald-900/60 p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-emerald-500/10 p-2 border border-emerald-500/30">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Revisão da Ficha & Aprovação da Arte</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {selectedQuotation.quotationNumber} — {selectedQuotation.teamName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewApproveModalOpen(false)}
                className="rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {approvalError && (
              <div className="rounded-lg bg-rose-500/15 p-3 text-xs text-rose-300 border border-rose-500/30 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{approvalError}</span>
              </div>
            )}

            {/* SEÇÃO 1: ARTE APROVADA */}
            {selectedQuotation.designBrief?.versions && selectedQuotation.designBrief.versions.length > 0 && (() => {
              const currentVer = selectedQuotation.designBrief.versions[0];
              return (
                <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        Arte Versão {currentVer.versionNumber} (v{currentVer.versionNumber})
                      </span>
                      <span className="text-xs text-slate-400">
                        Designer:{" "}
                        <strong className="text-slate-200">
                          {currentVer.designer?.name || selectedQuotation.designer?.name || "Designer"}
                        </strong>
                      </span>
                    </div>
                    {currentVer.previewUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          api.downloadFile(
                            currentVer.previewUrl,
                            `arte-v${currentVer.versionNumber}-${selectedQuotation.teamName || selectedQuotation.quotationNumber}.png`
                          )
                        }
                        className="inline-flex items-center gap-1 rounded bg-sky-950 hover:bg-sky-900 border border-sky-800 px-2.5 py-1 text-xs font-semibold text-sky-300 transition"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Baixar arte
                      </button>
                    )}
                  </div>

                  {currentVer.previewUrl && (
                    <div className="flex justify-center p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <img
                        src={api.getAuthenticatedFileUrl(currentVer.previewUrl)}
                        alt={`Arte v${currentVer.versionNumber}`}
                        className="max-h-52 rounded object-contain border border-slate-700"
                      />
                    </div>
                  )}

                  {currentVer.changeNotes && (
                    <p className="text-xs text-slate-300 bg-slate-900/80 p-2 rounded border border-slate-800">
                      <strong className="text-slate-400">Notas da versão: </strong>
                      {currentVer.changeNotes}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* SEÇÃO 2: DADOS DO PEDIDO PARA CONFERÊNCIA */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 border-b border-slate-800 pb-1.5">
                Conferência dos Dados da Pré-Venda
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block">Cliente / Empresa:</span>
                  <strong className="text-white">{selectedQuotation.customer?.companyName || "N/A"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Contato:</span>
                  <strong className="text-white">{selectedQuotation.customer?.contactName || "N/A"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Telefone:</span>
                  <strong className="text-white">{selectedQuotation.customer?.phone || "N/A"}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Time / Equipe:</span>
                  <strong className="text-white">{selectedQuotation.teamName}</strong>
                </div>
              </div>

              {selectedQuotation.items && selectedQuotation.items.length > 0 && (() => {
                const item = selectedQuotation.items[0];
                return (
                  <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <span className="text-slate-400 block">Modelo:</span>
                      <strong className="text-slate-200">
                        {item.isCustomModel ? `Outros: ${item.customModelName || item.productModel}` : item.productModel}
                      </strong>
                    </div>
                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <span className="text-slate-400 block">Tecido / Gola:</span>
                      <strong className="text-slate-200">
                        {item.isCustomFabric ? `Outros: ${item.customFabricName || item.fabricType}` : item.fabricType || "Dry Fit"} ·{" "}
                        {item.isCustomCollar ? `Outros: ${item.customCollarName || item.collarType}` : item.collarType || "Gola Careca"}
                      </strong>
                    </div>
                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <span className="text-slate-400 block">Quantidade & Total:</span>
                      <strong className="text-emerald-400">
                        {selectedQuotation.totalQuantity} peças · R$ {Number(selectedQuotation.budgetAmount || 0).toFixed(2)}
                      </strong>
                    </div>
                  </div>
                );
              })()}

              <div className="pt-2 border-t border-slate-800/80 text-xs">
                <span className="text-slate-400 block mb-1">Briefing Inicial do Designer:</span>
                <p className="text-slate-300 bg-slate-900 p-2 rounded border border-slate-800 whitespace-pre-wrap">
                  {selectedQuotation.designBrief?.briefingText || selectedQuotation.observations || "Sem briefing detalhado."}
                </p>
              </div>

              {selectedQuotation.attachments && selectedQuotation.attachments.length > 0 && (
                <div className="pt-2 border-t border-slate-800/80 text-xs space-y-1.5">
                  <span className="text-slate-400 block font-medium">
                    Anexos e Referências ({selectedQuotation.attachments.length}):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {selectedQuotation.attachments.map((att: any) => (
                      <div
                        key={att.id}
                        className="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800 text-[11px]"
                      >
                        <span className="text-slate-300 truncate max-w-[200px]" title={att.originalName || att.fileName}>
                          {att.originalName || att.fileName}
                        </span>
                        <button
                          type="button"
                          onClick={() => api.downloadFile(att.fileUrl, att.originalName || att.fileName)}
                          className="flex items-center gap-1 text-sky-400 hover:text-sky-300 font-semibold px-2 py-0.5 rounded bg-sky-950 border border-sky-800"
                        >
                          <Download className="h-3 w-3" /> Baixar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO 3: FORMULÁRIO DE APROVAÇÃO E ENCAMINHAMENTO */}
            <form onSubmit={handleSubmitReviewApprove} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium block">
                    Nome da Pessoa que Aprovou *
                  </label>
                  <input
                    type="text"
                    required
                    value={approvedByPerson}
                    onChange={(e) => setApprovedByPerson(e.target.value)}
                    placeholder="Ex: João da Silva (Presidente)"
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium block">
                    Observações da Aprovação
                  </label>
                  <input
                    type="text"
                    value={approvalNotes}
                    onChange={(e) => setApprovalNotes(e.target.value)}
                    placeholder="Ex: Arte conferida e aprovada sem ressalvas pelo cliente."
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* OPÇÃO DE ENCAMINHAMENTO IMEDIATO AO PRÓXIMO SETOR */}
              <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 p-3.5 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forwardToProduction}
                    onChange={(e) => setForwardToProduction(e.target.checked)}
                    className="h-4 w-4 rounded border-emerald-500/50 bg-slate-900 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-semibold text-emerald-300">
                    Encaminhar imediatamente ao próximo setor (SAC Interno / Gerar Ordem de Produção)
                  </span>
                </label>

                {forwardToProduction && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-emerald-900/40">
                    <div>
                      <label className="text-xs text-slate-300 font-medium block">
                        Prazo Prometido de Entrega *
                      </label>
                      <input
                        type="date"
                        required={forwardToProduction}
                        value={promisedDeliveryDate}
                        onChange={(e) => setPromisedDeliveryDate(e.target.value)}
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-300 font-medium block">
                        Notas Técnicas para a Produção
                      </label>
                      <input
                        type="text"
                        value={technicalNotes}
                        onChange={(e) => setTechnicalNotes(e.target.value)}
                        placeholder="Ex: Uniforme para campeonato. Cuidar alinhamento do escudo."
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsReviewApproveModalOpen(false)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                  disabled={isSubmittingApproval}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingApproval || !approvedByPerson.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-600/30 transition"
                >
                  {isSubmittingApproval ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                      Processando...
                    </>
                  ) : forwardToProduction ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confirmar Aprovação e Encaminhar ao SAC Interno
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confirmar Aprovação da Arte
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL FICHA UNIVERSAL DO PEDIDO */}
      <UniversalOrderSheetModal
        isOpen={isSheetModalOpen}
        onClose={() => {
          setIsSheetModalOpen(false);
          setSheetQuotationId(null);
        }}
        quotationId={sheetQuotationId || undefined}
        currentUser={currentUser || { id: "", name: "Vendedor", role: "VENDEDOR", hasPin: true }}
      />
    </div>
  );
}
