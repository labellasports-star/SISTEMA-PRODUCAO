import React, { useState, useEffect } from "react";
import {
  Scissors,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  TrendingUp,
  History,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  Search,
  Filter,
  Check,
  Calendar,
  Building2,
  Info,
  Eye,
} from "lucide-react";
import { api } from "../services/api.js";
import { User, SewingReceipt, SewingYieldPartnerReport } from "../types.js";
import { UniversalOrderSheetModal } from "./UniversalOrderSheetModal.js";

interface Sector12CosturaPanelProps {
  currentUser: User | null;
}

export function Sector12CosturaPanel({ currentUser }: Sector12CosturaPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<"queue" | "yield">("queue");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Fila de Lotes em Costura
  const [queueBatches, setQueueBatches] = useState<any[]>([]);
  const [queueMetrics, setQueueMetrics] = useState({
    totalBatches: 0,
    waitingCount: 0,
    inProgressCount: 0,
    completedCount: 0,
  });

  // Modal de Recebimento
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);
  const [selectedManifest, setSelectedManifest] = useState<any | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptGrid, setReceiptGrid] = useState<Record<string, { ok: number; missing: number; damaged: number }>>({});
  const [receiptNotes, setReceiptNotes] = useState("");
  const [receiptPin, setReceiptPin] = useState("");
  const [isSubmittingReceipt, setIsSubmittingReceipt] = useState(false);

  // Modal de Histórico de Recebimentos
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [batchReceipts, setBatchReceipts] = useState<SewingReceipt[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Ficha Universal
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [selectedSheetBatchId, setSelectedSheetBatchId] = useState<string | null>(null);

  // Modal Fechar com Divergência (Gestor/Admin)
  const [isDivergenceModalOpen, setIsDivergenceModalOpen] = useState(false);
  const [divergenceJustification, setDivergenceJustification] = useState("");
  const [divergencePin, setDivergencePin] = useState("");
  const [isSubmittingDivergence, setIsSubmittingDivergence] = useState(false);

  // Modal Avançar para Qualidade
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [forwardPin, setForwardPin] = useState("");
  const [forwardNotes, setForwardNotes] = useState("");
  const [isSubmittingForward, setIsSubmittingForward] = useState(false);

  // Relatório de Rendimento
  const [yieldReports, setYieldReports] = useState<SewingYieldPartnerReport[]>([]);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [loadingYield, setLoadingYield] = useState(false);

  // Carregar dados da fila operacional
  const loadQueue = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await api.get("/production/queue/COSTURA");
      setQueueBatches(res.batches || []);
      setQueueMetrics({
        totalBatches: res.totalBatches || 0,
        waitingCount: res.waitingCount || 0,
        inProgressCount: res.inProgressCount || 0,
        completedCount: res.completedCount || 0,
      });
    } catch (err: any) {
      console.error("Erro ao carregar fila da Costura:", err);
      setError(err.message || "Erro ao carregar fila da Costura.");
    } finally {
      setLoading(false);
    }
  };

  // Carregar relatório de rendimento
  const loadYieldReport = async () => {
    try {
      setLoadingYield(true);
      setError("");

      let query = "";
      const params = new URLSearchParams();
      if (filterFrom) params.append("from", filterFrom);
      if (filterTo) params.append("to", filterTo);
      if (params.toString()) query = `?${params.toString()}`;

      const res = await api.get(`/production/sewing/yield-report${query}`);
      setYieldReports(res.reports || []);
    } catch (err: any) {
      console.error("Erro ao carregar relatório de rendimento:", err);
      setError(err.message || "Erro ao carregar relatório de rendimento.");
    } finally {
      setLoadingYield(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === "queue") {
      loadQueue();
    } else {
      loadYieldReport();
    }
  }, [activeSubTab]);

  // Abrir modal de recebimento
  const handleOpenReceiptModal = async (batch: any) => {
    try {
      setSelectedBatch(batch);
      setReceiptNotes("");
      setReceiptPin("");
      setError("");
      setSuccessMessage("");

      // Buscar romaneio e recebimentos do lote
      const res = await api.get(`/production/batches/${batch.id}/sewing-receipts`);
      setSelectedManifest(res.manifest);
      setBatchReceipts(res.receipts || []);

      // Inicializar grade de tamanhos baseada no romaneio
      let sizeGridSent: Record<string, number> = {};
      try {
        sizeGridSent = JSON.parse(res.manifest.sizeGridBreakdown);
      } catch {
        sizeGridSent = {};
      }

      // Calcular o que já foi recebido por tamanho
      const alreadyReceivedPerSize: Record<string, number> = {};
      (res.receipts || []).forEach((r: SewingReceipt) => {
        r.items.forEach((it) => {
          alreadyReceivedPerSize[it.size] =
            (alreadyReceivedPerSize[it.size] || 0) +
            it.quantityReceivedOk +
            it.quantityMissing +
            it.quantityDamaged;
        });
      });

      const initialGrid: Record<string, { ok: number; missing: number; damaged: number }> = {};
      Object.keys(sizeGridSent).forEach((size) => {
        const sent = sizeGridSent[size] || 0;
        const accounted = alreadyReceivedPerSize[size] || 0;
        const remaining = Math.max(0, sent - accounted);

        initialGrid[size] = {
          ok: remaining,
          missing: 0,
          damaged: 0,
        };
      });

      setReceiptGrid(initialGrid);
      setIsReceiptModalOpen(true);
    } catch (err: any) {
      console.error("Erro ao carregar dados do romaneio:", err);
      setError(err.message || "Não foi possível carregar os dados do romaneio para recebimento.");
    }
  };

  // Abrir histórico de recebimentos
  const handleOpenHistoryModal = async (batch: any) => {
    try {
      setSelectedBatch(batch);
      setLoadingHistory(true);
      setError("");

      const res = await api.get(`/production/batches/${batch.id}/sewing-receipts`);
      setSelectedManifest(res.manifest);
      setBatchReceipts(res.receipts || []);
      setIsHistoryModalOpen(true);
    } catch (err: any) {
      console.error("Erro ao carregar histórico:", err);
      setError(err.message || "Erro ao carregar histórico de recebimentos.");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Submeter novo recebimento
  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    try {
      setIsSubmittingReceipt(false);
      setError("");

      const items = Object.entries(receiptGrid).map(([size, counts]) => ({
        size,
        quantityReceivedOk: Number(counts.ok) || 0,
        quantityMissing: Number(counts.missing) || 0,
        quantityDamaged: Number(counts.damaged) || 0,
      }));

      const totalItems = items.reduce(
        (sum, it) => sum + it.quantityReceivedOk + it.quantityMissing + it.quantityDamaged,
        0
      );

      if (totalItems <= 0) {
        setError("Informe ao menos uma peça recebida (OK, faltante ou danificada).");
        return;
      }

      setIsSubmittingReceipt(true);

      const res = await api.post(`/production/batches/${selectedBatch.id}/sewing-receipt`, {
        pin: receiptPin,
        items,
        notes: receiptNotes,
      });

      setSuccessMessage(res.message || "Recebimento registrado com sucesso!");
      setIsReceiptModalOpen(false);
      loadQueue();
    } catch (err: any) {
      console.error("Erro ao registrar recebimento:", err);
      setError(err.message || "Falha ao registrar recebimento da costura.");
    } finally {
      setIsSubmittingReceipt(false);
    }
  };

  // Submeter fechamento com divergência
  const handleSubmitDivergence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    try {
      setIsSubmittingDivergence(true);
      setError("");

      await api.post(`/production/batches/${selectedBatch.id}/close-receipt`, {
        pin: divergencePin,
        justification: divergenceJustification,
      });

      setSuccessMessage("Romaneio encerrado com divergência autorizada com sucesso!");
      setIsDivergenceModalOpen(false);
      loadQueue();
    } catch (err: any) {
      console.error("Erro ao fechar com divergência:", err);
      setError(err.message || "Falha ao fechar romaneio com divergência.");
    } finally {
      setIsSubmittingDivergence(false);
    }
  };

  // Submeter avanço para Qualidade
  const handleSubmitForward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    try {
      setIsSubmittingForward(true);
      setError("");

      await api.post(`/production/batches/${selectedBatch.id}/complete-and-forward`, {
        pin: forwardPin,
        notes: forwardNotes || "Avanço de Costura para Qualidade pós-costura",
      });

      setSuccessMessage(`Lote ${selectedBatch.batchNumber} encaminhado com sucesso para a Qualidade!`);
      setIsForwardModalOpen(false);
      loadQueue();
    } catch (err: any) {
      console.error("Erro ao avançar lote:", err);
      setError(err.message || "Falha ao encaminhar lote para a Qualidade.");
    } finally {
      setIsSubmittingForward(false);
    }
  };

  // Helpers de cálculos
  const calculateModalTotals = () => {
    if (!selectedManifest) return { currentInputTotal: 0, sentTotal: 0 };
    const currentInputTotal = Object.values(receiptGrid).reduce(
      (sum, c) => sum + (Number(c.ok) || 0) + (Number(c.missing) || 0) + (Number(c.damaged) || 0),
      0
    );
    return {
      currentInputTotal,
      sentTotal: selectedManifest.totalQuantity || 0,
    };
  };

  const isUserGestorOrAdmin = currentUser?.role === "ADMIN" || currentUser?.role === "GESTOR";

  return (
    <div className="space-y-6">
      {/* CABEÇALHO DO SETOR 12 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink-500/20 text-pink-400 font-mono font-bold text-xs border border-pink-500/30">
              12
            </span>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              Setor 12: Costura (Recebimento & Controle)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Conferência física de retorno das oficinas terceirizadas, controle de perdas e liberação para inspeção de Qualidade.
          </p>
        </div>

        {/* NAVEGAÇÃO DE SUB-ABAS */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveSubTab("queue")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              activeSubTab === "queue"
                ? "bg-pink-600 text-white shadow-md shadow-pink-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Scissors className="h-3.5 w-3.5" />
            Fila Operacional ({queueBatches.length})
          </button>
          <button
            onClick={() => setActiveSubTab("yield")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
              activeSubTab === "yield"
                ? "bg-pink-600 text-white shadow-md shadow-pink-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Rendimento por Oficina
          </button>
        </div>
      </div>

      {/* ALERTAS */}
      {error && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-300 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-rose-400" />
          <div>
            <p className="font-semibold">Atenção na Operação:</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm text-emerald-300 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-emerald-400" />
          <div>
            <p className="font-semibold">Operação Concluída:</p>
            <p className="text-xs mt-0.5">{successMessage}</p>
          </div>
        </div>
      )}

      {/* SUB-ABA 1: FILA OPERACIONAL */}
      {activeSubTab === "queue" && (
        <div className="space-y-6">
          {/* CARDS DE RESUMO */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Lotes em Costura</span>
              <p className="text-2xl font-bold text-white mt-1">{queueMetrics.totalBatches}</p>
            </div>
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
              <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider">Aguardando Oficina</span>
              <p className="text-2xl font-bold text-amber-300 mt-1">{queueMetrics.waitingCount}</p>
            </div>
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
              <span className="text-[11px] font-medium text-sky-400 uppercase tracking-wider">Recebimento Parcial</span>
              <p className="text-2xl font-bold text-sky-300 mt-1">{queueMetrics.inProgressCount}</p>
            </div>
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
              <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">Prontos p/ Qualidade</span>
              <p className="text-2xl font-bold text-emerald-300 mt-1">
                {queueBatches.filter((b) => b.dispatchManifests?.[0]?.isReceiptClosed).length}
              </p>
            </div>
          </div>

          {/* TABELA DA FILA */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scissors className="h-4 w-4 text-pink-400" />
                <h3 className="text-sm font-bold text-white">Lotes em Atendimento Externo / Oficina</h3>
              </div>
              <button
                onClick={loadQueue}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition border border-slate-700"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Atualizar Fila
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Lote / OP</th>
                    <th className="py-3 px-4">Oficina Parceira</th>
                    <th className="py-3 px-4">Romaneio</th>
                    <th className="py-3 px-4 text-center">Enviadas</th>
                    <th className="py-3 px-4">Retorno Previsto</th>
                    <th className="py-3 px-4 text-center">Status Recebimento</th>
                    <th className="py-3 px-4 text-right">Ações Operacionais</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {queueBatches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Nenhum lote aguardando ou em processo de recebimento na Costura.
                      </td>
                    </tr>
                  ) : (
                    queueBatches.map((batch) => {
                      const manifest = batch.dispatchManifests?.[0];
                      const isClosed = manifest?.isReceiptClosed;
                      const receiptStatus = manifest?.receiptStatus || "PENDING";

                      return (
                        <tr key={batch.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3.5 px-4">
                            <span className="font-mono font-bold text-white block">{batch.batchNumber}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {batch.productionOrder?.opNumber || "OP"} - {batch.productionOrder?.productType || "Produto"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                              <span className="font-semibold text-slate-200">
                                {manifest?.sewingPartner?.name || "Oficina não vinculada"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-purple-300">
                            {manifest?.manifestNumber || "Sem Romaneio"}
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono font-bold text-white">
                            {batch.quantity} pcs
                          </td>
                          <td className="py-3.5 px-4">
                            {manifest?.expectedReturnDate ? (
                              <div className="flex items-center gap-1 text-[11px]">
                                <Calendar className="h-3 w-3 text-slate-400" />
                                <span>{new Date(manifest.expectedReturnDate).toLocaleDateString()}</span>
                              </div>
                            ) : (
                              <span className="text-slate-500">-</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {isClosed ? (
                              receiptStatus === "CLOSED_WITH_DIVERGENCE" ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                                  Fechado c/ Divergência
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                                  Recebimento Concluído
                                </span>
                              )
                            ) : receiptStatus === "PARTIALLY_RECEIVED" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300 border border-sky-500/30">
                                Recebimento Parcial
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-500/30">
                                Aguardando Retorno
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Ficha Universal */}
                              <button
                                onClick={() => {
                                  setSelectedSheetBatchId(batch.id);
                                  setIsSheetModalOpen(true);
                                }}
                                title="Ver Ficha Universal do Pedido"
                                className="p-1.5 rounded-lg bg-sky-950/60 hover:bg-sky-900 text-sky-400 transition border border-sky-800/80"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>

                              {/* Histórico */}
                              <button
                                onClick={() => handleOpenHistoryModal(batch)}
                                title="Ver Histórico de Recebimentos"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700"
                              >
                                <History className="h-3.5 w-3.5" />
                              </button>

                              {/* Receber Peças (habilitado se não fechado) */}
                              {!isClosed && (
                                <button
                                  onClick={() => handleOpenReceiptModal(batch)}
                                  className="px-2.5 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-semibold text-[11px] shadow-sm transition"
                                >
                                  Receber Peças
                                </button>
                              )}

                              {/* Fechar com divergência (GESTOR / ADMIN se aberto) */}
                              {!isClosed && isUserGestorOrAdmin && (
                                <button
                                  onClick={() => {
                                    setSelectedBatch(batch);
                                    setDivergenceJustification("");
                                    setDivergencePin("");
                                    setIsDivergenceModalOpen(true);
                                  }}
                                  className="px-2 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600 hover:text-white text-amber-300 font-semibold text-[11px] border border-amber-500/30 transition"
                                >
                                  Fechar Divergência
                                </button>
                              )}

                              {/* Avançar para Qualidade (habilitado APENAS se fechado) */}
                              {isClosed ? (
                                <button
                                  onClick={() => {
                                    setSelectedBatch(batch);
                                    setForwardPin("");
                                    setForwardNotes("");
                                    setIsForwardModalOpen(true);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] shadow-md shadow-emerald-600/30 flex items-center gap-1 transition"
                                >
                                  <span>P/ Qualidade</span>
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              ) : (
                                <button
                                  disabled
                                  title="Avanço bloqueado até o fechamento total do recebimento"
                                  className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-500 text-[11px] cursor-not-allowed border border-slate-800"
                                >
                                  Bloqueado
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-ABA 2: PAINEL DE RENDIMENTO POR OFICINA */}
      {activeSubTab === "yield" && (
        <div className="space-y-6">
          {/* FILTRO DE PERÍODO */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col sm:flex-row items-end gap-3">
            <div className="flex-1 w-full">
              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Data Início (De)</label>
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Data Fim (Até)</label>
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
            </div>
            <button
              onClick={loadYieldReport}
              disabled={loadingYield}
              className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-semibold text-xs shadow-md transition flex items-center justify-center gap-1.5"
            >
              <Filter className="h-3.5 w-3.5" />
              Filtrar Rendimento
            </button>
          </div>

          {/* TABELA DE RENDIMENTO */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Indicadores de Desempenho e Retorno das Oficinas</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {yieldReports.length} oficina(s) com remessas registradas
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Oficina Parceira</th>
                    <th className="py-3 px-4 text-center">Remessas</th>
                    <th className="py-3 px-4 text-center">Total Enviadas</th>
                    <th className="py-3 px-4 text-center">Recebidas OK</th>
                    <th className="py-3 px-4 text-center">Faltantes</th>
                    <th className="py-3 px-4 text-center">Danificadas</th>
                    <th className="py-3 px-4 text-center">Rendimento (%)</th>
                    <th className="py-3 px-4 text-center">Atrasos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {yieldReports.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        Nenhum registro de envio para oficina encontrado no período selecionado.
                      </td>
                    </tr>
                  ) : (
                    yieldReports.map((report) => (
                      <tr key={report.sewingPartnerId} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4 font-semibold text-white">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-purple-400 shrink-0" />
                            <span>{report.sewingPartnerName}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono">{report.totalDispatches}</td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-white">{report.totalSent}</td>
                        <td className="py-3.5 px-4 text-center font-mono text-emerald-400 font-bold">{report.totalReceivedOk}</td>
                        <td className="py-3.5 px-4 text-center font-mono text-amber-400">{report.totalMissing}</td>
                        <td className="py-3.5 px-4 text-center font-mono text-rose-400">{report.totalDamaged}</td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                              report.yieldPercentage >= 95
                                ? "bg-emerald-500/20 text-emerald-400"
                                : report.yieldPercentage >= 85
                                ? "bg-amber-500/20 text-amber-400"
                                : "bg-rose-500/20 text-rose-400"
                            }`}
                          >
                            {report.yieldPercentage}%
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {report.delayedDispatchesCount > 0 ? (
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                              <AlertTriangle className="h-3 w-3" />
                              {report.delayedDispatchesCount} remessa(s)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                              <Check className="h-3 w-3" /> No Prazo
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: REGISTRAR RECEBIMENTO */}
      {isReceiptModalOpen && selectedBatch && selectedManifest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Scissors className="h-5 w-5 text-pink-400" />
                  Recebimento de Retorno da Oficina
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Romaneio: <strong className="text-purple-300 font-mono">{selectedManifest.manifestNumber}</strong> — Lote:{" "}
                  <strong className="text-white font-mono">{selectedBatch.batchNumber}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitReceipt} className="p-5 space-y-5">
              <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400">Oficina Parceira:</span>
                  <p className="font-bold text-white">{selectedManifest.sewingPartner?.name}</p>
                </div>
                <div>
                  <span className="text-slate-400">Total Enviado:</span>
                  <p className="font-bold font-mono text-purple-300">{selectedManifest.totalQuantity} peças</p>
                </div>
                <div>
                  <span className="text-slate-400">Prazo Acordado:</span>
                  <p className="font-bold text-slate-300">
                    {new Date(selectedManifest.expectedReturnDate).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* GRADE DE CONFERÊNCIA POR TAMANHO */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase text-slate-300">
                  Grade de Peças Recebidas nesta Remessa:
                </label>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {Object.entries(receiptGrid).map(([size, counts]) => (
                    <div
                      key={size}
                      className="grid grid-cols-4 items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800"
                    >
                      <div>
                        <span className="text-xs font-mono font-bold text-sky-400 uppercase">Tamanho {size}</span>
                      </div>
                      <div>
                        <label className="block text-[10px] text-emerald-400 uppercase font-semibold">Peças OK</label>
                        <input
                          type="number"
                          min="0"
                          value={counts.ok}
                          onChange={(e) =>
                            setReceiptGrid({
                              ...receiptGrid,
                              [size]: { ...counts, ok: parseInt(e.target.value) || 0 },
                            })
                          }
                          className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center font-mono focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-amber-400 uppercase font-semibold">Faltantes</label>
                        <input
                          type="number"
                          min="0"
                          value={counts.missing}
                          onChange={(e) =>
                            setReceiptGrid({
                              ...receiptGrid,
                              [size]: { ...counts, missing: parseInt(e.target.value) || 0 },
                            })
                          }
                          className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center font-mono focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-rose-400 uppercase font-semibold">Danificadas</label>
                        <input
                          type="number"
                          min="0"
                          value={counts.damaged}
                          onChange={(e) =>
                            setReceiptGrid({
                              ...receiptGrid,
                              [size]: { ...counts, damaged: parseInt(e.target.value) || 0 },
                            })
                          }
                          className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center font-mono focus:border-rose-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* OBSERVAÇÕES */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300 mb-1">
                  Observações da Conferência
                </label>
                <textarea
                  rows={2}
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  placeholder="Ex: Peças conferidas na bancada com etiqueta de revisão..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                />
              </div>

              {/* PIN DO OPERADOR */}
              <div className="bg-pink-500/10 border border-pink-500/20 p-4 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-pink-300">
                  <ShieldCheck className="h-4 w-4" />
                  Assinatura Digital do Operador de Costura (PIN)
                </div>
                <input
                  type="password"
                  maxLength={6}
                  required
                  placeholder="Digite seu PIN de 4 a 6 dígitos"
                  value={receiptPin}
                  onChange={(e) => setReceiptPin(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono text-center tracking-widest focus:border-pink-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsReceiptModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReceipt}
                  className="px-5 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shadow-lg shadow-pink-600/30 transition disabled:opacity-50"
                >
                  {isSubmittingReceipt ? "Registrando..." : "Confirmar Recebimento & Assinar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: HISTÓRICO DE RECEBIMENTOS */}
      {isHistoryModalOpen && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <History className="h-5 w-5 text-purple-400" />
                  Histórico de Recebimentos do Lote
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Lote: <strong className="text-white font-mono">{selectedBatch.batchNumber}</strong> — Romaneio:{" "}
                  <strong className="text-purple-300 font-mono">{selectedManifest?.manifestNumber}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
              {batchReceipts.length === 0 ? (
                <p className="text-center py-6 text-xs text-slate-500">
                  Nenhuma remessa foi recebida até o momento para este lote.
                </p>
              ) : (
                batchReceipts.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white">Remessa #{rec.receiptNumber}</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(rec.receivedAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs py-1 bg-slate-900/60 rounded-lg">
                      <div>
                        <span className="text-[10px] text-slate-400">OK</span>
                        <p className="font-bold font-mono text-emerald-400">{rec.totalReceivedOk}</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Faltantes</span>
                        <p className="font-bold font-mono text-amber-400">{rec.totalMissing}</p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">Danificadas</span>
                        <p className="font-bold font-mono text-rose-400">{rec.totalDamaged}</p>
                      </div>
                    </div>

                    {rec.notes && (
                      <p className="text-xs text-slate-300 italic">"{rec.notes}"</p>
                    )}

                    <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Operador: <strong className="text-slate-200">{rec.operator?.name || "Operador"}</strong></span>
                      {rec.digitalSignatureHash && (
                        <span className="font-mono text-purple-400 truncate max-w-xs" title={rec.digitalSignatureHash}>
                          HMAC: {rec.digitalSignatureHash.substring(0, 16)}...
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition"
              >
                Fechar Histórico
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: FECHAR COM DIVERGÊNCIA */}
      {isDivergenceModalOpen && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <AlertTriangle className="h-5 w-5" />
              Autorizar Encerramento com Divergência
            </div>
            <p className="text-xs text-slate-300">
              Esta ação encerra o romaneio aceitando perdas ou peças faltantes da oficina que não serão repostas.
            </p>

            <form onSubmit={handleSubmitDivergence} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Justificativa Escrita Obrigatória:
                </label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={divergenceJustification}
                  onChange={(e) => setDivergenceJustification(e.target.value)}
                  placeholder="Descreva o motivo da divergência (ex: 5 peças extraviadas na oficina, saldo cancelado por autorização do cliente)..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl space-y-1">
                <label className="block text-[11px] font-bold text-amber-300">
                  PIN do Gestor / Administrador:
                </label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  placeholder="PIN"
                  value={divergencePin}
                  onChange={(e) => setDivergencePin(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono text-center tracking-widest focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDivergenceModalOpen(false)}
                  className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDivergence}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  {isSubmittingDivergence ? "Autorizando..." : "Autorizar Fechamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: AVANÇAR PARA QUALIDADE */}
      {isForwardModalOpen && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <CheckCircle2 className="h-5 w-5" />
              Avançar Lote para Qualidade Pós-Costura (Setor 13)
            </div>
            <p className="text-xs text-slate-300">
              O lote <strong className="text-white font-mono">{selectedBatch.batchNumber}</strong> está com o recebimento
              fechado. Ao prosseguir, apenas as peças recebidas em conformidade (OK) serão encaminhadas para inspeção.
            </p>

            <form onSubmit={handleSubmitForward} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Notas de Envio para Qualidade:
                </label>
                <input
                  type="text"
                  value={forwardNotes}
                  onChange={(e) => setForwardNotes(e.target.value)}
                  placeholder="Ex: Peças conferidas prontas para verificação de costura e acabamento..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl space-y-1">
                <label className="block text-[11px] font-bold text-emerald-300">
                  PIN do Operador / Responsável:
                </label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  placeholder="PIN"
                  value={forwardPin}
                  onChange={(e) => setForwardPin(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono text-center tracking-widest focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsForwardModalOpen(false)}
                  className="px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingForward}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  {isSubmittingForward ? "Avançando..." : "Avançar para Qualidade"}
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
        currentUser={currentUser || { id: "", name: "Costura", role: "OPERADOR", hasPin: true }}
      />
    </div>
  );
}
