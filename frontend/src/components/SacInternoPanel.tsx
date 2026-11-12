import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  CheckCircle,
  XCircle,
  Clock,
  KeyRound,
  FileText,
  Users,
  Image,
  RefreshCw,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { api } from "../services/api.js";
import { getSocket, joinSectorRoom } from "../services/socket.js";
import { UniversalOrderSheetModal } from "./UniversalOrderSheetModal.js";

export function SacInternoPanel({ currentUser }: { currentUser?: any }) {
  const [ops, setOps] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Ficha Universal
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [selectedSheetOpId, setSelectedSheetOpId] = useState<string | null>(null);

  // Modal de Aprovação / Reprovação
  const [selectedOp, setSelectedOp] = useState<any | null>(null);
  const [actionType, setActionType] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [pinInput, setPinInput] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [actionError, setActionError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadQueue = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSacQueue();
      setOps(data);
    } catch (err) {
      console.error("Erro ao carregar fila do SAC:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
    joinSectorRoom("SAC_INTERNO");

    const socket = getSocket();
    const handleUpdate = () => {
      loadQueue();
    };

    socket.on("new_op_received", handleUpdate);
    socket.on("op_status_changed", handleUpdate);
    socket.on("op_returned_from_sac", handleUpdate);

    return () => {
      socket.off("new_op_received", handleUpdate);
      socket.off("op_status_changed", handleUpdate);
      socket.off("op_returned_from_sac", handleUpdate);
    };
  }, []);

  const handleSacAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOp) return;
    setActionError("");
    setIsSubmitting(true);
    try {
      if (actionType === "APPROVE") {
        await api.approveSacOp(selectedOp.id, {
          pin: pinInput,
          notes: actionNotes || undefined,
        });
        alert(`OP ${selectedOp.opNumber} aprovada pelo SAC e encaminhada para Pré-Diagramação!`);
      } else {
        await api.rejectSacOp(selectedOp.id, {
          pin: pinInput,
          reason: actionNotes,
        });
        alert(`OP ${selectedOp.opNumber} reprovada e devolvida para Vendas.`);
      }

      setSelectedOp(null);
      setPinInput("");
      setActionNotes("");
      await loadQueue();
    } catch (err: any) {
      setActionError(err.message || "Erro ao processar ação no SAC.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-sky-400" />
            Painel Operacional — Setor 04: SAC Interno
          </h2>
          <p className="text-xs text-slate-400">
            Conferência técnica detalhada de grades, personalizações e arte antes da liberação fabril.
          </p>
        </div>

        <button
          onClick={loadQueue}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 transition border border-slate-700"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar Fila ({ops.length})
        </button>
      </div>

      {/* FILA DE CONFERÊNCIA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {ops.map((op) => (
          <div
            key={op.id}
            className="rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-xl hover:border-slate-700 transition relative"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono text-xs font-bold text-sky-400">
                  {op.opNumber}
                </span>
                <h3 className="text-lg font-bold text-white mt-1">{op.title}</h3>
                <p className="text-xs text-slate-400">Cliente: {op.customer.companyName}</p>
              </div>

              <span className="rounded bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-300 border border-amber-500/30">
                Aguardando Conferência
              </span>
            </div>

            {/* ITENS E GRADE DA OP */}
            <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Grade de Produtos & Tamanhos
              </h4>
              <div className="flex flex-wrap gap-2 text-xs">
                {op.quotation?.items && op.quotation.items.length > 0 ? (
                  op.quotation.items.map((it: any) => (
                    <span
                      key={it.id}
                      className="rounded bg-slate-800 px-2.5 py-1 text-slate-300 border border-slate-700"
                    >
                      {it.productModel} ({it.size}): <strong>{it.quantity} pcs</strong>
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500 text-xs italic">Grade conforme resumo comercial.</span>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span>Qtd. Total: <strong className="text-white">{op.totalQuantityOrdered} peças</strong></span>
                {op.promisedDeliveryDate && (
                  <span className="text-amber-400 font-medium">
                    Prazo: {new Date(op.promisedDeliveryDate).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
            </div>

            {/* BRIEFING E ARTE */}
            <div className="mt-4 p-3 rounded-xl bg-slate-950/60 border border-slate-800/60 text-xs space-y-1">
              <p className="text-slate-300">
                <strong>Vendedor:</strong> {op.quotation?.seller?.name || "Não atribuído"}
              </p>
              <p className="text-slate-300">
                <strong>Arte Aprovada:</strong> {op.artworkUrl ? "Disponível para impressão" : "Pendente"}
              </p>
            </div>

            {/* BOTÃO FICHA UNIVERSAL */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  setSelectedSheetOpId(op.id);
                  setIsSheetModalOpen(true);
                }}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition border border-slate-700"
                title="Abrir Ficha Universal completa com referências, grade e arte"
              >
                <Eye className="h-4 w-4 text-sky-400" />
                Ver Ficha Completa (Sem Modificar Estado)
              </button>
            </div>

            {/* BOTÕES DE DECISÃO */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setSelectedOp(op);
                  setActionType("REJECT");
                  setActionNotes("");
                  setActionError("");
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-rose-600/20 text-rose-300 border border-rose-500/30 py-2.5 text-xs font-semibold hover:bg-rose-600 hover:text-white transition"
              >
                <XCircle className="h-4 w-4" />
                Reprovar p/ Vendas
              </button>

              <button
                onClick={() => {
                  setSelectedOp(op);
                  setActionType("APPROVE");
                  setActionNotes("");
                  setActionError("");
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 transition shadow-lg shadow-sky-600/30"
              >
                <CheckCircle className="h-4 w-4" />
                Aprovar & Enviar p/ Pré-Diag.
              </button>
            </div>
          </div>
        ))}

        {ops.length === 0 && (
          <div className="col-span-full py-16 text-center rounded-2xl bg-slate-900 border border-slate-800">
            <CheckCircle className="h-10 w-10 text-emerald-500/60 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-300">Nenhuma OP aguardando conferência</h4>
            <p className="text-xs text-slate-500 mt-1">Todas as OPs convertidas já foram analisadas pelo SAC.</p>
          </div>
        )}
      </div>

      {/* MODAL DE CONFIRMAÇÃO COM PIN */}
      {selectedOp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-2">
              {actionType === "APPROVE" ? (
                <CheckCircle className="h-6 w-6 text-emerald-400" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-rose-400" />
              )}
              <h3 className="text-lg font-bold text-white">
                {actionType === "APPROVE" ? "Aprovar OP no SAC Interno" : "Reprovar OP no SAC Interno"}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              {actionType === "APPROVE"
                ? `A OP ${selectedOp.opNumber} será assinada e encaminhada automaticamente para a Pré-Diagramação.`
                : `A OP ${selectedOp.opNumber} retornará para Vendas com o motivo de correção documentado.`}
            </p>

            {actionError && (
              <div className="mb-4 rounded-lg bg-rose-500/15 p-3 text-xs text-rose-300 border border-rose-500/30">
                {actionError}
              </div>
            )}

            <form onSubmit={handleSacAction} className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 font-medium">
                  {actionType === "APPROVE" ? "Notas de Liberação (Opcional)" : "Motivo da Reprovação (Obrigatório)"}
                </label>
                <textarea
                  rows={3}
                  required={actionType === "REJECT"}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  placeholder={
                    actionType === "APPROVE"
                      ? "Ex: Grade e tecido conferidos 100%..."
                      : "Ex: Falta especificação do tecido ou grade com quantidade divergente..."
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  PIN de Assinatura do Operador (4 a 6 dígitos)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                  className="mt-1 w-full text-center tracking-[0.4em] font-mono text-xl rounded-xl bg-slate-950 border border-slate-700 py-2.5 text-white focus:border-sky-500 focus:outline-none"
                  placeholder="••••••"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedOp(null)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition shadow-lg disabled:opacity-50 ${
                    actionType === "APPROVE"
                      ? "bg-sky-600 hover:bg-sky-500 shadow-sky-600/30"
                      : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/30"
                  }`}
                >
                  {isSubmitting
                    ? "Processando Assinatura..."
                    : actionType === "APPROVE"
                    ? "Confirmar com Assinatura Digital"
                    : "Confirmar Reprovação"}
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
          setSelectedSheetOpId(null);
        }}
        opId={selectedSheetOpId || undefined}
        currentUser={currentUser || { id: "", name: "SAC Interno", role: "OPERADOR", hasPin: true }}
      />
    </div>
  );
}
