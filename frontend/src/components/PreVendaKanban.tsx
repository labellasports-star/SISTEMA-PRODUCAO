import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Calendar,
  DollarSign,
  Users,
  Clock,
  ArrowRight,
  FileText,
  Image,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Eye,
} from "lucide-react";
import { api } from "../services/api.js";
import { getSocket } from "../services/socket.js";
import { UniversalOrderSheetModal } from "./UniversalOrderSheetModal.js";

const KANBAN_COLUMNS = [
  { id: "NOVA_SOLICITACAO", title: "Nova Solicitação", color: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
  { id: "ORCAMENTO_PREPARACAO", title: "Em Preparação", color: "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" },
  { id: "ORCAMENTO_ENVIADO", title: "Orçamento Enviado", color: "bg-amber-500/10 border-amber-500/30 text-amber-400" },
  { id: "AGUARDANDO_RESPOSTA", title: "Aguard. Resposta", color: "bg-orange-500/10 border-orange-500/30 text-orange-400" },
  { id: "ORCAMENTO_APROVADO", title: "Orçamento Aprovado", color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" },
  { id: "SOLICITACAO_ARTE", title: "Solicitação de Arte", color: "bg-purple-500/10 border-purple-500/30 text-purple-400" },
  { id: "DESENVOLVIMENTO_ARTE", title: "Em Desenvolvimento", color: "bg-pink-500/10 border-pink-500/30 text-pink-400" },
  { id: "AGUARDANDO_APROVACAO_ARTE", title: "Aguard. Aprov. Arte", color: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" },
  { id: "ARTE_EM_ALTERACAO", title: "Arte em Alteração", color: "bg-rose-500/10 border-rose-500/30 text-rose-400" },
  { id: "CONVERTIDA_VENDA", title: "Convertida em OP", color: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" },
  { id: "PERDIDA", title: "Perdida", color: "bg-slate-700/20 border-slate-700/40 text-slate-400" },
];

export function PreVendaKanban({ currentUser }: { currentUser?: any }) {
  const [quotations, setQuotations] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<any | null>(null);
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [sheetQuotationId, setSheetQuotationId] = useState<string | null>(null);

  // Form states
  const [customerName, setCustomerName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [teamName, setTeamName] = useState("");
  const [productsSummary, setProductsSummary] = useState("");
  const [totalQuantity, setTotalQuantity] = useState("50");
  const [budgetAmount, setBudgetAmount] = useState("2145.00");
  const [desiredDeadline, setDesiredDeadline] = useState("");
  const [briefingText, setBriefingText] = useState("");
  const [formError, setFormError] = useState("");

  // Catálogo Oficial Labella Sports
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [selectedFabric, setSelectedFabric] = useState<string>("");
  const [selectedCollar, setSelectedCollar] = useState<string>("");
  const [selectedCustomizations, setSelectedCustomizations] = useState<{ [key: string]: boolean }>({
    "Escudo TPU 3D": false,
    "Nome Individual": false,
    "Número Individual": false,
  });

  const loadQuotations = async () => {
    setIsLoading(true);
    try {
      const data = await api.getQuotations("", searchTerm);
      setQuotations(data);
    } catch (err) {
      console.error("Erro ao carregar orçamentos:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQuotations();
  }, [searchTerm]);

  useEffect(() => {
    api
      .getCatalogProducts()
      .then((prods) => {
        if (Array.isArray(prods)) {
          setCatalogProducts(prods);
          if (prods.length > 0) {
            setSelectedProduct(prods[0]);
            try {
              const fabrics = JSON.parse(prods[0].availableFabrics || "[]");
              if (fabrics.length > 0) setSelectedFabric(fabrics[0]);
              const collars = JSON.parse(prods[0].availableCollars || "[]");
              if (collars.length > 0) setSelectedCollar(collars[0]);
            } catch {
              // ignore
            }
          }
        }
      })
      .catch((err) => console.error("Erro ao carregar catálogo:", err));
  }, []);

  // Recálculo dinâmico seguro do orçamento
  useEffect(() => {
    if (selectedProduct) {
      let unit = selectedProduct.basePrice || 0;
      if (selectedCustomizations["Escudo TPU 3D"]) unit += 15.0;
      if (selectedCustomizations["Nome Individual"]) unit += 5.0;
      if (selectedCustomizations["Número Individual"]) unit += 5.0;

      const qty = parseInt(totalQuantity, 10) || 0;
      const total = unit * qty;
      setBudgetAmount(total.toFixed(2));
      setProductsSummary(`${qty}x ${selectedProduct.name}${selectedFabric ? ` (${selectedFabric})` : ""}`);
    }
  }, [selectedProduct, totalQuantity, selectedCustomizations, selectedFabric]);

  useEffect(() => {
    const socket = getSocket();
    const handleUpdate = () => {
      loadQuotations();
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

  const handleSelectProduct = (productId: string) => {
    const prod = catalogProducts.find((p) => p.id === productId);
    if (prod) {
      setSelectedProduct(prod);
      try {
        const fabrics = JSON.parse(prod.availableFabrics || "[]");
        setSelectedFabric(fabrics.length > 0 ? fabrics[0] : "");
        const collars = JSON.parse(prod.availableCollars || "[]");
        setSelectedCollar(collars.length > 0 ? collars[0] : "");
      } catch {
        setSelectedFabric("");
        setSelectedCollar("");
      }
    }
  };

  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    try {
      // 1. Cadastrar ou recuperar cliente
      const customer = await api.createCustomer({
        companyName: customerName,
        contactName,
        phone,
      });

      // 2. Preparar snapshot congelado e itens
      let itemsData = undefined;
      let frozenSnapshot = undefined;

      if (selectedProduct) {
        const qty = parseInt(totalQuantity, 10) || 1;
        let unit = selectedProduct.basePrice || 0;
        const customs = [];
        if (selectedCustomizations["Escudo TPU 3D"]) {
          unit += 15.0;
          customs.push({ name: "Escudo TPU 3D", price: 15.0 });
        }
        if (selectedCustomizations["Nome Individual"]) {
          unit += 5.0;
          customs.push({ name: "Nome Individual", price: 5.0 });
        }
        if (selectedCustomizations["Número Individual"]) {
          unit += 5.0;
          customs.push({ name: "Número Individual", price: 5.0 });
        }

        const subtotal = unit * qty;
        itemsData = [
          {
            catalogProductId: selectedProduct.id,
            productModel: selectedProduct.name,
            gender: "UNISSEX",
            size: "G", // Registro operacional
            quantity: qty,
            unitPrice: unit,
            subtotal,
            fabricType: selectedFabric || undefined,
            collarType: selectedCollar || undefined,
            customizationNotes: customs.length > 0 ? customs.map((c) => c.name).join(", ") : undefined,
          },
        ];

        frozenSnapshot = JSON.stringify({
          source: "CATALOGO_OFICIAL_LABELLA_SPORTS",
          productId: selectedProduct.id,
          productCode: selectedProduct.code,
          productName: selectedProduct.name,
          basePrice: selectedProduct.basePrice,
          effectiveDate: selectedProduct.priceEffectiveDate || new Date().toISOString(),
          minQuantityRecommended: selectedProduct.minQuantity,
          customizations: customs,
          unitPrice: unit,
          quantity: qty,
          subtotal,
        });
      }

      // 3. Criar cotação
      await api.createQuotation({
        customerId: customer.id,
        teamName,
        productsSummary,
        totalQuantity: parseInt(totalQuantity, 10) || 1,
        budgetAmount: parseFloat(budgetAmount) || 0,
        frozenPriceSnapshot: frozenSnapshot,
        desiredDeadline: desiredDeadline ? new Date(desiredDeadline).toISOString() : undefined,
        briefingText,
        items: itemsData,
      });

      setIsModalOpen(false);
      // Reset form
      setCustomerName("");
      setContactName("");
      setPhone("");
      setTeamName("");
      setProductsSummary("");
      setBriefingText("");
      await loadQuotations();
    } catch (err: any) {
      setFormError(err.message || "Erro ao criar oportunidade.");
    }
  };

  const handleMoveStatus = async (quotationId: string, nextStatus: string) => {
    try {
      await api.updateQuotationStatus(quotationId, { status: nextStatus });
      await loadQuotations();
      if (selectedQuotation && selectedQuotation.id === quotationId) {
        const updated = await api.getQuotationDetails(quotationId);
        setSelectedQuotation(updated);
      }
    } catch (err: any) {
      alert(err.message || "Erro ao movimentar oportunidade.");
    }
  };

  const openDetails = async (id: string) => {
    try {
      const details = await api.getQuotationDetails(id);
      setSelectedQuotation(details);
    } catch (err) {
      console.error("Erro ao abrir detalhes:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER DE AÇÕES */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Kanban Comercial — Pré-Venda
          </h2>
          <p className="text-xs text-slate-400">
            Acompanhamento contínuo de oportunidades, orçamentos e briefs de arte em 11 estágios.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar cliente ou equipe..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>

          <button
            onClick={loadQuotations}
            title="Atualizar Quadro"
            className="rounded-lg bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 transition border border-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-sky-600/30 hover:bg-sky-500 transition shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nova Solicitação
          </button>
        </div>
      </div>

      {/* KANBAN BOARD */}
      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 min-h-[560px]">
        {KANBAN_COLUMNS.map((col) => {
          const colQuotations = quotations.filter((q) => q.status === col.id);
          return (
            <div
              key={col.id}
              className="w-80 shrink-0 rounded-2xl bg-slate-900/90 border border-slate-800/80 flex flex-col shadow-xl"
            >
              {/* Topo da Coluna */}
              <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${col.color.split(" ")[0].replace("/10", "/80")}`}></span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">{col.title}</h3>
                </div>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-mono font-bold text-slate-300">
                  {colQuotations.length}
                </span>
              </div>

              {/* Lista de Cards da Coluna */}
              <div className="flex-1 p-2.5 space-y-3 overflow-y-auto max-h-[680px]">
                {colQuotations.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => openDetails(q.id)}
                    className="cursor-pointer rounded-xl bg-slate-950/70 border border-slate-800/80 p-3.5 hover:border-sky-500/50 hover:bg-slate-950 transition shadow-md group relative"
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-[11px] font-mono font-bold text-sky-400">
                        {q.quotationNumber}
                      </span>
                      {q.isArtworkApproved && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                          <CheckCircle className="h-3 w-3" />
                          Arte Aprovada
                        </span>
                      )}
                    </div>

                    <h4 className="mt-1 text-sm font-bold text-white group-hover:text-sky-300 transition">
                      {q.teamName}
                    </h4>
                    <p className="text-xs text-slate-400">{q.customer.companyName}</p>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-300">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-slate-500" />
                        {q.totalQuantity} pcs
                      </span>
                      <span className="font-semibold text-emerald-400">
                        R$ {q.budgetAmount.toFixed(2)}
                      </span>
                    </div>

                    {q.desiredDeadline && (
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-400/90 font-medium">
                        <Clock className="h-3 w-3" />
                        Prazo: {new Date(q.desiredDeadline).toLocaleDateString("pt-BR")}
                      </div>
                    )}
                  </div>
                ))}

                {colQuotations.length === 0 && (
                  <div className="h-28 flex items-center justify-center text-xs text-slate-600 border border-dashed border-slate-800/80 rounded-xl">
                    Sem solicitações
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL NOVA SOLICITAÇÃO DE PRÉ-VENDA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-4">Nova Oportunidade Comercial (Pré-Venda)</h3>
            {formError && (
              <div className="mb-4 rounded-lg bg-rose-500/15 p-3 text-xs text-rose-300 border border-rose-500/30">
                {formError}
              </div>
            )}
            <form onSubmit={handleCreateQuotation} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">Cliente / Empresa</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    placeholder="Ex: Atlética Medicina ou Loja X"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">Contato Responsável</label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    placeholder="Nome do cliente"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    placeholder="(11) 98888-7777"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">Nome do Time / Equipe</label>
                  <input
                    type="text"
                    required
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                    placeholder="Ex: Flamengo do Bairro ou Turma 2026"
                  />
                </div>
              </div>

              {/* SELEÇÃO DO PRODUTO DO CATÁLOGO OFICIAL */}
              <div className="rounded-xl border border-sky-900/40 bg-sky-950/20 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                    Catálogo Oficial Labella Sports
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-sky-900/60 text-sky-300">
                    Pedido Mínimo: 10 peças
                  </span>
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-medium">Modelo do Catálogo</label>
                  <select
                    value={selectedProduct?.id || ""}
                    onChange={(e) => handleSelectProduct(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  >
                    {catalogProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — R$ {p.basePrice.toFixed(2)} (Ref: {p.code})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedProduct && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Tecido */}
                    <div>
                      <label className="text-xs text-slate-300 font-medium">Tecido Recomendado</label>
                      <select
                        value={selectedFabric}
                        onChange={(e) => setSelectedFabric(e.target.value)}
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                      >
                        {(() => {
                          try {
                            const list = JSON.parse(selectedProduct.availableFabrics || "[]");
                            return list.map((f: string) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ));
                          } catch {
                            return <option value="">Padrão</option>;
                          }
                        })()}
                      </select>
                    </div>

                    {/* Gola */}
                    <div>
                      <label className="text-xs text-slate-300 font-medium">Tipo de Gola</label>
                      <select
                        value={selectedCollar}
                        onChange={(e) => setSelectedCollar(e.target.value)}
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                      >
                        {(() => {
                          try {
                            const list = JSON.parse(selectedProduct.availableCollars || "[]");
                            return list.map((c: string) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ));
                          } catch {
                            return <option value="">Padrão</option>;
                          }
                        })()}
                      </select>
                    </div>
                  </div>
                )}

                {/* Opcionais / Personalizações Comerciais */}
                <div>
                  <label className="text-xs text-slate-300 font-medium block mb-1.5">
                    Opcionais e Personalizações:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 cursor-pointer hover:border-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedCustomizations["Escudo TPU 3D"]}
                        onChange={(e) =>
                          setSelectedCustomizations((prev) => ({
                            ...prev,
                            "Escudo TPU 3D": e.target.checked,
                          }))
                        }
                        className="rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <span>Escudo TPU 3D (+R$ 15)</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 cursor-pointer hover:border-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedCustomizations["Nome Individual"]}
                        onChange={(e) =>
                          setSelectedCustomizations((prev) => ({
                            ...prev,
                            "Nome Individual": e.target.checked,
                          }))
                        }
                        className="rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <span>Nome (+R$ 5)</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 cursor-pointer hover:border-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedCustomizations["Número Individual"]}
                        onChange={(e) =>
                          setSelectedCustomizations((prev) => ({
                            ...prev,
                            "Número Individual": e.target.checked,
                          }))
                        }
                        className="rounded border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <span>Número (+R$ 5)</span>
                    </label>
                  </div>
                </div>

                {parseInt(totalQuantity, 10) < 10 && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Atenção: A política comercial da Labella Sports recomenda pedidos a partir de 10 peças.</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">Qtd. Total de Peças</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={totalQuantity}
                    onChange={(e) => setTotalQuantity(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">Valor Orçado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">Prazo Desejado</label>
                  <input
                    type="date"
                    value={desiredDeadline}
                    onChange={(e) => setDesiredDeadline(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">Produtos Solicitados</label>
                <input
                  type="text"
                  value={productsSummary}
                  onChange={(e) => setProductsSummary(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  placeholder="Ex: 50 Camisas DryFit + 50 Calções de Jogo"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">Briefing Inicial para o Designer</label>
                <textarea
                  rows={3}
                  value={briefingText}
                  onChange={(e) => setBriefingText(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-sky-500 focus:outline-none"
                  placeholder="Descreva cores desejadas, escudo, referências visuais e ideias do cliente..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition shadow-lg shadow-sky-600/30"
                >
                  Criar Solicitação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DETALHES COMPLETOS DA OPORTUNIDADE */}
      {selectedQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="font-mono text-xs font-bold text-sky-400">
                  {selectedQuotation.quotationNumber}
                </span>
                <h3 className="text-xl font-bold text-white mt-1">{selectedQuotation.teamName}</h3>
                <p className="text-xs text-slate-400">
                  Cliente: <strong className="text-slate-300">{selectedQuotation.customer.companyName}</strong> ({selectedQuotation.customer.contactName} - {selectedQuotation.customer.phone})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSheetQuotationId(selectedQuotation.id);
                    setIsSheetModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-sky-950 hover:bg-sky-900 border border-sky-800 px-3 py-1.5 text-xs font-semibold text-sky-300 transition"
                  title="Abrir Ficha Universal do Pedido"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver Ficha Completa
                </button>
                <button
                  onClick={() => setSelectedQuotation(null)}
                  className="rounded-lg bg-slate-800 p-2 text-slate-400 hover:text-white transition"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* AÇÕES DE AVANÇO RÁPIDO DO KANBAN */}
            <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 mr-2">Mover Status:</span>
              {selectedQuotation.status === "NOVA_SOLICITACAO" && (
                <button
                  onClick={() => handleMoveStatus(selectedQuotation.id, "ORCAMENTO_PREPARACAO")}
                  className="rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 text-xs font-medium hover:bg-indigo-600 hover:text-white transition"
                >
                  Em Preparação →
                </button>
              )}
              {selectedQuotation.status === "ORCAMENTO_PREPARACAO" && (
                <button
                  onClick={() => handleMoveStatus(selectedQuotation.id, "ORCAMENTO_ENVIADO")}
                  className="rounded bg-amber-600/20 text-amber-300 border border-amber-500/30 px-3 py-1 text-xs font-medium hover:bg-amber-600 hover:text-white transition"
                >
                  Orçamento Enviado →
                </button>
              )}
              {selectedQuotation.status === "ORCAMENTO_ENVIADO" && (
                <button
                  onClick={() => handleMoveStatus(selectedQuotation.id, "SOLICITACAO_ARTE")}
                  className="rounded bg-purple-600/20 text-purple-300 border border-purple-500/30 px-3 py-1 text-xs font-medium hover:bg-purple-600 hover:text-white transition"
                >
                  Enviar ao Designer →
                </button>
              )}
              <span className="ml-auto text-xs font-mono text-slate-400">
                Status Atual: <strong className="text-sky-400">{selectedQuotation.status}</strong>
              </span>
            </div>

            {/* DETALHES DE BRIEFING E ARTE */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-950 p-4 border border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Briefing do Cliente
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {selectedQuotation.designBrief?.briefingText || "Sem briefing detalhado."}
                </p>
              </div>

              <div className="rounded-xl bg-slate-950 p-4 border border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Status da Arte
                </h4>
                {selectedQuotation.isArtworkApproved ? (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                    <CheckCircle className="h-4 w-4" />
                    Arte aprovada por: {selectedQuotation.artworkApprovedBy || "Cliente"}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                    <AlertCircle className="h-4 w-4" />
                    Aprovação da arte ainda pendente
                  </div>
                )}
                {selectedQuotation.designBrief?.versions && selectedQuotation.designBrief.versions.length > 0 && (
                  <div className="mt-2 text-xs text-slate-400">
                    Última versão anexada: <strong>v{selectedQuotation.designBrief.versions[0].versionNumber}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* TIMELINE DE HISTÓRICO */}
            <div className="mt-6 border-t border-slate-800 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                Histórico & Timeline do Pedido
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedQuotation.timeline?.map((t: any) => (
                  <div key={t.id} className="text-xs border-l-2 border-sky-500 pl-3 py-1">
                    <div className="flex items-center gap-2 text-slate-400">
                      <span className="font-semibold text-white">{t.user?.name || "Sistema"}</span>
                      <span>•</span>
                      <span>{new Date(t.createdAt).toLocaleString("pt-BR")}</span>
                    </div>
                    <p className="text-slate-300 mt-0.5">{t.notes}</p>
                  </div>
                ))}
              </div>
            </div>
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
        currentUser={currentUser || { id: "", name: "Vendedor", role: "VENDEDOR", hasPin: true }}
      />
    </div>
  );
}
