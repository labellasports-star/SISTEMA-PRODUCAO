import React, { useState, useEffect } from "react";
import {
  ShoppingBag,
  CheckCircle2,
  AlertTriangle,
  Send,
  Calendar,
  DollarSign,
  Users,
  RefreshCw,
  FileCheck,
  Eye,
} from "lucide-react";
import { api } from "../services/api.js";
import { getSocket } from "../services/socket.js";
import { UniversalOrderSheetModal } from "./UniversalOrderSheetModal.js";

export function VendasPanel({ currentUser }: { currentUser?: any }) {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Ficha Universal
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [sheetQuotationId, setSheetQuotationId] = useState<string | null>(null);

  // Modal aprovação de cliente
  const [selectedForApproval, setSelectedForApproval] = useState<any | null>(null);
  const [decision, setDecision] = useState<"APPROVED" | "REVISION_REQUESTED">("APPROVED");
  const [approvedByPerson, setApprovedByPerson] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [approvalError, setApprovalError] = useState("");

  // Modal conversão em OP
  const [selectedForConversion, setSelectedForConversion] = useState<any | null>(null);
  const [promisedDeliveryDate, setPromisedDeliveryDate] = useState("");
  const [finalNegotiatedAmount, setFinalNegotiatedAmount] = useState("");
  const [technicalNotes, setTechnicalNotes] = useState("");
  const [conversionError, setConversionError] = useState("");
  const [isConverting, setIsConverting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Buscar orçamentos em estágios de aprovação de arte ou prontos para conversão
      const all = await api.getQuotations();
      const filtered = all.filter(
        (q) =>
          q.status === "AGUARDANDO_APROVACAO_ARTE" ||
          q.status === "ORCAMENTO_APROVADO" ||
          q.status === "CONVERTIDA_VENDA"
      );
      setQuotations(filtered);
    } catch (err) {
      console.error("Erro ao carregar vendas:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handleUpdate = () => {
      loadData();
    };

    socket.on("artwork_version_submitted", handleUpdate);
    socket.on("client_approval_updated", handleUpdate);
    socket.on("quotation_status_changed", handleUpdate);
    socket.on("op_returned_from_sac", handleUpdate);

    return () => {
      socket.off("artwork_version_submitted", handleUpdate);
      socket.off("client_approval_updated", handleUpdate);
      socket.off("quotation_status_changed", handleUpdate);
      socket.off("op_returned_from_sac", handleUpdate);
    };
  }, []);

  const handleClientApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForApproval) return;
    setApprovalError("");
    try {
      await api.submitClientApproval(selectedForApproval.id, {
        decision,
        approvedByPerson,
        feedbackNotes,
      });

      setSelectedForApproval(null);
      setFeedbackNotes("");
      setApprovedByPerson("");
      await loadData();
    } catch (err: any) {
      setApprovalError(err.message || "Erro ao registrar decisão do cliente.");
    }
  };

  const handleConvertToOp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedForConversion) return;
    setConversionError("");
    setIsConverting(true);
    try {
      await api.convertToOp(selectedForConversion.id, {
        promisedDeliveryDate: new Date(promisedDeliveryDate).toISOString(),
        finalNegotiatedAmount: parseFloat(finalNegotiatedAmount) || undefined,
        technicalNotes,
      });

      setSelectedForConversion(null);
      setPromisedDeliveryDate("");
      setTechnicalNotes("");
      await loadData();
      alert("Sucesso! Ordem de Produção gerada e encaminhada ao SAC Interno.");
    } catch (err: any) {
      setConversionError(err.message || "Erro ao converter em OP.");
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-emerald-400" />
            Painel de Vendas — Validação de Arte & Conversão em OP
          </h2>
          <p className="text-xs text-slate-400">
            Registro formal do retorno do cliente e geração oficial da Ordem de Produção com lotes fracionáveis.
          </p>
        </div>

        <button
          onClick={loadData}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 transition border border-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar Lista ({quotations.length})
        </button>
      </div>

      {/* LISTA DE PEDIDOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {quotations.map((item) => {
          const isApproved = item.isArtworkApproved;
          const isConverted = item.status === "CONVERTIDA_VENDA";

          return (
            <div
              key={item.id}
              className={`rounded-2xl border p-5 shadow-xl transition relative overflow-hidden ${
                isConverted
                  ? "bg-slate-900/60 border-emerald-500/30"
                  : isApproved
                  ? "bg-slate-900 border-emerald-500/60 shadow-emerald-500/10"
                  : "bg-slate-900 border-slate-800"
              }`}
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-xs font-bold text-sky-400">
                  {item.quotationNumber}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    isConverted
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : isApproved
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  {isConverted
                    ? "OP Gerada"
                    : isApproved
                    ? "Arte Aprovada"
                    : "Aguardando Cliente"}
                </span>
              </div>

              <h3 className="mt-2 text-base font-bold text-white">{item.teamName}</h3>
              <p className="text-xs text-slate-400">
                Cliente: <strong className="text-slate-300">{item.customer.companyName}</strong> ({item.customer.contactName})
              </p>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-300 pt-2 border-t border-slate-800/80">
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-slate-500" />
                  {item.totalQuantity} pcs
                </span>
                <span className="font-semibold text-emerald-400">
                  R$ {item.budgetAmount.toFixed(2)}
                </span>
              </div>

              {/* Botões de Ação */}
              <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col gap-2">
                {!isConverted && !isApproved && (
                  <button
                    onClick={() => {
                      setSelectedForApproval(item);
                      setApprovedByPerson(item.customer.contactName);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/30"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Registrar Parecer do Cliente
                  </button>
                )}

                {!isConverted && isApproved && (
                  <button
                    onClick={() => {
                      setSelectedForConversion(item);
                      setFinalNegotiatedAmount(item.budgetAmount.toString());
                      if (item.desiredDeadline) {
                        setPromisedDeliveryDate(item.desiredDeadline.split("T")[0]);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-600/30"
                  >
                    <FileCheck className="h-4 w-4" />
                    Converter em OP Oficial
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSheetQuotationId(item.id);
                    setIsSheetModalOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition border border-slate-700"
                  title="Abrir Ficha Universal do Pedido"
                >
                  <Eye className="h-3.5 w-3.5 text-sky-400" />
                  Ver Ficha Completa
                </button>
              </div>
            </div>
          );
        })}

        {quotations.length === 0 && (
          <div className="col-span-full py-16 text-center rounded-2xl bg-slate-900 border border-slate-800">
            <ShoppingBag className="h-10 w-10 text-slate-600 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-300">Nenhum pedido para validação</h4>
            <p className="text-xs text-slate-500 mt-1">Os pedidos aparecerão aqui após o Designer anexar a arte.</p>
          </div>
        )}
      </div>

      {/* MODAL REGISTRAR PARECER DO CLIENTE */}
      {selectedForApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">
              Retorno do Cliente — {selectedForApproval.teamName}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Informe a resposta do cliente após a apresentação do mockup de arte.
            </p>

            {approvalError && (
              <div className="mb-4 rounded-lg bg-rose-500/15 p-3 text-xs text-rose-300 border border-rose-500/30">
                {approvalError}
              </div>
            )}

            <form onSubmit={handleClientApproval} className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 font-medium">Decisão do Cliente</label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => setDecision("APPROVED")}
                    className={`py-2.5 rounded-lg border text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                      decision === "APPROVED"
                        ? "bg-emerald-600 border-emerald-500 text-white"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Arte 100% Aprovada
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecision("REVISION_REQUESTED")}
                    className={`py-2.5 rounded-lg border text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                      decision === "REVISION_REQUESTED"
                        ? "bg-rose-600 border-rose-500 text-white"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Solicitar Alterações
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">Nome de Quem Aprovou / Falou pelo Cliente</label>
                <input
                  type="text"
                  value={approvedByPerson}
                  onChange={(e) => setApprovedByPerson(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  placeholder="Nome do responsável"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">Observações / Parecer do Cliente</label>
                <textarea
                  rows={3}
                  required
                  value={feedbackNotes}
                  onChange={(e) => setFeedbackNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  placeholder={
                    decision === "APPROVED"
                      ? "Ex: Aprovado via WhatsApp pelo diretor do time em 02/11."
                      : "Descreva exatamente o que precisa ser alterado pelo designer..."
                  }
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedForApproval(null)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition shadow-lg shadow-sky-600/30"
                >
                  Salvar Parecer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONVERSÃO EM OP */}
      {selectedForConversion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">
              Gerar Ordem de Produção (OP) — {selectedForConversion.teamName}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              A conversão criará a OP principal com lote fracionável e a encaminhará para o SAC Interno.
            </p>

            {conversionError && (
              <div className="mb-4 rounded-lg bg-rose-500/15 p-3 text-xs text-rose-300 border border-rose-500/30">
                {conversionError}
              </div>
            )}

            <form onSubmit={handleConvertToOp} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">Prazo de Entrega Acordado</label>
                  <input
                    type="date"
                    required
                    value={promisedDeliveryDate}
                    onChange={(e) => setPromisedDeliveryDate(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">Valor Fechado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={finalNegotiatedAmount}
                    onChange={(e) => setFinalNegotiatedAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">Instruções Técnicas para o SAC / Produção</label>
                <textarea
                  rows={3}
                  value={technicalNotes}
                  onChange={(e) => setTechnicalNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  placeholder="Observações sobre embalagem, tecido prioritário ou cuidados especiais..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedForConversion(null)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isConverting}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                >
                  {isConverting ? "Gerando OP..." : "Confirmar & Gerar OP Oficial"}
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
        currentUser={currentUser || { id: "", name: "Vendas", role: "VENDEDOR", hasPin: true }}
      />
    </div>
  );
}
