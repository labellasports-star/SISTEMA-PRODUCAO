import { Router, Response } from "express";
import { prisma } from "../prisma.js";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../middleware/auth.js";

export const dashboardRouter = Router();

// Endpoint protegido para Administrador e Gestores
dashboardRouter.use(authenticateToken);
dashboardRouter.use(requireRole("ADMIN", "GESTOR"));

interface TimelinePoint {
  key: string;
  label: string;
  ordersCompleted: number;
  piecesDelivered: number;
}

/**
 * GET /api/dashboard/overview
 * Parâmetros de query:
 *   - period: "days" | "weeks" | "months" | "years" (padrão: "days")
 *   - range: número opcional de períodos retroativos
 */
dashboardRouter.get("/overview", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const period = (req.query.period as string) || "days";
    const now = new Date();

    // 1. Definir intervalo de tempo e pontos da timeline
    const timelineMap = new Map<string, TimelinePoint>();
    let startDate: Date;

    if (period === "weeks") {
      // Últimas 12 semanas
      const numWeeks = 12;
      startDate = new Date(now.getTime() - numWeeks * 7 * 24 * 60 * 60 * 1000);
      for (let i = numWeeks - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        // Ano e número aproximado da semana
        const weekNum = getWeekNumber(d);
        const key = `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
        const label = `Sem ${weekNum}`;
        if (!timelineMap.has(key)) {
          timelineMap.set(key, { key, label, ordersCompleted: 0, piecesDelivered: 0 });
        }
      }
    } else if (period === "months") {
      // Últimos 12 meses
      const numMonths = 12;
      startDate = new Date(now.getFullYear(), now.getMonth() - numMonths + 1, 1);
      for (let i = numMonths - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        const label = `${monthNames[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
        timelineMap.set(key, { key, label, ordersCompleted: 0, piecesDelivered: 0 });
      }
    } else if (period === "years") {
      // Últimos 4 anos
      const numYears = 4;
      startDate = new Date(now.getFullYear() - numYears + 1, 0, 1);
      for (let i = numYears - 1; i >= 0; i--) {
        const yr = now.getFullYear() - i;
        const key = `${yr}`;
        const label = `${yr}`;
        timelineMap.set(key, { key, label, ordersCompleted: 0, piecesDelivered: 0 });
      }
    } else {
      // "days" - Últimos 14 dias
      const numDays = 14;
      startDate = new Date(now.getTime() - (numDays - 1) * 24 * 60 * 60 * 1000);
      startDate.setHours(0, 0, 0, 0);
      for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
        const label = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        timelineMap.set(key, { key, label, ordersCompleted: 0, piecesDelivered: 0 });
      }
    }

    // 2. Buscar OPs ativas e lotes em andamento
    const activeOrders = await prisma.productionOrder.findMany({
      where: { status: "ACTIVE" },
      include: {
        customer: { select: { id: true, companyName: true, contactName: true, phone: true } },
        batches: {
          include: {
            currentSector: { select: { id: true, code: true, name: true, sequenceOrder: true } },
            reworkOriginSector: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: [
        { priority: "desc" },
        { promisedDeliveryDate: "asc" },
      ],
    });

    // 3. Buscar OPs concluídas no período
    const completedOrdersInPeriod = await prisma.productionOrder.findMany({
      where: {
        status: "COMPLETED",
        updatedAt: { gte: startDate },
      },
      include: {
        customer: { select: { id: true, companyName: true } },
        deliveryManifests: {
          select: { manifestNumber: true, createdAt: true, deliveredAt: true, totalQuantity: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Total histórico de OPs concluídas
    const totalHistoricalCompletedCount = await prisma.productionOrder.count({
      where: { status: "COMPLETED" },
    });

    // 4. Preencher dados da timeline com as OPs concluídas
    let totalPiecesDeliveredPeriod = 0;
    let totalLeadTimeDays = 0;
    let completedWithLeadTimeCount = 0;

    for (const order of completedOrdersInPeriod) {
      const compDate = new Date(order.updatedAt);
      let key = "";

      if (period === "weeks") {
        const weekNum = getWeekNumber(compDate);
        key = `${compDate.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
      } else if (period === "months") {
        key = `${compDate.getFullYear()}-${String(compDate.getMonth() + 1).padStart(2, "0")}`;
      } else if (period === "years") {
        key = `${compDate.getFullYear()}`;
      } else {
        key = compDate.toISOString().slice(0, 10);
      }

      const deliveredPcs = order.totalQuantityDelivered || order.totalQuantityDone || order.totalQuantityOrdered;
      totalPiecesDeliveredPeriod += deliveredPcs;

      // Calcular lead time em dias
      const leadTime = Math.max(0, Math.round((compDate.getTime() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24)));
      totalLeadTimeDays += leadTime;
      completedWithLeadTimeCount++;

      const point = timelineMap.get(key);
      if (point) {
        point.ordersCompleted += 1;
        point.piecesDelivered += deliveredPcs;
      }
    }

    const avgLeadTimeDays = completedWithLeadTimeCount > 0
      ? Math.round((totalLeadTimeDays / completedWithLeadTimeCount) * 10) / 10
      : 0;

    // 5. Todos os 14 Setores para Mapa de Carga e Gargalos
    const allSectors = await prisma.sector.findMany({
      orderBy: { sequenceOrder: "asc" },
      select: { id: true, sequenceOrder: true, code: true, name: true },
    });

    // Contagem de lotes e peças por setor
    const sectorStatsMap = new Map<string, { batchesCount: number; piecesCount: number; reworkBatchesCount: number }>();
    for (const sec of allSectors) {
      sectorStatsMap.set(sec.id, { batchesCount: 0, piecesCount: 0, reworkBatchesCount: 0 });
    }

    let totalPiecesInProduction = 0;
    let totalReworkBatchesCount = 0;
    let totalReworkPiecesCount = 0;

    // 6. Pipeline de Produção Formatado e Detecção de Riscos
    interface RiskAlert {
      id: string;
      severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
      type: "DEADLINE_EXPIRED" | "DEADLINE_NEAR" | "REWORK_ACTIVE" | "SECTOR_BOTTLENECK" | "SAC_REJECTED";
      title: string;
      description: string;
      opId: string;
      opNumber: string;
      customerName: string;
      batchNumber?: string;
      sectorName?: string;
      daysRemaining?: number;
      createdAt: string;
    }

    const riskAlerts: RiskAlert[] = [];

    const pipelineOrders = activeOrders.map((order) => {
      let opPiecesInProd = 0;
      let hasRework = false;
      const sectorsInvolvedSet = new Set<string>();

      for (const b of order.batches) {
        if (b.batchStatus !== "DELIVERED") {
          opPiecesInProd += b.quantity;
          totalPiecesInProduction += b.quantity;

          const secStats = sectorStatsMap.get(b.currentSectorId);
          if (secStats) {
            secStats.batchesCount += 1;
            secStats.piecesCount += b.quantity;
            if (b.isUnderRework) {
              secStats.reworkBatchesCount += 1;
            }
          }

          if (b.currentSector) {
            sectorsInvolvedSet.add(b.currentSector.name);
          }

          if (b.isUnderRework) {
            hasRework = true;
            totalReworkBatchesCount++;
            totalReworkPiecesCount += b.quantity;

            // Alerta de Retrabalho Ativo
            riskAlerts.push({
              id: `risk-rework-${b.id}`,
              severity: "HIGH",
              type: "REWORK_ACTIVE",
              title: `Lote em Retrabalho: ${b.batchNumber}`,
              description: `Lote de ${b.quantity} peças retornado para ${b.currentSector?.name || "Setor"}. Motivo: ${b.reworkReason || "Não especificado"}.`,
              opId: order.id,
              opNumber: order.opNumber,
              customerName: order.customer.companyName,
              batchNumber: b.batchNumber,
              sectorName: b.currentSector?.name,
              createdAt: b.updatedAt.toISOString(),
            });
          }
        }
      }

      // Cálculos de prazo e vencimento
      let daysRemaining: number | null = null;
      let deadlineStatus: "ON_TIME" | "WARNING" | "EXPIRED" = "ON_TIME";

      if (order.promisedDeliveryDate) {
        const diffMs = new Date(order.promisedDeliveryDate).getTime() - now.getTime();
        daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (daysRemaining < 0) {
          deadlineStatus = "EXPIRED";
          riskAlerts.push({
            id: `risk-expired-${order.id}`,
            severity: "CRITICAL",
            type: "DEADLINE_EXPIRED",
            title: `Prazo Estourado: ${order.opNumber}`,
            description: `Atrasado há ${Math.abs(daysRemaining)} dia(s) (Prometido: ${formatDateBR(new Date(order.promisedDeliveryDate))}). Cliente: ${order.customer.companyName}.`,
            opId: order.id,
            opNumber: order.opNumber,
            customerName: order.customer.companyName,
            daysRemaining,
            createdAt: order.updatedAt.toISOString(),
          });
        } else if (daysRemaining <= 2) {
          deadlineStatus = "WARNING";
          // Se ainda não estiver na Expedição (Setor 14)
          const allInExpedicao = order.batches.every(
            (b) => b.currentSector?.code === "EXPEDICAO" || b.batchStatus === "DELIVERED"
          );
          if (!allInExpedicao) {
            riskAlerts.push({
              id: `risk-near-${order.id}`,
              severity: "HIGH",
              type: "DEADLINE_NEAR",
              title: `Prazo Crítico Próximo: ${order.opNumber}`,
              description: `Vence em ${daysRemaining === 0 ? "menos de 24h" : `${daysRemaining} dia(s)`} (${formatDateBR(new Date(order.promisedDeliveryDate))}).`,
              opId: order.id,
              opNumber: order.opNumber,
              customerName: order.customer.companyName,
              daysRemaining,
              createdAt: order.updatedAt.toISOString(),
            });
          }
        }
      }

      // Se foi reprovada pelo SAC Interno
      if (order.sacApprovalStatus === "REJECTED") {
        riskAlerts.push({
          id: `risk-sac-${order.id}`,
          severity: "MEDIUM",
          type: "SAC_REJECTED",
          title: `OP Reprovada no SAC: ${order.opNumber}`,
          description: `Motivo: ${order.sacRejectionReason || "Revisão solicitada pelo SAC"}.`,
          opId: order.id,
          opNumber: order.opNumber,
          customerName: order.customer.companyName,
          createdAt: order.sacReviewedAt?.toISOString() || order.updatedAt.toISOString(),
        });
      }

      const percentDone = order.totalQuantityOrdered > 0
        ? Math.min(100, Math.round(((order.totalQuantityDelivered || order.totalQuantityDone) / order.totalQuantityOrdered) * 100))
        : 0;

      return {
        id: order.id,
        opNumber: order.opNumber,
        title: order.title,
        productType: order.productType,
        priority: order.priority,
        status: order.status,
        customer: order.customer,
        totalQuantityOrdered: order.totalQuantityOrdered,
        totalQuantityDone: order.totalQuantityDone,
        totalQuantityDelivered: order.totalQuantityDelivered,
        totalQuantityRework: order.totalQuantityRework,
        percentDone,
        promisedDeliveryDate: order.promisedDeliveryDate,
        daysRemaining,
        deadlineStatus,
        hasRework,
        currentSectors: Array.from(sectorsInvolvedSet),
        batches: order.batches.map((b) => ({
          id: b.id,
          batchNumber: b.batchNumber,
          quantity: b.quantity,
          batchStatus: b.batchStatus,
          isUnderRework: b.isUnderRework,
          reworkReason: b.reworkReason,
          sectorCode: b.currentSector?.code,
          sectorName: b.currentSector?.name,
          sequenceOrder: b.currentSector?.sequenceOrder,
        })),
        createdAt: order.createdAt,
      };
    });

    // 7. Avaliar gargalos por setor
    const sectorDistribution = allSectors.map((sec) => {
      const stats = sectorStatsMap.get(sec.id) || { batchesCount: 0, piecesCount: 0, reworkBatchesCount: 0 };
      const isBottleneck =
        totalPiecesInProduction > 0 && stats.piecesCount / totalPiecesInProduction >= 0.35 && stats.batchesCount >= 2;

      if (isBottleneck) {
        riskAlerts.push({
          id: `risk-bottleneck-${sec.id}`,
          severity: "MEDIUM",
          type: "SECTOR_BOTTLENECK",
          title: `Gargalo Detectado: ${sec.name}`,
          description: `Setor concentra ${stats.piecesCount} peças (${Math.round((stats.piecesCount / totalPiecesInProduction) * 100)}% da carga total da fábrica).`,
          opId: "",
          opNumber: "FABRICA",
          customerName: "Operação Geral",
          sectorName: sec.name,
          createdAt: now.toISOString(),
        });
      }

      return {
        id: sec.id,
        sequenceOrder: sec.sequenceOrder,
        code: sec.code,
        name: sec.name,
        batchesCount: stats.batchesCount,
        piecesCount: stats.piecesCount,
        reworkBatchesCount: stats.reworkBatchesCount,
        isBottleneck,
      };
    });

    // Ordenar alertas por severidade (CRITICAL -> HIGH -> MEDIUM -> LOW)
    const severityOrder: Record<string, number> = {
      CRITICAL: 1,
      HIGH: 2,
      MEDIUM: 3,
      LOW: 4,
    };
    riskAlerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // 8. Taxa de retrabalho
    const reworkRate = totalPiecesInProduction > 0
      ? Math.round((totalReworkPiecesCount / totalPiecesInProduction) * 1000) / 10
      : 0;

    // 9. Lista detalhada de OPs concluídas no período
    const completedOrdersList = completedOrdersInPeriod.map((o) => {
      const deliveredAt = o.updatedAt;
      const leadTime = Math.max(0, Math.round((new Date(deliveredAt).getTime() - new Date(o.createdAt).getTime()) / (1000 * 60 * 60 * 24)));
      const lastManifest = o.deliveryManifests[0]?.manifestNumber || null;

      return {
        id: o.id,
        opNumber: o.opNumber,
        title: o.title,
        customerName: o.customer.companyName,
        totalQuantityOrdered: o.totalQuantityOrdered,
        totalQuantityDelivered: o.totalQuantityDelivered || o.totalQuantityDone || o.totalQuantityOrdered,
        completedAt: deliveredAt,
        leadTimeDays: leadTime,
        deliveryManifestNumber: lastManifest,
      };
    });

    return res.json({
      period,
      kpis: {
        activeOrdersCount: activeOrders.length,
        totalPiecesInProduction,
        completedOrdersPeriodCount: completedOrdersInPeriod.length,
        totalHistoricalCompletedCount,
        piecesDeliveredPeriodCount: totalPiecesDeliveredPeriod,
        totalReworkBatchesCount,
        totalReworkPiecesCount,
        reworkRate,
        activeRisksCount: riskAlerts.length,
        criticalRisksCount: riskAlerts.filter((r) => r.severity === "CRITICAL").length,
        avgLeadTimeDays,
      },
      timeline: Array.from(timelineMap.values()),
      riskAlerts,
      pipelineOrders,
      sectorDistribution,
      completedOrdersList,
    });
  } catch (err: any) {
    console.error("Erro ao gerar métricas do Dashboard:", err);
    return res.status(500).json({ error: "Erro interno ao carregar dados do Dashboard." });
  }
});

// Helper para obter semana ISO do ano
function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatDateBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
