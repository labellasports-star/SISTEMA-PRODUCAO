import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";
import { io } from "../server.js";
import { parseMonetaryValue } from "../utils/pricing.js";
import { verifyPin } from "../utils/security.js";

export const quotationsRouter = Router();

quotationsRouter.use(authenticateToken);

const DANGEROUS_EXTENSIONS = ["EXE", "BAT", "CMD", "SH", "PS1", "MSI", "VBS", "COM", "SCR", "JAR"];

const itemSchema = z.object({
  productModel: z.string().min(1),
  catalogProductId: z.string().nullable().optional(),
  isCustomModel: z.boolean().optional().default(false),
  customModelName: z.string().nullable().optional(),
  isCustomFabric: z.boolean().optional().default(false),
  customFabricName: z.string().nullable().optional(),
  isCustomCollar: z.boolean().optional().default(false),
  customCollarName: z.string().nullable().optional(),
  gender: z.string().default("UNISSEX"),
  size: z.string().min(1),
  quantity: z.number().int().min(1),
  customName: z.string().optional(),
  customNumber: z.string().optional(),
  fabricType: z.string().optional(),
  collarType: z.string().optional(),
  unitPrice: z.union([z.number(), z.string()]).optional().default(0.0),
  subtotal: z.union([z.number(), z.string()]).optional().default(0.0),
  customizationNotes: z.string().optional(),
});

// Helper para validar PIN de um Gestor ou Administrador ativo
export async function verifyManagerOrAdminPin(
  pin: string,
  preferredManagerId?: string
): Promise<{
  success: boolean;
  manager?: { id: string; name: string; role: string };
  error?: string;
}> {
  if (!pin || typeof pin !== "string" || !/^\d{4,8}$/.test(pin.trim())) {
    return {
      success: false,
      error: "O PIN de autorização deve conter entre 4 e 8 dígitos numéricos.",
    };
  }

  const cleanPin = pin.trim();

  if (preferredManagerId) {
    const mgr = await prisma.user.findUnique({
      where: { id: preferredManagerId },
      select: { id: true, name: true, role: true, signaturePinHash: true, isActive: true },
    });
    if (!mgr || !mgr.isActive || (mgr.role !== "ADMIN" && mgr.role !== "GESTOR")) {
      return {
        success: false,
        error: "O usuário selecionado não é um gestor ou administrador ativo.",
      };
    }
    if (!mgr.signaturePinHash) {
      return {
        success: false,
        error: `O gestor/administrador ${mgr.name} ainda não possui PIN cadastrado.`,
      };
    }
    const match = await verifyPin(cleanPin, mgr.signaturePinHash);
    if (!match) {
      return { success: false, error: "PIN de autorização incorreto." };
    }
    return { success: true, manager: { id: mgr.id, name: mgr.name, role: mgr.role } };
  }

  // Se não foi especificado um ID, verifica contra qualquer Gestor ou Administrador ativo com PIN
  const managers = await prisma.user.findMany({
    where: {
      role: { in: ["ADMIN", "GESTOR"] },
      isActive: true,
      signaturePinHash: { not: null },
    },
    select: { id: true, name: true, role: true, signaturePinHash: true },
  });

  for (const mgr of managers) {
    if (mgr.signaturePinHash && (await verifyPin(cleanPin, mgr.signaturePinHash))) {
      return { success: true, manager: { id: mgr.id, name: mgr.name, role: mgr.role } };
    }
  }

  return {
    success: false,
    error: "PIN de autorização incorreto. Nenhum gestor ou administrador autorizado para este PIN.",
  };
}

// Helper para validar dados e recalcular preços e subtotais no backend antes de persistir
async function processAndRecalculateItems(
  items: any[],
  fallbackBudget?: number,
  fallbackTotalQty?: number
): Promise<{
  processedItems: any[];
  totalQuantity: number;
  totalItemsAmount: number;
  error?: string;
}> {
  let totalQuantity = 0;
  let totalItemsAmount = 0;
  const processedItems = [];

  for (const it of items) {
    let isCustom =
      it.isCustomModel === true ||
      it.productModel === "Outros" ||
      it.productModel?.toLowerCase() === "outros";

    let catalogProduct = null;
    if (it.catalogProductId) {
      catalogProduct = await prisma.catalogProduct.findUnique({ where: { id: it.catalogProductId } });
    } else if (!isCustom && it.productModel) {
      catalogProduct = await prisma.catalogProduct.findFirst({
        where: { name: { contains: it.productModel } },
      });
    }

    if (!catalogProduct && !isCustom) {
      // Se não veio catalogProductId, não achou pelo nome e não é explicitamente "Outros"
      if (it.isCustomModel === false && !it.productModel?.toLowerCase().includes("outros")) {
        isCustom = false;
      } else {
        isCustom = true;
      }
    }

    let baseUnitPrice = 0;
    let customAdds = 0;
    let finalModelName = it.productModel;

    // Calcular adicionais de personalização a partir de customizationNotes
    const notes = (it.customizationNotes || "").toUpperCase();
    if (notes.includes("TPU") || notes.includes("ESCUDO")) {
      customAdds += 15.0;
    }
    // Nome e Número: R$ 0,00 adicionais

    if (isCustom) {
      finalModelName = (it.customModelName || it.productModel || "").trim();
      if (!finalModelName || finalModelName.toUpperCase() === "OUTROS") {
        return {
          processedItems: [],
          totalQuantity: 0,
          totalItemsAmount: 0,
          error: "Nome do modelo é obrigatório quando 'Outros' é selecionado.",
        };
      }

      baseUnitPrice = parseMonetaryValue(it.unitPrice);
      if (baseUnitPrice <= 0 && it.subtotal && it.quantity) {
        baseUnitPrice = Number((parseMonetaryValue(it.subtotal) / it.quantity).toFixed(2));
      }

      if (baseUnitPrice <= 0) {
        return {
          processedItems: [],
          totalQuantity: 0,
          totalItemsAmount: 0,
          error: "Valor unitário deve ser maior que zero.",
        };
      }

      if (!Number.isInteger(it.quantity) || it.quantity < 1) {
        return {
          processedItems: [],
          totalQuantity: 0,
          totalItemsAmount: 0,
          error: "A quantidade de peças deve ser um número inteiro de no mínimo 1 unidade.",
        };
      }
    } else {
      // Produto do catálogo oficial ou modelo legado com preço histórico
      if (catalogProduct) {
        baseUnitPrice = catalogProduct.basePrice;
        finalModelName = catalogProduct.name;
      } else {
        baseUnitPrice = parseMonetaryValue(it.unitPrice);
        if (baseUnitPrice <= 0 && it.subtotal && it.quantity) {
          baseUnitPrice = Number((parseMonetaryValue(it.subtotal) / it.quantity).toFixed(2));
        }
        if (baseUnitPrice <= 0 && fallbackBudget && fallbackTotalQty && fallbackTotalQty > 0) {
          baseUnitPrice = Number((fallbackBudget / fallbackTotalQty).toFixed(2));
        }
        if (baseUnitPrice <= 0) {
          baseUnitPrice = 38.9;
        }
      }
    }

    const effectiveUnitPrice = Number((baseUnitPrice + customAdds).toFixed(2));
    const subtotal = Number((effectiveUnitPrice * it.quantity).toFixed(2));

    totalQuantity += it.quantity;
    totalItemsAmount += subtotal;

    processedItems.push({
      ...it,
      catalogProductId: catalogProduct ? catalogProduct.id : (isCustom ? null : (it.catalogProductId || null)),
      productModel: finalModelName,
      isCustomModel: isCustom,
      customModelName: isCustom ? finalModelName : null,
      unitPrice: effectiveUnitPrice,
      subtotal,
    });
  }

  return {
    processedItems,
    totalQuantity,
    totalItemsAmount: Number(totalItemsAmount.toFixed(2)),
  };
}

const attachmentInputSchema = z.object({
  fileName: z.string().min(1),
  originalName: z.string().optional(),
  fileType: z.enum(["REFERENCE", "ARTWORK_PREVIEW", "ARTWORK_VECTOR", "CLIENT_PROOF"]).default("REFERENCE"),
  fileUrl: z.string().min(1),
  fileSize: z.number().optional(),
});

const createQuotationSchema = z.object({
  customerId: z.string().optional(),
  customer: z
    .object({
      companyName: z.string().min(1, "Nome da empresa/cliente é obrigatório."),
      contactName: z.string().min(1, "Nome do contato responsável é obrigatório."),
      phone: z.string().min(1, "Telefone/WhatsApp é obrigatório."),
    })
    .optional(),
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
  items: z.array(itemSchema).optional(),
  attachments: z.array(attachmentInputSchema).optional(),
  managerPin: z.string().optional(),
  managerId: z.string().optional(),
});

// GET /api/quotations/eligible-managers - Listar gestores e administradores habilitados para autorização por PIN
quotationsRouter.get("/eligible-managers", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const managers = await prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "GESTOR"] },
        isActive: true,
        signaturePinHash: { not: null },
      },
      select: {
        id: true,
        name: true,
        role: true,
        email: true,
      },
      orderBy: { name: "asc" },
    });
    res.json(managers);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar gestores elegíveis." });
  }
});

// POST /api/quotations/verify-manager-pin - Verificar PIN de um gestor/admin antes de salvar
quotationsRouter.post("/verify-manager-pin", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { pin, managerId } = req.body;
    const result = await verifyManagerOrAdminPin(pin, managerId);
    if (!result.success) {
      res.status(403).json({ error: result.error });
      return;
    }
    res.json({
      success: true,
      manager: result.manager,
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao verificar PIN." });
  }
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

// GET /api/quotations - Listar orçamentos com filtros para o Kanban e isolamento de contas
quotationsRouter.get("/", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const status = req.query.status as string;
    const search = req.query.search as string;
    const requestedSellerId = req.query.sellerId as string;

    const where: any = {};
    if (status) where.status = status;

    // Regras de isolamento de conta por perfil no servidor
    if (user.role === "VENDEDOR") {
      // Vendedor só acessa estritamente suas próprias fichas
      where.sellerId = user.id;
    } else if (user.role === "DESIGNER") {
      // Designer visualiza fichas encaminhadas ao design ou atribuídas a ele
      const designStatuses = [
        "SOLICITACAO_ARTE",
        "DESENVOLVIMENTO_ARTE",
        "AGUARDANDO_APROVACAO_ARTE",
        "ARTE_EM_ALTERACAO",
        "ORCAMENTO_APROVADO",
        "CONVERTIDA_VENDA",
      ];
      where.OR = [
        { status: { in: designStatuses } },
        { designerId: user.id },
      ];
    } else if (user.role === "OPERADOR") {
      // Operador fabril só visualiza fichas que viraram OP e chegaram ao seu setor (ou SAC Interno)
      if (user.sectorCode === "SAC_INTERNO") {
        where.productionOrder = { isNot: null };
      } else {
        where.productionOrder = {
          batches: {
            some: {
              OR: [
                { currentSectorId: user.sectorId },
                { assignedOperatorId: user.id },
              ],
            },
          },
        };
      }
    } else if (requestedSellerId) {
      // ADMIN ou GESTOR filtrando por vendedor
      where.sellerId = requestedSellerId;
    }

    if (search) {
      const searchCondition = [
        { quotationNumber: { contains: search } },
        { teamName: { contains: search } },
        { customer: { companyName: { contains: search } } },
        { customer: { contactName: { contains: search } } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchCondition }];
        delete where.OR;
      } else {
        where.OR = searchCondition;
      }
    }

    const quotations = await prisma.quotation.findMany({
      where,
      include: {
        customer: true,
        seller: { select: { id: true, name: true, email: true } },
        designer: { select: { id: true, name: true, email: true } },
        minQtyAuthorizedBy: { select: { id: true, name: true, role: true, email: true } },
        minQtyRequestedBy: { select: { id: true, name: true, role: true, email: true } },
        items: true,
        attachments: {
          include: {
            uploadedBy: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: "desc" },
        },
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

// GET /api/quotations/:id - Detalhes completos do orçamento com validação estrita de autorização
quotationsRouter.get("/:id", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        seller: { select: { id: true, name: true, email: true, phone: true } },
        designer: { select: { id: true, name: true, email: true } },
        minQtyAuthorizedBy: { select: { id: true, name: true, role: true, email: true } },
        minQtyRequestedBy: { select: { id: true, name: true, role: true, email: true } },
        items: true,
        attachments: {
          include: {
            uploadedBy: { select: { id: true, name: true, role: true } },
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
            batches: true,
          },
        },
      },
    });

    if (!quotation) {
      res.status(404).json({ error: "Orçamento não encontrado." });
      return;
    }

    // Validação estrita de autorização por perfil
    if (user.role === "VENDEDOR") {
      if (quotation.sellerId !== user.id) {
        res.status(403).json({
          error: "Acesso negado: Vendedores só possuem permissão para acessar suas próprias cotações.",
        });
        return;
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
        res.status(403).json({
          error: "Acesso negado: Este orçamento ainda não foi encaminhado para o setor de Design.",
        });
        return;
      }
    } else if (user.role === "OPERADOR") {
      if (user.sectorCode !== "SAC_INTERNO") {
        const hasBatch = quotation.productionOrder?.batches.some(
          (b) => b.currentSectorId === user.sectorId || b.assignedOperatorId === user.id
        );
        if (!hasBatch) {
          res.status(403).json({
            error: "Acesso negado: Operadores só possuem acesso a pedidos encaminhados ao seu setor de produção.",
          });
          return;
        }
      }
    }

    res.json(quotation);
  } catch (error) {
    console.error("Erro ao buscar detalhes do orçamento:", error);
    res.status(500).json({ error: "Erro ao buscar orçamento." });
  }
});

// POST /api/quotations - Criar nova oportunidade / orçamento na Pré-Venda
quotationsRouter.post("/", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = createQuotationSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const data = parseResult.data;
    const user = req.user!;

    // Vincular cliente existente ou cadastrar cliente
    let finalCustomerId = data.customerId;
    if (!finalCustomerId && data.customer) {
      const newCustomer = await prisma.customer.create({
        data: {
          companyName: data.customer.companyName,
          contactName: data.customer.contactName,
          phone: data.customer.phone,
          sellerId: user.id,
        },
      });
      finalCustomerId = newCustomer.id;
    }

    if (!finalCustomerId) {
      res.status(400).json({ error: "Cliente ou dados de contato são obrigatórios para a pré-venda." });
      return;
    }

    const quotationNumber = await generateNextQuotationNumber();

    let finalItems = data.items;
    let finalTotalQuantity = data.totalQuantity;
    let finalBudgetAmount = data.budgetAmount;

    if (data.items && data.items.length > 0) {
      const calculation = await processAndRecalculateItems(data.items, data.budgetAmount, data.totalQuantity);
      if (calculation.error) {
        res.status(400).json({ error: calculation.error });
        return;
      }
      finalItems = calculation.processedItems;
      finalTotalQuantity = calculation.totalQuantity;
      finalBudgetAmount = Number((calculation.totalItemsAmount - (data.discountAmount || 0)).toFixed(2));
    }

    // Regra de autorização gerencial por PIN para pedidos abaixo de 10 peças
    let minQtyAuthorizedById: string | null = null;
    let minQtyAuthorizedAt: Date | null = null;
    let minQtyApprovedQuantity: number | null = null;
    let minQtyRequestedById: string | null = null;
    let authorizedManagerObj: any = null;

    if (finalTotalQuantity < 10) {
      if (!data.managerPin) {
        res.status(400).json({
          error: `Pedidos com quantidade abaixo de 10 peças (${finalTotalQuantity} peças) exigem autorização por PIN de um gestor ou administrador.`,
        });
        return;
      }

      const pinResult = await verifyManagerOrAdminPin(data.managerPin, data.managerId);
      if (!pinResult.success || !pinResult.manager) {
        res.status(403).json({ error: pinResult.error || "PIN de autorização incorreto." });
        return;
      }

      minQtyAuthorizedById = pinResult.manager.id;
      minQtyAuthorizedAt = new Date();
      minQtyApprovedQuantity = finalTotalQuantity;
      minQtyRequestedById = user.id;
      authorizedManagerObj = pinResult.manager;
    }

    const created = await prisma.quotation.create({
      data: {
        quotationNumber,
        customerId: finalCustomerId,
        teamName: data.teamName,
        productsSummary: data.productsSummary || null,
        totalQuantity: finalTotalQuantity,
        budgetAmount: finalBudgetAmount,
        discountAmount: data.discountAmount ?? 0,
        frozenPriceSnapshot: data.frozenPriceSnapshot || null,
        desiredDeadline: data.desiredDeadline ? new Date(data.desiredDeadline) : null,
        observations: data.observations || null,
        sellerId: user.id, // Vínculo estrito e inviolável com o vendedor autenticado
        status: "NOVA_SOLICITACAO",
        minQtyAuthorizedById,
        minQtyAuthorizedAt,
        minQtyApprovedQuantity,
        minQtyRequestedById,
        items: finalItems && finalItems.length > 0
          ? {
              create: finalItems.map((it) => ({
                productModel: it.productModel,
                catalogProductId: it.catalogProductId || null,
                isCustomModel: it.isCustomModel ?? false,
                customModelName: it.customModelName || null,
                isCustomFabric: it.isCustomFabric ?? false,
                customFabricName: it.customFabricName || null,
                isCustomCollar: it.isCustomCollar ?? false,
                customCollarName: it.customCollarName || null,
                gender: it.gender,
                size: it.size,
                quantity: it.quantity,
                customName: it.customName || null,
                customNumber: it.customNumber || null,
                fabricType: it.fabricType || null,
                collarType: it.collarType || null,
                unitPrice: typeof it.unitPrice === "number" ? it.unitPrice : (parseMonetaryValue(it.unitPrice) || 0),
                subtotal: typeof it.subtotal === "number" ? it.subtotal : (parseMonetaryValue(it.subtotal) || 0),
                customizationNotes: it.customizationNotes || null,
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
        attachments: data.attachments && data.attachments.length > 0
          ? {
              create: data.attachments.map((att) => {
                const ext = att.fileName.split(".").pop()?.toUpperCase() || "";
                return {
                  fileName: att.fileName,
                  originalName: att.originalName || att.fileName,
                  fileType: att.fileType,
                  fileExtension: ext,
                  fileSize: att.fileSize || null,
                  fileUrl: att.fileUrl,
                  uploadedById: user.id,
                };
              }),
            }
          : undefined,
        timeline: {
          create: {
            fromStatus: null,
            toStatus: "NOVA_SOLICITACAO",
            userId: user.id,
            notes: `Oportunidade comercial criada na Pré-Venda pelo vendedor ${user.name}.`,
          },
        },
      },
      include: {
        customer: true,
        items: true,
        attachments: {
          include: { uploadedBy: { select: { id: true, name: true } } },
        },
        designBrief: true,
        minQtyAuthorizedBy: { select: { id: true, name: true, role: true, email: true } },
        minQtyRequestedBy: { select: { id: true, name: true, role: true, email: true } },
      },
    });

    if (minQtyAuthorizedById && authorizedManagerObj) {
      await logAudit({
        userId: user.id,
        action: "QUOTATION_MIN_QTY_AUTHORIZED",
        entityName: "Quotation",
        entityId: created.id,
        newValues: {
          quotationNumber: created.quotationNumber,
          approvedQuantity: finalTotalQuantity,
          authorizedById: authorizedManagerObj.id,
          authorizedByName: authorizedManagerObj.name,
          authorizedByRole: authorizedManagerObj.role,
          requestedById: user.id,
          requestedByName: user.name,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
    }

    await logAudit({
      userId: user.id,
      action: "QUOTATION_CREATED",
      entityName: "Quotation",
      entityId: created.id,
      newValues: {
        quotationNumber: created.quotationNumber,
        teamName: created.teamName,
        totalQuantity: created.totalQuantity,
        budgetAmount: created.budgetAmount,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json(created);
  } catch (error) {
    console.error("Erro ao criar oportunidade:", error);
    res.status(500).json({ error: "Erro ao criar oportunidade." });
  }
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

      // Propriedade horizontal: Vendedor só pode alterar o status de suas próprias cotações
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
            error: `Transição de status comercial inválida: não é permitido alterar de '${oldStatus}' diretamente para '${newStatus}'. Transições permitidas: ${allowedTransitions.join(", ") || "Nenhuma"}.`,
          });
          return;
        }
      }

      // Bloqueio de encaminhamento para pedidos < 10 peças sem autorização por PIN válida
      if (newStatus !== "PERDIDA") {
        if (quotation.totalQuantity < 10) {
          if (!quotation.minQtyAuthorizedById || quotation.minQtyApprovedQuantity !== quotation.totalQuantity) {
            res.status(400).json({
              error: `Encaminhamento bloqueado: Esta ficha possui quantidade abaixo de 10 peças (${quotation.totalQuantity} peças) e não possui autorização por PIN de gestor/administrador válida para esta quantidade.`,
            });
            return;
          }
        }
      }

      // Bloqueio de avanço de AGUARDANDO_APROVACAO_ARTE sem aprovação formal da arte
      if (oldStatus === "AGUARDANDO_APROVACAO_ARTE" && newStatus === "ORCAMENTO_APROVADO") {
        if (!quotation.isArtworkApproved) {
          res.status(400).json({
            error: "Encaminhamento bloqueado: A arte precisa ser aprovada formalmente pelo cliente com confirmação da revisão antes de avançar para 'Orçamento Aprovado'.",
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
              notes:
                parseResult.data.notes ||
                `Status alterado de ${oldStatus} para ${newStatus} por ${req.user!.name}.`,
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

      // Notificação restrita aos setores autorizados
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

// PUT /api/quotations/:id - Atualizar dados completos da ficha de pré-venda
const updateQuotationSchema = z.object({
  customer: z
    .object({
      companyName: z.string().optional(),
      contactName: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional(),
  teamName: z.string().min(2).optional(),
  productsSummary: z.string().optional(),
  totalQuantity: z.number().int().min(1).optional(),
  budgetAmount: z.number().min(0).optional(),
  desiredDeadline: z.string().optional(),
  observations: z.string().optional(),
  briefingText: z.string().optional(),
  frozenPriceSnapshot: z.string().optional(),
  items: z.array(itemSchema).optional(),
  attachments: z.array(attachmentInputSchema).optional(),
  notes: z.string().optional(),
  managerPin: z.string().optional(),
  managerId: z.string().optional(),
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

      const quotation = await prisma.quotation.findUnique({
        where: { id },
        include: { customer: true, designBrief: true },
      });
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

      const data = parseResult.data;

      // 1. Atualizar dados do cliente se informados
      if (data.customer && quotation.customerId) {
        await prisma.customer.update({
          where: { id: quotation.customerId },
          data: {
            companyName: data.customer.companyName || undefined,
            contactName: data.customer.contactName || undefined,
            phone: data.customer.phone || undefined,
          },
        });
      }

      // 2. Atualizar ou criar briefing de design
      if (data.briefingText !== undefined) {
        if (quotation.designBrief) {
          await prisma.designBrief.update({
            where: { id: quotation.designBrief.id },
            data: { briefingText: data.briefingText },
          });
        } else if (data.briefingText.trim() !== "") {
          await prisma.designBrief.create({
            data: {
              quotationId: id,
              briefingText: data.briefingText,
            },
          });
        }
      }

      // 3. Atualizar itens da grade se enviados (com recálculo e validação segura)
      let updatedTotalQuantity = data.totalQuantity;
      let updatedBudgetAmount = data.budgetAmount;

      if (data.items) {
        if (data.items.length > 0) {
          const calculation = await processAndRecalculateItems(
            data.items,
            data.budgetAmount || quotation.budgetAmount,
            data.totalQuantity || quotation.totalQuantity
          );
          if (calculation.error) {
            res.status(400).json({ error: calculation.error });
            return;
          }
          updatedTotalQuantity = calculation.totalQuantity;
          updatedBudgetAmount = calculation.totalItemsAmount;

          await prisma.quotationItem.deleteMany({ where: { quotationId: id } });
          await prisma.quotationItem.createMany({
            data: calculation.processedItems.map((it) => ({
              quotationId: id,
              productModel: it.productModel,
              catalogProductId: it.catalogProductId || null,
              isCustomModel: it.isCustomModel ?? false,
              customModelName: it.customModelName || null,
              isCustomFabric: it.isCustomFabric ?? false,
              customFabricName: it.customFabricName || null,
              isCustomCollar: it.isCustomCollar ?? false,
              customCollarName: it.customCollarName || null,
              gender: it.gender,
              size: it.size,
              quantity: it.quantity,
              customName: it.customName || null,
              customNumber: it.customNumber || null,
              fabricType: it.fabricType || null,
              collarType: it.collarType || null,
              unitPrice: typeof it.unitPrice === "number" ? it.unitPrice : (parseMonetaryValue(it.unitPrice) || 0),
              subtotal: typeof it.subtotal === "number" ? it.subtotal : (parseMonetaryValue(it.subtotal) || 0),
              customizationNotes: it.customizationNotes || null,
            })),
          });
        } else {
          await prisma.quotationItem.deleteMany({ where: { quotationId: id } });
        }
      }

      // 4. Anexar novos arquivos se enviados
      if (data.attachments && data.attachments.length > 0) {
        for (const att of data.attachments) {
          const ext = att.fileName.split(".").pop()?.toUpperCase() || "";
          await prisma.quotationAttachment.create({
            data: {
              quotationId: id,
              fileName: att.fileName,
              originalName: att.originalName || att.fileName,
              fileType: att.fileType,
              fileExtension: ext,
              fileSize: att.fileSize || null,
              fileUrl: att.fileUrl,
              uploadedById: req.user!.id,
            },
          });
        }
      }

      // 5. Verificação e atualização da autorização por PIN para pedidos abaixo de 10 peças
      const finalQuantity = updatedTotalQuantity ?? data.totalQuantity ?? quotation.totalQuantity;
      let minQtyUpdate: any = {};
      let authorizedManagerObj: any = null;

      if (finalQuantity < 10) {
        // Verifica se a ficha já possui aprovação válida para ESSA quantidade exata
        const hasValidExistingApproval =
          quotation.minQtyAuthorizedById &&
          quotation.minQtyApprovedQuantity === finalQuantity;

        if (hasValidExistingApproval && !data.managerPin) {
          // Quantidade permaneceu inalterada e já estava autorizada. Mantém aprovação válida.
        } else {
          // A quantidade mudou ou não possui aprovação prévia para esta quantidade: exige PIN
          if (!data.managerPin) {
            res.status(400).json({
              error: `Alteração para quantidade abaixo de 10 peças (${finalQuantity} peças) exige autorização por PIN de um gestor ou administrador.`,
            });
            return;
          }

          const pinResult = await verifyManagerOrAdminPin(data.managerPin, data.managerId);
          if (!pinResult.success || !pinResult.manager) {
            res.status(403).json({ error: pinResult.error || "PIN de autorização incorreto." });
            return;
          }

          minQtyUpdate = {
            minQtyAuthorizedById: pinResult.manager.id,
            minQtyAuthorizedAt: new Date(),
            minQtyApprovedQuantity: finalQuantity,
            minQtyRequestedById: req.user!.id,
          };
          authorizedManagerObj = pinResult.manager;
        }
      } else {
        // Quantidade >= 10: limpa qualquer autorização anterior de baixa quantidade
        minQtyUpdate = {
          minQtyAuthorizedById: null,
          minQtyAuthorizedAt: null,
          minQtyApprovedQuantity: null,
          minQtyRequestedById: null,
        };
      }

      // 6. Atualizar campos escalares da cotação
      const updated = await prisma.quotation.update({
        where: { id },
        data: {
          teamName: data.teamName,
          productsSummary: data.productsSummary,
          totalQuantity: updatedTotalQuantity ?? data.totalQuantity,
          budgetAmount: updatedBudgetAmount ?? data.budgetAmount,
          frozenPriceSnapshot: data.frozenPriceSnapshot,
          observations: data.observations,
          desiredDeadline: data.desiredDeadline ? new Date(data.desiredDeadline) : undefined,
          ...minQtyUpdate,
          timeline: {
            create: {
              fromStatus: quotation.status,
              toStatus: quotation.status,
              userId: req.user!.id,
              notes: data.notes || `Ficha comercial atualizada pelo usuário ${req.user!.name}.`,
            },
          },
        },
        include: {
          customer: true,
          items: true,
          attachments: {
            include: { uploadedBy: { select: { id: true, name: true } } },
          },
          designBrief: true,
          minQtyAuthorizedBy: { select: { id: true, name: true, role: true, email: true } },
          minQtyRequestedBy: { select: { id: true, name: true, role: true, email: true } },
          timeline: {
            orderBy: { createdAt: "desc" },
            include: { user: { select: { id: true, name: true } } },
          },
        },
      });

      if (minQtyUpdate.minQtyAuthorizedById && authorizedManagerObj) {
        await logAudit({
          userId: req.user!.id,
          action: "QUOTATION_MIN_QTY_AUTHORIZED",
          entityName: "Quotation",
          entityId: id,
          newValues: {
            quotationNumber: quotation.quotationNumber,
            approvedQuantity: finalQuantity,
            authorizedById: authorizedManagerObj.id,
            authorizedByName: authorizedManagerObj.name,
            authorizedByRole: authorizedManagerObj.role,
            requestedById: req.user!.id,
            requestedByName: req.user!.name,
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });
      }

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

// POST /api/quotations/:id/attachments - Anexar arquivos à ficha
quotationsRouter.post("/:id/attachments", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const parseResult = attachmentInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const quotation = await prisma.quotation.findUnique({ where: { id } });
    if (!quotation) {
      res.status(404).json({ error: "Orçamento não encontrado." });
      return;
    }

    // Regra horizontal de autorização: Vendedor só anexa nas suas cotações; Designer se encaminhado; Admin/Gestor sempre
    if (req.user!.role === "VENDEDOR" && quotation.sellerId !== req.user!.id) {
      res.status(403).json({
        error: "Acesso negado: Vendedores só possuem permissão para anexar arquivos em suas próprias cotações.",
      });
      return;
    }

    const data = parseResult.data;
    const ext = data.fileName.split(".").pop()?.toUpperCase() || "";

    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      res.status(400).json({
        error: `Extensão de arquivo potencialmente perigosa (.${ext}) não é permitida.`,
      });
      return;
    }

    const attachment = await prisma.quotationAttachment.create({
      data: {
        quotationId: id,
        fileName: data.fileName,
        originalName: data.originalName || data.fileName,
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

    await prisma.quotationTimeline.create({
      data: {
        quotationId: id,
        fromStatus: quotation.status,
        toStatus: quotation.status,
        userId: req.user!.id,
        notes: `Arquivo ${data.fileName} anexado por ${req.user!.name}.`,
      },
    });

    await logAudit({
      userId: req.user!.id,
      action: "ATTACHMENT_ADDED",
      entityName: "QuotationAttachment",
      entityId: attachment.id,
      newValues: { fileName: data.fileName, fileUrl: data.fileUrl },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json(attachment);
  } catch (error) {
    console.error("Erro ao anexar arquivo:", error);
    res.status(500).json({ error: "Erro ao anexar arquivo." });
  }
});

// DELETE /api/quotations/:id/attachments/:attachmentId - Remover anexo da ficha
quotationsRouter.delete(
  "/:id/attachments/:attachmentId",
  requireRole("VENDEDOR", "GESTOR", "ADMIN", "DESIGNER"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id, attachmentId } = req.params;
      const quotation = await prisma.quotation.findUnique({ where: { id } });
      if (!quotation) {
        res.status(404).json({ error: "Orçamento não encontrado." });
        return;
      }

      if (req.user!.role === "VENDEDOR" && quotation.sellerId !== req.user!.id) {
        res.status(403).json({
          error: "Acesso negado: Vendedores só possuem permissão para excluir anexos de suas próprias cotações.",
        });
        return;
      }

      const attachment = await prisma.quotationAttachment.findFirst({
        where: { id: attachmentId, quotationId: id },
      });
      if (!attachment) {
        res.status(404).json({ error: "Anexo não encontrado." });
        return;
      }

      await prisma.quotationAttachment.delete({ where: { id: attachmentId } });

      await logAudit({
        userId: req.user!.id,
        action: "ATTACHMENT_DELETED",
        entityName: "QuotationAttachment",
        entityId: attachmentId,
        oldValues: attachment,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({ message: "Anexo removido com sucesso." });
    } catch (error) {
      console.error("Erro ao excluir anexo:", error);
      res.status(500).json({ error: "Erro ao excluir anexo." });
    }
  }
);
