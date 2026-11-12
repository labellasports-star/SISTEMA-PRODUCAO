import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Flame,
  Calendar,
  Layers,
  Truck,
  Building2,
  PackageCheck,
  AlertCircle,
  Eye,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { api } from "../services/api.js";

type PeriodType = "days" | "weeks" | "months" | "years";

interface DashboardData {
  period: PeriodType;
  kpis: {
    activeOrdersCount: number;
    totalPiecesInProduction: number;
    completedOrdersPeriodCount: number;
    totalHistoricalCompletedCount: number;
    piecesDeliveredPeriodCount: number;
    totalReworkBatchesCount: number;
    totalReworkPiecesCount: number;
    reworkRate: number;
    activeRisksCount: number;
    criticalRisksCount: number;
    avgLeadTimeDays: number;
  };
  timeline: Array<{
    key: string;
    label: string;
    ordersCompleted: number;
    piecesDelivered: number;
  }>;
  riskAlerts: Array<{
    id: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    type: string;
    title: string;
    description: string;
    opId: string;
    opNumber: string;
    customerName: string;
    batchNumber?: string;
    sectorName?: string;
    daysRemaining?: number;
    createdAt: string;
  }>;
  pipelineOrders: Array<{
    id: string;
    opNumber: string;
    title: string;
    productType: string;
    priority: string;
    status: string;
    customer: { id: string; companyName: string; contactName: string; phone: string };
    totalQuantityOrdered: number;
    totalQuantityDone: number;
    totalQuantityDelivered: number;
    totalQuantityRework: number;
    percentDone: number;
    promisedDeliveryDate?: string;
    daysRemaining?: number | null;
    deadlineStatus: "ON_TIME" | "WARNING" | "EXPIRED";
    hasRework: boolean;
    currentSectors: string[];
    batches: Array<{
      id: string;
      batchNumber: string;
      quantity: number;
      batchStatus: string;
      isUnderRework: boolean;
      reworkReason?: string;
      sectorCode?: string;
      sectorName?: string;
      sequenceOrder?: number;
    }>;
    createdAt: string;
  }>;
  sectorDistribution: Array<{
    id: string;
    sequenceOrder: number;
    code: string;
    name: string;
    batchesCount: number;
    piecesCount: number;
    reworkBatchesCount: number;
    isBottleneck: boolean;
  }>;
  completedOrdersList: Array<{
    id: string;
    opNumber: string;
    title: string;
    customerName: string;
    totalQuantityOrdered: number;
    totalQuantityDelivered: number;
    completedAt: string;
    leadTimeDays: number;
    deliveryManifestNumber?: string;
  }>;
}

interface AdminDashboardProps {
  onNavigateToOp?: (opId: string) => void;
  onNavigateToSector?: (sectorCode: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onNavigateToOp,
  onNavigateToSector,
}) => {
  const [period, setPeriod] = useState<PeriodType>("days");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Filtros de busca no pipeline
  const [searchPipeline, setSearchPipeline] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ON_TIME" | "WARNING" | "EXPIRED" | "REWORK">("ALL");
  const [expandedOpId, setExpandedOpId] = useState<string | null>(null);

  // Filtros de riscos
  const [riskSeverityFilter, setRiskSeverityFilter] = useState<"ALL" | "CRITICAL" | "HIGH" | "MEDIUM">("ALL");

  const loadDashboardData = async (selectedPeriod: PeriodType = period, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await api.getDashboardOverview(selectedPeriod);
      setData(res);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error("Erro ao carregar Dashboard:", err);
      setError(err.message || "Não foi possível carregar os dados analíticos.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData(period);
  }, [period]);

  // Filtragem do Pipeline de Pedidos
  const filteredPipeline = useMemo(() => {
    if (!data?.pipelineOrders) return [];
    return data.pipelineOrders.filter((order) => {
      const matchSearch =
        order.opNumber.toLowerCase().includes(searchPipeline.toLowerCase()) ||
        order.customer.companyName.toLowerCase().includes(searchPipeline.toLowerCase()) ||
        order.title.toLowerCase().includes(searchPipeline.toLowerCase());

      if (!matchSearch) return false;

      if (filterStatus === "ON_TIME") return order.deadlineStatus === "ON_TIME" && !order.hasRework;
      if (filterStatus === "WARNING") return order.deadlineStatus === "WARNING";
      if (filterStatus === "EXPIRED") return order.deadlineStatus === "EXPIRED";
      if (filterStatus === "REWORK") return order.hasRework;

      return true;
    });
  }, [data?.pipelineOrders, searchPipeline, filterStatus]);

  // Filtragem de Riscos
  const filteredRisks = useMemo(() => {
    if (!data?.riskAlerts) return [];
    if (riskSeverityFilter === "ALL") return data.riskAlerts;
    return data.riskAlerts.filter((r) => r.severity === riskSeverityFilter);
  }, [data?.riskAlerts, riskSeverityFilter]);

  // Cálculo para o Gráfico de Evolução SVG
  const chartMaxPieces = useMemo(() => {
    if (!data?.timeline || data.timeline.length === 0) return 100;
    const max = Math.max(...data.timeline.map((t) => t.piecesDelivered), 10);
    return Math.ceil(max * 1.25);
  }, [data?.timeline]);

  const maxSectorPieces = useMemo(() => {
    if (!data?.sectorDistribution || data.sectorDistribution.length === 0) return 10;
    return Math.max(...data.sectorDistribution.map((s) => s.piecesCount), 10);
  }, [data?.sectorDistribution]);

  const handleFocusOp = (opId: string, opNumber?: string) => {
    if (opNumber) {
      setSearchPipeline(opNumber);
    }
    setExpandedOpId(opId);
    const elem = document.getElementById("pipeline-section");
    if (elem) {
      elem.scrollIntoView({ behavior: "smooth" });
    }
    if (onNavigateToOp) {
      onNavigateToOp(opId);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8">
        <RefreshCw className="h-10 w-10 text-sky-400 animate-spin mb-4" />
        <h3 className="text-lg font-bold text-white">Carregando Dashboard Analítico...</h3>
        <p className="text-sm text-slate-400 mt-1">Consolidando pedidos, chão de fábrica e acionamento de riscos</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-400 mb-3" />
          <h3 className="text-lg font-bold text-white">Erro ao Carregar Dashboard</h3>
          <p className="text-sm text-rose-200 mt-1 mb-4">{error}</p>
          <button
            onClick={() => loadDashboardData(period)}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 transition shadow-lg"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  const kpis = data?.kpis;

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 max-w-[1600px] mx-auto w-full">
      {/* CABEÇALHO DO DASHBOARD EXECUTIVO */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-sky-500/20 text-amber-400 border border-amber-500/30 shadow-inner">
              <TrendingUp className="h-6 w-6 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Dashboard do Administrador Geral
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/25">
                  <Sparkles className="h-3 w-3" />
                  Visão Executiva & PCP
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Controle em tempo real da esteira fabril, detecção de gargalos, acionamento de riscos e histórico temporal
              </p>
            </div>
          </div>
        </div>

        {/* SELETOR DE PERÍODO & ATUALIZAR */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botões de Período */}
          <div className="inline-flex rounded-xl bg-slate-900 p-1 border border-slate-800 shadow-sm">
            <button
              onClick={() => setPeriod("days")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === "days"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Dias
            </button>
            <button
              onClick={() => setPeriod("weeks")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === "weeks"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Semanas
            </button>
            <button
              onClick={() => setPeriod("months")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === "months"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Meses
            </button>
            <button
              onClick={() => setPeriod("years")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === "years"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              Anos
            </button>
          </div>

          {/* Botão de Atualizar */}
          <button
            onClick={() => loadDashboardData(period, true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 border border-slate-700 transition disabled:opacity-50"
            title="Atualizar dados agora"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-sky-400 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {/* CARDS DE KPIS EXECUTIVOS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI 1: OPs Ativas */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 p-5 border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ordens Ativas</span>
            <div className="rounded-xl bg-sky-500/15 p-2 text-sky-400 border border-sky-500/20">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {kpis?.activeOrdersCount ?? 0}
            </span>
            <span className="text-xs text-sky-400 font-medium">OPs no fluxo</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2">
            <span>Carga Total:</span>
            <strong className="text-slate-200 font-semibold">{kpis?.totalPiecesInProduction ?? 0} peças</strong>
          </div>
        </div>

        {/* KPI 2: Concluídos no Período */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 p-5 border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Entregues ({period === "days" ? "14 Dias" : period === "weeks" ? "12 Sem" : period === "months" ? "12 Meses" : "Anual"})
            </span>
            <div className="rounded-xl bg-emerald-500/15 p-2 text-emerald-400 border border-emerald-500/20">
              <PackageCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-400 tracking-tight">
              {kpis?.completedOrdersPeriodCount ?? 0}
            </span>
            <span className="text-xs text-emerald-400/80 font-medium">OPs concluídas</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2">
            <span>Peças Entregues:</span>
            <strong className="text-emerald-300 font-semibold">{kpis?.piecesDeliveredPeriodCount ?? 0} pcs</strong>
          </div>
        </div>

        {/* KPI 3: Lead Time Médio */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 p-5 border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lead Time Médio</span>
            <div className="rounded-xl bg-blue-500/15 p-2 text-blue-400 border border-blue-500/20">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white tracking-tight">
              {kpis?.avgLeadTimeDays ?? 0}
            </span>
            <span className="text-xs text-blue-400 font-medium">dias / pedido</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2">
            <span>Total Histórico:</span>
            <strong className="text-slate-200 font-semibold">{kpis?.totalHistoricalCompletedCount ?? 0} OPs</strong>
          </div>
        </div>

        {/* KPI 4: Retrabalho */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 p-5 border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Taxa de Retrabalho</span>
            <div className={`rounded-xl p-2 border ${
              (kpis?.reworkRate ?? 0) > 5
                ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                : (kpis?.reworkRate ?? 0) > 0
                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            }`}>
              <RotateCcw className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold tracking-tight ${
              (kpis?.reworkRate ?? 0) > 5 ? "text-rose-400" : (kpis?.reworkRate ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"
            }`}>
              {kpis?.reworkRate ?? 0}%
            </span>
            <span className="text-xs text-slate-400 font-medium">das peças</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2">
            <span>Lotes Retrabalhando:</span>
            <strong className={`${(kpis?.totalReworkBatchesCount ?? 0) > 0 ? "text-amber-400" : "text-slate-200"} font-semibold`}>
              {kpis?.totalReworkBatchesCount ?? 0} lote(s)
            </strong>
          </div>
        </div>

        {/* KPI 5: Alertas de Risco */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 p-5 border border-slate-800/80 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Acionamento de Riscos</span>
            <div className={`rounded-xl p-2 border ${
              (kpis?.criticalRisksCount ?? 0) > 0
                ? "bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse"
                : (kpis?.activeRisksCount ?? 0) > 0
                ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
            }`}>
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold tracking-tight ${
              (kpis?.criticalRisksCount ?? 0) > 0 ? "text-rose-400" : (kpis?.activeRisksCount ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"
            }`}>
              {kpis?.activeRisksCount ?? 0}
            </span>
            <span className="text-xs text-slate-400 font-medium">alertas ativos</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2">
            <span>Riscos Críticos:</span>
            <strong className={`${(kpis?.criticalRisksCount ?? 0) > 0 ? "text-rose-400 font-bold" : "text-slate-200 font-semibold"}`}>
              {kpis?.criticalRisksCount ?? 0} estourados
            </strong>
          </div>
        </div>
      </div>

      {/* PAINEL DE ACIONAMENTO DE RISCOS (RISK ALERTS) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Central de Acionamento de Riscos
                <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-bold text-rose-300 border border-rose-500/30">
                  {filteredRisks.length} {filteredRisks.length === 1 ? "Ocorrência" : "Ocorrências"}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Prazos estourados, gargalos de setores fabris, lotes retidos e retrabalhos ativos
              </p>
            </div>
          </div>

          {/* Filtros de Severidade */}
          <div className="inline-flex rounded-lg bg-slate-800 p-1 border border-slate-700 text-xs">
            <button
              onClick={() => setRiskSeverityFilter("ALL")}
              className={`px-2.5 py-1 rounded font-medium transition ${
                riskSeverityFilter === "ALL" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Todos ({data?.riskAlerts.length ?? 0})
            </button>
            <button
              onClick={() => setRiskSeverityFilter("CRITICAL")}
              className={`px-2.5 py-1 rounded font-medium transition ${
                riskSeverityFilter === "CRITICAL" ? "bg-rose-600 text-white" : "text-rose-400 hover:text-rose-300"
              }`}
            >
              Críticos ({data?.riskAlerts.filter((r) => r.severity === "CRITICAL").length ?? 0})
            </button>
            <button
              onClick={() => setRiskSeverityFilter("HIGH")}
              className={`px-2.5 py-1 rounded font-medium transition ${
                riskSeverityFilter === "HIGH" ? "bg-amber-600 text-white" : "text-amber-400 hover:text-amber-300"
              }`}
            >
              Altos ({data?.riskAlerts.filter((r) => r.severity === "HIGH").length ?? 0})
            </button>
            <button
              onClick={() => setRiskSeverityFilter("MEDIUM")}
              className={`px-2.5 py-1 rounded font-medium transition ${
                riskSeverityFilter === "MEDIUM" ? "bg-sky-600 text-white" : "text-sky-400 hover:text-sky-300"
              }`}
            >
              Médios ({data?.riskAlerts.filter((r) => r.severity === "MEDIUM").length ?? 0})
            </button>
          </div>
        </div>

        {/* Lista de Alertas de Risco */}
        <div className="mt-4">
          {filteredRisks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-950/50 rounded-xl border border-slate-800/80">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-2" />
              <p className="text-sm font-semibold text-slate-200">Nenhum risco detectado nesta categoria!</p>
              <p className="text-xs text-slate-500 mt-0.5">Todas as operações estão dentro dos parâmetros esperados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredRisks.map((risk) => (
                <div
                  key={risk.id}
                  className={`relative rounded-xl p-4 border transition hover:border-slate-600 ${
                    risk.severity === "CRITICAL"
                      ? "bg-rose-950/20 border-rose-500/40 text-rose-100"
                      : risk.severity === "HIGH"
                      ? "bg-amber-950/20 border-amber-500/40 text-amber-100"
                      : "bg-slate-800/50 border-slate-700/80 text-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          risk.severity === "CRITICAL"
                            ? "bg-rose-600 text-white animate-pulse"
                            : risk.severity === "HIGH"
                            ? "bg-amber-600 text-white"
                            : "bg-sky-600 text-white"
                        }`}
                      >
                        {risk.severity === "CRITICAL"
                          ? "Crítico"
                          : risk.severity === "HIGH"
                          ? "Alerta Alto"
                          : "Atenção"}
                      </span>
                      {risk.sectorName && (
                        <span className="text-[11px] font-medium text-slate-400 bg-slate-800/90 px-1.5 py-0.5 rounded border border-slate-700">
                          {risk.sectorName}
                        </span>
                      )}
                    </div>
                    {risk.opNumber && (
                      <span className="text-xs font-mono font-bold text-slate-300">
                        {risk.opNumber}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-2 text-sm font-bold text-white">{risk.title}</h3>
                  <p className="mt-1 text-xs text-slate-300 leading-relaxed">{risk.description}</p>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-700/40 pt-2">
                    <span className="truncate max-w-[150px]">Cliente: {risk.customerName}</span>
                    {risk.opId && (
                      <button
                        onClick={() => handleFocusOp(risk.opId, risk.opNumber)}
                        className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-semibold"
                        title="Ver e focar esta OP no pipeline"
                      >
                        Ver OP <ArrowUpRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SEÇÃO DE GRÁFICOS: TEMPORAL + CARGA POR SETOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* GRÁFICO 1: Histórico de Conclusões & Peças Entregues (8 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-3 gap-2">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-sky-400" />
                  Evolução de Entregas & Produtividade
                </h2>
                <p className="text-xs text-slate-400">
                  Peças entregues e OPs concluídas agrupadas por{" "}
                  {period === "days"
                    ? "dia a dia"
                    : period === "weeks"
                    ? "semana do ano"
                    : period === "months"
                    ? "mês"
                    : "ano"}
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-500"></span>
                  <span className="text-slate-300 font-medium">Peças Entregues</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                  <span className="text-slate-300 font-medium">OPs Concluídas</span>
                </div>
              </div>
            </div>

            {/* GRÁFICO EM SVG NATIVO RESPONSIVO */}
            <div className="mt-6 w-full h-56 sm:h-64 relative">
              {data?.timeline && data.timeline.length > 0 ? (
                <div className="w-full h-full flex flex-col justify-between">
                  <svg
                    viewBox={`0 0 ${data.timeline.length * 50 + 20} 180`}
                    className="w-full h-full overflow-visible"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0284c7" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Linhas de Grade Horizontais */}
                    <line x1="10" y1="30" x2={data.timeline.length * 50} y2="30" stroke="#334155" strokeDasharray="3 3" opacity="0.6" />
                    <line x1="10" y1="80" x2={data.timeline.length * 50} y2="80" stroke="#334155" strokeDasharray="3 3" opacity="0.6" />
                    <line x1="10" y1="130" x2={data.timeline.length * 50} y2="130" stroke="#334155" strokeDasharray="3 3" opacity="0.6" />
                    <line x1="10" y1="160" x2={data.timeline.length * 50} y2="160" stroke="#475569" strokeWidth="1" />

                    {/* Área Preenchida com Gradiente */}
                    {data.timeline.length > 1 && (
                      <polygon
                        points={`10,160 ${data.timeline
                          .map((t, idx) => {
                            const x = 20 + idx * 50;
                            const y = 160 - Math.min(140, (t.piecesDelivered / chartMaxPieces) * 140);
                            return `${x},${y}`;
                          })
                          .join(" ")} ${20 + (data.timeline.length - 1) * 50},160`}
                        fill="url(#areaGradient)"
                      />
                    )}

                    {/* Linha de Conexão das Peças */}
                    {data.timeline.length > 1 && (
                      <polyline
                        points={data.timeline
                          .map((t, idx) => {
                            const x = 20 + idx * 50;
                            const y = 160 - Math.min(140, (t.piecesDelivered / chartMaxPieces) * 140);
                            return `${x},${y}`;
                          })
                          .join(" ")}
                        fill="none"
                        stroke="#0284c7"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Pontos de Dados & Barras de OPs Concluídas */}
                    {data.timeline.map((point, idx) => {
                      const x = 20 + idx * 50;
                      const yPieces = 160 - Math.min(140, (point.piecesDelivered / chartMaxPieces) * 140);
                      const barHeight = Math.min(60, point.ordersCompleted * 15);

                      return (
                        <g key={point.key} className="cursor-pointer group">
                          {/* Barra de OPs concluídas */}
                          {point.ordersCompleted > 0 && (
                            <rect
                              x={x - 6}
                              y={160 - barHeight}
                              width="12"
                              height={barHeight}
                              rx="3"
                              fill="#10b981"
                              opacity="0.8"
                              className="group-hover:opacity-100 transition"
                            />
                          )}

                          {/* Ponto da linha de peças */}
                          <circle
                            cx={x}
                            cy={yPieces}
                            r={point.piecesDelivered > 0 ? 4 : 2}
                            fill="#0284c7"
                            stroke="#ffffff"
                            strokeWidth="1.5"
                            className="group-hover:r-6 transition"
                          />

                          {/* Valor acima do ponto se > 0 */}
                          {point.piecesDelivered > 0 && (
                            <text
                              x={x}
                              y={yPieces - 7}
                              textAnchor="middle"
                              fill="#38bdf8"
                              fontSize="9"
                              fontWeight="bold"
                            >
                              {point.piecesDelivered}
                            </text>
                          )}

                          {/* Rótulo do Eixo X */}
                          <text
                            x={x}
                            y="175"
                            textAnchor="middle"
                            fill="#94a3b8"
                            fontSize="8.5"
                            fontWeight="500"
                          >
                            {point.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-slate-500 text-xs">
                  Sem dados para o período selecionado.
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-800 pt-3 flex items-center justify-between text-xs text-slate-400">
            <span>
              Total de entregas no período: <strong className="text-white">{kpis?.completedOrdersPeriodCount ?? 0} OPs</strong>
            </span>
            <span>
              Volume total: <strong className="text-sky-400">{kpis?.piecesDeliveredPeriodCount ?? 0} peças entregues</strong>
            </span>
          </div>
        </div>

        {/* GRÁFICO 2: Distribuição de Carga nos 14 Setores Fabris (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="h-4 w-4 text-amber-400" />
                Mapa de Carga nos 14 Setores
              </h2>
              <p className="text-xs text-slate-400">
                Lotes e peças em processamento com identificação automática de gargalos
              </p>
            </div>

            <div className="mt-4 space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {data?.sectorDistribution.map((sector) => {
                const percent = maxSectorPieces > 0 ? (sector.piecesCount / maxSectorPieces) * 100 : 0;
                return (
                  <div
                    key={sector.id}
                    onClick={() => onNavigateToSector && onNavigateToSector(sector.code)}
                    className={`rounded-xl p-2.5 border transition cursor-pointer ${
                      sector.isBottleneck
                        ? "bg-rose-950/20 border-rose-500/50 hover:bg-rose-950/30"
                        : sector.piecesCount > 0
                        ? "bg-slate-800/60 border-slate-700/80 hover:bg-slate-800"
                        : "bg-slate-900/50 border-slate-800/60 hover:bg-slate-800/40 opacity-70"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded font-bold">
                          {String(sector.sequenceOrder).padStart(2, "0")}
                        </span>
                        <span className="font-semibold text-slate-200">{sector.name}</span>
                        {sector.isBottleneck && (
                          <span className="rounded bg-rose-600 px-1.5 py-0.2 text-[9px] font-bold text-white animate-pulse">
                            GARGALO
                          </span>
                        )}
                        {sector.reworkBatchesCount > 0 && (
                          <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 text-[9px] font-semibold">
                            {sector.reworkBatchesCount} retrabalho
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-slate-400 text-[11px]">{sector.batchesCount} lote(s)</span>
                        <strong className="text-white font-bold text-[11px]">{sector.piecesCount} pcs</strong>
                      </div>
                    </div>

                    {/* Barra de Carga Percentual */}
                    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          sector.isBottleneck
                            ? "bg-rose-500"
                            : sector.piecesCount > 0
                            ? "bg-sky-500"
                            : "bg-slate-700"
                        }`}
                        style={{ width: `${Math.max(percent, sector.piecesCount > 0 ? 5 : 0)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-800 pt-3 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Clique no setor para inspecionar</span>
            <span className="font-semibold text-slate-300">14 Setores Industriais Ativos</span>
          </div>
        </div>
      </div>

      {/* SEÇÃO DE ANDAMENTO DE PEDIDOS (PIPELINE OPERACIONAL) */}
      <div id="pipeline-section" className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-sky-400" />
              Andamento de Pedidos em Produção (Pipeline)
            </h2>
            <p className="text-xs text-slate-400">
              Acompanhamento de OPs ativas, avanço físico por setor e controle de prazos
            </p>
          </div>

          {/* Barra de Busca e Filtro de Status */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar OP, Cliente ou Produto..."
                value={searchPipeline}
                onChange={(e) => setSearchPipeline(e.target.value)}
                className="w-56 sm:w-64 rounded-xl bg-slate-800 border border-slate-700 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
            >
              <option value="ALL">Todos os Status</option>
              <option value="ON_TIME">No Prazo</option>
              <option value="WARNING">Atenção (Próximo)</option>
              <option value="EXPIRED">Atrasados</option>
              <option value="REWORK">Com Retrabalho</option>
            </select>
          </div>
        </div>

        {/* Tabela do Pipeline */}
        <div className="mt-4 overflow-x-auto">
          {filteredPipeline.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              Nenhuma Ordem de Produção encontrada com os filtros selecionados.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[11px]">
                  <th className="py-2.5 px-3">OP & Pedido</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Prioridade</th>
                  <th className="py-2.5 px-3">Prazo Prometido</th>
                  <th className="py-2.5 px-3">Progresso Físico</th>
                  <th className="py-2.5 px-3">Setor Atual</th>
                  <th className="py-2.5 px-3 text-right">Lotes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredPipeline.map((op) => {
                  const isExpanded = expandedOpId === op.id;
                  return (
                    <React.Fragment key={op.id}>
                      <tr className="hover:bg-slate-800/40 transition">
                        {/* OP & Título */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setExpandedOpId(isExpanded ? null : op.id)}
                              className="text-slate-400 hover:text-white transition"
                              title="Ver lotes desta OP"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-sky-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-bold text-sky-400">{op.opNumber}</span>
                                {op.hasRework && (
                                  <span className="rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 py-0.2 text-[9px] font-bold">
                                    RETRABALHO
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-300 block truncate max-w-[200px]">
                                {op.title}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Cliente */}
                        <td className="py-3 px-3 text-slate-200 font-medium">
                          {op.customer.companyName}
                        </td>

                        {/* Prioridade */}
                        <td className="py-3 px-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              op.priority === "URGENTE"
                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 font-extrabold"
                                : op.priority === "ALTA"
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                : "bg-slate-800 text-slate-300 border border-slate-700"
                            }`}
                          >
                            {op.priority}
                          </span>
                        </td>

                        {/* Prazo */}
                        <td className="py-3 px-3">
                          {op.promisedDeliveryDate ? (
                            <div>
                              <span
                                className={`font-semibold ${
                                  op.deadlineStatus === "EXPIRED"
                                    ? "text-rose-400"
                                    : op.deadlineStatus === "WARNING"
                                    ? "text-amber-400"
                                    : "text-slate-200"
                                }`}
                              >
                                {new Date(op.promisedDeliveryDate).toLocaleDateString("pt-BR")}
                              </span>
                              <span className="block text-[10px] text-slate-400">
                                {typeof op.daysRemaining === "number" && op.daysRemaining < 0
                                  ? `Atrasado há ${Math.abs(op.daysRemaining)} dia(s)`
                                  : op.daysRemaining === 0
                                  ? "Vence hoje!"
                                  : typeof op.daysRemaining === "number"
                                  ? `${op.daysRemaining} dia(s) restantes`
                                  : "Data não definida"}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500">Sem prazo</span>
                          )}
                        </td>

                        {/* Progresso Físico */}
                        <td className="py-3 px-3">
                          <div className="w-36">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="font-semibold text-slate-200">
                                {op.totalQuantityDone} / {op.totalQuantityOrdered} pcs
                              </span>
                              <span className="text-sky-400 font-bold">{op.percentDone}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-300"
                                style={{ width: `${op.percentDone}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>

                        {/* Setor Atual */}
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {op.currentSectors.length > 0 ? (
                              op.currentSectors.map((secName, idx) => (
                                <span
                                  key={idx}
                                  className="rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium"
                                >
                                  {secName}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-500 text-[11px]">Aguardando</span>
                            )}
                          </div>
                        </td>

                        {/* Lotes */}
                        <td className="py-3 px-3 text-right">
                          <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-slate-300 font-semibold">
                            {op.batches.length} {op.batches.length === 1 ? "lote" : "lotes"}
                          </span>
                        </td>
                      </tr>

                      {/* Sub-tabela de lotes expandida */}
                      {isExpanded && (
                        <tr className="bg-slate-900/90 border-b border-slate-800">
                          <td colSpan={7} className="p-3 pl-8">
                            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                                Lotes e Sublotes da {op.opNumber}:
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {op.batches.map((b) => (
                                  <div
                                    key={b.id}
                                    className={`rounded-lg p-2.5 border text-xs ${
                                      b.isUnderRework
                                        ? "bg-amber-950/20 border-amber-500/40 text-amber-200"
                                        : "bg-slate-900 border-slate-800 text-slate-300"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between font-mono font-bold mb-1">
                                      <span className="text-sky-400">{b.batchNumber}</span>
                                      <span className="text-white">{b.quantity} pcs</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                                      <span>Setor: <strong className="text-slate-200">{b.sectorName || "N/A"}</strong></span>
                                      <span className="rounded bg-slate-800 px-1 text-[10px] font-semibold">{b.batchStatus}</span>
                                    </div>
                                    {b.isUnderRework && b.reworkReason && (
                                      <div className="mt-1.5 text-[10px] text-amber-300 bg-amber-500/10 p-1 rounded border border-amber-500/20">
                                        Motivo: {b.reworkReason}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* SEÇÃO: REGISTRO DE PEDIDOS CONCLUÍDOS NO PERÍODO */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-emerald-400" />
              Pedidos Concluídos & Entregues ({data?.completedOrdersList.length ?? 0})
            </h2>
            <p className="text-xs text-slate-400">
              Histórico de Ordens de Produção finalizadas com sucesso no período de{" "}
              {period === "days"
                ? "últimos 14 dias"
                : period === "weeks"
                ? "últimas 12 semanas"
                : period === "months"
                ? "últimos 12 meses"
                : "histórico anual"}
            </p>
          </div>

          <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            Total Entregue: {kpis?.piecesDeliveredPeriodCount ?? 0} peças
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          {data?.completedOrdersList && data.completedOrdersList.length > 0 ? (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[11px]">
                  <th className="py-2 px-3">OP Concluída</th>
                  <th className="py-2 px-3">Cliente</th>
                  <th className="py-2 px-3">Peças Entregues</th>
                  <th className="py-2 px-3">Lead Time Fabril</th>
                  <th className="py-2 px-3">Data de Conclusão</th>
                  <th className="py-2 px-3">Romaneio de Entrega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.completedOrdersList.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3">
                      <span className="font-mono font-bold text-emerald-400">{item.opNumber}</span>
                      <span className="block text-[11px] text-slate-400 truncate max-w-[200px]">{item.title}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-200 font-medium">{item.customerName}</td>
                    <td className="py-2.5 px-3 font-semibold text-white">
                      {item.totalQuantityDelivered} pcs
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300 font-medium">
                        {item.leadTimeDays} dia(s) corridos
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {new Date(item.completedAt).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-sky-400">
                      {item.deliveryManifestNumber || "Direto / Balcão"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-8 text-center text-xs text-slate-500">
              Nenhuma ordem de produção concluída registrada neste intervalo temporal.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
