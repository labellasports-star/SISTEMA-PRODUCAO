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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
              <Truck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-800">Setor 14 — Embalagem, Expedição & Entrega</h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">
                  Etapa Final do PCP
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                Empacotamento em volumes, geração de romaneios de entrega (RD), baixa física com PIN e conclusão oficial da OP.
              </p>
            </div>
          </div>

          <button
            onClick={loadQueue}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar Fila
          </button>
        </div>

        {/* Mensagens de Feedback */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError("")} className="text-red-500 hover:text-red-700 font-bold">×</button>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage("")} className="text-emerald-500 hover:text-emerald-700 font-bold">×</button>
          </div>
        )}
      </div>

      {/* Métricas Rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Lotes na Expedição</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{queueMetrics.totalBatches}</div>
          <div className="text-xs text-slate-400 mt-0.5">Aguardando saída física</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Total de Peças Prontas</div>
          <div className="text-2xl font-bold text-purple-600 mt-1">{queueMetrics.totalPieces}</div>
          <div className="text-xs text-slate-400 mt-0.5">Aprovadas pela Qualidade</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Aguardando Volumes / Embalagem</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{queueMetrics.pendingPackaging}</div>
          <div className="text-xs text-slate-400 mt-0.5">Sem volumes cadastrados</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Prontos para Romaneio / Entrega</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{queueMetrics.readyToDeliver}</div>
          <div className="text-xs text-slate-400 mt-0.5">Volumes gerados</div>
        </div>
      </div>

      {/* Tabela de Lotes em Expedição */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-600" />
            Fila de Expedição e Entrega Final
          </h3>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-purple-600 mb-2" />
            Carregando lotes da Expedição...
          </div>
        ) : queueBatches.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="font-medium text-slate-700">Nenhum lote pendente de expedição</p>
            <p className="text-xs text-slate-400 mt-1">Todos os lotes foram entregues ao cliente final.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Lote / OP</th>
                  <th className="py-3 px-4">Cliente / Pedido</th>
                  <th className="py-3 px-4 text-center">Quantidade</th>
                  <th className="py-3 px-4 text-center">Volumes</th>
                  <th className="py-3 px-4">Status / Romaneio</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queueBatches.map((batch: any) => {
                  const hasVolumes = batch.packageVolumes && batch.packageVolumes.length > 0;
                  const lastManifest = batch.deliveryManifests && batch.deliveryManifests.length > 0
                    ? batch.deliveryManifests[batch.deliveryManifests.length - 1]
                    : null;

                  return (
                    <tr key={batch.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{batch.batchNumber}</div>
                        <div className="text-xs font-mono text-slate-400">{batch.productionOrder?.opNumber}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{batch.productionOrder?.customer?.companyName || "Cliente"}</div>
                        <div className="text-xs text-slate-500">{batch.productionOrder?.title || batch.productionOrder?.productType}</div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-100">
                          {batch.quantity} pçs
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {hasVolumes ? (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {batch.packageVolumes.length} vol(s)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-50 text-amber-700">
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {lastManifest ? (
                          <div className="flex flex-col gap-1 items-start">
                            <span className="text-xs font-mono font-bold text-purple-700">
                              {lastManifest.manifestNumber}
                            </span>
                            <span className={`px-2 py-0.5 text-[11px] rounded font-medium ${
                              lastManifest.isDelivered
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-blue-50 text-blue-700"
                            }`}>
                              {lastManifest.isDelivered ? "Entregue ao Cliente" : "Em Trânsito / Aguardando Baixa"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Sem romaneio</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSheetBatchId(batch.id);
                            setIsSheetModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-colors inline-flex items-center gap-1"
                          title="Ver Ficha Universal do Pedido"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ficha
                        </button>

                        <button
                          onClick={() => handleOpenVolumeModal(batch)}
                          className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                        >
                          {hasVolumes ? "Editar Volumes" : "Registrar Volumes"}
                        </button>

                        {hasVolumes && !lastManifest && (
                          <button
                            onClick={() => handleOpenManifestModal(batch)}
                            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg text-white bg-purple-600 hover:bg-purple-700 transition-colors"
                          >
                            Gerar Romaneio (RD)
                          </button>
                        )}

                        {lastManifest && (
                          <>
                            <button
                              onClick={() => handleViewManifest(lastManifest.id)}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"
                            >
                              Ver Romaneio
                            </button>

                            {!lastManifest.isDelivered && (
                              <button
                                onClick={() => handleOpenDeliverModal(lastManifest)}
                                className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xl w-full p-6 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-800">Embalagem & Volumes — Lote {selectedBatch.batchNumber}</h3>
              </div>
              <button onClick={() => setIsVolumeModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">×</button>
            </div>

            <form onSubmit={handleSubmitVolumes} className="mt-4 space-y-4">
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500">Total do Lote: </span>
                  <strong className="text-slate-800">{selectedBatch.quantity} peças</strong>
                </div>
                <div>
                  <span className="text-slate-500">Soma dos Volumes: </span>
                  <strong className={totalPiecesInVolumes === selectedBatch.quantity ? "text-emerald-600" : "text-rose-600"}>
                    {totalPiecesInVolumes} peças
                  </strong>
                </div>
              </div>

              {/* Lista de Volumes */}
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {volumesList.map((vol, vIdx) => {
                  const volPieces = Object.values(vol.sizeBreakdown).reduce((s, q) => s + (Number(q) || 0), 0);
                  return (
                    <div key={vIdx} className="p-3 bg-purple-50/40 rounded-xl border border-purple-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-800">Volume #{vol.volumeNumber} ({volPieces} pçs)</span>
                        {volumesList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveVolume(vIdx)}
                            className="text-rose-500 hover:text-rose-700 text-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Grades por tamanho */}
                      <div className="grid grid-cols-5 gap-2">
                        {["P", "M", "G", "GG", "XG"].map((sz) => (
                          <div key={sz}>
                            <label className="block text-[11px] font-medium text-slate-500 mb-0.5">Tam {sz}</label>
                            <input
                              type="number"
                              min="0"
                              value={vol.sizeBreakdown[sz] ?? 0}
                              onChange={(e) => handleUpdateVolumeSize(vIdx, sz, Number(e.target.value))}
                              className="w-full px-2 py-1 text-xs border border-slate-300 rounded font-bold"
                            />
                          </div>
                        ))}
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-500 mb-0.5">Peso Estimado (kg, opcional):</label>
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
                          className="w-32 px-2 py-1 text-xs border border-slate-300 rounded"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleAddVolume}
                className="w-full py-2 text-xs font-semibold text-purple-700 border border-dashed border-purple-300 rounded-lg hover:bg-purple-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Outro Volume
              </button>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsVolumeModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingVolumes || totalPiecesInVolumes !== selectedBatch.quantity}
                  className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">Gerar Romaneio de Entrega (RD)</h3>
              <button onClick={() => setIsManifestModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">×</button>
            </div>

            <form onSubmit={handleSubmitManifest} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Transportadora ou Entregador:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Motoboy Express / Braspress / Próprio"
                  value={carrierName}
                  onChange={(e) => setCarrierName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Documento / Placa (Opcional):</label>
                <input
                  type="text"
                  placeholder="CPF/CNPJ ou Placa do veículo"
                  value={carrierDocument}
                  onChange={(e) => setCarrierDocument(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Telefone de Contato (Opcional):</label>
                <input
                  type="text"
                  placeholder="(11) 98888-0000"
                  value={carrierPhone}
                  onChange={(e) => setCarrierPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Instruções / Observações:</label>
                <textarea
                  rows={2}
                  placeholder="Entregar na portaria B..."
                  value={manifestNotes}
                  onChange={(e) => setManifestNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsManifestModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingManifest || !carrierName.trim()}
                  className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm"
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 my-8 print:border-none print:shadow-none print:p-0">
            {/* Cabeçalho do Romaneio */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-purple-600 uppercase">PCP Industrial • Fábrica de Uniformes</span>
                <h2 className="text-xl font-black text-slate-900 mt-0.5">{viewingManifest.manifestNumber}</h2>
                <p className="text-xs text-slate-500">Romaneio Oficial de Entrega de Produção</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Emissão:</div>
                <div className="text-xs font-bold text-slate-800">
                  {new Date(viewingManifest.createdAt).toLocaleString("pt-BR")}
                </div>
                {viewingManifest.reprintCount > 0 && (
                  <span className="inline-block px-2 py-0.5 text-[10px] rounded bg-amber-50 text-amber-700 font-bold border border-amber-200 mt-1">
                    Reimpressão #{viewingManifest.reprintCount}
                  </span>
                )}
              </div>
            </div>

            {/* Dados do Destinatário e Transporte */}
            <div className="grid grid-cols-2 gap-4 py-3 border-b border-slate-200 text-xs">
              <div>
                <span className="text-slate-400">Cliente / Destinatário:</span>
                <div className="font-bold text-slate-800 text-sm mt-0.5">{viewingManifest.customer?.companyName}</div>
                <div className="text-slate-500">Contato: {viewingManifest.customer?.contactName} ({viewingManifest.customer?.phone})</div>
                <div className="text-slate-500 mt-1">OP: <strong>{viewingManifest.productionOrder?.opNumber}</strong></div>
              </div>
              <div>
                <span className="text-slate-400">Transporte / Entrega:</span>
                <div className="font-bold text-purple-800 text-sm mt-0.5">{viewingManifest.carrierName}</div>
                {viewingManifest.carrierDocument && <div className="text-slate-500">Doc/Placa: {viewingManifest.carrierDocument}</div>}
                {viewingManifest.carrierPhone && <div className="text-slate-500">Telefone: {viewingManifest.carrierPhone}</div>}
              </div>
            </div>

            {/* Grade de Volumes */}
            <div className="py-3 border-b border-slate-200">
              <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">Volumes Embalados</h4>
              <div className="space-y-1.5 text-xs">
                {viewingManifest.volumes?.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-200">
                    <div>
                      <span className="font-bold text-slate-800">Vol #{v.volumeNumber}</span>
                      <span className="text-slate-500 ml-2">({v.quantity} peças)</span>
                      <span className="font-mono text-[10px] text-slate-400 ml-2">{v.labelQrCode}</span>
                    </div>
                    {v.weightKg && <span className="text-slate-600 font-medium">{v.weightKg} kg</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-800 mt-2 px-2">
                <span>Total de Volumes: {viewingManifest.volumes?.length || 0}</span>
                <span>Total de Peças: {viewingManifest.totalQuantity} pçs</span>
              </div>
            </div>

            {/* Status e Assinatura */}
            <div className="py-3 border-b border-slate-200 text-xs flex items-center justify-between">
              <div>
                <span className="text-slate-400">Status da Entrega:</span>
                <div className="font-bold text-sm mt-0.5">
                  {viewingManifest.isDelivered ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Entregue para {viewingManifest.deliveredRecipient}
                    </span>
                  ) : (
                    <span className="text-blue-600 flex items-center gap-1">
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
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800"
              >
                Fechar
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleReprintManifest(viewingManifest.id)}
                  disabled={isReprinting}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  {isReprinting ? "Reimprimindo..." : "Imprimir Romaneio"}
                </button>
                {!viewingManifest.isDelivered && (
                  <button
                    onClick={() => handleOpenDeliverModal(viewingManifest)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-800">Baixa de Entrega — {manifestToDeliver.manifestNumber}</h3>
              </div>
              <button onClick={() => setIsDeliverModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">×</button>
            </div>

            <form onSubmit={handleSubmitDeliver} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nome do Recebedor (Cliente):</label>
                <input
                  type="text"
                  required
                  placeholder="Nome completo de quem recebeu as peças"
                  value={deliveredRecipient}
                  onChange={(e) => setDeliveredRecipient(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Observações da Entrega (Opcional):</label>
                <textarea
                  rows={2}
                  placeholder="Canhoto assinado, entrega sem avarias..."
                  value={deliverNotes}
                  onChange={(e) => setDeliverNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  PIN de Assinatura do Expedidor:
                </label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  placeholder="PIN de 4 a 6 dígitos"
                  value={deliverPin}
                  onChange={(e) => setDeliverPin(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg tracking-widest focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Assinatura digital criptografada e verificação de conclusão da OP.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsDeliverModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDeliver || !deliveredRecipient.trim() || !deliverPin}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
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
