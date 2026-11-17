import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  TrendingDown,
  Building2,
  Calendar,
  Search,
  Filter,
  Plus,
  ArrowRight,
  RefreshCw,
  Info,
  Clock,
  Layers,
  Check,
  Eye,
} from "lucide-react";
import { api } from "../services/api.js";
import { User, DefectType, QualityDefectReport } from "../types.js";
import { UniversalOrderSheetModal } from "./UniversalOrderSheetModal.js";

interface Sector13QualidadePanelProps {
  currentUser: User | null;
}

export function Sector13QualidadePanel({ currentUser }: Sector13QualidadePanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<"queue" | "indicators" | "defectTypes">("queue");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Fila de Lotes em Qualidade
  const [queueBatches, setQueueBatches] = useState<any[]>([]);
  const [queueMetrics, setQueueMetrics] = useState({
    totalBatches: 0,
    pendingCount: 0,
    reworkCount: 0,
    totalPieces: 0,
  });

  // Tipos de Defeito
  const [defectTypes, setDefectTypes] = useState<DefectType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);

  // Modal de Novo Tipo de Defeito (Admin/Gestor)
  const [isNewTypeModalOpen, setIsNewTypeModalOpen] = useState(false);
  const [newTypeCode, setNewTypeCode] = useState("");
  const [newTypeName, setNewTypeName] = useState("");
  const [isSubmittingType, setIsSubmittingType] = useState(false);

  // Modal de Inspeção
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);
  const [isInspectionModalOpen, setIsInspectionModalOpen] = useState(false);
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [selectedSheetBatchId, setSelectedSheetBatchId] = useState<string | null>(null);
  const [inspectionResult, setInspectionResult] = useState<"APPROVED_TOTAL" | "APPROVED_PARTIAL" | "REJECTED_TOTAL">("APPROVED_TOTAL");
  const [totalApproved, setTotalApproved] = useState<number>(0);
  const [totalDefective, setTotalDefective] = useState<number>(0);
  const [reworkTargetSector, setReworkTargetSector] = useState<string>("COSTURA");
  const [reworkReason, setReworkReason] = useState<string>("");
  const [inspectionNotes, setInspectionNotes] = useState<string>("");
  const [inspectionPin, setInspectionPin] = useState<string>("");
  const [isSubmittingInspection, setIsSubmittingInspection] = useState(false);

  // Apontamento detalhado de defeitos no modal
  const [defectEntries, setDefectEntries] = useState<{ id: string; defectTypeId: string; size: string; quantity: number }[]>([]);
  const [currentDefectTypeId, setCurrentDefectTypeId] = useState<string>("");
  const [currentDefectSize, setCurrentDefectSize] = useState<string>("M");
  const [currentDefectQty, setCurrentDefectQty] = useState<number>(1);

  // Relatório de Indicadores
  const [defectReport, setDefectReport] = useState<QualityDefectReport | null>(null);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [loadingReport, setLoadingReport] = useState(false);

  const isGestorOrAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "GESTOR";

  // Carregar fila de lotes em Qualidade
  const loadQueue = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get<any>("/production/queue/QUALIDADE");
      const batches = res.batches || [];
      setQueueBatches(batches);

      const totalBatches = batches.length;
      const pendingCount = batches.filter((b: any) => b.batchStatus === "PENDING" || b.batchStatus === "WAITING").length;
      const reworkCount = batches.filter((b: any) => b.isUnderRework).length;
      const totalPieces = batches.reduce((sum: number, b: any) => sum + (b.quantity || 0), 0);

      setQueueMetrics({
        totalBatches,
        pendingCount,
        reworkCount,
        totalPieces,
      });
    } catch (err: any) {
      console.error("Erro ao carregar fila da Qualidade:", err);
      setError(err.message || "Erro ao carregar fila do Setor 13 (Qualidade).");
    } finally {
      setLoading(false);
    }
  };

  // Carregar tipos de defeito
  const loadDefectTypes = async () => {
    try {
      setLoadingTypes(true);
      const res = await api.get<any>("/production/quality/defect-types");
      setDefectTypes(res.defectTypes || []);
    } catch (err: any) {
      console.error("Erro ao carregar tipos de defeito:", err);
    } finally {
      setLoadingTypes(false);
    }
  };

  // Carregar relatório de defeitos por oficina
  const loadDefectReport = async () => {
    try {
      setLoadingReport(true);
      const params = new URLSearchParams();
      if (filterFrom) params.append("from", filterFrom);
      if (filterTo) params.append("to", filterTo);
      const query = params.toString() ? `?${params.toString()}` : "";

      const res = await api.get<QualityDefectReport>(`/production/quality/defect-report${query}`);
      setDefectReport(res);
    } catch (err: any) {
      console.error("Erro ao carregar relatório de defeitos:", err);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    loadQueue();
    loadDefectTypes();
  }, []);

  useEffect(() => {
    if (activeSubTab === "indicators") {
      loadDefectReport();
    }
  }, [activeSubTab]);

  // Abrir modal de inspeção
  const handleOpenInspection = (batch: any) => {
    setSelectedBatch(batch);
    setInspectionResult("APPROVED_TOTAL");
    setTotalApproved(batch.quantity);
    setTotalDefective(0);
    setReworkTargetSector("COSTURA");
    setReworkReason("");
    setInspectionNotes("");
    setInspectionPin("");
    setDefectEntries([]);
    setCurrentDefectTypeId(defectTypes[0]?.id || "");
    setCurrentDefectSize("M");
    setCurrentDefectQty(1);
    setIsInspectionModalOpen(true);
  };

  // Ajustar totais quando altera o resultado
  const handleResultChange = (newResult: "APPROVED_TOTAL" | "APPROVED_PARTIAL" | "REJECTED_TOTAL") => {
    setInspectionResult(newResult);
    if (!selectedBatch) return;

    if (newResult === "APPROVED_TOTAL") {
      setTotalApproved(selectedBatch.quantity);
      setTotalDefective(0);
      setDefectEntries([]);
    } else if (newResult === "REJECTED_TOTAL") {
      setTotalApproved(0);
      setTotalDefective(selectedBatch.quantity);
    } else if (newResult === "APPROVED_PARTIAL") {
      // Padrão de divisão inicial proporcional
      const half = Math.floor(selectedBatch.quantity / 2);
      setTotalApproved(selectedBatch.quantity - half);
      setTotalDefective(half);
    }
  };

  // Adicionar defeito ao checklist
  const handleAddDefect = () => {
    if (!currentDefectTypeId || currentDefectQty <= 0) return;
    const newEntry = {
      id: Math.random().toString(36).substring(7),
      defectTypeId: currentDefectTypeId,
      size: currentDefectSize,
      quantity: Number(currentDefectQty),
    };
    setDefectEntries([...defectEntries, newEntry]);
  };

  // Remover defeito do checklist
  const handleRemoveDefect = (id: string) => {
    setDefectEntries(defectEntries.filter((d) => d.id !== id));
  };

  // Submeter inspeção de qualidade
  const handleSubmitInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    setError("");
    setSuccessMessage("");

    // Validações no cliente
    if (totalApproved + totalDefective !== selectedBatch.quantity) {
      setError(`A soma de aprovadas (${totalApproved}) e defeituosas (${totalDefective}) deve ser exatamente igual a ${selectedBatch.quantity}.`);
      return;
    }

    if (totalDefective > 0) {
      const sumDefects = defectEntries.reduce((sum, d) => sum + d.quantity, 0);
      if (sumDefects !== totalDefective) {
        setError(`A soma das quantidades de defeitos apontados (${sumDefects}) deve ser igual ao total de defeituosas (${totalDefective}).`);
        return;
      }
      if (!reworkReason.trim()) {
        setError("Justificativa de retrabalho é obrigatória para peças reprovadas.");
        return;
      }
    }

    if (!inspectionPin || inspectionPin.length < 4) {
      setError("PIN de assinatura digital é obrigatório (mínimo 4 dígitos).");
      return;
    }

    try {
      setIsSubmittingInspection(true);
      const payload = {
        pin: inspectionPin,
        result: inspectionResult,
        totalApproved: Number(totalApproved),
        totalDefective: Number(totalDefective),
        reworkTargetSectorCode: totalDefective > 0 ? reworkTargetSector : undefined,
        reworkReason: totalDefective > 0 ? reworkReason : undefined,
        notes: inspectionNotes || undefined,
        defects: defectEntries.map((d) => ({
          defectTypeId: d.defectTypeId,
          size: d.size,
          quantity: d.quantity,
        })),
      };

      const res = await api.post<any>(`/production/batches/${selectedBatch.id}/quality-inspection`, payload);
      setSuccessMessage(res.message || "Inspeção de qualidade registrada com sucesso!");
      setIsInspectionModalOpen(false);
      loadQueue();
      if (activeSubTab === "indicators") loadDefectReport();
    } catch (err: any) {
      console.error("Erro ao enviar inspeção:", err);
      setError(err.message || "Erro ao registrar inspeção de qualidade.");
    } finally {
      setIsSubmittingInspection(false);
    }
  };

  // Cadastrar novo tipo de defeito (Admin/Gestor)
  const handleCreateDefectType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeCode.trim() || !newTypeName.trim()) return;

    try {
      setIsSubmittingType(true);
      setError("");
      await api.post("/production/quality/defect-types", {
        code: newTypeCode,
        name: newTypeName,
      });
      setSuccessMessage("Novo tipo de defeito cadastrado com sucesso!");
      setIsNewTypeModalOpen(false);
      setNewTypeCode("");
      setNewTypeName("");
      loadDefectTypes();
    } catch (err: any) {
      console.error("Erro ao criar tipo de defeito:", err);
      setError(err.message || "Erro ao cadastrar tipo de defeito.");
    } finally {
      setIsSubmittingType(false);
    }
  };

  // Alternar status ativo/inativo do tipo de defeito
  const handleToggleDefectType = async (typeId: string) => {
    try {
      setError("");
      const res = await api.patch<any>(`/production/quality/defect-types/${typeId}/toggle`);
      setSuccessMessage(res.message || "Status alterado com sucesso!");
      loadDefectTypes();
    } catch (err: any) {
      console.error("Erro ao alternar status do tipo de defeito:", err);
      setError(err.message || "Erro ao atualizar tipo de defeito.");
    }
  };

  const sumDefectEntries = defectEntries.reduce((sum, d) => sum + d.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  SETOR 13
                </span>
                <h1 className="text-2xl font-bold text-white">Qualidade Pós-Costura</h1>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                Inspeção minuciosa de peças, controle de defeitos por oficina, assinaturas digitais HMAC e retorno para retrabalho.
              </p>
            </div>
          </div>

          {/* Sub-Abas de Navegação Interna */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveSubTab("queue")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeSubTab === "queue"
                  ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Fila de Inspeção ({queueMetrics.totalBatches})
            </button>
            <button
              onClick={() => setActiveSubTab("indicators")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeSubTab === "indicators"
                  ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              Indicadores por Oficina
            </button>
            <button
              onClick={() => setActiveSubTab("defectTypes")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeSubTab === "defectTypes"
                  ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Tipos de Defeito ({defectTypes.length})
            </button>
          </div>
        </div>

        {/* Mensagens de Sucesso ou Erro */}
        {error && (
          <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError("")} className="text-rose-400 hover:text-rose-200 font-bold">×</button>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage("")} className="text-emerald-400 hover:text-emerald-200 font-bold">×</button>
          </div>
        )}
      </div>

      {/* SUB-ABA 1: FILA DE INSPEÇÃO */}
      {activeSubTab === "queue" && (
        <div className="space-y-6">
          {/* Métricas Rápidas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Lotes para Inspecionar</div>
              <div className="text-2xl font-bold text-white mt-1">{queueMetrics.totalBatches}</div>
              <div className="text-xs text-slate-500 mt-0.5">Disponíveis na Qualidade</div>
            </div>
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
              <div className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">Total de Peças a Inspecionar</div>
              <div className="text-2xl font-bold text-indigo-300 mt-1">{queueMetrics.totalPieces}</div>
              <div className="text-xs text-slate-500 mt-0.5">Soma física dos lotes</div>
            </div>
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
              <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Aguardando Avaliação</div>
              <div className="text-2xl font-bold text-amber-300 mt-1">{queueMetrics.pendingCount}</div>
              <div className="text-xs text-slate-500 mt-0.5">Status PENDING / WAITING</div>
            </div>
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
              <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Lotes em Retrabalho</div>
              <div className="text-2xl font-bold text-rose-300 mt-1">{queueMetrics.reworkCount}</div>
              <div className="text-xs text-slate-500 mt-0.5">Vindos de correção</div>
            </div>
          </div>

          {/* Lista de Lotes em Inspeção */}
          <div className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold text-white">Lotes Posicionados para Inspeção de Qualidade</h3>
              </div>
              <button
                onClick={loadQueue}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Atualizar Fila
              </button>
            </div>

            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-400 mb-2" />
                Carregando lotes da Qualidade...
              </div>
            ) : queueBatches.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle2 className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-slate-300">Nenhum lote pendente de inspeção</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Todos os lotes vindos da Costura foram inspecionados ou encaminhados para a Expedição / Retrabalho.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-xs font-semibold text-slate-400">
                      <th className="py-3 px-4">Lote / OP</th>
                      <th className="py-3 px-4">Cliente / Produto</th>
                      <th className="py-3 px-4 text-center">Quantidade</th>
                      <th className="py-3 px-4">Status / Condição</th>
                      <th className="py-3 px-4">Entrada no Setor</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {queueBatches.map((batch: any) => (
                      <tr key={batch.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">{batch.batchNumber}</div>
                          <div className="text-xs text-slate-400 font-mono">{batch.productionOrder?.opNumber}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-200 font-medium">{batch.productionOrder?.customer?.companyName || "Cliente"}</div>
                          <div className="text-xs text-slate-400">{batch.productionOrder?.title || batch.productionOrder?.productType}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {batch.quantity} pçs
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="px-2 py-0.5 text-xs rounded font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {batch.batchStatus}
                            </span>
                            {batch.isUnderRework && (
                              <span className="px-2 py-0.5 text-xs rounded font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Em Retrabalho: {batch.reworkReason || "Reprovado anteriormente"}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-400">
                          {new Date(batch.updatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSheetBatchId(batch.id);
                              setIsSheetModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 transition-all mr-1.5"
                            title="Ver Ficha Universal do Pedido"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Ficha
                          </button>
                          <button
                            onClick={() => handleOpenInspection(batch)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm transition-all"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Inspecionar Lote
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-ABA 2: INDICADORES POR OFICINA */}
      {activeSubTab === "indicators" && (
        <div className="space-y-6">
          {/* Filtros de Período */}
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>Período de Inspeção:</span>
              </div>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg focus:border-indigo-500 focus:outline-none"
              />
              <span className="text-xs text-slate-400">até</span>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={loadDefectReport}
                disabled={loadingReport}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
              >
                Filtrar
              </button>
              {(filterFrom || filterTo) && (
                <button
                  onClick={() => { setFilterFrom(""); setFilterTo(""); setTimeout(loadDefectReport, 50); }}
                  className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Limpar
                </button>
              )}
            </div>
            <button
              onClick={loadDefectReport}
              disabled={loadingReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingReport ? "animate-spin" : ""}`} />
              Recarregar Relatório
            </button>
          </div>

          {/* Cards de Resumo Consolidado */}
          {defectReport && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Inspeções Realizadas</div>
                <div className="text-2xl font-bold text-white mt-1">{defectReport.summary.totalInspections}</div>
              </div>
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Peças Inspecionadas</div>
                <div className="text-2xl font-bold text-white mt-1">{defectReport.summary.totalInspected}</div>
              </div>
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
                <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Peças Aprovadas</div>
                <div className="text-2xl font-bold text-emerald-300 mt-1">{defectReport.summary.totalApproved}</div>
              </div>
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
                <div className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Peças Defeituosas</div>
                <div className="text-2xl font-bold text-rose-300 mt-1">{defectReport.summary.totalDefective}</div>
              </div>
              <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
                <div className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">Taxa Geral de Defeito</div>
                <div className={`text-2xl font-bold mt-1 ${defectReport.summary.defectRate > 5 ? "text-rose-400" : "text-emerald-400"}`}>
                  {defectReport.summary.defectRate}%
                </div>
              </div>
            </div>
          )}

          {/* Tabela de Oficinas */}
          <div className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <h3 className="font-semibold text-white">Desempenho e Defeitos por Oficina de Costura</h3>
            </div>

            {loadingReport ? (
              <div className="p-12 text-center text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-400 mb-2" />
                Computando indicadores de qualidade...
              </div>
            ) : !defectReport || defectReport.workshops.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Info className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400">Nenhum dado de inspeção encontrado para o período selecionado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-xs font-semibold text-slate-400">
                      <th className="py-3 px-4">Oficina / Célula</th>
                      <th className="py-3 px-4 text-center">Tipo</th>
                      <th className="py-3 px-4 text-center">Inspecionadas</th>
                      <th className="py-3 px-4 text-center">Aprovadas</th>
                      <th className="py-3 px-4 text-center">Defeituosas</th>
                      <th className="py-3 px-4 text-center">Taxa de Defeito</th>
                      <th className="py-3 px-4">Principais Defeitos Apontados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {defectReport.workshops.map((w, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 text-slate-200">
                        <td className="py-3 px-4 font-semibold text-white">
                          {w.partnerName}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                            w.partnerType === "INTERNAL" ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          }`}>
                            {w.partnerType === "INTERNAL" ? "Interna" : "Externa"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-medium text-slate-300">{w.totalInspected}</td>
                        <td className="py-3 px-4 text-center font-medium text-emerald-400">{w.totalApproved}</td>
                        <td className="py-3 px-4 text-center font-medium text-rose-400">{w.totalDefective}</td>
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <span className={`font-bold ${w.defectRate > 5 ? "text-rose-400" : "text-emerald-400"}`}>
                              {w.defectRate}%
                            </span>
                            <div className="w-16 bg-slate-800 h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${w.defectRate > 5 ? "bg-rose-500" : "bg-emerald-500"}`}
                                style={{ width: `${Math.min(w.defectRate, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {w.topDefects.length === 0 ? (
                            <span className="text-xs text-slate-500">Nenhum defeito</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {w.topDefects.slice(0, 3).map((d, dIdx) => (
                                <span
                                  key={dIdx}
                                  className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded text-xs"
                                >
                                  {d.name}: {d.count} pçs
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-ABA 3: TIPOS DE DEFEITO */}
      {activeSubTab === "defectTypes" && (
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">Catálogo de Tipos de Defeito</h3>
                <p className="text-xs text-slate-400">Tipos de anomalias padronizados para apontamento na inspeção.</p>
              </div>
              {isGestorOrAdmin && (
                <button
                  onClick={() => setIsNewTypeModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Tipo de Defeito
                </button>
              )}
            </div>

            {loadingTypes ? (
              <div className="p-12 text-center text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-400 mb-2" />
                Carregando tipos de defeito...
              </div>
            ) : defectTypes.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                Nenhum tipo de defeito cadastrado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-xs font-semibold text-slate-400">
                      <th className="py-3 px-4">Código</th>
                      <th className="py-3 px-4">Descrição do Defeito</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {defectTypes.map((dt) => (
                      <tr key={dt.id} className="hover:bg-slate-800/40 text-slate-200">
                        <td className="py-3 px-4 font-mono font-bold text-xs text-indigo-300">{dt.code}</td>
                        <td className="py-3 px-4 text-white font-medium">{dt.name}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                            dt.isActive ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-slate-800 text-slate-400 border border-slate-700"
                          }`}>
                            {dt.isActive ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isGestorOrAdmin && (
                            <button
                              onClick={() => handleToggleDefectType(dt.id)}
                              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                                dt.isActive
                                  ? "text-rose-400 hover:bg-rose-500/10 border border-rose-500/20"
                                  : "text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20"
                              }`}
                            >
                              {dt.isActive ? "Desativar" : "Ativar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE INSPEÇÃO DE QUALIDADE */}
      {isInspectionModalOpen && selectedBatch && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 max-w-2xl w-full p-6 my-8 text-white">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-white text-lg">Inspeção de Qualidade — Lote {selectedBatch.batchNumber}</h3>
                  <p className="text-xs text-slate-400">
                    OP: {selectedBatch.productionOrder?.opNumber} • Total do Lote: <strong className="text-white">{selectedBatch.quantity} peças</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsInspectionModalOpen(false)}
                className="text-slate-400 hover:text-white text-xl font-bold"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitInspection} className="mt-4 space-y-4">
              {/* Escolha da Decisão de Inspeção */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Decisão de Inspeção:</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleResultChange("APPROVED_TOTAL")}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                      inspectionResult === "APPROVED_TOTAL"
                        ? "border-emerald-500/50 bg-emerald-500/10 ring-2 ring-emerald-500/20"
                        : "border-slate-800 bg-slate-950 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400">Aprovação Total</span>
                      {inspectionResult === "APPROVED_TOTAL" && <Check className="w-4 h-4 text-emerald-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">100% aprovado para Expedição</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleResultChange("APPROVED_PARTIAL")}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                      inspectionResult === "APPROVED_PARTIAL"
                        ? "border-amber-500/50 bg-amber-500/10 ring-2 ring-amber-500/20"
                        : "border-slate-800 bg-slate-950 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-400">Aprovação Parcial</span>
                      {inspectionResult === "APPROVED_PARTIAL" && <Check className="w-4 h-4 text-amber-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Fraciona aprovadas e retrabalho</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleResultChange("REJECTED_TOTAL")}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                      inspectionResult === "REJECTED_TOTAL"
                        ? "border-rose-500/50 bg-rose-500/10 ring-2 ring-rose-500/20"
                        : "border-slate-800 bg-slate-950 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-400">Reprovação Total</span>
                      {inspectionResult === "REJECTED_TOTAL" && <Check className="w-4 h-4 text-rose-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">Retorna lote inteiro</p>
                  </button>
                </div>
              </div>

              {/* Contagem de Peças Aprovadas e Defeituosas */}
              <div className="grid grid-cols-2 gap-4 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Peças Aprovadas (OK):</label>
                  <input
                    type="number"
                    min="0"
                    max={selectedBatch.quantity}
                    value={totalApproved}
                    disabled={inspectionResult !== "APPROVED_PARTIAL"}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setTotalApproved(val);
                      setTotalDefective(selectedBatch.quantity - val);
                    }}
                    className="w-full px-3 py-2 text-sm font-bold text-emerald-400 bg-slate-900 border border-slate-700 rounded-lg focus:border-emerald-500 focus:outline-none disabled:bg-slate-950 disabled:text-emerald-400/60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Peças com Defeito:</label>
                  <input
                    type="number"
                    min="0"
                    max={selectedBatch.quantity}
                    value={totalDefective}
                    disabled={inspectionResult !== "APPROVED_PARTIAL"}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setTotalDefective(val);
                      setTotalApproved(selectedBatch.quantity - val);
                    }}
                    className="w-full px-3 py-2 text-sm font-bold text-rose-400 bg-slate-900 border border-slate-700 rounded-lg focus:border-rose-500 focus:outline-none disabled:bg-slate-950 disabled:text-rose-400/60"
                  />
                </div>
                <div className="col-span-2 flex items-center justify-between text-xs text-slate-400">
                  <span>Soma atual: <strong className="text-white">{totalApproved + totalDefective}</strong> / {selectedBatch.quantity} peças</span>
                  {totalApproved + totalDefective === selectedBatch.quantity ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Soma coerente
                    </span>
                  ) : (
                    <span className="text-rose-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Divergência na soma
                    </span>
                  )}
                </div>
              </div>

              {/* Apontamento de Defeitos (se houver peças com defeito) */}
              {totalDefective > 0 && (
                <div className="p-4 bg-rose-500/10 rounded-xl border border-rose-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-300 uppercase tracking-wide">
                      Checklist de Defeitos por Tamanho
                    </span>
                    <span className={`text-xs font-semibold ${sumDefectEntries === totalDefective ? "text-emerald-400" : "text-rose-400"}`}>
                      Apontados: {sumDefectEntries} / {totalDefective} peças
                    </span>
                  </div>

                  {/* Formulário para adicionar defeito */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2">
                      <select
                        value={currentDefectTypeId}
                        onChange={(e) => setCurrentDefectTypeId(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg focus:border-rose-500 focus:outline-none"
                      >
                        {defectTypes.filter((dt) => dt.isActive).map((dt) => (
                          <option key={dt.id} value={dt.id} className="bg-slate-900 text-white">
                            {dt.name} ({dt.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <select
                        value={currentDefectSize}
                        onChange={(e) => setCurrentDefectSize(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg focus:border-rose-500 focus:outline-none"
                      >
                        {["PP", "P", "M", "G", "GG", "XG", "U"].map((sz) => (
                          <option key={sz} value={sz} className="bg-slate-900 text-white">Tam {sz}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        min="1"
                        value={currentDefectQty}
                        onChange={(e) => setCurrentDefectQty(Math.max(1, Number(e.target.value)))}
                        className="w-16 px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg font-bold text-center focus:border-rose-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddDefect}
                        className="flex-1 px-2.5 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-500 transition-colors shadow-sm"
                      >
                        + Adicionar
                      </button>
                    </div>
                  </div>

                  {/* Lista de Defeitos Apontados */}
                  {defectEntries.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {defectEntries.map((def) => {
                        const typeObj = defectTypes.find((t) => t.id === def.defectTypeId);
                        return (
                          <div
                            key={def.id}
                            className="flex items-center justify-between bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs"
                          >
                            <span className="text-slate-300">
                              <strong className="text-white">{typeObj?.name || "Defeito"}</strong> — Tam {def.size}: <strong className="text-rose-400">{def.quantity} pçs</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveDefect(def.id)}
                              className="text-rose-400 hover:text-rose-300 font-bold px-1"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Seletor de Setor de Retrabalho */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Setor de Retrabalho:</label>
                      <select
                        value={reworkTargetSector}
                        onChange={(e) => setReworkTargetSector(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg font-medium focus:border-rose-500 focus:outline-none"
                      >
                        <option value="COSTURA" className="bg-slate-900 text-white">12. Costura (Padrão)</option>
                        <option value="DESPACHE_OFICINA" className="bg-slate-900 text-white">11. Despache para Oficina</option>
                        <option value="SEPARACAO" className="bg-slate-900 text-white">10. Separação</option>
                        <option value="CALANDRA" className="bg-slate-900 text-white">09. Calandra</option>
                        <option value="INFESTO" className="bg-slate-900 text-white">08. Infesto</option>
                        <option value="IMPRESSAO" className="bg-slate-900 text-white">07. Impressão</option>
                        <option value="DIAGRAMACAO" className="bg-slate-900 text-white">06. Diagramação</option>
                        <option value="PRE_DIAGRAMACAO" className="bg-slate-900 text-white">05. Pré-Diagramação</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Justificativa do Retrabalho:</label>
                      <input
                        type="text"
                        placeholder="Ex: Refazer costura torta na barra..."
                        value={reworkReason}
                        onChange={(e) => setReworkReason(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg focus:border-rose-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Observações Gerais */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Observações da Inspeção (Opcional):</label>
                <textarea
                  rows={2}
                  placeholder="Informações técnicas adicionais observadas na inspeção..."
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* PIN de Assinatura Digital HMAC */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  PIN de Assinatura Digital do Inspetor:
                </label>
                <input
                  type="password"
                  maxLength={6}
                  placeholder="PIN de 4 a 6 dígitos"
                  value={inspectionPin}
                  onChange={(e) => setInspectionPin(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 text-white rounded-lg tracking-widest text-center focus:border-indigo-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Gera assinatura digital criptografada HMAC-SHA-256 e registra auditoria imutável.
                </p>
              </div>

              {/* Ações */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsInspectionModalOpen(false)}
                  disabled={isSubmittingInspection}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingInspection}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
                >
                  {isSubmittingInspection ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Registrando e Assinando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Concluir Inspeção & Assinar
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE NOVO TIPO DE DEFEITO (ADMIN/GESTOR) */}
      {isNewTypeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 max-w-md w-full p-6 text-white animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white">Cadastrar Novo Tipo de Defeito</h3>
              <button onClick={() => setIsNewTypeModalOpen(false)} className="text-slate-400 hover:text-white text-xl font-bold">×</button>
            </div>

            <form onSubmit={handleCreateDefectType} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Código (Identificador Único):</label>
                <input
                  type="text"
                  placeholder="Ex: BOTAO_SOLTO, ZIPER_DEFEITUOSO"
                  value={newTypeCode}
                  onChange={(e) => setNewTypeCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-700 text-white rounded-lg uppercase focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Descrição do Defeito:</label>
                <input
                  type="text"
                  placeholder="Ex: Botão solto ou frouxo na gola polo"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewTypeModalOpen(false)}
                  disabled={isSubmittingType}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingType || !newTypeCode.trim() || !newTypeName.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-all"
                >
                  {isSubmittingType ? "Cadastrando..." : "Cadastrar Tipo de Defeito"}
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
          setSelectedSheetBatchId(null);
        }}
        batchId={selectedSheetBatchId || undefined}
        currentUser={currentUser || { id: "", name: "Qualidade", role: "OPERADOR", hasPin: true }}
      />
    </div>
  );
}
