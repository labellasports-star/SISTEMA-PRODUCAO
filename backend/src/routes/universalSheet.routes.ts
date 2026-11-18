import { Router, Response } from "express";
import { prisma } from "../prisma.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";

export const universalSheetRouter = Router();

universalSheetRouter.use(authenticateToken);

// Helper para sanitizar dados sensíveis/financeiros conforme o RBAC do usuário
function applyRbacSanitization(sheetData: any, userRole: string): any {
  const sanitized = JSON.parse(JSON.stringify(sheetData));

  // Operadores de chão de fábrica não devem visualizar dados financeiros/comerciais sigilosos
  if (userRole === "OPERADOR") {
    if (sanitized.quotation) {
      delete sanitized.quotation.budgetAmount;
      if (Array.isArray(sanitized.quotation.items)) {
        sanitized.quotation.items.forEach((item: any) => {
          delete item.unitPrice;
          delete item.subtotal;
        });
      }
    }
    if (sanitized.financialSummary) {
      delete sanitized.financialSummary;
    }
    // Ocultar dados pessoais de contato sensíveis se necessário
    if (sanitized.customer) {
      delete sanitized.customer.notes;
    }
  }

  return sanitized;
}

// Helper compartilhado para montagem da ficha da OP
async function fetchOpSheetPayload(opIdOrNumber: string, userRole: string) {
  const op = await prisma.productionOrder.findFirst({
    where: {
      OR: [{ id: opIdOrNumber }, { opNumber: opIdOrNumber }],
    },
    include: {
      customer: true,
      quotation: {
        include: {
          seller: { select: { id: true, name: true, email: true, phone: true } },
          designer: { select: { id: true, name: true, email: true } },
          items: true,
          attachments: {
            include: {
              uploadedBy: { select: { id: true, name: true, role: true } },
            },
          },
          designBrief: {
            include: {
              versions: {
                orderBy: { versionNumber: "desc" },
                include: {
                  designer: { select: { id: true, name: true } },
                },
              },
            },
          },
          timeline: {
            orderBy: { createdAt: "desc" },
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
      batches: {
        orderBy: { batchNumber: "asc" },
        include: {
          currentSector: true,
          assignedOperator: { select: { id: true, name: true, role: true } },
          movements: {
            orderBy: { createdAt: "desc" },
            include: {
              fromSector: true,
              toSector: true,
              operator: { select: { id: true, name: true } },
              managerAuthorizer: { select: { id: true, name: true } },
            },
          },
          dispatchManifests: {
            orderBy: { createdAt: "desc" },
            include: { sewingPartner: true },
          },
          packageVolumes: true,
          deliveryManifests: true,
        },
      },
    },
  });

  if (!op) return null;

  // Montar consolidação de grade de tamanhos
  const consolidatedSizeGrid: Record<string, number> = {};
  if (op.quotation?.items) {
    for (const item of op.quotation.items) {
      consolidatedSizeGrid[item.size] = (consolidatedSizeGrid[item.size] || 0) + item.quantity;
    }
  }

  // Filtrar referências visuais do cliente
  const referenceAttachments = (op.quotation?.attachments || []).filter(
    (a) => a.fileType === "REFERENCE"
  );

  // Identificar a versão oficial aprovada da arte
  const artworkVersions = op.quotation?.designBrief?.versions || [];
  const approvedArtwork = artworkVersions.find((v) => v.status === "APPROVED") || null;
  const latestArtwork = artworkVersions[0] || null;

  const payload = {
    orderId: op.id,
    opNumber: op.opNumber,
    title: op.title,
    productType: op.productType,
    totalQuantityOrdered: op.totalQuantityOrdered,
    totalQuantityDone: op.totalQuantityDone,
    totalQuantityRework: op.totalQuantityRework,
    totalQuantityDelivered: op.totalQuantityDelivered,
    priority: op.priority,
    status: op.status,
    promisedDeliveryDate: op.promisedDeliveryDate,
    technicalNotes: op.technicalNotes,
    artworkUrl: op.artworkUrl || approvedArtwork?.previewUrl || approvedArtwork?.vectorUrl || null,
    createdAt: op.createdAt,
    customer: op.customer,
    seller: op.quotation?.seller || null,
    designer: op.quotation?.designer || null,
    quotation: op.quotation
      ? {
          id: op.quotation.id,
          quotationNumber: op.quotation.quotationNumber,
          teamName: op.quotation.teamName,
          status: op.quotation.status,
          productsSummary: op.quotation.productsSummary,
          desiredDeadline: op.quotation.desiredDeadline,
          observations: op.quotation.observations,
          isArtworkApproved: op.quotation.isArtworkApproved,
          artworkApprovalDate: op.quotation.artworkApprovalDate,
          artworkApprovedBy: op.quotation.artworkApprovedBy,
          budgetAmount: op.quotation.budgetAmount,
          items: op.quotation.items,
          attachments: op.quotation.attachments,
        }
      : null,
    consolidatedSizeGrid,
    briefing: op.quotation?.designBrief
      ? {
          briefingText: op.quotation.designBrief.briefingText,
          predominantColors: op.quotation.designBrief.predominantColors,
          printType: op.quotation.designBrief.printType,
          status: op.quotation.designBrief.status,
        }
      : null,
    references: (op.quotation?.attachments && op.quotation.attachments.length > 0) ? op.quotation.attachments : referenceAttachments,
    attachments: op.quotation?.attachments || [],
    artwork: {
      approvedVersion: approvedArtwork,
      latestVersion: latestArtwork,
      allVersions: artworkVersions,
    },
    batches: op.batches,
    timeline: op.quotation?.timeline || [],
  };

  return applyRbacSanitization(payload, userRole);
}

// 1. GET /api/universal-sheet/orders/:opId - Consulta unificada por ID da Ordem de Produção
universalSheetRouter.get("/orders/:opId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { opId } = req.params;
    const user = req.user!;
    const sheet = await fetchOpSheetPayload(opId, user.role);

    if (!sheet) {
      return res.status(404).json({ error: "Ordem de Produção não encontrada." });
    }

    return res.json(sheet);
  } catch (err: any) {
    console.error("Erro ao carregar Ficha Universal da OP:", err);
    return res.status(500).json({ error: "Erro interno ao carregar Ficha Universal do Pedido." });
  }
});

// 2. GET /api/universal-sheet/by-batch/:batchId - Consulta atalho a partir de um lote específico
universalSheetRouter.get("/by-batch/:batchId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId } = req.params;
    const user = req.user!;
    const batch = await prisma.opBatch.findUnique({
      where: { id: batchId },
      select: { productionOrderId: true },
    });

    if (!batch) {
      return res.status(404).json({ error: "Lote de produção não encontrado." });
    }

    const sheet = await fetchOpSheetPayload(batch.productionOrderId, user.role);
    if (!sheet) {
      return res.status(404).json({ error: "Ordem de Produção vinculada não encontrada." });
    }

    return res.json(sheet);
  } catch (err: any) {
    console.error("Erro ao buscar Ficha por lote:", err);
    return res.status(500).json({ error: "Erro ao localizar Ficha Universal do Lote." });
  }
});

// 3. GET /api/universal-sheet/quotations/:quotationId - Consulta pré-OP (para Pré-Venda e Designer)
universalSheetRouter.get(["/quotations/:quotationId", "/quotation/:quotationId"], async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { quotationId } = req.params;
    const user = req.user!;

    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        customer: true,
        seller: { select: { id: true, name: true, email: true, phone: true } },
        designer: { select: { id: true, name: true, email: true } },
        items: true,
        attachments: {
          include: {
            uploadedBy: { select: { id: true, name: true, role: true } },
          },
        },
        designBrief: {
          include: {
            versions: {
              orderBy: { versionNumber: "desc" },
              include: {
                designer: { select: { id: true, name: true } },
              },
            },
          },
        },
        timeline: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, name: true } } },
        },
        productionOrder: {
          include: {
            batches: {
              include: {
                currentSector: true,
                assignedOperator: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!quotation) {
      return res.status(404).json({ error: "Orçamento / Oportunidade não encontrada." });
    }

    // Validação de acesso RBAC e isolamento de contas
    if (user.role === "VENDEDOR") {
      if (quotation.sellerId !== user.id) {
        return res.status(403).json({
          error: "Acesso negado: Vendedores só possuem permissão para acessar a ficha de suas próprias cotações.",
        });
      }
    } else if (user.role === "DESIGNER") {
      const designStatuses = [
        "SOLICITACAO_ARTE",
        "DESENVOLVIMENTO_ARTE",
        "AGUARDANDO_APROVACAO_ARTE",
        "ARTE_EM_ALTERACAO",
        "ORCAMENTO_APROVADO",
        "CONVERTIDA_VENDA",
      ];
      if (!designStatuses.includes(quotation.status) && quotation.designerId !== user.id) {
        return res.status(403).json({
          error: "Acesso negado: Este orçamento ainda não foi encaminhado para o setor de Design.",
        });
      }
    } else if (user.role === "OPERADOR") {
      if (user.sectorCode !== "SAC_INTERNO") {
        const hasBatch = quotation.productionOrder?.batches.some(
          (b: any) => b.currentSectorId === user.sectorId || b.assignedOperatorId === user.id
        );
        if (!hasBatch) {
          return res.status(403).json({
            error: "Acesso negado: Operadores só possuem acesso a pedidos encaminhados ao seu setor de produção.",
          });
        }
      }
    }

    const consolidatedSizeGrid: Record<string, number> = {};
    for (const item of quotation.items) {
      consolidatedSizeGrid[item.size] = (consolidatedSizeGrid[item.size] || 0) + item.quantity;
    }

    const allAttachments = quotation.attachments || [];
    const referenceAttachments = allAttachments;
    const artworkVersions = quotation.designBrief?.versions || [];
    const approvedArtwork = artworkVersions.find((v) => v.status === "APPROVED") || null;

    const payload = {
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
      teamName: quotation.teamName,
      status: quotation.status,
      productsSummary: quotation.productsSummary,
      totalQuantity: quotation.totalQuantity,
      budgetAmount: quotation.budgetAmount,
      desiredDeadline: quotation.desiredDeadline,
      observations: quotation.observations,
      isArtworkApproved: quotation.isArtworkApproved,
      artworkApprovalDate: quotation.artworkApprovalDate,
      artworkApprovedBy: quotation.artworkApprovedBy,
      customer: quotation.customer,
      seller: quotation.seller,
      designer: quotation.designer,
      items: quotation.items,
      attachments: allAttachments,
      consolidatedSizeGrid,
      briefing: quotation.designBrief
        ? {
            briefingText: quotation.designBrief.briefingText,
            predominantColors: quotation.designBrief.predominantColors,
            printType: quotation.designBrief.printType,
            status: quotation.designBrief.status,
          }
        : null,
      references: referenceAttachments,
      artwork: {
        approvedVersion: approvedArtwork,
        latestVersion: artworkVersions[0] || null,
        allVersions: artworkVersions,
      },
      productionOrder: quotation.productionOrder
        ? {
            id: quotation.productionOrder.id,
            opNumber: quotation.productionOrder.opNumber,
            title: quotation.productionOrder.title,
            status: quotation.productionOrder.status,
            batches: quotation.productionOrder.batches,
          }
        : null,
      timeline: quotation.timeline,
    };

    return res.json(applyRbacSanitization(payload, user.role));
  } catch (err: any) {
    console.error("Erro ao carregar Ficha da Cotação:", err);
    return res.status(500).json({ error: "Erro interno ao carregar Ficha da Oportunidade." });
  }
});
