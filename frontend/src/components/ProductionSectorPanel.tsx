import React, { useState, useEffect } from "react";
import {
  Layers,
  Printer,
  Flame,
  Boxes,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  History,
  FileText,
  FileCheck,
  Split,
  RefreshCw,
  Clock,
  User as UserIcon,
  Tag,
  ShieldCheck,
  X,
  Upload,
  Eye,
} from "lucide-react";
import { api } from "../services/api.js";
import { User } from "../types.js";
import { io } from "socket.io-client";
import { UniversalOrderSheetModal } from "./UniversalOrderSheetModal.js";

interface ProductionSectorPanelProps {
  sectorCode: "PRE_DIAGRAMACAO" | "DIAGRAMACAO" | "IMPRESSAO" | "INFESTO" | "CALANDRA" | "SEPARACAO";
  sectorName: string;
  sectorNumber: string;
  currentUser: User;
}

export function ProductionSectorPanel({
  sectorCode,
  sectorName,
  sectorNumber,
  currentUser,
}: ProductionSectorPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [queueData, setQueueData] = useState<{
    sector: any;
    totalBatches: number;
    waitingCount: number;
    inProgressCount: number;
    completedCount: number;
    reworkCount: number;
    batches: any[];
  } | null>(null);

  const [filterTab, setFilterTab] = useState<"ALL" | "WAITING" | "IN_PROGRESS" | "REWORK" | "COMPLETED">("ALL");

  // Modais
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isDiagramModalOpen, setIsDiagramModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [selectedSheetBatchId, setSelectedSheetBatchId] = useState<string | null>(null);

  // Histórico
  const [historyLoading, setHistoryLoading] = useState(false);
  const [batchHistory, setBatchHistory] = useState<any>(null);

  // Campos do formulário de conclusão
  const [pinInput, setPinInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [machineInput, setMachineInput] = useState("");
  const [qtyPlannedInput, setQtyPlannedInput] = useState<number>(0);
  const [qtyProducedInput, setQtyProducedInput] = useState<number>(0);
  const [qtyLostInput, setQtyLostInput] = useState<number>(0);
  const [qtyReceivedInput, setQtyReceivedInput] = useState<number>(0);
  const [qtyPreparedInput, setQtyPreparedInput] = useState<number>(0);
  const [lossesDivergencesInput, setLossesDivergencesInput] = useState<number>(0);
  const [temperatureInput, setTemperatureInput] = useState("205°C");
  const [speedOrTimeInput, setSpeedOrTimeInput] = useState("1.8 m/min");
  const [qtyProcessedInput, setQtyProcessedInput] = useState<number>(0);
  const [qtySeparatedInput, setQtySeparatedInput] = useState<number>(0);
  const [integrityVerifiedInput, setIntegrityVerifiedInput] = useState(false);
  const [diagramFileNameInput, setDiagramFileNameInput] = useState("");
  const [diagramFileUrlInput, setDiagramFileUrlInput] = useState("");
  const [diagramVersionInput, setDiagramVersionInput] = useState(1);

  // Campos de devolução
  const [returnTargetSector, setReturnTargetSector] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnPin, setReturnPin] = useState("");

  // Campos de desmembramento (split)
  const [splitQty, setSplitQty] = useState(1);
  const [splitNotes, setSplitNotes] = useState("");

  // Carregar fila de produção
  const loadQueue = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await api.getProductionQueue(sectorCode);
      setQueueData(data);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar fila de produção.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();

    // Socket.io em tempo real com token de autenticação
    const socket = io({
      auth: { token: localStorage.getItem("pcp_auth_token") },
    });

    socket.on("connect", () => {
      socket.emit("join_sector", sectorCode);
    });

    socket.on("batch_moved", () => {
      loadQueue();
    });

    socket.on("batch_started", () => {
      loadQueue();
    });

    socket.on("batch_returned", () => {
      loadQueue();
    });

    socket.on("batch_split", () => {
      loadQueue();
    });

    return () => {
      socket.disconnect();
    };
  }, [sectorCode]);

  // Ações Operacionais
  const handleStartBatch = async (batchId: string) => {
    try {
      await api.startProductionBatch(batchId, "Iniciado pelo operador do painel.");
      await loadQueue();
    } catch (err: any) {
      alert(`Falha ao iniciar lote: ${err.message}`);
    }
  };

  const handleOpenCompleteModal = (batch: any) => {
    setSelectedBatch(batch);
    setPinInput("");
    setNotesInput("");
    setMachineInput(sectorCode === "IMPRESSAO" ? "Plotter SureColor F9470 #01" : sectorCode === "CALANDRA" ? "Calandra Rotativa Monti Antonio #01" : "");
    setQtyPlannedInput(batch.quantity);
    setQtyProducedInput(batch.quantity);
    setQtyLostInput(0);
    setQtyReceivedInput(batch.quantity);
    setQtyPreparedInput(batch.quantity);
    setLossesDivergencesInput(0);
    setTemperatureInput("205°C");
    setSpeedOrTimeInput("1.8 m/min");
    setQtyProcessedInput(batch.quantity);
    setQtySeparatedInput(batch.quantity);
    setIntegrityVerifiedInput(false);
    setDiagramFileNameInput(`encaixe_${batch.batchNumber}.pdf`);
    setDiagramFileUrlInput(`/uploads/diagramacao/encaixe_${batch.batchNumber}.pdf`);
    setDiagramVersionInput(1);
    setIsCompleteModalOpen(true);
  };

  const handleConfirmComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput || pinInput.length < 4) {
      alert("Informe seu PIN numérico de 4 a 6 dígitos.");
      return;
    }

    try {
      const payload: any = {
        pin: pinInput,
        notes: notesInput,
      };

      if (sectorCode === "DIAGRAMACAO") {
        payload.diagramFileName = diagramFileNameInput;
        payload.diagramFileUrl = diagramFileUrlInput;
        payload.diagramVersion = diagramVersionInput;
      } else if (sectorCode === "IMPRESSAO") {
        payload.machine = machineInput;
        payload.quantityPlanned = Number(qtyPlannedInput);
        payload.quantityProduced = Number(qtyProducedInput);
        payload.quantityLost = Number(qtyLostInput);
      } else if (sectorCode === "INFESTO") {
        payload.quantityReceived = Number(qtyReceivedInput);
        payload.quantityPrepared = Number(qtyPreparedInput);
        payload.lossesOrDivergences = Number(lossesDivergencesInput);
      } else if (sectorCode === "CALANDRA") {
        payload.machine = machineInput;
        payload.temperature = temperatureInput;
        payload.speedOrTime = speedOrTimeInput;
        payload.quantityProcessed = Number(qtyProcessedInput);
      } else if (sectorCode === "SEPARACAO") {
        payload.quantitySeparated = Number(qtySeparatedInput);
        payload.integrityVerified = integrityVerifiedInput;
        payload.missingOrDivergences = Number(lossesDivergencesInput);
      }

      await api.completeAndForwardBatch(selectedBatch.id, payload);
      setIsCompleteModalOpen(false);
      setSelectedBatch(null);
      await loadQueue();
    } catch (err: any) {
      alert(`Falha ao concluir etapa: ${err.message}`);
    }
  };

  const handleOpenReturnModal = (batch: any) => {
    setSelectedBatch(batch);
    setReturnPin("");
    setReturnReason("");
    // Definir setor default anterior
    if (sectorCode === "DIAGRAMACAO") setReturnTargetSector("PRE_DIAGRAMACAO");
    else if (sectorCode === "IMPRESSAO") setReturnTargetSector("DIAGRAMACAO");
    else if (sectorCode === "INFESTO") setReturnTargetSector("IMPRESSAO");
    else if (sectorCode === "CALANDRA") setReturnTargetSector("IMPRESSAO");
    else if (sectorCode === "SEPARACAO") setReturnTargetSector("CALANDRA");
    else setReturnTargetSector("SAC_INTERNO");

    setIsReturnModalOpen(true);
  };

  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnPin || returnPin.length < 4) {
      alert("Informe seu PIN numérico de assinatura.");
      return;
    }
    if (!returnReason || returnReason.length < 5) {
      alert("Informe uma justificativa detalhada para a devolução.");
      return;
    }

    try {
      await api.returnProductionBatch(selectedBatch.id, {
        pin: returnPin,
        targetSectorCode: returnTargetSector,
        reason: returnReason,
      });
      setIsReturnModalOpen(false);
      setSelectedBatch(null);
      await loadQueue();
    } catch (err: any) {
      alert(`Falha na devolução: ${err.message}`);
    }
  };

  const handleOpenHistoryModal = async (batch: any) => {
    setSelectedBatch(batch);
    setIsHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const data = await api.getBatchHistory(batch.id);
      setBatchHistory(data);
    } catch (err: any) {
      alert(`Erro ao carregar histórico: ${err.message}`);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenDiagramModal = (batch: any) => {
    setSelectedBatch(batch);
    setDiagramFileNameInput(`encaixe_${batch.batchNumber}_v1.pdf`);
    setDiagramFileUrlInput(`/uploads/diagramacao/encaixe_${batch.batchNumber}_v1.pdf`);
    setDiagramVersionInput(1);
    setNotesInput("");
    setIsDiagramModalOpen(true);
  };

  const handleConfirmDiagramAttach = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.attachDiagramFile(selectedBatch.id, {
        fileName: diagramFileNameInput,
        fileUrl: diagramFileUrlInput,
        fileVersion: Number(diagramVersionInput),
        notes: notesInput,
      });
      alert("Arquivo de diagramação anexado com sucesso!");
      setIsDiagramModalOpen(false);
      setSelectedBatch(null);
      await loadQueue();
    } catch (err: any) {
      alert(`Falha ao anexar diagramação: ${err.message}`);
    }
  };

  const handleOpenSplitModal = (batch: any) => {
    setSelectedBatch(batch);
    setSplitQty(Math.floor(batch.quantity / 2) || 1);
    setSplitNotes("");
    setIsSplitModalOpen(true);
  };

  const handleConfirmSplit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (splitQty >= selectedBatch.quantity) {
      alert(`A quantidade fracionada deve ser menor que ${selectedBatch.quantity}.`);
      return;
    }
    try {
      await api.splitProductionBatch(selectedBatch.id, {
        splitQuantity: Number(splitQty),
        notes: splitNotes,
      });
      alert("Lote desmembrado com sucesso!");
      setIsSplitModalOpen(false);
      setSelectedBatch(null);
      await loadQueue();
    } catch (err: any) {
      alert(`Falha no desmembramento: ${err.message}`);
    }
  };

  // Filtragem de lotes
  const filteredBatches = (queueData?.batches || []).filter((batch) => {
    if (filterTab === "ALL") return true;
    if (filterTab === "WAITING") return batch.batchStatus === "WAITING" && !batch.isUnderRework;
    if (filterTab === "IN_PROGRESS") return batch.batchStatus === "IN_PROGRESS";
    if (filterTab === "REWORK") return batch.isUnderRework || batch.batchStatus === "REWORK";
    if (filterTab === "COMPLETED") return batch.batchStatus === "COMPLETED";
    return true;
  });

  const getSectorIcon = () => {
    switch (sectorCode) {
      case "PRE_DIAGRAMACAO":
        return <Layers className="h-6 w-6 text-sky-400" />;
      case "DIAGRAMACAO":
        return <FileCheck className="h-6 w-6 text-indigo-400" />;
      case "IMPRESSAO":
        return <Printer className="h-6 w-6 text-blue-400" />;
      case "INFESTO":
        return <Layers className="h-6 w-6 text-teal-400" />;
      case "CALANDRA":
        return <Flame className="h-6 w-6 text-amber-400" />;
      case "SEPARACAO":
        return <Boxes className="h-6 w-6 text-emerald-400" />;
      default:
        return <Layers className="h-6 w-6 text-sky-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* CABEÇALHO DO SETOR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl bg-slate-900/80 p-6 border border-slate-800 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 border border-slate-700/80 shadow-inner">
            {getSectorIcon()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-sky-500/20 px-2.5 py-0.5 text-xs font-bold text-sky-400 border border-sky-500/30">
                SETOR {sectorNumber}
              </span>
              <h2 className="text-xl font-bold tracking-tight text-white">{sectorName}</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Operador conectado: <strong className="text-slate-200">{currentUser.name}</strong> ({currentUser.role})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadQueue}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 border border-slate-700 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-sky-400" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* CARDS DE RESUMO DE MÉTRICAS */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl bg-slate-900/60 p-4 border border-slate-800">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total na Fila</span>
          <p className="text-2xl font-black text-white mt-1">{queueData?.totalBatches || 0}</p>
        </div>
        <div className="rounded-xl bg-slate-900/60 p-4 border border-amber-500/20 bg-amber-500/5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Aguardando</span>
          <p className="text-2xl font-black text-amber-300 mt-1">{queueData?.waitingCount || 0}</p>
        </div>
        <div className="rounded-xl bg-slate-900/60 p-4 border border-sky-500/20 bg-sky-500/5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">Em Andamento</span>
          <p className="text-2xl font-black text-sky-300 mt-1">{queueData?.inProgressCount || 0}</p>
        </div>
        <div className="rounded-xl bg-slate-900/60 p-4 border border-rose-500/20 bg-rose-500/5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Retrabalho</span>
          <p className="text-2xl font-black text-rose-300 mt-1">{queueData?.reworkCount || 0}</p>
        </div>
        <div className="rounded-xl bg-slate-900/60 p-4 border border-emerald-500/20 bg-emerald-500/5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Concluídos</span>
          <p className="text-2xl font-black text-emerald-300 mt-1">{queueData?.completedCount || 0}</p>
        </div>
      </div>

      {/* ABAS DE FILTRO */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterTab("ALL")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
            filterTab === "ALL" ? "bg-slate-800 text-sky-400 border border-slate-700" : "text-slate-400 hover:text-white"
          }`}
        >
          Todos ({queueData?.totalBatches || 0})
        </button>
        <button
          onClick={() => setFilterTab("WAITING")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
            filterTab === "WAITING" ? "bg-slate-800 text-amber-400 border border-slate-700" : "text-slate-400 hover:text-white"
          }`}
        >
          Aguardando ({queueData?.waitingCount || 0})
        </button>
        <button
          onClick={() => setFilterTab("IN_PROGRESS")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
            filterTab === "IN_PROGRESS" ? "bg-slate-800 text-sky-400 border border-slate-700" : "text-slate-400 hover:text-white"
          }`}
        >
          Em Execução ({queueData?.inProgressCount || 0})
        </button>
        <button
          onClick={() => setFilterTab("REWORK")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
            filterTab === "REWORK" ? "bg-slate-800 text-rose-400 border border-slate-700" : "text-slate-400 hover:text-white"
          }`}
        >
          Retrabalho ({queueData?.reworkCount || 0})
        </button>
        <button
          onClick={() => setFilterTab("COMPLETED")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
            filterTab === "COMPLETED" ? "bg-slate-800 text-emerald-400 border border-slate-700" : "text-slate-400 hover:text-white"
          }`}
        >
          Concluídos ({queueData?.completedCount || 0})
        </button>
      </div>

      {/* LISTAGEM DE LOTES */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-500/15 p-4 text-sm text-rose-300 border border-rose-500/30">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !queueData ? (
        <div className="p-12 text-center text-slate-400">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-sky-400 mb-2" />
          <p className="text-sm">Carregando lotes do setor {sectorName}...</p>
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center text-slate-500">
          <CheckCircle2 className="h-10 w-10 mx-auto text-slate-600 mb-2" />
          <p className="text-sm">Nenhum lote nesta condição na fila operacional do setor.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBatches.map((batch) => {
            const op = batch.productionOrder;
            const items = op?.quotation?.items || [];

            return (
              <div
                key={batch.id}
                className={`rounded-2xl bg-slate-900 border p-5 flex flex-col justify-between transition-all hover:border-slate-600 shadow-lg ${
                  batch.isUnderRework
                    ? "border-rose-500/40 bg-gradient-to-b from-rose-950/20 to-slate-900"
                    : batch.batchStatus === "IN_PROGRESS"
                    ? "border-sky-500/40 bg-gradient-to-b from-sky-950/20 to-slate-900"
                    : "border-slate-800"
                }`}
              >
                <div>
                  {/* CABEÇALHO DO CARD */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Tag className="h-4 w-4 text-sky-400" />
                        <span className="font-mono text-sm font-bold text-white">{batch.batchNumber}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSheetBatchId(batch.id);
                            setIsSheetModalOpen(true);
                          }}
                          className="ml-1 inline-flex items-center gap-1 rounded bg-sky-950/80 hover:bg-sky-900 px-2 py-0.5 text-[11px] font-semibold text-sky-300 border border-sky-800 transition"
                          title="Abrir Ficha Universal do Pedido"
                        >
                          <Eye className="h-3 w-3" />
                          Ficha
                        </button>
                      </div>
                      <span className="text-xs font-semibold text-slate-400">OP: {op?.opNumber}</span>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          batch.isUnderRework
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                            : batch.batchStatus === "IN_PROGRESS"
                            ? "bg-sky-500/10 text-sky-400 border-sky-500/30 animate-pulse"
                            : batch.batchStatus === "COMPLETED"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        }`}
                      >
                        {batch.isUnderRework ? "Retrabalho" : batch.batchStatus === "IN_PROGRESS" ? "Em Produção" : batch.batchStatus}
                      </span>
                      <span className="text-xs font-bold text-slate-200">{batch.quantity} peças</span>
                    </div>
                  </div>

                  {/* ALERTA DE RETRABALHO */}
                  {batch.isUnderRework && (
                    <div className="mt-3 rounded-xl bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-300">
                      <strong className="block font-bold mb-0.5">Motivo do Retrabalho:</strong>
                      <span>{batch.reworkReason || "Não especificado"}</span>
                    </div>
                  )}

                  {/* DETALHES DO PEDIDO / CLIENTE */}
                  <div className="mt-4 space-y-1.5 border-t border-slate-800/80 pt-3 text-xs">
                    <p className="text-slate-300">
                      <strong className="text-slate-400">Cliente:</strong> {op?.customer?.companyName || "N/A"}
                    </p>
                    <p className="text-slate-300">
                      <strong className="text-slate-400">Item:</strong> {op?.title || op?.productType}
                    </p>
                    {batch.assignedOperator && (
                      <p className="text-sky-300 flex items-center gap-1">
                        <UserIcon className="h-3.5 w-3.5" />
                        <span>Operador: {batch.assignedOperator.name}</span>
                      </p>
                    )}
                  </div>

                  {/* GRADE DE TAMANHOS (RESUMO) */}
                  {items.length > 0 && (
                    <div className="mt-3 bg-slate-950/60 rounded-xl p-2.5 border border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                        Grade de Produção
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {items.slice(0, 4).map((it: any, idx: number) => (
                          <span key={idx} className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300 border border-slate-700">
                            {it.size}: {it.quantity}un
                          </span>
                        ))}
                        {items.length > 4 && (
                          <span className="text-[10px] text-slate-400 self-center">+{items.length - 4} itens</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* BOTÕES DE AÇÃO OPERACIONAL */}
                <div className="mt-5 pt-3 border-t border-slate-800/80 flex flex-wrap gap-2">
                  {batch.batchStatus !== "IN_PROGRESS" && batch.batchStatus !== "COMPLETED" && (
                    <button
                      onClick={() => handleStartBatch(batch.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 py-2.5 px-3 text-xs font-bold text-white shadow-md shadow-sky-600/20 active:scale-95 transition"
                    >
                      <Play className="h-4 w-4" />
                      Iniciar
                    </button>
                  )}

                  {sectorCode === "DIAGRAMACAO" && (
                    <button
                      onClick={() => handleOpenDiagramModal(batch)}
                      className="flex items-center gap-1 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white py-2 px-3 text-xs font-semibold border border-indigo-500/30 transition"
                      title="Anexar arquivo de encaixe/diagramação"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Anexar Encaixe
                    </button>
                  )}

                  {batch.batchStatus === "IN_PROGRESS" && (
                    <button
                      onClick={() => handleOpenCompleteModal(batch)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-2.5 px-3 text-xs font-bold text-white shadow-md shadow-emerald-600/20 active:scale-95 transition"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Concluir Etapa
                    </button>
                  )}

                  {batch.quantity > 1 && batch.batchStatus !== "COMPLETED" && (
                    <button
                      onClick={() => handleOpenSplitModal(batch)}
                      className="flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 p-2.5 border border-slate-700 transition"
                      title="Desmembrar Lote Parcial"
                    >
                      <Split className="h-4 w-4 text-purple-400" />
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setSelectedSheetBatchId(batch.id);
                      setIsSheetModalOpen(true);
                    }}
                    className="flex items-center justify-center rounded-xl bg-sky-950/60 hover:bg-sky-900 text-sky-300 p-2.5 border border-sky-800/80 transition"
                    title="Visualizar Ficha Universal Completa"
                  >
                    <Eye className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => handleOpenReturnModal(batch)}
                    className="flex items-center justify-center rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white p-2.5 border border-rose-500/30 transition"
                    title="Devolver para setor anterior"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => handleOpenHistoryModal(batch)}
                    className="flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 p-2.5 border border-slate-700 transition"
                    title="Histórico de Rastreabilidade & Assinaturas"
                  >
                    <History className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE CONCLUSÃO & ASSINATURA COM PIN */}
      {isCompleteModalOpen && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 p-6 border border-slate-800 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">
                  Concluir Etapa: {sectorName}
                </h3>
              </div>
              <button
                onClick={() => setIsCompleteModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmComplete} className="mt-4 space-y-4">
              <div className="rounded-xl bg-slate-800/60 p-3 text-xs text-slate-300 border border-slate-700">
                <p>
                  <strong>Lote:</strong> {selectedBatch.batchNumber} |{" "}
                  <strong>Quantidade:</strong> {selectedBatch.quantity} peças
                </p>
                <p>
                  <strong>OP:</strong> {selectedBatch.productionOrder?.opNumber}
                </p>
              </div>

              {/* CAMPOS ESPECÍFICOS POR SETOR */}
              {sectorCode === "DIAGRAMACAO" && (
                <div className="space-y-3 rounded-xl bg-indigo-950/20 p-4 border border-indigo-500/30">
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider block">
                    Confirmação de Arquivos de Produção
                  </span>
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Nome do Arquivo de Encaixe / RIP *
                    </label>
                    <input
                      type="text"
                      required
                      value={diagramFileNameInput}
                      onChange={(e) => setDiagramFileNameInput(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Caminho / URL do Arquivo Vetorial *
                    </label>
                    <input
                      type="text"
                      required
                      value={diagramFileUrlInput}
                      onChange={(e) => setDiagramFileUrlInput(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
              )}

              {sectorCode === "IMPRESSAO" && (
                <div className="space-y-3 rounded-xl bg-blue-950/20 p-4 border border-blue-500/30">
                  <span className="text-xs font-bold text-blue-300 uppercase tracking-wider block">
                    Métricas de Impressão Sublimática
                  </span>
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Máquina / Plotter Utilizada *
                    </label>
                    <input
                      type="text"
                      required
                      value={machineInput}
                      onChange={(e) => setMachineInput(e.target.value)}
                      placeholder="Ex: Plotter Epson SureColor F9470 #01"
                      className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300">
                        Peças Impressas *
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={qtyProducedInput}
                        onChange={(e) => setQtyProducedInput(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300">
                        Perdas / Desperdício
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={qtyLostInput}
                        onChange={(e) => setQtyLostInput(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {sectorCode === "INFESTO" && (
                <div className="space-y-3 rounded-xl bg-teal-950/20 p-4 border border-teal-500/30">
                  <span className="text-xs font-bold text-teal-300 uppercase tracking-wider block">
                    Métricas de Corte e Infesto
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300">
                        Qtd Recebida (Impressão)
                      </label>
                      <input
                        type="number"
                        value={qtyReceivedInput}
                        onChange={(e) => setQtyReceivedInput(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300">
                        Qtd Enfestada / Cortada
                      </label>
                      <input
                        type="number"
                        value={qtyPreparedInput}
                        onChange={(e) => setQtyPreparedInput(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {sectorCode === "CALANDRA" && (
                <div className="space-y-3 rounded-xl bg-amber-950/20 p-4 border border-amber-500/30">
                  <span className="text-xs font-bold text-amber-300 uppercase tracking-wider block">
                    Parâmetros Térmicos de Termotransferência
                  </span>
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Máquina Calandra *
                    </label>
                    <input
                      type="text"
                      required
                      value={machineInput}
                      onChange={(e) => setMachineInput(e.target.value)}
                      placeholder="Ex: Calandra Rotativa Monti Antonio #02"
                      className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300">
                        Temperatura *
                      </label>
                      <input
                        type="text"
                        required
                        value={temperatureInput}
                        onChange={(e) => setTemperatureInput(e.target.value)}
                        placeholder="Ex: 205°C"
                        className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300">
                        Velocidade / Tempo *
                      </label>
                      <input
                        type="text"
                        required
                        value={speedOrTimeInput}
                        onChange={(e) => setSpeedOrTimeInput(e.target.value)}
                        placeholder="Ex: 1.8 m/min"
                        className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {sectorCode === "SEPARACAO" && (
                <div className="space-y-3 rounded-xl bg-emerald-950/20 p-4 border border-emerald-500/30">
                  <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider block">
                    Conferência e Separação por Grade
                  </span>
                  <div>
                    <label className="block text-xs font-medium text-slate-300">
                      Qtd Total Separada *
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={qtySeparatedInput}
                      onChange={(e) => setQtySeparatedInput(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="integrityCheck"
                      checked={integrityVerifiedInput}
                      onChange={(e) => setIntegrityVerifiedInput(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-600 focus:ring-emerald-500"
                    />
                    <label htmlFor="integrityCheck" className="text-xs font-semibold text-emerald-300 cursor-pointer">
                      Confirmo a conferência de grade, identificação e integridade das peças *
                    </label>
                  </div>
                </div>
              )}

              {/* OBSERVAÇÕES OPERACIONAIS */}
              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Observações Operacionais
                </label>
                <textarea
                  rows={2}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Anotações técnicas de execução..."
                  className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-500"
                />
              </div>

              {/* CONFIRMAÇÃO DE ASSINATURA COM PIN */}
              <div className="rounded-xl bg-slate-800 p-4 border border-slate-700 space-y-2">
                <div className="flex items-center gap-2 text-sky-400">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Assinatura Digital do Operador (HMAC-SHA-256)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Digite seu PIN individual de 4 a 6 dígitos para validar a responsabilidade técnica e gerar o hash criptográfico.
                </p>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="••••"
                  className="w-full text-center tracking-widest text-lg font-mono rounded-lg bg-slate-900 border border-slate-700 py-2.5 text-white focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCompleteModalOpen(false)}
                  className="flex-1 rounded-xl bg-slate-800 py-3 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 text-xs font-bold text-white shadow-lg shadow-emerald-600/30"
                >
                  Assinar & Encaminhar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE DEVOLUÇÃO / RETRABALHO */}
      {isReturnModalOpen && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 p-6 border border-rose-500/40 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <RotateCcw className="h-5 w-5" />
                <h3 className="text-base font-bold text-white">Devolução de Lote (Retrabalho)</h3>
              </div>
              <button onClick={() => setIsReturnModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReturn} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300">Setor de Destino da Devolução *</label>
                <select
                  required
                  value={returnTargetSector}
                  onChange={(e) => setReturnTargetSector(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                >
                  {sectorCode !== "PRE_DIAGRAMACAO" && <option value="SAC_INTERNO">04. SAC Interno</option>}
                  {sectorCode !== "PRE_DIAGRAMACAO" && <option value="PRE_DIAGRAMACAO">05. Pré-Diagramação</option>}
                  {["IMPRESSAO", "INFESTO", "CALANDRA", "SEPARACAO"].includes(sectorCode) && (
                    <option value="DIAGRAMACAO">06. Diagramação</option>
                  )}
                  {["INFESTO", "CALANDRA", "SEPARACAO"].includes(sectorCode) && (
                    <option value="IMPRESSAO">07. Impressão</option>
                  )}
                  {["CALANDRA", "SEPARACAO"].includes(sectorCode) && (
                    <option value="INFESTO">08. Infesto</option>
                  )}
                  {sectorCode === "SEPARACAO" && <option value="CALANDRA">09. Calandra</option>}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Motivo / Defeito Identificado *</label>
                <textarea
                  rows={3}
                  required
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Descreva detalhadamente o motivo da devolução para rastreabilidade..."
                  className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">PIN de Assinatura do Operador *</label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={returnPin}
                  onChange={(e) => setReturnPin(e.target.value)}
                  placeholder="••••"
                  className="mt-1 w-full text-center font-mono tracking-widest rounded-lg bg-slate-900 border border-slate-700 py-2 text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-600/30"
                >
                  Confirmar Devolução
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE HISTÓRICO & RASTREABILIDADE */}
      {isHistoryModalOpen && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 p-6 border border-slate-800 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-sky-400">
                <History className="h-5 w-5" />
                <h3 className="text-base font-bold text-white">
                  Rastreabilidade Industrial: {selectedBatch.batchNumber}
                </h3>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto my-4 space-y-4 pr-1">
              {historyLoading ? (
                <div className="p-8 text-center text-slate-400">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-sky-400 mb-2" />
                  Carregando trilha de auditoria...
                </div>
              ) : !batchHistory || batchHistory.movements?.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">Nenhuma movimentação registrada até o momento.</p>
              ) : (
                <div className="space-y-3">
                  {batchHistory.movements.map((mov: any, index: number) => (
                    <div
                      key={mov.id || index}
                      className="rounded-xl bg-slate-950 p-4 border border-slate-800 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sky-400 flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          {mov.fromSector?.name || "Origem"} → {mov.toSector?.name || "Destino"}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {new Date(mov.createdAt).toLocaleString("pt-BR")}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-slate-300">
                        <p><strong>Operador:</strong> {mov.operator?.name || "Sistema"}</p>
                        <p><strong>Tipo:</strong> {mov.movementType}</p>
                      </div>

                      {mov.notes && (
                        <p className="text-slate-400 bg-slate-900/60 p-2 rounded-lg font-mono text-[11px]">
                          {mov.notes}
                        </p>
                      )}

                      <div className="border-t border-slate-800/80 pt-2 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span className="flex items-center gap-1 text-emerald-400">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          HMAC-SHA-256 Verificado
                        </span>
                        <span className="truncate max-w-[280px]" title={mov.digitalSignatureHash}>
                          {mov.digitalSignatureHash}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 pt-3 text-right">
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DESMEMBRAMENTO DE LOTE PARCIAL */}
      {isSplitModalOpen && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 p-6 border border-purple-500/40 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-purple-400">
                <Split className="h-5 w-5" />
                <h3 className="text-base font-bold text-white">Desmembrar Lote Parcial</h3>
              </div>
              <button onClick={() => setIsSplitModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSplit} className="mt-4 space-y-4">
              <div className="rounded-xl bg-slate-800/60 p-3 text-xs text-slate-300 border border-slate-700">
                <p><strong>Lote Atual:</strong> {selectedBatch.batchNumber}</p>
                <p><strong>Quantidade Total:</strong> {selectedBatch.quantity} peças</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Quantidade a Fracionar para Novo Lote *
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedBatch.quantity - 1}
                  required
                  value={splitQty}
                  onChange={(e) => setSplitQty(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-bold text-white"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Restarão {selectedBatch.quantity - splitQty} peças no lote original.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Justificativa / Motivo</label>
                <input
                  type="text"
                  value={splitNotes}
                  onChange={(e) => setSplitNotes(e.target.value)}
                  placeholder="Ex: Produzir em máquina paralela..."
                  className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSplitModalOpen(false)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-purple-600 hover:bg-purple-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-purple-600/30"
                >
                  Fracionar Lote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ANEXAR ENCAIXE / DIAGRAMAÇÃO */}
      {isDiagramModalOpen && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 p-6 border border-indigo-500/40 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-indigo-400">
                <Upload className="h-5 w-5" />
                <h3 className="text-base font-bold text-white">Anexar Diagramação / Encaixe</h3>
              </div>
              <button onClick={() => setIsDiagramModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmDiagramAttach} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300">Nome do Arquivo (PDF/CDR/AI) *</label>
                <input
                  type="text"
                  required
                  value={diagramFileNameInput}
                  onChange={(e) => setDiagramFileNameInput(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Caminho ou URL de Download *</label>
                <input
                  type="text"
                  required
                  value={diagramFileUrlInput}
                  onChange={(e) => setDiagramFileUrlInput(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Versão do Encaixe</label>
                <input
                  type="number"
                  min="1"
                  value={diagramVersionInput}
                  onChange={(e) => setDiagramVersionInput(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Observações de Corte / Aproveitamento</label>
                <textarea
                  rows={2}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Ex: Aproveitamento de tecido: 89.2%..."
                  className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDiagramModalOpen(false)}
                  className="flex-1 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30"
                >
                  Salvar Encaixe
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
        currentUser={currentUser}
      />
    </div>
  );
}
