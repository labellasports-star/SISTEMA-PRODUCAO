import React, { useState, useEffect } from "react";
import {
  X,
  FileText,
  User,
  Calendar,
  Layers,
  Palette,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Download,
  Eye,
  ExternalLink,
  Tag,
  Package,
  Sparkles,
  Info,
  RefreshCw,
  Image as ImageIcon,
} from "lucide-react";
import { api } from "../services/api.js";
import { User as CurrentUserType } from "../types.js";

interface UniversalOrderSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  opId?: string;
  batchId?: string;
  quotationId?: string;
  currentUser?: any;
}

export function UniversalOrderSheetModal({
  isOpen,
  onClose,
  opId,
  batchId,
  quotationId,
  currentUser,
}: UniversalOrderSheetModalProps) {
  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "ITEMS" | "ARTWORK" | "BATCHES">("OVERVIEW");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<any | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Desmembramento de OP
  const [isSubdivideModalOpen, setIsSubdivideModalOpen] = useState(false);
  const [numParts, setNumParts] = useState(2);
  const [partQuantities, setPartQuantities] = useState<number[]>([]);
  const [subdividePin, setSubdividePin] = useState("");
  const [subdivideNotes, setSubdivideNotes] = useState("");
  const [subdivideError, setSubdivideError] = useState("");
  const [isSubdividing, setIsSubdividing] = useState(false);

  const openSubdivideModal = () => {
    const total = sheet?.totalQuantityOrdered || 0;
    const parts = 2;
    setNumParts(parts);
    const half = Math.floor(total / 2);
    setPartQuantities([half, total - half]);
    setSubdividePin("");
    setSubdivideNotes("");
    setSubdivideError("");
    setIsSubdivideModalOpen(true);
  };

  const handleNumPartsChange = (n: number) => {
    const total = sheet?.totalQuantityOrdered || 0;
    setNumParts(n);
    const base = Math.floor(total / n);
    const remainder = total % n;
    const newQuants = Array.from({ length: n }, (_, i) => (i === 0 ? base + remainder : base));
    setPartQuantities(newQuants);
  };

  const handleConfirmSubdivision = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubdivideError("");
    const total = sheet?.totalQuantityOrdered || 0;
    const currentSum = partQuantities.reduce((a, b) => a + b, 0);
    if (currentSum !== total) {
      setSubdivideError(`A soma das quantidades (${currentSum} pcs) deve ser igual a ${total} pcs.`);
      return;
    }
    if (!subdividePin || subdividePin.length < 4) {
      setSubdivideError("PIN de assinatura é obrigatório (mínimo 4 dígitos).");
      return;
    }
    const currentOpId = opId || sheet?.opId || sheet?.id;
    if (!currentOpId) {
      setSubdivideError("ID da OP não localizado.");
      return;
    }

    setIsSubdividing(true);
    try {
      await api.subdivideOrder(currentOpId, {
        subdivisions: partQuantities.map((q, idx) => ({
          quantity: q,
          notes: `Sublote ${idx + 1}/${numParts}`,
        })),
        pin: subdividePin,
        notes: subdivideNotes || undefined,
      });

      const refreshed = await api.getUniversalSheetByOrder(currentOpId);
      setSheet(refreshed);
      setIsSubdivideModalOpen(false);
    } catch (err: any) {
      setSubdivideError(err.message || "Erro ao desmembrar OP.");
    } finally {
      setIsSubdividing(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const loadSheet = async () => {
      setLoading(true);
      setError("");
      try {
        let data: any = null;
        if (opId) {
          data = await api.getUniversalSheetByOrder(opId);
        } else if (batchId) {
          data = await api.getUniversalSheetByBatch(batchId);
        } else if (quotationId) {
          data = await api.getUniversalSheetByQuotation(quotationId);
        }
        setSheet(data);
      } catch (err: any) {
        setError(err.message || "Não foi possível carregar a Ficha Universal do Pedido.");
      } finally {
        setLoading(false);
      }
    };

    loadSheet();
  }, [isOpen, opId, batchId, quotationId]);

  if (!isOpen) return null;

  const isOperator = currentUser?.role === "OPERADOR";
  const items = sheet?.items || sheet?.quotation?.items || [];
  const references = sheet?.references || [];
  const artwork = sheet?.artwork || {};
  const approvedArtwork = artwork.approvedVersion;
  const versions = artwork.allVersions || [];
  const batches = sheet?.batches || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4 backdrop-blur-sm animate-fadeIn">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[92vh] rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl text-slate-100 overflow-hidden">
        {/* CABEÇALHO */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/70 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm sm:text-base font-extrabold text-white">
                  {sheet?.opNumber || sheet?.quotationNumber || "Ficha do Pedido"}
                </span>
                {sheet?.status && (
                  <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-300 border border-slate-700">
                    {sheet.status}
                  </span>
                )}
                {sheet?.priority && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                      sheet.priority === "URGENTE"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                  >
                    {sheet.priority}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 truncate max-w-[280px] sm:max-w-md">
                {sheet?.title || sheet?.teamName || "Ordem de Produção Industrial"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* NAVEGAÇÃO DE ABAS RESPONSIVA */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950/40 px-3 sm:px-6 overflow-x-auto scrollbar-none gap-1 sm:gap-2">
          <button
            onClick={() => setActiveTab("OVERVIEW")}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === "OVERVIEW"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Info className="h-4 w-4" />
            Visão Geral
          </button>

          <button
            onClick={() => setActiveTab("ITEMS")}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === "ITEMS"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Package className="h-4 w-4" />
            Grade & Produtos ({items.length})
          </button>

          <button
            onClick={() => setActiveTab("ARTWORK")}
            className={`flex items-center gap-1.5 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap ${
              activeTab === "ARTWORK"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Palette className="h-4 w-4" />
            Referências & Artes ({references.length + versions.length})
          </button>

          {batches.length > 0 && (
            <button
              onClick={() => setActiveTab("BATCHES")}
              className={`flex items-center gap-1.5 py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === "BATCHES"
                  ? "border-sky-500 text-sky-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="h-4 w-4" />
              Lotes ({batches.length})
            </button>
          )}
        </div>

        {/* CORPO DA FICHA */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-sky-400" />
              <p className="text-sm">Carregando dados da Ficha Universal...</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 p-4 text-xs text-rose-300">
              {error}
            </div>
          )}

          {!loading && sheet && (
            <>
              {/* ABA 1: VISÃO GERAL */}
              {activeTab === "OVERVIEW" && (
                <div className="space-y-6">
                  {/* Grid de Metadados Principais */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-slate-950/60 p-3.5 border border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Cliente
                      </span>
                      <strong className="text-sm text-white font-semibold block truncate">
                        {sheet.customer?.companyName || "N/A"}
                      </strong>
                      <span className="text-xs text-slate-400">{sheet.customer?.contactName}</span>
                    </div>

                    <div className="rounded-xl bg-slate-950/60 p-3.5 border border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Total de Peças
                      </span>
                      <strong className="text-xl text-sky-400 font-extrabold block">
                        {sheet.totalQuantityOrdered || sheet.totalQuantity || 0} pcs
                      </strong>
                      <span className="text-xs text-slate-400">
                        {sheet.productType || "Uniformes Personalizados"}
                      </span>
                    </div>

                    <div className="rounded-xl bg-slate-950/60 p-3.5 border border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Prazo de Entrega
                      </span>
                      <strong className="text-sm text-amber-300 font-semibold flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {sheet.promisedDeliveryDate || sheet.desiredDeadline
                          ? new Date(sheet.promisedDeliveryDate || sheet.desiredDeadline).toLocaleDateString("pt-BR")
                          : "A definir"}
                      </strong>
                      <span className="text-[11px] text-slate-400">Contratado</span>
                    </div>

                    <div className="rounded-xl bg-slate-950/60 p-3.5 border border-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Equipe Comercial / Design
                      </span>
                      <p className="text-xs text-slate-200">
                        <strong>Vendedor:</strong> {sheet.seller?.name || "N/A"}
                      </p>
                      <p className="text-xs text-slate-300">
                        <strong>Designer:</strong> {sheet.designer?.name || "Aguardando"}
                      </p>
                    </div>
                  </div>

                  {/* Alerta de Retrabalho se houver */}
                  {sheet.totalQuantityRework > 0 && (
                    <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-3.5 flex items-center gap-3 text-rose-300 text-xs">
                      <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
                      <div>
                        <strong>Atenção Chão de Fábrica:</strong> Esta Ordem possui{" "}
                        <span className="font-bold underline">{sheet.totalQuantityRework} peça(s)</span> em fluxo de
                        retrabalho prioritário.
                      </div>
                    </div>
                  )}

                  {/* Resumo da Grade Rápida */}
                  {sheet.consolidatedSizeGrid && Object.keys(sheet.consolidatedSizeGrid).length > 0 && (
                    <div className="rounded-xl bg-slate-950/70 p-4 border border-slate-800">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5 flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-sky-400" />
                        Distribuição Consolidada de Tamanhos
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(sheet.consolidatedSizeGrid).map(([size, qty]) => (
                          <div
                            key={size}
                            className="rounded-lg bg-slate-800 px-3 py-1.5 border border-slate-700 text-center min-w-[50px]"
                          >
                            <span className="block text-[10px] font-bold text-slate-400">{size}</span>
                            <span className="block text-sm font-extrabold text-white">{qty as number}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Observações Técnicas e Briefing */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-indigo-400" />
                        Observações Técnicas de Produção
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {sheet.technicalNotes || sheet.observations || "Nenhuma observação técnica cadastrada."}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-pink-400" />
                        Briefing & Cores do Modelo
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {sheet.briefing?.briefingText || "Sem briefing detalhado."}
                      </p>
                      {sheet.briefing?.predominantColors && (
                        <p className="mt-2 text-xs text-slate-400">
                          <strong>Cores Predominantes:</strong> {sheet.briefing.predominantColors}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Informações Financeiras (Apenas VENDEDOR / GESTOR / ADMIN) */}
                  {!isOperator && sheet.quotation?.budgetAmount !== undefined && (
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block mb-1">
                        Informação Comercial (Restrita)
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-emerald-300">
                          R$ {Number(sheet.quotation.budgetAmount).toFixed(2)}
                        </span>
                        <span className="text-xs text-slate-400">Valor Total do Pedido</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ABA 2: ITENS E GRADE DETALHADA */}
              {activeTab === "ITEMS" && (
                <div className="space-y-4">
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-3">Modelo</th>
                          <th className="py-3 px-3">Gênero</th>
                          <th className="py-3 px-3 text-center">Tamanho</th>
                          <th className="py-3 px-3 text-center">Qtd</th>
                          <th className="py-3 px-3">Nome Personalizado</th>
                          <th className="py-3 px-3">Número</th>
                          <th className="py-3 px-3">Tecido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                        {items.map((item: any, idx: number) => (
                          <tr key={item.id || idx} className="hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 font-semibold text-white">{item.productModel}</td>
                            <td className="py-2.5 px-3 text-slate-400">{item.gender}</td>
                            <td className="py-2.5 px-3 text-center font-bold font-mono text-sky-400 bg-slate-950/40">
                              {item.size}
                            </td>
                            <td className="py-2.5 px-3 text-center font-extrabold text-white">{item.quantity}</td>
                            <td className="py-2.5 px-3 text-slate-300 font-mono">{item.customName || "—"}</td>
                            <td className="py-2.5 px-3 text-slate-300 font-mono">{item.customNumber || "—"}</td>
                            <td className="py-2.5 px-3 text-slate-400 truncate max-w-[140px]">
                              {item.fabricType || "Dry Fit Padrão"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {items.length === 0 && (
                    <div className="py-8 text-center text-xs text-slate-500">
                      Nenhum item cadastrado nesta Ordem de Produção.
                    </div>
                  )}
                </div>
              )}

              {/* ABA 3: REFERÊNCIAS & ARTES */}
              {activeTab === "ARTWORK" && (
                <div className="space-y-6">
                  {/* Arte Aprovada Homologada (Destaque Principal) */}
                  {approvedArtwork ? (
                    <div className="rounded-2xl border-2 border-emerald-500/60 bg-emerald-950/20 p-4 sm:p-5 shadow-xl">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-500/30 pb-3 mb-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                          <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                            Arte Oficial Homologada para Produção (Versão {approvedArtwork.versionNumber})
                          </h4>
                        </div>
                        <span className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-widest">
                          Aprovada pelo Cliente
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                        {approvedArtwork.previewUrl && (
                          <div className="relative group rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center max-h-[220px]">
                            <img
                              src={approvedArtwork.previewUrl}
                              alt="Mockup Oficial Aprovado"
                              className="object-contain max-h-[200px] w-full cursor-pointer hover:scale-105 transition"
                              onClick={() => setSelectedImage(approvedArtwork.previewUrl)}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition pointer-events-none">
                              <span className="text-xs text-white bg-black/70 px-2 py-1 rounded">Clique para ampliar</span>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 text-xs">
                          <p className="text-slate-300">
                            <strong>Designer:</strong> {approvedArtwork.designer?.name || sheet.designer?.name || "N/A"}
                          </p>
                          <p className="text-slate-300">
                            <strong>Aprovado por:</strong> {sheet.artworkApprovedBy || "Cliente"}
                          </p>
                          <p className="text-slate-300">
                            <strong>Notas da Versão:</strong> {approvedArtwork.changeNotes || "Versão aprovada sem ressalvas."}
                          </p>
                          <div className="pt-2 flex flex-wrap gap-2">
                            {approvedArtwork.previewUrl && (
                              <a
                                href={approvedArtwork.previewUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs text-sky-400 font-semibold border border-slate-700 transition"
                              >
                                <Eye className="h-3.5 w-3.5" /> Ver Imagem
                              </a>
                            )}
                            {approvedArtwork.vectorUrl && (
                              <a
                                href={approvedArtwork.vectorUrl}
                                download
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 text-xs text-white font-semibold shadow transition"
                              >
                                <Download className="h-3.5 w-3.5" /> Baixar Vetor
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Ainda não há arte oficial aprovada para este pedido. A produção deve aguardar a homologação.
                    </div>
                  )}

                  {/* Galeria de Imagens de Referência trazidas pelo cliente */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-sky-400" />
                      Imagens de Referência do Cliente ({references.length})
                    </h4>
                    {references.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {references.map((ref: any, idx: number) => (
                          <div
                            key={ref.id || idx}
                            className="group relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 hover:border-slate-700 transition"
                          >
                            <img
                              src={ref.fileUrl}
                              alt={ref.fileName}
                              className="h-28 w-full object-cover cursor-pointer group-hover:scale-105 transition"
                              onClick={() => setSelectedImage(ref.fileUrl)}
                            />
                            <div className="p-2 text-[11px] truncate text-slate-300" title={ref.fileName}>
                              {ref.fileName}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">Nenhuma imagem de referência anexada pelo cliente.</p>
                    )}
                  </div>

                  {/* Histórico Completo de Versões Desenvolvidas */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
                      <Layers className="h-4 w-4 text-purple-400" />
                      Histórico de Versões da Arte ({versions.length})
                    </h4>
                    <div className="space-y-2">
                      {versions.map((ver: any) => (
                        <div
                          key={ver.id}
                          className="flex items-center justify-between rounded-xl bg-slate-950/60 p-3 border border-slate-800 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
                              v{ver.versionNumber}
                            </span>
                            <div>
                              <p className="text-slate-200 font-semibold">{ver.changeNotes || "Sem notas de alteração"}</p>
                              <span className="text-[11px] text-slate-400">
                                Designer: {ver.designer?.name || "Designer"} · {new Date(ver.createdAt).toLocaleString("pt-BR")}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                ver.status === "APPROVED"
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                  : ver.status === "REVISION_REQUESTED"
                                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                  : "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                              }`}
                            >
                              {ver.status === "APPROVED"
                                ? "Aprovada"
                                : ver.status === "REVISION_REQUESTED"
                                ? "Alteração"
                                : "Submetida"}
                            </span>

                            {ver.previewUrl && (
                              <button
                                onClick={() => setSelectedImage(ver.previewUrl)}
                                className="text-sky-400 hover:text-sky-300 p-1"
                                title="Visualizar"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 4: LOTES E RASTREABILIDADE */}
              {activeTab === "BATCHES" && (
                <div className="space-y-4">
                  {(currentUser.role === "ADMIN" || currentUser.role === "GESTOR") && (sheet?.opId || opId) && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div>
                        <h4 className="text-xs font-bold text-white">Desmembramento de Ordem de Produção</h4>
                        <p className="text-[11px] text-slate-400">
                          Subdividir lote em múltiplos sublotes (ex: OP - 2001 - 1/5 até 5/5) para fluxos paralelos.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={openSubdivideModal}
                        className="rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition shadow-sm shrink-0"
                      >
                        Desmembrar OP
                      </button>
                    </div>
                  )}

                  {batches.map((batch: any) => (
                    <div
                      key={batch.id}
                      className="rounded-xl bg-slate-950/60 p-4 border border-slate-800 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-sky-400" />
                          <span className="font-mono text-sm font-bold text-white">{batch.batchNumber}</span>
                          <span className="text-xs text-slate-400 font-semibold">({batch.quantity} pcs)</span>
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase border ${
                            batch.isUnderRework
                              ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                              : "bg-sky-500/20 text-sky-300 border-sky-500/40"
                          }`}
                        >
                          {batch.currentSector?.name || "Setor"} · {batch.batchStatus}
                        </span>
                      </div>

                      {/* Histórico de Movimentações */}
                      {batch.movements && batch.movements.length > 0 && (
                        <div className="mt-2 border-t border-slate-800/80 pt-2 space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Linha do Tempo de Movimentações
                          </span>
                          {batch.movements.map((mov: any, mIdx: number) => (
                            <div
                              key={mov.id || mIdx}
                              className="text-[11px] text-slate-400 flex items-center justify-between gap-2"
                            >
                              <span>
                                {mov.fromSector?.name} ➔ <strong className="text-white">{mov.toSector?.name}</strong>{" "}
                                por {mov.operator?.name}
                              </span>
                              <span className="font-mono text-[10px] text-slate-500 flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                                {new Date(mov.createdAt).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* MODAL DE DESMEMBRAMENTO DE OP */}
        {isSubdivideModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white">
                  Desmembrar {sheet?.opNumber || "OP"} em Sublotes
                </h3>
                <button
                  type="button"
                  onClick={() => setIsSubdivideModalOpen(false)}
                  className="rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {subdivideError && (
                <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  {subdivideError}
                </div>
              )}

              <form onSubmit={handleConfirmSubdivision} className="mt-4 space-y-4">
                <div>
                  <label className="text-xs text-slate-300 font-medium block">
                    Total Encomendado: <strong className="text-white">{sheet?.totalQuantityOrdered || 0} pcs</strong>
                  </label>
                  <label className="text-xs text-slate-300 font-medium block mt-2">
                    Número de Sublotes (Partes):
                  </label>
                  <select
                    value={numParts}
                    onChange={(e) => handleNumPartsChange(parseInt(e.target.value, 10))}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  >
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} Partes ({sheet?.opNumber || "OP"} - 1/{n} até {n}/{n})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-300 font-medium block">
                    Distribuição das Quantidades:
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                    {partQuantities.map((qty, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded bg-slate-950 border border-slate-800">
                        <span className="text-xs font-mono text-sky-400 w-16">
                          {idx + 1}/{numParts}:
                        </span>
                        <input
                          type="number"
                          min="1"
                          required
                          value={qty}
                          onChange={(e) => {
                            const newQ = [...partQuantities];
                            newQ[idx] = parseInt(e.target.value, 10) || 0;
                            setPartQuantities(newQ);
                          }}
                          className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-white text-right focus:border-sky-500 focus:outline-none"
                        />
                        <span className="text-[11px] text-slate-400">pcs</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    Soma atual:{" "}
                    <strong
                      className={
                        partQuantities.reduce((a, b) => a + b, 0) === (sheet?.totalQuantityOrdered || 0)
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }
                    >
                      {partQuantities.reduce((a, b) => a + b, 0)}
                    </strong>{" "}
                    / {sheet?.totalQuantityOrdered || 0} pcs
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-medium">PIN de Assinatura Digital</label>
                  <input
                    type="password"
                    maxLength={8}
                    required
                    value={subdividePin}
                    onChange={(e) => setSubdividePin(e.target.value)}
                    placeholder="Seu PIN de 4 a 8 dígitos"
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none font-mono tracking-widest text-center"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-medium">Observações (opcional)</label>
                  <input
                    type="text"
                    value={subdivideNotes}
                    onChange={(e) => setSubdivideNotes(e.target.value)}
                    placeholder="Ex: Fracionamento para estampas claras e escuras"
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsSubdivideModalOpen(false)}
                    className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubdividing}
                    className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition shadow-lg shadow-sky-600/30"
                  >
                    {isSubdividing ? "Desmembrando..." : "Confirmar e Assinar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL DE ZOOM DE IMAGEM */}
        {selectedImage && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setSelectedImage(null)}
          >
            <div className="relative max-w-4xl max-h-[90vh]">
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-2 right-2 rounded-full bg-black/70 p-2 text-white hover:bg-black"
              >
                <X className="h-6 w-6" />
              </button>
              <img src={selectedImage} alt="Visualização ampliada" className="max-h-[85vh] w-auto rounded-xl object-contain shadow-2xl" />
            </div>
          </div>
        )}

        {/* RODAPÉ DO MODAL */}
        <div className="border-t border-slate-800 bg-slate-950/70 px-4 py-3 sm:px-6 flex items-center justify-between text-xs text-slate-400">
          <span>Consulta somente leitura · Ficha Universal do Pedido</span>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 font-semibold text-white transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
