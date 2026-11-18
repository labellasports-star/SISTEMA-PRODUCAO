import React, { useState, useEffect } from "react";
import {
  Palette,
  FileImage,
  Upload,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  UserCheck,
  Eye,
  Download,
  Image as ImageIcon,
} from "lucide-react";
import { api } from "../services/api.js";
import { getSocket } from "../services/socket.js";
import { UniversalOrderSheetModal } from "./UniversalOrderSheetModal.js";

export function DesignerPanel({ currentUser }: { currentUser?: any }) {
  const [queue, setQueue] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<any | null>(null);

  // Ficha Universal do Pedido
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [sheetQuotationId, setSheetQuotationId] = useState<string | null>(null);

  // Form states de upload de versão de arte
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [vectorUrl, setVectorUrl] = useState("");
  const [changeNotes, setChangeNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPreview, setIsUploadingPreview] = useState(false);
  const [isUploadingVector, setIsUploadingVector] = useState(false);

  const loadQueue = async () => {
    setIsLoading(true);
    try {
      const data = await api.getDesignQueue();
      setQueue(data);
    } catch (err) {
      console.error("Erro ao carregar fila de arte:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handleUpdate = () => {
      loadQueue();
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

  const handleClaim = async (quotationId: string) => {
    try {
      await api.claimDesign(quotationId);
      await loadQueue();
    } catch (err: any) {
      alert(err.message || "Erro ao assumir desenvolvimento de arte.");
    }
  };

  const handleSubmitVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuotation) return;
    setFormError("");
    setIsSubmitting(true);
    try {
      await api.submitArtworkVersion(selectedQuotation.id, {
        previewUrl,
        vectorUrl: vectorUrl || undefined,
        changeNotes,
      });

      setIsVersionModalOpen(false);
      setPreviewUrl("");
      setVectorUrl("");
      setChangeNotes("");
      setSelectedQuotation(null);
    } catch (err: any) {
      setFormError(err.message || "Erro ao enviar versão da arte.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadPreview = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPreview(true);
    setFormError("");
    try {
      const res = await api.uploadArtworkFile(file);
      setPreviewUrl(res.fileUrl);
    } catch (err: any) {
      setFormError(err.message || "Erro no upload do mockup.");
    } finally {
      setIsUploadingPreview(false);
    }
  };

  const handleUploadVector = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingVector(true);
    setFormError("");
    try {
      const res = await api.uploadArtworkFile(file);
      setVectorUrl(res.fileUrl);
    } catch (err: any) {
      setFormError(err.message || "Erro no upload do vetor.");
    } finally {
      setIsUploadingVector(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Palette className="h-6 w-6 text-pink-400" />
            Painel Operacional — Designer / Arte-Final
          </h2>
          <p className="text-xs text-slate-400">
            Fila de desenvolvimento de layouts, versionamento de mockups e envio ao vendedor.
          </p>
        </div>

        <button
          onClick={loadQueue}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 transition border border-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar Fila ({queue.length})
        </button>
      </div>

      {/* FILA DE SOLICITAÇÕES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {queue.map((item) => {
          const isUnderAlteration = item.status === "ARTE_EM_ALTERACAO";
          const isClaimedByMe = item.status === "DESENVOLVIMENTO_ARTE";

          return (
            <div
              key={item.id}
              className={`rounded-2xl border p-5 shadow-xl transition relative overflow-hidden ${
                isUnderAlteration
                  ? "bg-slate-900/90 border-rose-500/50 hover:border-rose-400"
                  : "bg-slate-900 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-xs font-bold text-sky-400">
                  {item.quotationNumber}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    isUnderAlteration
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      : isClaimedByMe
                      ? "bg-pink-500/20 text-pink-300 border border-pink-500/30"
                      : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                  }`}
                >
                  {isUnderAlteration
                    ? "Alteração Solicitada"
                    : isClaimedByMe
                    ? "Em Andamento"
                    : "Aguardando Designer"}
                </span>
              </div>

              <h3 className="mt-2 text-base font-bold text-white">{item.teamName}</h3>
              <p className="text-xs text-slate-400">
                Cliente: <strong className="text-slate-300">{item.customer.companyName}</strong> ({item.customer.contactName} - {item.customer.phone})
              </p>

              {/* Especificações Técnicas do Modelo */}
              {item.items && item.items.length > 0 && (() => {
                const first = item.items[0];
                return (
                  <div className="mt-2.5 p-2 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] space-y-1">
                    <div className="text-slate-300">
                      <strong className="text-slate-400">Modelo: </strong>
                      <span className="text-sky-300 font-semibold">
                        {first.isCustomModel ? `Outros: ${first.customModelName || first.productModel}` : first.productModel}
                      </span>
                    </div>
                    <div className="text-slate-300 flex flex-wrap gap-x-3">
                      <span>
                        <strong className="text-slate-400">Tecido: </strong>
                        {first.isCustomFabric ? `Outros: ${first.customFabricName || first.fabricType}` : first.fabricType || "Dry Fit Padrão"}
                      </span>
                      <span>
                        <strong className="text-slate-400">Gola: </strong>
                        {first.isCustomCollar ? `Outros: ${first.customCollarName || first.collarType}` : first.collarType || "Gola Careca"}
                      </span>
                    </div>
                    {first.customizationNotes && (
                      <div className="text-slate-300">
                        <strong className="text-slate-400">Opcionais: </strong>
                        <span>{first.customizationNotes}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Briefing */}
              <div className="mt-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs">
                <p className="text-slate-300 line-clamp-3">
                  <strong className="text-slate-400">Briefing: </strong>
                  {item.designBrief?.briefingText || item.observations || "Sem briefing detalhado."}
                </p>
              </div>

              {/* Referências e Anexos com Download Direto */}
              {item.attachments && item.attachments.length > 0 && (
                <div className="mt-2.5 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400 block">
                    Arquivos da Pré-Venda ({item.attachments.length}):
                  </span>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {item.attachments.map((att: any) => (
                      <div
                        key={att.id}
                        className="flex items-center justify-between p-1.5 rounded bg-slate-950 border border-slate-800 text-[11px]"
                      >
                        <span className="text-slate-300 truncate max-w-[180px]" title={att.originalName || att.fileName}>
                          {att.originalName || att.fileName}
                        </span>
                        <button
                          type="button"
                          onClick={() => api.downloadFile(att.fileUrl, att.originalName || att.fileName)}
                          className="flex items-center gap-1 text-sky-400 hover:text-sky-300 font-semibold px-2 py-0.5 rounded bg-sky-950/80 border border-sky-800"
                        >
                          <Download className="h-3 w-3" /> Baixar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Alterações Solicitadas pelo Cliente em ARTE_EM_ALTERACAO */}
              {item.status === "ARTE_EM_ALTERACAO" && (
                <div className="mt-2.5 p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-rose-400">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Alteração Solicitada pelo Cliente (v{item.designBrief?.versions?.[0]?.versionNumber || 1})</span>
                  </div>
                  <p className="text-slate-200 text-[11px] whitespace-pre-wrap">
                    {item.artworkApprovalNotes || "Cliente solicitou ajustes nesta versão."}
                  </p>
                </div>
              )}

              {/* Versões da Arte */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {item.designBrief?.versions && item.designBrief.versions.length > 0 && (
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                    v{item.designBrief.versions[0].versionNumber} ({item.designBrief.versions.length} versões)
                  </span>
                )}
              </div>

              {/* Ações */}
              <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSheetQuotationId(item.id);
                    setIsSheetModalOpen(true);
                  }}
                  className="w-full sm:w-auto flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 px-3 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition border border-slate-700"
                  title="Abrir Ficha Universal completa com referências e grade"
                >
                  <Eye className="h-3.5 w-3.5 text-sky-400" />
                  Ver Ficha
                </button>

                {item.status === "SOLICITACAO_ARTE" ? (
                  <button
                    onClick={() => handleClaim(item.id)}
                    className="w-full sm:w-auto flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-purple-600 py-2 px-3 text-xs font-semibold text-white hover:bg-purple-500 transition shadow-lg shadow-purple-600/30"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Assumir Criação
                  </button>
                ) : item.status === "ARTE_EM_ALTERACAO" ? (
                  <button
                    onClick={() => {
                      setSelectedQuotation(item);
                      setIsVersionModalOpen(true);
                    }}
                    className="w-full sm:w-auto flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 py-2 px-3 text-xs font-semibold text-white hover:bg-rose-500 transition shadow-lg shadow-rose-600/30"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Anexar Correção (v{(item.designBrief?.versions?.[0]?.versionNumber || 0) + 1})
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedQuotation(item);
                      setIsVersionModalOpen(true);
                    }}
                    className="w-full sm:w-auto flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-pink-600 py-2 px-3 text-xs font-semibold text-white hover:bg-pink-500 transition shadow-lg shadow-pink-600/30"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Anexar Versão
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {queue.length === 0 && (
          <div className="col-span-full py-16 text-center rounded-2xl bg-slate-900 border border-slate-800">
            <Palette className="h-10 w-10 text-slate-600 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-300">Fila de design limpa!</h4>
            <p className="text-xs text-slate-500 mt-1">Nenhuma solicitação de arte pendente no momento.</p>
          </div>
        )}
      </div>

      {/* MODAL ANEXAR VERSÃO DA ARTE */}
      {isVersionModalOpen && selectedQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">
              {selectedQuotation.status === "ARTE_EM_ALTERACAO"
                ? `Anexar Correção da Arte (v${(selectedQuotation.designBrief?.versions?.[0]?.versionNumber || 0) + 1}) — ${selectedQuotation.teamName}`
                : `Anexar Versão de Arte — ${selectedQuotation.teamName}`}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Ao enviar a arte, o pedido será encaminhado automaticamente para o Vendedor apresentar ao cliente.
            </p>

            {selectedQuotation.status === "ARTE_EM_ALTERACAO" && (
              <div className="mb-4 rounded-xl bg-rose-950/40 border border-rose-800/60 p-3 text-xs text-rose-200">
                <span className="font-bold text-rose-400 flex items-center gap-1.5 mb-1">
                  <AlertCircle className="h-4 w-4" />
                  Ajustes solicitados pelo cliente:
                </span>
                <p className="whitespace-pre-wrap">{selectedQuotation.artworkApprovalNotes || "Verifique o histórico da ficha."}</p>
              </div>
            )}

            {formError && (
              <div className="mb-4 rounded-lg bg-rose-500/15 p-3 text-xs text-rose-300 border border-rose-500/30">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitVersion} className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 font-medium">Mockup / Imagem de Preview (PNG/JPG)</label>
                <div className="mt-1 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    required
                    value={previewUrl}
                    onChange={(e) => setPreviewUrl(e.target.value)}
                    className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-pink-500 focus:outline-none"
                    placeholder="URL ou faça upload ao lado..."
                  />
                  <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg cursor-pointer border border-slate-700 transition">
                    <Upload className={`h-3.5 w-3.5 ${isUploadingPreview ? "animate-spin" : ""}`} />
                    <span>{isUploadingPreview ? "Enviando..." : "Upload Imagem"}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleUploadPreview}
                      className="hidden"
                      disabled={isUploadingPreview}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">Arquivo Mestre / Vetor (PDF, PSD, CDR, AI, EPS)</label>
                <div className="mt-1 flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={vectorUrl}
                    onChange={(e) => setVectorUrl(e.target.value)}
                    className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-pink-500 focus:outline-none"
                    placeholder="URL do vetor ou faça upload ao lado..."
                  />
                  <label className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg cursor-pointer border border-slate-700 transition">
                    <Upload className={`h-3.5 w-3.5 ${isUploadingVector ? "animate-spin" : ""}`} />
                    <span>{isUploadingVector ? "Enviando..." : "Upload Vetor"}</span>
                    <input
                      type="file"
                      accept=".pdf,.psd,.cdr,.ai,.eps,.zip"
                      onChange={handleUploadVector}
                      className="hidden"
                      disabled={isUploadingVector}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">Notas da Versão / Alterações Efetuadas</label>
                <textarea
                  rows={3}
                  value={changeNotes}
                  onChange={(e) => setChangeNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-pink-500 focus:outline-none"
                  placeholder="Descreva o que foi desenvolvido ou corrigido nesta versão..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsVersionModalOpen(false)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploadingPreview || isUploadingVector}
                  className="rounded-lg bg-pink-600 px-4 py-2 text-xs font-semibold text-white hover:bg-pink-500 transition shadow-lg shadow-pink-600/30 disabled:opacity-50"
                >
                  {isSubmitting ? "Enviando..." : "Enviar Arte ao Vendedor"}
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
        currentUser={currentUser || { id: "", name: "Designer", role: "DESIGNER", hasPin: true }}
      />
    </div>
  );
}
