import React, { useState, useEffect } from "react";
import {
  Truck,
  Package,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Printer,
  QrCode,
  ShieldCheck,
  Search,
  RefreshCw,
  Plus,
  Trash2,
  UserCheck,
  Info,
  Calendar,
  Building2,
  Check,
  Eye,
} from "lucide-react";
import { api } from "../services/api.js";
import { User, DeliveryManifest, PackageVolume } from "../types.js";
import { UniversalOrderSheetModal } from "./UniversalOrderSheetModal.js";

interface Sector14ExpedicaoPanelProps {
  currentUser: User | null;
}

export function Sector14ExpedicaoPanel({ currentUser }: Sector14ExpedicaoPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Fila de Lotes em Expedição
  const [queueBatches, setQueueBatches] = useState<any[]>([]);
  const [queueMetrics, setQueueMetrics] = useState({
    totalBatches: 0,
    totalPieces: 0,
    pendingPackaging: 0,
    readyToDeliver: 0,
  });

  // Modal de Embalagem / Volumes
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);
  const [isVolumeModalOpen, setIsVolumeModalOpen] = useState(false);
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [selectedSheetBatchId, setSelectedSheetBatchId] = useState<string | null>(null);
  const [volumesList, setVolumesList] = useState<
    { volumeNumber: number; sizeBreakdown: Record<string, number>; weightKg?: number }[]
  >([]);
  const [isSubmittingVolumes, setIsSubmittingVolumes] = useState(false);

  // Modal de Geração de Romaneio
  const [isManifestModalOpen, setIsManifestModalOpen] = useState(false);
  const [carrierName, setCarrierName] = useState("");
  const [carrierDocument, setCarrierDocument] = useState("");
  const [carrierPhone, setCarrierPhone] = useState("");
  const [manifestNotes, setManifestNotes] = useState("");
  const [isSubmittingManifest, setIsSubmittingManifest] = useState(false);

  // Modal de Visualização / Impressão de Romaneio
  const [viewingManifest, setViewingManifest] = useState<DeliveryManifest | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isReprinting, setIsReprinting] = useState(false);

  // Modal de Baixa de Entrega
  const [isDeliverModalOpen, setIsDeliverModalOpen] = useState(false);
  const [manifestToDeliver, setManifestToDeliver] = useState<DeliveryManifest | null>(null);
  const [deliveredRecipient, setDeliveredRecipient] = useState("");
  const [deliverNotes, setDeliverNotes] = useState("");
  const [deliverPin, setDeliverPin] = useState("");
  const [isSubmittingDeliver, setIsSubmittingDeliver] = useState(false);

  // Carregar fila de lotes em Expedição
  const loadQueue = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get<any>("/production/queue/EXPEDICAO");
      const batches = res.batches || [];
      setQueueBatches(batches);

      const totalBatches = batches.length;
      const totalPieces = batches.reduce((sum: number, b: any) => sum + (b.quantity || 0), 0);
      const pendingPackaging = batches.filter(
        (b: any) => !b.packageVolumes || b.packageVolumes.length === 0
      ).length;
      const readyToDeliver = batches.filter(
        (b: any) => b.packageVolumes && b.packageVolumes.length > 0
      ).length;

      setQueueMetrics({
        totalBatches,
        totalPieces,
        pendingPackaging,
        readyToDeliver,
      });
    } catch (err: any) {
      console.error("Erro ao carregar fila da Expedição:", err);
      setError(err.message || "Erro ao carregar fila do Setor 14 (Expedição).");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  // Abrir modal de volumes
  const handleOpenVolumeModal = (batch: any) => {
    setSelectedBatch(batch);
    setError("");

    // Carregar volumes já existentes ou inicializar com 1 volume com o total do lote
    if (batch.packageVolumes && batch.packageVolumes.length > 0) {
      const existing = batch.packageVolumes.map((pv: any) => {
        let sb = {};
        try {
          sb = typeof pv.sizeBreakdown === "string" ? JSON.parse(pv.sizeBreakdown) : pv.sizeBreakdown;
        } catch (_) {}
        return {
          volumeNumber: pv.volumeNumber,
          sizeBreakdown: sb,
          weightKg: pv.weightKg || undefined,
        };
      });
      setVolumesList(existing);
    } else {
      setVolumesList([
        {
          volumeNumber: 1,
          sizeBreakdown: { M: batch.quantity },
          weightKg: undefined,
        },
      ]);
    }
    setIsVolumeModalOpen(true);
  };

  // Adicionar novo volume
  const handleAddVolume = () => {
    const nextNum = volumesList.length + 1;
    setVolumesList([
      ...volumesList,
      {
        volumeNumber: nextNum,
        sizeBreakdown: { M: 0 },
        weightKg: undefined,
      },
    ]);
  };

  // Remover volume
  const handleRemoveVolume = (idx: number) => {
    if (volumesList.length <= 1) return;
    const updated = volumesList.filter((_, i) => i !== idx).map((v, i) => ({
      ...v,
      volumeNumber: i + 1,
    }));
    setVolumesList(updated);
  };

  // Atualizar tamanho/quantidade do volume
  const handleUpdateVolumeSize = (volIdx: number, size: string, qty: number) => {
    const updated = [...volumesList];
    updated[volIdx].sizeBreakdown = {
      ...updated[volIdx].sizeBreakdown,
      [size]: Math.max(0, qty),
    };
    setVolumesList(updated);
  };

  // Total de peças somado em todos os volumes
  const totalPiecesInVolumes = volumesList.reduce((acc, v) => {
    const sumVol = Object.values(v.sizeBreakdown).reduce((s, q) => s + (Number(q) || 0), 0);
    return acc + sumVol;
  }, 0);

  // Submeter registro de volumes
  const handleSubmitVolumes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    if (totalPiecesInVolumes !== selectedBatch.quantity) {
      setError(
        `A soma das peças dos volumes (${totalPiecesInVolumes}) difere da quantidade do lote (${selectedBatch.quantity}). Ajuste para bater exatamente!`
      );
      return;
    }

    try {
      setIsSubmittingVolumes(true);
      setError("");
      const res = await api.post<any>(`/production/batches/${selectedBatch.id}/volumes`, {
        volumes: volumesList,
      });
      setSuccessMessage(res.message || "Volumes registrados com sucesso!");
      setIsVolumeModalOpen(false);
      loadQueue();
    } catch (err: any) {
      console.error("Erro ao registrar volumes:", err);
      setError(err.message || "Erro ao registrar volumes.");
    } finally {
      setIsSubmittingVolumes(false);
    }
  };

  // Abrir modal de geração de romaneio
  const handleOpenManifestModal = (batch: any) => {
    setSelectedBatch(batch);
    setCarrierName("");
    setCarrierDocument("");
    setCarrierPhone("");
    setManifestNotes("");
    setIsManifestModalOpen(true);
  };

  // Submeter geração de romaneio
  const handleSubmitManifest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch || !carrierName.trim()) return;

    try {
      setIsSubmittingManifest(true);
      setError("");
      const res = await api.post<any>(`/production/batches/${selectedBatch.id}/delivery-manifest`, {
        carrierName,
        carrierDocument: carrierDocument || undefined,
        carrierPhone: carrierPhone || undefined,
        notes: manifestNotes || undefined,
      });
      setSuccessMessage(res.message || "Romaneio de entrega gerado com sucesso!");
      setIsManifestModalOpen(false);
      loadQueue();
      // Abrir prévia de visualização
      if (res.manifest) {
        handleViewManifest(res.manifest.id);
      }
    } catch (err: any) {
      console.error("Erro ao gerar romaneio de entrega:", err);
      setError(err.message || "Erro ao gerar romaneio de entrega.");
    } finally {
      setIsSubmittingManifest(false);
    }
  };

  // Visualizar / consultar romaneio
  const handleViewManifest = async (manifestId: string) => {
    try {
      setError("");
      const res = await api.get<any>(`/production/delivery-manifests/${manifestId}`);
      setViewingManifest(res.manifest);
      setIsViewModalOpen(true);
    } catch (err: any) {
      console.error("Erro ao carregar romaneio:", err);
      setError(err.message || "Erro ao carregar romaneio.");
    }
  };

  // Reimpressão auditada de romaneio
  const handleReprintManifest = async (manifestId: string) => {
    try {
      setIsReprinting(true);
      const res = await api.post<any>(`/production/delivery-manifests/${manifestId}/reprint`);
      setViewingManifest(res.manifest);
      setSuccessMessage(res.message || "Reimpressão registrada com sucesso!");
      window.print();
    } catch (err: any) {
      console.error("Erro ao reimprimir romaneio:", err);
      setError(err.message || "Erro ao reimprimir romaneio.");
    } finally {
      setIsReprinting(false);
    }
  };

  // Abrir modal de baixa de entrega
  const handleOpenDeliverModal = (manifest: DeliveryManifest) => {
    setManifestToDeliver(manifest);
    setDeliveredRecipient("");
    setDeliverNotes("");
    setDeliverPin("");
    setIsDeliverModalOpen(true);
  };

  // Submeter baixa de entrega
  const handleSubmitDeliver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manifestToDeliver || !deliveredRecipient.trim() || !deliverPin) return;

    try {
      setIsSubmittingDeliver(true);
      setError("");
      const res = await api.post<any>(`/production/delivery-manifests/${manifestToDeliver.id}/deliver`, {
        pin: deliverPin,
        deliveredRecipient,
        notes: deliverNotes || undefined,
      });

      setSuccessMessage(res.message || "Entrega baixada com sucesso!");
      setIsDeliverModalOpen(false);
      setIsViewModalOpen(false);
      loadQueue();
    } catch (err: any) {
      console.error("Erro ao dar baixa na entrega:", err);
      setError(err.message || "Erro ao registrar baixa da entrega.");
    } finally {
      setIsSubmittingDeliver(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header do Setor 14 */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
              <Truck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  SETOR 14
                </span>
                <h1 className="text-2xl font-bold text-white">Embalagem, Expedição & Entrega</h1>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">
                Empacotamento em volumes, geração de romaneios de entrega (RD), baixa física com PIN e conclusão oficial da OP.
              </p>
            </div>
          </div>

          <button
            onClick={loadQueue}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar Fila
          </button>
        </div>

        {/* Mensagens de Feedback */}
        {error && (
          <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError("")} className="text-rose-400 hover:text-rose-200 font-bold">×</button>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage("")} className="text-emerald-400 hover:text-emerald-200 font-bold">×</button>
          </div>
        )}
      </div>

      {/* Métricas Rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Lotes na Expedição</div>
          <div className="text-2xl font-bold text-white mt-1">{queueMetrics.totalBatches}</div>
          <div className="text-xs text-slate-500 mt-0.5">Aguardando saída física</div>
        </div>
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
          <div className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">Total de Peças Prontas</div>
          <div className="text-2xl font-bold text-purple-300 mt-1">{queueMetrics.totalPieces}</div>
          <div className="text-xs text-slate-500 mt-0.5">Aprovadas pela Qualidade</div>
        </div>
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
          <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Aguardando Volumes / Embalagem</div>
          <div className="text-2xl font-bold text-amber-300 mt-1">{queueMetrics.pendingPackaging}</div>
          <div className="text-xs text-slate-500 mt-0.5">Sem volumes cadastrados</div>
        </div>
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-xl">
          <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Prontos para Romaneio / Entrega</div>
          <div className="text-2xl font-bold text-emerald-300 mt-1">{queueMetrics.readyToDeliver}</div>
          <div className="text-xs text-slate-500 mt-0.5">Volumes gerados</div>
        </div>
      </div>

      {/* Tabela de Lotes em Expedição */}
      <div className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-400" />
            Fila de Expedição e Entrega Final
          </h3>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-purple-400 mb-2" />
            Carregando lotes da Expedição...
          </div>
        ) : queueBatches.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-slate-600 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-300">Nenhum lote pendente de expedição</h4>
            <p className="text-xs text-slate-500 mt-1">Todos os lotes foram entregues ao cliente final.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-xs font-semibold text-slate-400">
                  <th className="py-3 px-4">Lote / OP</th>
                  <th className="py-3 px-4">Cliente / Pedido</th>
                  <th className="py-3 px-4 text-center">Quantidade</th>
                  <th className="py-3 px-4 text-center">Volumes</th>
                  <th className="py-3 px-4">Status / Romaneio</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {queueBatches.map((batch: any) => {
                  const hasVolumes = batch.packageVolumes && batch.packageVolumes.length > 0;
                  const lastManifest = batch.deliveryManifests && batch.deliveryManifests.length > 0
                    ? batch.deliveryManifests[batch.deliveryManifests.length - 1]
                    : null;

                  return (
                    <tr key={batch.id} className="hover:bg-slate-800/40 text-slate-200">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{batch.batchNumber}</div>
                        <div className="text-xs font-mono text-slate-400">{batch.productionOrder?.opNumber}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200">{batch.productionOrder?.customer?.companyName || "Cliente"}</div>
                        <div className="text-xs text-slate-400">{batch.productionOrder?.title || batch.productionOrder?.productType}</div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {batch.quantity} pçs
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {hasVolumes ? (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            {batch.packageVolumes.length} vol(s)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {lastManifest ? (
                          <div className="flex flex-col gap-1 items-start">
                            <span className="text-xs font-mono font-bold text-purple-400">
                              {lastManifest.manifestNumber}
                            </span>
                            <span className={`px-2 py-0.5 text-[11px] rounded font-medium ${
                              lastManifest.isDelivered
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                            }`}>
                              {lastManifest.isDelivered ? "Entregue ao Cliente" : "Em Trânsito / Aguardando Baixa"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">Sem romaneio</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSheetBatchId(batch.id);
                            setIsSheetModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 transition-colors inline-flex items-center gap-1"
                          title="Ver Ficha Universal do Pedido"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ficha
                        </button>

                        <button
                          onClick={() => handleOpenVolumeModal(batch)}
                          className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700"
                        >
                          {hasVolumes ? "Editar Volumes" : "Registrar Volumes"}
                        </button>

                        {hasVolumes && !lastManifest && (
                          <button
                            onClick={() => handleOpenManifestModal(batch)}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg text-white bg-purple-600 hover:bg-purple-500 transition-colors shadow-sm"
                          >
                            Gerar Romaneio (RD)
                          </button>
                        )}

                        {lastManifest && (
                          <>
                            <button
                              onClick={() => handleViewManifest(lastManifest.id)}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition-colors"
                            >
                              Ver Romaneio
                            </button>

                            {!lastManifest.isDelivered && (
                              <button
                                onClick={() => handleOpenDeliverModal(lastManifest)}
                                className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-sm"
                              >
                                Baixar Entrega
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: REGISTRO DE VOLUMES */}
      {isVolumeModalOpen && selectedBatch && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 max-w-xl w-full p-6 my-8 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-white text-lg">Embalagem & Volumes — Lote {selectedBatch.batchNumber}</h3>
              </div>
              <button onClick={() => setIsVolumeModalOpen(false)} className="text-slate-400 hover:text-white font-bold text-xl">×</button>
            </div>

            <form onSubmit={handleSubmitVolumes} className="mt-4 space-y-4">
              <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400">Total do Lote: </span>
                  <strong className="text-white">{selectedBatch.quantity} peças</strong>
                </div>
                <div>
                  <span className="text-slate-400">Soma dos Volumes: </span>
                  <strong className={totalPiecesInVolumes === selectedBatch.quantity ? "text-emerald-400" : "text-rose-400"}>
                    {totalPiecesInVolumes} peças
                  </strong>
                </div>
              </div>

              {/* Lista de Volumes */}
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {volumesList.map((vol, vIdx) => {
                  const volPieces = Object.values(vol.sizeBreakdown).reduce((s, q) => s + (Number(q) || 0), 0);
                  return (
                    <div key={vIdx} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-300">Volume #{vol.volumeNumber} ({volPieces} pçs)</span>
                        {volumesList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveVolume(vIdx)}
                            className="text-rose-400 hover:text-rose-300 text-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Grades por tamanho */}
                      <div className="grid grid-cols-5 gap-2">
                        {["P", "M", "G", "GG", "XG"].map((sz) => (
                          <div key={sz}>
                            <label className="block text-[11px] font-medium text-slate-400 mb-0.5">Tam {sz}</label>
                            <input
                              type="number"
                              min="0"
                              value={vol.sizeBreakdown[sz] ?? 0}
                              onChange={(e) => handleUpdateVolumeSize(vIdx, sz, Number(e.target.value))}
                              className="w-full px-2 py-1 text-xs bg-slate-900 border border-slate-700 text-white rounded font-bold focus:border-purple-500 focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-0.5">Peso Estimado (kg, opcional):</label>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Ex: 3.5"
                          value={vol.weightKg ?? ""}
                          onChange={(e) => {
                            const updated = [...volumesList];
                            updated[vIdx].weightKg = e.target.value ? Number(e.target.value) : undefined;
                            setVolumesList(updated);
                          }}
                          className="w-32 px-2 py-1 text-xs bg-slate-900 border border-slate-700 text-white rounded focus:border-purple-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleAddVolume}
                className="w-full py-2 text-xs font-semibold text-purple-400 border border-dashed border-purple-500/40 rounded-lg hover:bg-purple-500/10 transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Outro Volume
              </button>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsVolumeModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingVolumes || totalPiecesInVolumes !== selectedBatch.quantity}
                  className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isSubmittingVolumes ? "Salvando..." : "Salvar Volumes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: GERAÇÃO DE ROMANEIO (RD) */}
      {isManifestModalOpen && selectedBatch && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 max-w-md w-full p-6 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white">Gerar Romaneio de Entrega (RD)</h3>
              <button onClick={() => setIsManifestModalOpen(false)} className="text-slate-400 hover:text-white font-bold text-xl">×</button>
            </div>

            <form onSubmit={handleSubmitManifest} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Transportadora ou Entregador:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Motoboy Express / Braspress / Próprio"
                  value={carrierName}
                  onChange={(e) => setCarrierName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Documento / Placa (Opcional):</label>
                <input
                  type="text"
                  placeholder="CPF/CNPJ ou Placa do veículo"
                  value={carrierDocument}
                  onChange={(e) => setCarrierDocument(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Telefone de Contato (Opcional):</label>
                <input
                  type="text"
                  placeholder="(11) 98888-0000"
                  value={carrierPhone}
                  onChange={(e) => setCarrierPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Instruções / Observações:</label>
                <textarea
                  rows={2}
                  placeholder="Entregar na portaria B..."
                  value={manifestNotes}
                  onChange={(e) => setManifestNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsManifestModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingManifest || !carrierName.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-lg shadow-sm"
                >
                  {isSubmittingManifest ? "Gerando RD..." : "Emitir Romaneio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: VISUALIZAÇÃO / IMPRESSÃO DE ROMANEIO (RD) */}
      {isViewModalOpen && viewingManifest && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 max-w-2xl w-full p-6 my-8 text-white print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
            {/* Cabeçalho do Romaneio */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 print:border-slate-300">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-purple-400 uppercase print:text-purple-700">PCP Industrial • Fábrica de Uniformes</span>
                <h2 className="text-xl font-black text-white mt-0.5 print:text-black">{viewingManifest.manifestNumber}</h2>
                <p className="text-xs text-slate-400 print:text-slate-600">Romaneio Oficial de Entrega de Produção</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 print:text-slate-600">Emissão:</div>
                <div className="text-xs font-bold text-white print:text-black">
                  {new Date(viewingManifest.createdAt).toLocaleString("pt-BR")}
                </div>
                {viewingManifest.reprintCount > 0 && (
                  <span className="inline-block px-2 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 mt-1 print:bg-amber-100 print:text-amber-800">
                    Reimpressão #{viewingManifest.reprintCount}
                  </span>
                )}
              </div>
            </div>

            {/* Dados do Destinatário e Transporte */}
            <div className="grid grid-cols-2 gap-4 py-3 border-b border-slate-800 print:border-slate-300 text-xs">
              <div>
                <span className="text-slate-400">Cliente / Destinatário:</span>
                <div className="font-bold text-white text-sm mt-0.5 print:text-black">{viewingManifest.customer?.companyName}</div>
                <div className="text-slate-400 print:text-slate-600">Contato: {viewingManifest.customer?.contactName} ({viewingManifest.customer?.phone})</div>
                <div className="text-slate-400 print:text-slate-600 mt-1">OP: <strong className="text-white print:text-black">{viewingManifest.productionOrder?.opNumber}</strong></div>
              </div>
              <div>
                <span className="text-slate-400">Transporte / Entrega:</span>
                <div className="font-bold text-purple-400 text-sm mt-0.5 print:text-purple-800">{viewingManifest.carrierName}</div>
                {viewingManifest.carrierDocument && <div className="text-slate-400 print:text-slate-600">Doc/Placa: {viewingManifest.carrierDocument}</div>}
                {viewingManifest.carrierPhone && <div className="text-slate-400 print:text-slate-600">Telefone: {viewingManifest.carrierPhone}</div>}
              </div>
            </div>

            {/* Grade de Volumes */}
            <div className="py-3 border-b border-slate-800 print:border-slate-300">
              <h4 className="text-xs font-bold text-slate-300 uppercase mb-2 print:text-black">Volumes Embalados</h4>
              <div className="space-y-1.5 text-xs">
                {viewingManifest.volumes?.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-2 bg-slate-950 rounded border border-slate-800 print:bg-slate-50 print:border-slate-300">
                    <div>
                      <span className="font-bold text-white print:text-black">Vol #{v.volumeNumber}</span>
                      <span className="text-slate-400 print:text-slate-600 ml-2">({v.quantity} peças)</span>
                      <span className="font-mono text-[10px] text-slate-500 ml-2">{v.labelQrCode}</span>
                    </div>
                    {v.weightKg && <span className="text-slate-400 font-medium print:text-slate-600">{v.weightKg} kg</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-white mt-2 px-2 print:text-black">
                <span>Total de Volumes: {viewingManifest.volumes?.length || 0}</span>
                <span>Total de Peças: {viewingManifest.totalQuantity} pçs</span>
              </div>
            </div>

            {/* Status e Assinatura */}
            <div className="py-3 border-b border-slate-800 print:border-slate-300 text-xs flex items-center justify-between">
              <div>
                <span className="text-slate-400">Status da Entrega:</span>
                <div className="font-bold text-sm mt-0.5">
                  {viewingManifest.isDelivered ? (
                    <span className="text-emerald-400 flex items-center gap-1 print:text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" /> Entregue para {viewingManifest.deliveredRecipient}
                    </span>
                  ) : (
                    <span className="text-sky-400 flex items-center gap-1 print:text-blue-700">
                      <Clock className="w-4 h-4" /> Em Transporte
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-mono">Assinatura HMAC:</span>
                <span className="font-mono text-[10px] text-slate-500 max-w-xs truncate block">
                  {viewingManifest.digitalSignatureHash || "HMAC-SHA256"}
                </span>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex items-center justify-between pt-4 print:hidden">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white"
              >
                Fechar
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReprintManifest(viewingManifest.id)}
                  disabled={isReprinting}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors border border-slate-700"
                >
                  <Printer className="w-3.5 h-3.5" />
                  {isReprinting ? "Reimprimindo..." : "Imprimir Romaneio"}
                </button>
                {!viewingManifest.isDelivered && (
                  <button
                    onClick={() => handleOpenDeliverModal(viewingManifest)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition-all"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Baixar Entrega
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: BAIXA DA ENTREGA */}
      {isDeliverModalOpen && manifestToDeliver && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 max-w-md w-full p-6 text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Baixa de Entrega — {manifestToDeliver.manifestNumber}</h3>
              </div>
              <button onClick={() => setIsDeliverModalOpen(false)} className="text-slate-400 hover:text-white font-bold text-xl">×</button>
            </div>

            <form onSubmit={handleSubmitDeliver} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Recebedor (Cliente):</label>
                <input
                  type="text"
                  required
                  placeholder="Nome completo de quem recebeu as peças"
                  value={deliveredRecipient}
                  onChange={(e) => setDeliveredRecipient(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Observações da Entrega (Opcional):</label>
                <textarea
                  rows={2}
                  placeholder="Canhoto assinado, entrega sem avarias..."
                  value={deliverNotes}
                  onChange={(e) => setDeliverNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 text-white rounded-lg focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <label className="block text-xs font-semibold text-slate-200 mb-1">
                  PIN de Assinatura do Expedidor:
                </label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  placeholder="PIN de 4 a 6 dígitos"
                  value={deliverPin}
                  onChange={(e) => setDeliverPin(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 text-white rounded-lg tracking-widest text-center focus:border-emerald-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Assinatura digital criptografada e verificação de conclusão da OP.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDeliverModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDeliver || !deliveredRecipient.trim() || !deliverPin}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm"
                >
                  {isSubmittingDeliver ? "Confirmando..." : "Confirmar & Baixar Entrega"}
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
        currentUser={currentUser || { id: "", name: "Expedição", role: "OPERADOR", hasPin: true }}
      />
    </div>
  );
}
