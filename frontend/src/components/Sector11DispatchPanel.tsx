import React, { useState, useEffect } from "react";
import {
  Truck,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  History,
  FileText,
  Printer,
  Calendar,
  Lock,
  X,
  Search,
  RefreshCw,
  Clock,
  ShieldCheck,
  Building2,
  User as UserIcon,
  Eye,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../services/api.js";
import { User, SewingPartner, DispatchManifest } from "../types.js";
import { io } from "socket.io-client";
import { UniversalOrderSheetModal } from "./UniversalOrderSheetModal.js";

interface Sector11DispatchPanelProps {
  currentUser: User;
}

export function Sector11DispatchPanel({ currentUser }: Sector11DispatchPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [queueData, setQueueData] = useState<any>(null);
  const [partners, setPartners] = useState<SewingPartner[]>([]);
  const [filterTab, setFilterTab] = useState<"ALL" | "WAITING" | "IN_PROGRESS" | "DISPATCHED">("ALL");

  // Modais
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isManifestModalOpen, setIsManifestModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [selectedSheetBatchId, setSelectedSheetBatchId] = useState<string | null>(null);
  const [activeManifest, setActiveManifest] = useState<DispatchManifest | null>(null);

  // Form State do Despache
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [sizeGrid, setSizeGrid] = useState<Record<string, number>>({
    PP: 0,
    P: 0,
    M: 0,
    G: 0,
    GG: 0,
    XG: 0,
  });
  const [operatorPin, setOperatorPin] = useState("");
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Form State de Devolução / Retrabalho
  const [returnTargetSector, setReturnTargetSector] = useState("SEPARACAO");
  const [returnReason, setReturnReason] = useState("");
  const [returnPin, setReturnPin] = useState("");

  const totalGridPieces = Object.values(sizeGrid).reduce((acc, qty) => acc + (Number(qty) || 0), 0);

  // Carregar dados da fila e oficinas ativas
  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      // 1. Fila do Setor 11 (DESPACHE_OFICINA ou COSTURA seq 11)
      let queueRes = null;
      try {
        queueRes = await api.get("/production/queue/DESPACHE_OFICINA");
      } catch {
        queueRes = await api.get("/production/queue/COSTURA");
      }
      setQueueData(queueRes);

      // 2. Oficinas cadastradas
      const partnersRes = await api.get("/sewing-partners");
      const activePartners = Array.isArray(partnersRes)
        ? partnersRes.filter((p: any) => p.isActive)
        : [];
      setPartners(activePartners);
      if (activePartners.length > 0 && !selectedPartnerId) {
        setSelectedPartnerId(activePartners[0].id);
      }
    } catch (err: any) {
      console.error("Erro ao carregar dados do setor 11:", err);
      setError(err.message || "Erro ao carregar fila de despache para oficinas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Data padrão de retorno: 7 dias a partir de hoje às 17h
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    defaultDate.setHours(17, 0, 0, 0);
    setExpectedReturnDate(defaultDate.toISOString().slice(0, 16));

    const socket = io({
      auth: { token: localStorage.getItem("token") },
    });

    socket.on("batch_dispatched", () => loadData());
    socket.on("batch_moved", () => loadData());
    socket.on("batch_returned", () => loadData());

    return () => {
      socket.disconnect();
    };
  }, []);

  // Iniciar lote no setor
  const handleStartBatch = async (batchId: string) => {
    try {
      setSubmitting(true);
      await api.post(`/production/batches/${batchId}/start`, { notes: "Iniciada separação para envio a oficina" });
      setSuccessMsg("Lote iniciado com sucesso no setor de Despache.");
      setTimeout(() => setSuccessMsg(""), 4000);
      loadData();
    } catch (err: any) {
      alert(err.message || "Erro ao iniciar lote.");
    } finally {
      setSubmitting(false);
    }
  };

  // Abrir modal de despache configurando grade inicial automática
  const handleOpenDispatchModal = (batch: any) => {
    setSelectedBatch(batch);
    // Inicializar grade sugerida com a quantidade do lote no tamanho M
    setSizeGrid({
      PP: 0,
      P: Math.floor(batch.quantity * 0.2),
      M: Math.floor(batch.quantity * 0.4),
      G: Math.floor(batch.quantity * 0.3),
      GG: batch.quantity - Math.floor(batch.quantity * 0.2) - Math.floor(batch.quantity * 0.4) - Math.floor(batch.quantity * 0.3),
      XG: 0,
    });
    setOperatorPin("");
    setDispatchNotes("");
    setIsDispatchModalOpen(true);
  };

  // Submeter Despache
  const handleConfirmDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    if (totalGridPieces !== selectedBatch.quantity) {
      alert(`Atenção: A soma da grade (${totalGridPieces} peças) deve ser exatamente igual à quantidade do lote (${selectedBatch.quantity} peças).`);
      return;
    }

    if (!operatorPin || operatorPin.length < 4) {
      alert("Informe seu PIN de assinatura digital (mínimo 4 dígitos).");
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.post(`/production/batches/${selectedBatch.id}/dispatch`, {
        sewingPartnerId: selectedPartnerId,
        expectedReturnDate: new Date(expectedReturnDate).toISOString(),
        sizeGridBreakdown: sizeGrid,
        pin: operatorPin,
        notes: dispatchNotes || undefined,
      });

      setIsDispatchModalOpen(false);
      setActiveManifest(res.manifest);
      setIsManifestModalOpen(true);
      setSuccessMsg(`Lote despachado com sucesso! Romaneio ${res.manifest.manifestNumber} gerado.`);
      loadData();
    } catch (err: any) {
      alert(err.message || "Erro ao realizar despache para oficina.");
    } finally {
      setSubmitting(false);
    }
  };

  // Visualizar Romaneio já emitido
  const handleViewManifest = async (batchId: string) => {
    try {
      const manifest = await api.get(`/production/dispatch/manifests/by-batch/${batchId}`);
      setActiveManifest(manifest);
      setIsManifestModalOpen(true);
    } catch (err: any) {
      alert(err.message || "Nenhum romaneio de envio encontrado para este lote.");
    }
  };

  // Reimpressão do Romaneio com auditoria
  const handleReprintManifest = async (manifestId: string) => {
    try {
      setSubmitting(true);
      const res = await api.post(`/production/dispatch/manifests/${manifestId}/reprint`, {
        reason: "Reimpressão solicitada no terminal de despacho",
      });
      setActiveManifest(res.manifest);
      setSuccessMsg(`Reimpressão registrada com sucesso! Total de vias: ${res.manifest.reprintCount}.`);
      window.print();
    } catch (err: any) {
      alert(err.message || "Erro ao registrar reimpressão.");
    } finally {
      setSubmitting(false);
    }
  };

  // Devolução para retrabalho
  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    try {
      setSubmitting(true);
      await api.post(`/production/batches/${selectedBatch.id}/return`, {
        pin: returnPin,
        targetSectorCode: returnTargetSector,
        reason: returnReason,
      });

      setIsReturnModalOpen(false);
      setSuccessMsg("Lote devolvido com sucesso para conferência anterior.");
      loadData();
    } catch (err: any) {
      alert(err.message || "Erro ao devolver lote.");
    } finally {
      setSubmitting(false);
    }
  };

  const batches = queueData?.batches || [];
  const filteredBatches = batches.filter((b: any) => {
    if (filterTab === "WAITING") return b.batchStatus === "WAITING";
    if (filterTab === "IN_PROGRESS") return b.batchStatus === "IN_PROGRESS";
    if (filterTab === "DISPATCHED") return b.batchStatus === "COMPLETED" || b.dispatchManifests?.length > 0;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Setor 11 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
              <Truck className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                  SETOR 11
                </span>
                <h1 className="text-2xl font-bold text-slate-900">Despache para Oficina de Costura</h1>
              </div>
              <p className="text-slate-500 text-sm mt-1">
                Remessas com Romaneio de Envio sequencial, controle de grade, prazo e assinatura digital HMAC.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-2 text-sm font-medium transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Mensagens de Sucesso ou Erro */}
        {successMsg && (
          <div className="mt-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {error && (
          <div className="mt-4 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2 text-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Contadores da Fila */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total na Fila</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">{queueData?.totalBatches || 0}</div>
          </div>
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Aguardando Envio</span>
            <div className="text-2xl font-bold text-amber-900 mt-1">{queueData?.waitingCount || 0}</div>
          </div>
          <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Em Separação</span>
            <div className="text-2xl font-bold text-blue-900 mt-1">{queueData?.inProgressCount || 0}</div>
          </div>
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Oficinas Ativas</span>
            <div className="text-2xl font-bold text-emerald-900 mt-1">{partners.length}</div>
          </div>
        </div>

        {/* Tabs de Filtro */}
        <div className="flex border-b border-slate-200 mt-6 gap-2">
          <button
            onClick={() => setFilterTab("ALL")}
            className={`pb-3 px-3 text-sm font-medium border-b-2 transition ${
              filterTab === "ALL"
                ? "border-amber-600 text-amber-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Todos os Lotes ({batches.length})
          </button>
          <button
            onClick={() => setFilterTab("WAITING")}
            className={`pb-3 px-3 text-sm font-medium border-b-2 transition ${
              filterTab === "WAITING"
                ? "border-amber-600 text-amber-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Aguardando ({queueData?.waitingCount || 0})
          </button>
          <button
            onClick={() => setFilterTab("IN_PROGRESS")}
            className={`pb-3 px-3 text-sm font-medium border-b-2 transition ${
              filterTab === "IN_PROGRESS"
                ? "border-amber-600 text-amber-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Em Preparação ({queueData?.inProgressCount || 0})
          </button>
        </div>
      </div>

      {/* Listagem de Lotes do Setor 11 */}
      {filteredBatches.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
          <Truck className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <h3 className="text-lg font-medium text-slate-800">Nenhum lote neste estágio no momento</h3>
          <p className="text-sm mt-1">Lotes concluídos na Separação (Setor 10) aparecerão aqui automaticamente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBatches.map((batch: any) => (
            <div
              key={batch.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 hover:border-amber-400 transition p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-sm font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded">
                      {batch.batchNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSheetBatchId(batch.id);
                        setIsSheetModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-700 px-2 py-0.5 text-xs font-semibold border border-sky-200 transition"
                      title="Abrir Ficha Universal do Pedido"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Ficha
                    </button>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      batch.batchStatus === "WAITING"
                        ? "bg-amber-100 text-amber-800"
                        : batch.batchStatus === "IN_PROGRESS"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {batch.batchStatus === "WAITING"
                      ? "Aguardando"
                      : batch.batchStatus === "IN_PROGRESS"
                      ? "Em Preparo"
                      : "Concluído"}
                  </span>
                </div>

                <h3 className="font-semibold text-slate-900 text-base line-clamp-1">
                  {batch.productionOrder?.title || "Ordem de Produção"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  OP: <strong className="font-mono text-slate-700">{batch.productionOrder?.opNumber}</strong>
                </p>
                <p className="text-xs text-slate-500">
                  Cliente: <span className="text-slate-700">{batch.productionOrder?.customer?.companyName || "N/D"}</span>
                </p>

                <div className="mt-4 p-3 rounded-lg bg-amber-50/50 border border-amber-100 flex items-center justify-between text-sm">
                  <span className="text-slate-600 font-medium">Quantidade:</span>
                  <span className="font-bold text-amber-900">{batch.quantity} peças</span>
                </div>
              </div>

              {/* Ações do Lote */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col gap-2">
                {batch.batchStatus === "WAITING" && (
                  <button
                    onClick={() => handleStartBatch(batch.id)}
                    disabled={submitting}
                    className="w-full py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-medium transition flex items-center justify-center gap-1.5"
                  >
                    Iniciar Preparação
                  </button>
                )}

                <button
                  onClick={() => handleOpenDispatchModal(batch)}
                  className="w-full py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium transition flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Truck className="w-4 h-4" />
                  Despachar para Oficina
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleViewManifest(batch.id)}
                    className="flex-1 py-1.5 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-xs font-medium transition flex items-center justify-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Romaneio
                  </button>
                  <button
                    onClick={() => {
                      setSelectedBatch(batch);
                      setReturnPin("");
                      setReturnReason("");
                      setIsReturnModalOpen(true);
                    }}
                    className="flex-1 py-1.5 border border-rose-200 text-rose-700 rounded-lg hover:bg-rose-50 text-xs font-medium transition flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Devolver
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL 1: Form de Despache para Oficina */}
      {isDispatchModalOpen && selectedBatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Despachar Lote para Oficina de Costura</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Lote: {selectedBatch.batchNumber} ({selectedBatch.quantity} peças)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmDispatch} className="space-y-5 mt-5">
              {/* Seleção de Oficina */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Oficina Parceira de Costura *
                </label>
                <select
                  value={selectedPartnerId}
                  onChange={(e) => setSelectedPartnerId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                >
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type === "INTERNAL" ? "Célula Interna" : "Terceirizada"}) - R$ {p.basePricePerPc.toFixed(2)}/peça
                    </option>
                  ))}
                </select>
              </div>

              {/* Data Prevista de Retorno */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Prazo Acordado de Retorno *
                </label>
                <div className="relative">
                  <input
                    type="datetime-local"
                    value={expectedReturnDate}
                    onChange={(e) => setExpectedReturnDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-800 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    required
                  />
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
                <p className="text-xs text-slate-500 mt-1">O prazo deve ser uma data e horário futuro.</p>
              </div>

              {/* Grade de Tamanhos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-slate-700">
                    Grade de Tamanhos Enviada *
                  </label>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                      totalGridPieces === selectedBatch.quantity
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    Total: {totalGridPieces} / {selectedBatch.quantity} peças
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                  {Object.keys(sizeGrid).map((sizeKey) => (
                    <div key={sizeKey} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-center">
                      <span className="block text-xs font-bold text-slate-600 mb-1">{sizeKey}</span>
                      <input
                        type="number"
                        min="0"
                        value={sizeGrid[sizeKey]}
                        onChange={(e) =>
                          setSizeGrid({
                            ...sizeGrid,
                            [sizeKey]: Math.max(0, parseInt(e.target.value, 10) || 0),
                          })
                        }
                        className="w-full text-center px-1 py-1 rounded border border-slate-300 font-mono text-sm bg-white"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Observações / Instruções para a Costura
                </label>
                <textarea
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  placeholder="Ex: Atenção ao vivo na gola, linha reforçada..."
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  rows={2}
                />
              </div>

              {/* Assinatura Digital PIN */}
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2 mb-2 text-amber-900 font-semibold text-sm">
                  <Lock className="w-4 h-4 text-amber-600" />
                  Assinatura Digital do Expedidor (PIN) *
                </div>
                <input
                  type="password"
                  maxLength={6}
                  value={operatorPin}
                  onChange={(e) => setOperatorPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Digite seu PIN de 4 a 6 dígitos"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-amber-300 bg-white font-mono text-sm tracking-widest text-center focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
                <p className="text-xs text-amber-700 mt-1">
                  A assinatura HMAC-SHA-256 será atrelada ao romaneio com o seu PIN autenticado.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsDispatchModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting || totalGridPieces !== selectedBatch.quantity}
                  className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold flex items-center gap-2 transition disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {submitting ? "Despachando..." : "Confirmar e Gerar Romaneio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Visualização e Impressão do Romaneio de Envio */}
      {isManifestModalOpen && activeManifest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full p-8 my-8 print:p-0 print:border-none print:shadow-none">
            {/* Controles de Fechamento / Impressão */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6 print:hidden">
              <span className="text-xs font-bold px-2.5 py-1 rounded bg-amber-100 text-amber-800">
                VIA DE REMESSA OFICIAL
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReprintManifest(activeManifest.id)}
                  disabled={submitting}
                  className="px-3.5 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-medium flex items-center gap-2 transition"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir / Reimprimir
                </button>
                <button
                  onClick={() => setIsManifestModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* CONTEÚDO IMPRIMÍVEL DO ROMANEIO */}
            <div className="border border-slate-300 rounded-xl p-6 bg-white space-y-6">
              {/* Cabeçalho */}
              <div className="flex items-start justify-between border-b pb-5">
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                    Romaneio de Envio de Costura
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">PCP Industrial — Gestão de Produção e Rastreabilidade</p>
                  <div className="text-sm font-mono font-bold text-amber-700 mt-2">
                    Nº: {activeManifest.manifestNumber}
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  {/* QR Code de Autenticidade */}
                  <div className="p-1.5 bg-white border border-slate-300 rounded-lg shadow-sm">
                    <QRCodeSVG
                      value={activeManifest.qrPayload || activeManifest.manifestNumber}
                      size={110}
                      level="M"
                    />
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 mt-1 uppercase">QR de Autenticidade</span>
                </div>
              </div>

              {/* Informações da Oficina e da OP */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="font-bold text-slate-800 block text-xs uppercase mb-1">Dados da Oficina:</span>
                  <p><strong>Nome:</strong> {activeManifest.sewingPartner?.name}</p>
                  <p><strong>Contato:</strong> {activeManifest.sewingPartner?.contactPerson || "N/A"}</p>
                  <p><strong>Telefone:</strong> {activeManifest.sewingPartner?.phone || "N/A"}</p>
                  <p><strong>Endereço:</strong> {activeManifest.sewingPartner?.address || "N/A"}</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="font-bold text-slate-800 block text-xs uppercase mb-1">Dados do Lote:</span>
                  <p><strong>OP:</strong> {activeManifest.productionOrder?.opNumber}</p>
                  <p><strong>Lote:</strong> {activeManifest.opBatch?.batchNumber || "Lote de Produção"}</p>
                  <p><strong>Cliente:</strong> {activeManifest.productionOrder?.customer?.companyName || "N/D"}</p>
                  <p>
                    <strong>Prazo de Retorno:</strong>{" "}
                    <span className="text-amber-800 font-bold">
                      {new Date(activeManifest.expectedReturnDate).toLocaleDateString("pt-BR")} às{" "}
                      {new Date(activeManifest.expectedReturnDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </p>
                </div>
              </div>

              {/* Grade de Tamanhos */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase mb-2">Grade de Peças Despachadas</h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-center">
                    <thead className="bg-slate-100 text-slate-700 font-bold">
                      <tr>
                        {Object.keys(JSON.parse(activeManifest.sizeGridBreakdown || "{}")).map((sz) => (
                          <th key={sz} className="py-2 border-r last:border-none border-slate-200 uppercase">
                            {sz}
                          </th>
                        ))}
                        <th className="py-2 bg-amber-100 text-amber-900 font-black">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {Object.values(JSON.parse(activeManifest.sizeGridBreakdown || "{}")).map((qty: any, idx) => (
                          <td key={idx} className="py-2.5 font-mono border-r last:border-none border-slate-200 font-bold text-slate-800">
                            {qty}
                          </td>
                        ))}
                        <td className="py-2.5 font-mono font-black text-amber-900 bg-amber-50">
                          {activeManifest.totalQuantity}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Assinatura Digital Criptográfica */}
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[10px] text-slate-500 font-mono break-all">
                <strong>Assinatura Digital HMAC-SHA-256:</strong> {activeManifest.digitalSignatureHash}
                <div className="mt-0.5 text-slate-400">
                  Emitido por: {activeManifest.createdBy?.name || currentUser.name} em {new Date(activeManifest.createdAt).toLocaleString("pt-BR")}
                  {activeManifest.reprintCount > 0 && ` (Reimpressão Nº ${activeManifest.reprintCount})`}
                </div>
              </div>

              {/* Linhas de Assinatura Física */}
              <div className="grid grid-cols-2 gap-8 pt-8">
                <div className="text-center">
                  <div className="border-t border-slate-400 pt-1.5 text-xs text-slate-700 font-semibold">
                    Expedição / PCP da Fábrica
                  </div>
                  <div className="text-[10px] text-slate-400">Assinatura do Expedidor</div>
                </div>
                <div className="text-center">
                  <div className="border-t border-slate-400 pt-1.5 text-xs text-slate-700 font-semibold">
                    {activeManifest.sewingPartner?.name}
                  </div>
                  <div className="text-[10px] text-slate-400">Assinatura do Responsável na Oficina</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Devolução para Retrabalho */}
      {isReturnModalOpen && selectedBatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-bold text-slate-900">Devolução de Lote (Retrabalho)</h3>
              <button onClick={() => setIsReturnModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleConfirmReturn} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Setor de Destino *</label>
                <select
                  value={returnTargetSector}
                  onChange={(e) => setReturnTargetSector(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  required
                >
                  <option value="SEPARACAO">Setor 10: Separação</option>
                  <option value="CALANDRA">Setor 09: Calandra</option>
                  <option value="INFESTO">Setor 08: Infesto</option>
                  <option value="IMPRESSAO">Setor 07: Impressão</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Motivo Detalhado *</label>
                <textarea
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Descreva o motivo da devolução..."
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  rows={3}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">PIN de Assinatura *</label>
                <input
                  type="password"
                  value={returnPin}
                  onChange={(e) => setReturnPin(e.target.value)}
                  placeholder="PIN"
                  className="w-full px-3 py-2 rounded-lg border text-sm font-mono text-center"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold"
                >
                  Confirmar Devolução
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
