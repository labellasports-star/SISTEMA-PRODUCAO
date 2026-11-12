import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";
import { io } from "../server.js";

export const quotationsRouter = Router();

quotationsRouter.use(authenticateToken);

const ALLOWED_EXTENSIONS = ["PNG", "JPG", "JPEG", "PDF", "PSD", "CDR", "AI"];

const createQuotationSchema = z.object({
  customerId: z.string().uuid("ID de cliente inválido."),
  teamName: z.string().min(2, "Nome da equipe/time/projeto é obrigatório."),
  productsSummary: z.string().optional(),
  totalQuantity: z.number().int().min(1, "A quantidade total deve ser no mínimo 1."),
  budgetAmount: z.number().min(0).default(0.0),
  discountAmount: z.number().min(0).optional().default(0.0),
  frozenPriceSnapshot: z.string().optional(),
  desiredDeadline: z.string().optional(),
  observations: z.string().optional(),
  briefingText: z.string().optional(),
  predominantColors: z.string().optional(),
  printType: z.string().optional(),
  items: z
    .array(
      z.object({
        productModel: z.string().min(1),
        gender: z.string().default("UNISSEX"),
        size: z.string().min(1),
        quantity: z.number().int().min(1),
        customName: z.string().optional(),
        customNumber: z.string().optional(),
        fabricType: z.string().optional(),
        collarType: z.string().optional(),
        unitPrice: z.number().min(0).optional().default(0.0),
        subtotal: z.number().min(0).optional().default(0.0),
        customizationNotes: z.string().optional(),
        catalogProductId: z.string().optional(),
      })
    )
    .optional(),
});

// Função auxiliar para gerar número de orçamento único atômico: ORC-YYYY-00001
async function generateNextQuotationNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `ORC-${currentYear}-`;

  const lastQuotation = await prisma.quotation.findFirst({
    where: { quotationNumber: { startsWith: prefix } },
    orderBy: { quotationNumber: "desc" },
    select: { quotationNumber: true },
  });

  let nextSequence = 1;
  if (lastQuotation && lastQuotation.quotationNumber) {
    const parts = lastQuotation.quotationNumber.split("-");
    if (parts.length === 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) {
        nextSequence = parsed + 1;
      }
    }
  }

  return `${prefix}${nextSequence.toString().padStart(5, "0")}`;
}

// GET /api/quotations - Listar orçamentos com filtros para o Kanban
quotationsRouter.get("/", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string;
    const search = req.query.search as string;
    const sellerId = req.query.sellerId as string;

    const where: any = {};
    if (status) where.status = status;
    if (sellerId) where.sellerId = sellerId;
    if (search) {
      where.OR = [
        { quotationNumber: { contains: search } },
        { teamName: { contains: search } },
        { customer: { companyName: { contains: search } } },
        { customer: { contactName: { contains: search } } },
      ];
    }

    const quotations = await prisma.quotation.findMany({
      where,
      include: {
        customer: true,
        seller: { select: { id: true, name: true, email: true } },
        designer: { select: { id: true, name: true, email: true } },
        designBrief: {
          include: {
            versions: { orderBy: { versionNumber: "desc" }, take: 1 },
          },
        },
        _count: {
          select: { items: true, attachments: true, timeline: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(quotations);
  } catch (error) {
    console.error("Erro ao listar orçamentos:", error);
    res.status(500).json({ error: "Erro ao buscar orçamentos." });
  }
});

// GET /api/quotations/:id - Detalhes completos do orçamento
quotationsRouter.get("/:id", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        seller: { select: { id: true, name: true, email: true, phone: true } },
        designer: { select: { id: true, name: true, email: true } },
        items: true,
        attachments: {
          include: {
            uploadedBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        designBrief: {
          include: {
            versions: {
              include: {
                designer: { select: { id: true, name: true } },
              },
              orderBy: { versionNumber: "desc" },
            },
          },
        },
        timeline: {
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        productionOrder: {
          select: {
            id: true,
            opNumber: true,
            status: true,
            sacApprovalStatus: true,
            createdAt: true,
          },
        },
      },
    });

    if (!quotation) {
      res.status(404).json({ error: "Orçamento não encontrado." });
      return;
    }

    res.json(quotation);
  } catch (error) {
    console.error("Erro ao buscar detalhes do orçamento:", error);
    res.status(500).json({ error: "Erro ao buscar orçamento." });
  }
});

// POST /api/quotations - Criar nova oportunidade / orçamento
quotationsRouter.post("/", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = createQuotationSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const data = parseResult.data;
    const quotationNumber = await generateNextQuotationNumber();

    const created = await prisma.quotation.create({
      data: {
        quotationNumber,
        customerId: data.customerId,
        teamName: data.teamName,
        productsSummary: data.productsSummary || null,
        totalQuantity: data.totalQuantity,
        budgetAmount: data.budgetAmount,
        discountAmount: data.discountAmount ?? 0,
        frozenPriceSnapshot: data.frozenPriceSnapshot || null,
        desiredDeadline: data.desiredDeadline ? new Date(data.desiredDeadline) : null,
        observations: data.observations || null,
        sellerId: req.user!.id,
        status: "NOVA_SOLICITACAO",
        items: data.items && data.items.length > 0
          ? {
              create: data.items.map((it) => ({
                productModel: it.productModel,
                gender: it.gender,
                size: it.size,
                quantity: it.quantity,
                customName: it.customName || null,
                customNumber: it.customNumber || null,
                fabricType: it.fabricType || null,
                collarType: it.collarType || null,
                unitPrice: it.unitPrice ?? 0,
                subtotal: it.subtotal ?? 0,
                customizationNotes: it.customizationNotes || null,
                catalogProductId: it.catalogProductId || null,
              })),
            }
          : undefined,
        designBrief: data.briefingText
          ? {
              create: {
                briefingText: data.briefingText,
                predominantColors: data.predominantColors || null,
                printType: data.printType || null,
              },
            }
          : undefined,
        timeline: {
          create: {
            fromStatus: null,
            toStatus: "NOVA_SOLICITACAO",
            userId: req.user!.id,
            notes: "Oportunidade criada na Pré-Venda.",
          },
        },
      },
      include: {
        customer: true,
        items: true,
        designBrief: true,
      },
    });

    await logAudit({
      userId: req.user!.id,
      action: "QUOTATION_CREATED",
      entityName: "Quotation",
      entityId: created.id,
      newValues: { quotationNumber: created.quotationNumber, teamName: created.teamName },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json(created);
  } catch (error) {
    console.error("Erro ao criar oportunidade:", error);
    res.status(500).json({ error: "Erro ao criar oportunidade." });
  }
});

// PUT /api/quotations/:id/status - Atualizar status do Kanban e registrar timeline
const updateStatusSchema = z.object({
  status: z.enum([
    "NOVA_SOLICITACAO",
    "ORCAMENTO_PREPARACAO",
    "ORCAMENTO_ENVIADO",
    "AGUARDANDO_RESPOSTA",
    "ORCAMENTO_APROVADO",
    "SOLICITACAO_ARTE",
    "DESENVOLVIMENTO_ARTE",
    "AGUARDANDO_APROVACAO_ARTE",
    "ARTE_EM_ALTERACAO",
    "CONVERTIDA_VENDA",
    "PERDIDA",
  ]),
  notes: z.string().optional(),
  rejectionReason: z.string().optional(),
});

// Matriz rigorosa de transições válidas de status comercial
const VALID_TRANSITIONS: Record<string, string[]> = {
  NOVA_SOLICITACAO: ["ORCAMENTO_PREPARACAO", "SOLICITACAO_ARTE", "PERDIDA"],
  ORCAMENTO_PREPARACAO: ["ORCAMENTO_ENVIADO", "NOVA_SOLICITACAO", "PERDIDA"],
  ORCAMENTO_ENVIADO: ["AGUARDANDO_RESPOSTA", "ORCAMENTO_APROVADO", "SOLICITACAO_ARTE", "PERDIDA"],
  AGUARDANDO_RESPOSTA: ["ORCAMENTO_APROVADO", "SOLICITACAO_ARTE", "ORCAMENTO_ENVIADO", "PERDIDA"],
  ORCAMENTO_APROVADO: ["SOLICITACAO_ARTE", "CONVERTIDA_VENDA", "PERDIDA"],
  SOLICITACAO_ARTE: ["DESENVOLVIMENTO_ARTE", "ORCAMENTO_APROVADO", "PERDIDA"],
  DESENVOLVIMENTO_ARTE: ["AGUARDANDO_APROVACAO_ARTE", "SOLICITACAO_ARTE", "PERDIDA"],
  AGUARDANDO_APROVACAO_ARTE: ["ORCAMENTO_APROVADO", "ARTE_EM_ALTERACAO", "PERDIDA"],
  ARTE_EM_ALTERACAO: ["DESENVOLVIMENTO_ARTE", "AGUARDANDO_APROVACAO_ARTE", "PERDIDA"],
  CONVERTIDA_VENDA: [], // Terminal: Uma vez gerada a OP, não altera status comercialmente por esta rota
  PERDIDA: ["NOVA_SOLICITACAO", "ORCAMENTO_PREPARACAO"], // Reativação comercial permitida
};

// PUT /api/quotations/:id/status - Atualizar status do Kanban com RBAC e State Machine
quotationsRouter.put(
  "/:id/status",
  requireRole("VENDEDOR", "GESTOR", "ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const parseResult = updateStatusSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.errors[0].message });
        return;
      }

      const quotation = await prisma.quotation.findUnique({ where: { id } });
      if (!quotation) {
        res.status(404).json({ error: "Orçamento não encontrado." });
        return;
      }

      // Propriedade horizontal: Vendedor só pode alterar suas próprias cotações
      if (req.user!.role === "VENDEDOR" && quotation.sellerId !== req.user!.id) {
        res.status(403).json({
          error: "Acesso negado: Vendedores só possuem permissão para alterar o status de suas próprias cotações.",
        });
        return;
      }

      const oldStatus = quotation.status;
      const newStatus = parseResult.data.status;

      // Validação da Máquina de Estados (State Machine)
      if (oldStatus !== newStatus) {
        const allowedTransitions = VALID_TRANSITIONS[oldStatus] || [];
        const isUserAdmin = req.user!.role === "ADMIN";

        if (!allowedTransitions.includes(newStatus) && !isUserAdmin) {
          res.status(400).json({
            error: `Transição de status comercial inválida: não é permitido alterar de '${oldStatus}' diretamente para '${newStatus}'. Transições permitidas a partir deste estágio: ${allowedTransitions.join(", ") || "Nenhuma (estágio terminal)"}.`,
          });
          return;
        }
      }

      const updated = await prisma.quotation.update({
        where: { id },
        data: {
          status: newStatus,
          rejectionReason: parseResult.data.rejectionReason || quotation.rejectionReason,
          timeline: {
            create: {
              fromStatus: oldStatus,
              toStatus: newStatus,
              userId: req.user!.id,
              notes: parseResult.data.notes || `Status alterado de ${oldStatus} para ${newStatus}.`,
            },
          },
        },
      });

      await logAudit({
        userId: req.user!.id,
        action: "QUOTATION_STATUS_CHANGED",
        entityName: "Quotation",
        entityId: id,
        oldValues: { status: oldStatus },
        newValues: { status: newStatus },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      // Notificação restrita aos setores autorizados (Vendas, Design, SAC Interno e Gestão)
      io.to("sector_VENDAS")
        .to("sector_DESIGN")
        .to("sector_DESIGNER")
        .to("sector_SAC_INTERNO")
        .to("sector_ADMIN")
        .to("sector_GESTAO")
        .emit("quotation_status_changed", {
          id: updated.id,
          quotationNumber: updated.quotationNumber,
          teamName: updated.teamName,
          fromStatus: oldStatus,
          toStatus: newStatus,
          updatedBy: req.user!.name,
        });

      res.json(updated);
    } catch (error) {
      console.error("Erro ao atualizar status do orçamento:", error);
      res.status(500).json({ error: "Erro ao atualizar status." });
    }
  }
);

// PUT /api/quotations/:id - Atualizar dados do orçamento (VENDEDOR dono, ADMIN ou GESTOR)
const updateQuotationSchema = z.object({
  teamName: z.string().min(2).optional(),
  productsSummary: z.string().optional(),
  totalQuantity: z.number().int().min(1).optional(),
  budgetAmount: z.number().min(0).optional(),
  desiredDeadline: z.string().optional(),
  observations: z.string().optional(),
});

quotationsRouter.put(
  "/:id",
  requireRole("VENDEDOR", "GESTOR", "ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const parseResult = updateQuotationSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.errors[0].message });
        return;
      }

      const quotation = await prisma.quotation.findUnique({ where: { id } });
      if (!quotation) {
        res.status(404).json({ error: "Orçamento não encontrado." });
        return;
      }

      // Propriedade horizontal: Vendedor só pode alterar suas próprias cotações
      if (req.user!.role === "VENDEDOR" && quotation.sellerId !== req.user!.id) {
        res.status(403).json({
          error: "Acesso negado: Vendedores só possuem permissão para alterar suas próprias cotações.",
        });
        return;
      }

      const updated = await prisma.quotation.update({
        where: { id },
        data: {
          ...parseResult.data,
          desiredDeadline: parseResult.data.desiredDeadline ? new Date(parseResult.data.desiredDeadline) : undefined,
        },
      });

      await logAudit({
        userId: req.user!.id,
        action: "QUOTATION_UPDATED",
        entityName: "Quotation",
        entityId: id,
        oldValues: quotation,
        newValues: updated,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(updated);
    } catch (error) {
      console.error("Erro ao atualizar dados do orçamento:", error);
      res.status(500).json({ error: "Erro ao atualizar orçamento." });
    }
  }
);

// DELETE /api/quotations/:id - Excluir orçamento (VENDEDOR dono, ADMIN ou GESTOR)
quotationsRouter.delete(
  "/:id",
  requireRole("VENDEDOR", "GESTOR", "ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const quotation = await prisma.quotation.findUnique({ where: { id } });
      if (!quotation) {
        res.status(404).json({ error: "Orçamento não encontrado." });
        return;
      }

      // Propriedade horizontal: Vendedor só pode excluir suas próprias cotações
      if (req.user!.role === "VENDEDOR" && quotation.sellerId !== req.user!.id) {
        res.status(403).json({
          error: "Acesso negado: Vendedores só possuem permissão para excluir suas próprias cotações.",
        });
        return;
      }

      await prisma.quotation.delete({ where: { id } });

      await logAudit({
        userId: req.user!.id,
        action: "QUOTATION_DELETED",
        entityName: "Quotation",
        entityId: id,
        oldValues: quotation,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({ message: "Orçamento excluído com sucesso." });
    } catch (error) {
      console.error("Erro ao excluir orçamento:", error);
      res.status(500).json({ error: "Erro ao excluir orçamento." });
    }
  }
);

// POST /api/quotations/:id/attachments - Anexar arquivos e referências com validação de extensão
const attachmentSchema = z.object({
  fileName: z.string().min(1),
  fileType: z.enum(["REFERENCE", "ARTWORK_PREVIEW", "ARTWORK_VECTOR", "CLIENT_PROOF"]),
  fileUrl: z.string().min(1),
  fileSize: z.number().optional(),
});

quotationsRouter.post("/:id/attachments", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const parseResult = attachmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const quotation = await prisma.quotation.findUnique({ where: { id } });
    if (!quotation) {
      res.status(404).json({ error: "Orçamento não encontrado." });
      return;
    }

    // Propriedade horizontal: Vendedor só anexa nas suas próprias cotações
    if (req.user!.role === "VENDEDOR" && quotation.sellerId !== req.user!.id) {
      res.status(403).json({
        error: "Acesso negado: Vendedores só possuem permissão para anexar arquivos em suas próprias cotações.",
      });
      return;
    }

    const data = parseResult.data;
    const ext = data.fileName.split(".").pop()?.toUpperCase() || "";

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      res.status(400).json({
        error: `Extensão de arquivo não permitida (.${ext}). Formatos suportados: ${ALLOWED_EXTENSIONS.join(", ")}.`,
      });
      return;
    }

    const attachment = await prisma.quotationAttachment.create({
      data: {
        quotationId: id,
        fileName: data.fileName,
        fileType: data.fileType,
        fileExtension: ext,
        fileSize: data.fileSize || null,
        fileUrl: data.fileUrl,
        uploadedById: req.user!.id,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    });

    res.status(201).json(attachment);
  } catch (error) {
    console.error("Erro ao anexar arquivo:", error);
    res.status(500).json({ error: "Erro ao anexar arquivo." });
  }
});
