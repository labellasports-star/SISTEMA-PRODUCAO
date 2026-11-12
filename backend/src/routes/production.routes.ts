import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { verifyPin, generateDigitalSignature, assertAndVerifyUserPin } from "../utils/security.js";
import { logAudit } from "../utils/audit.js";
import { io } from "../server.js";

export const productionRouter = Router();

// Todas as rotas de produção exigem autenticação
productionRouter.use(authenticateToken);

// Sequência oficial completa dos 14 setores industriais
export const SECTOR_SEQUENCE = [
  "PRE_VENDA",         // 01
  "DESIGNER",          // 02
  "VENDAS",            // 03
  "SAC_INTERNO",       // 04
  "PRE_DIAGRAMACAO",   // 05
  "DIAGRAMACAO",       // 06
  "IMPRESSAO",         // 07
  "INFESTO",           // 08
  "CALANDRA",          // 09
  "SEPARACAO",         // 10
  "DESPACHE_OFICINA",  // 11
  "COSTURA",           // 12
  "QUALIDADE",         // 13
  "EXPEDICAO",         // 14
];

// Helper para obter o índice na sequência oficial dos 14 setores
export function getSectorSequenceIndex(code: string): number {
  return SECTOR_SEQUENCE.indexOf(code);
}

export const NEXT_SECTOR_MAP: Record<string, string> = {
  PRE_DIAGRAMACAO: "DIAGRAMACAO",
  DIAGRAMACAO: "IMPRESSAO",
  IMPRESSAO: "INFESTO",
  INFESTO: "CALANDRA",
  CALANDRA: "SEPARACAO",
  SEPARACAO: "DESPACHE_OFICINA",
  DESPACHE_OFICINA: "COSTURA",
  COSTURA: "QUALIDADE",
  QUALIDADE: "EXPEDICAO",
};

// Esquemas de validação Zod
const startBatchSchema = z.object({
  pin: z.string().min(4, "PIN de 4 a 8 dígitos é obrigatório.").optional(),
  notes: z.string().optional(),
});

const attachDiagramSchema = z.object({
  fileName: z.string().min(1, "Nome do arquivo é obrigatório."),
  fileUrl: z.string().min(1, "URL ou caminho do arquivo é obrigatório."),
  fileVersion: z.number().int().min(1).default(1),
  notes: z.string().optional(),
});

const completeBatchSchema = z.object({
  pin: z.string().min(4, "PIN de 4 a 6 dígitos é obrigatório."),
  notes: z.string().optional(),

  // Parâmetros específicos por setor
  // 06. Diagramação
  diagramFileUrl: z.string().optional(),
  diagramFileName: z.string().optional(),
  diagramVersion: z.number().optional(),

  // 07. Impressão
  machine: z.string().optional(),
  quantityPlanned: z.number().int().optional(),
  quantityProduced: z.number().int().min(1).optional(),
  quantityLost: z.number().int().min(0).default(0),

  // 08. Infesto
  quantityReceived: z.number().int().optional(),
  quantityPrepared: z.number().int().optional(),
  lossesOrDivergences: z.number().int().min(0).default(0),

  // 09. Calandra
  temperature: z.string().optional(), // Ex: "205°C"
  speedOrTime: z.string().optional(), // Ex: "1.8 m/min" ou "30s"
  quantityProcessed: z.number().int().optional(),

  // 10. Separação
  quantitySeparated: z.number().int().optional(),
  missingOrDivergences: z.number().int().min(0).default(0),
  integrityVerified: z.boolean().optional(),

  // Retrabalho (quando aplicável)
  reworkQuantity: z.number().int().optional(),
});

const returnBatchSchema = z.object({
  pin: z.string().min(4, "PIN de assinatura é obrigatório."),
  targetSectorCode: z.string().min(2, "Setor de destino da devolução é obrigatório."),
  reason: z.string().min(5, "Motivo detalhado da devolução/retrabalho é obrigatório."),
});

// -----------------------------------------------------------------------------
// 1. GET /api/production/queue/:sectorCode
// Consulta da fila operacional do setor com validação estrita de RBAC
// -----------------------------------------------------------------------------
productionRouter.get("/queue/:sectorCode", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sectorCode } = req.params;
    const user = req.user!;

    // RBAC: Operadores só podem consultar a fila do seu próprio setor
    if (user.role === "OPERADOR" && user.sectorCode !== sectorCode) {
      return res.status(403).json({
        error: `Acesso negado: Operadores do setor '${user.sectorCode}' não possuem permissão para visualizar a fila de '${sectorCode}'.`,
      });
    }

    const sector = await prisma.sector.findUnique({ where: { code: sectorCode } });
    if (!sector) {
      return res.status(404).json({ error: `Setor '${sectorCode}' não cadastrado no sistema.` });
    }

    const batches = await prisma.opBatch.findMany({
      where: { currentSectorId: sector.id },
      include: {
        productionOrder: {
          include: {
            customer: true,
            quotation: {
              include: {
                items: true,
                attachments: true,
                designBrief: {
                  include: {
                    versions: { orderBy: { versionNumber: "desc" } },
                  },
                },
              },
            },
            batches: {
              include: { currentSector: true },
            },
          },
        },
        currentSector: true,
        assignedOperator: { select: { id: true, name: true, email: true, role: true } },
        movements: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            fromSector: true,
            toSector: true,
            operator: { select: { id: true, name: true, role: true } },
          },
        },
      },
      orderBy: [
        { productionOrder: { priority: "desc" } },
        { createdAt: "asc" },
      ],
    });

    return res.json({
      sector: { id: sector.id, code: sector.code, name: sector.name, sequenceOrder: sector.sequenceOrder },
      totalBatches: batches.length,
      waitingCount: batches.filter((b) => b.batchStatus === "WAITING" || b.batchStatus === "PENDING").length,
      inProgressCount: batches.filter((b) => b.batchStatus === "IN_PROGRESS").length,
      completedCount: batches.filter((b) => b.batchStatus === "COMPLETED").length,
      reworkCount: batches.filter((b) => b.isUnderRework || b.batchStatus === "REWORK").length,
      batches,
    });
  } catch (err: any) {
    console.error("Erro ao consultar fila de produção:", err);
    return res.status(500).json({ error: "Erro interno ao carregar fila de produção." });
  }
});

// -----------------------------------------------------------------------------
// 2. POST /api/production/batches/:batchId/start
// Operador assume e inicia a execução do lote no setor
// -----------------------------------------------------------------------------
productionRouter.post("/batches/:batchId/start", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId } = req.params;
    const user = req.user!;
    const parseResult = startBatchSchema.safeParse(req.body);

    const batch = await prisma.opBatch.findUnique({
      where: { id: batchId },
      include: { currentSector: true, productionOrder: true },
    });

    if (!batch) {
      return res.status(404).json({ error: "Lote de produção não encontrado." });
    }

    // RBAC: Apenas ADMIN, GESTOR ou OPERADOR alocado no setor atual do lote podem iniciar o lote
    if (user.role !== "ADMIN" && user.role !== "GESTOR") {
      if (user.role !== "OPERADOR") {
        return res.status(403).json({
          error: `Acesso negado: O perfil '${user.role}' não possui permissão para iniciar lotes de produção no chão de fábrica.`,
        });
      }
      if (user.sectorCode !== batch.currentSector.code) {
        return res.status(403).json({
          error: `Acesso negado: Você está alocado em '${user.sectorCode || "Nenhum"}' e não pode iniciar lotes no setor '${batch.currentSector.code}'.`,
        });
      }
    }

    if (batch.batchStatus === "IN_PROGRESS") {
      return res.status(400).json({ error: "Este lote já está em andamento." });
    }

    if (parseResult.data?.pin) {
      const pinResult = await assertAndVerifyUserPin(user.id, parseResult.data.pin);
      if (!pinResult.success) {
        return res.status(pinResult.status).json({ error: pinResult.error });
      }
    }

    const updated = await prisma.opBatch.update({
      where: { id: batchId },
      data: {
        batchStatus: "IN_PROGRESS",
        assignedOperatorId: user.id,
      },
      include: {
        currentSector: true,
        assignedOperator: { select: { id: true, name: true, role: true } },
      },
    });

    await logAudit({
      userId: user.id,
      action: "PRODUCTION_BATCH_STARTED",
      entityName: "OpBatch",
      entityId: batch.id,
      newValues: {
        batchNumber: batch.batchNumber,
        sector: batch.currentSector.code,
        notes: parseResult.data?.notes,
      },
    });

    // Emissão Socket.io direcionada
    io.to(`sector_${batch.currentSector.code}`)
      .to("sector_ADMIN")
      .to("sector_GESTAO")
      .emit("batch_started", {
        batchId: updated.id,
        batchNumber: updated.batchNumber,
        sectorCode: updated.currentSector.code,
        operatorName: user.name,
      });

    return res.json({
      message: `Lote ${batch.batchNumber} iniciado com sucesso por ${user.name}.`,
      batch: updated,
    });
  } catch (err: any) {
    console.error("Erro ao iniciar lote:", err);
    return res.status(500).json({ error: "Erro interno ao iniciar lote." });
  }
});

// -----------------------------------------------------------------------------
// 3. POST /api/production/batches/:batchId/attach-diagram
// Setor 06 (Diagramação): Registrar e anexar arquivo de produção (encaixe/mapa)
// -----------------------------------------------------------------------------
productionRouter.post(
  "/batches/:batchId/attach-diagram",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { batchId } = req.params;
      const user = req.user!;
      const parseResult = attachDiagramSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          error: "Dados inválidos.",
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const batch = await prisma.opBatch.findUnique({
        where: { id: batchId },
        include: { currentSector: true, productionOrder: true },
      });

      if (!batch) {
        return res.status(404).json({ error: "Lote não encontrado." });
      }

      if (batch.currentSector.code !== "DIAGRAMACAO" && user.role !== "ADMIN" && user.role !== "GESTOR") {
        return res.status(400).json({
          error: "Anexação de arquivos de diagramação permitida apenas no setor de Diagramação.",
        });
      }

      const { fileName, fileUrl, fileVersion, notes } = parseResult.data;
      const fileExt = fileName.includes(".")
        ? fileName.split(".").pop()!.toUpperCase()
        : "PDF";

      // Anexar como anexo formal de produção se houver quotationId vinculado
      let attachment = null;
      if (batch.productionOrder.quotationId) {
        attachment = await prisma.quotationAttachment.create({
          data: {
            quotationId: batch.productionOrder.quotationId,
            fileName: `[DIAGRAMACAO_V${fileVersion}] ${fileName}`,
            fileType: "ARTWORK_VECTOR",
            fileExtension: fileExt,
            fileUrl,
            uploadedById: user.id,
          },
        });
      } else {
        attachment = {
          id: `virtual-${Date.now()}`,
          fileName: `[DIAGRAMACAO_V${fileVersion}] ${fileName}`,
          fileType: "ARTWORK_VECTOR",
          fileExtension: fileExt,
          fileUrl,
        };
      }

      await logAudit({
        userId: user.id,
        action: "DIAGRAM_FILE_ATTACHED",
        entityName: "OpBatch",
        entityId: batch.id,
        newValues: {
          batchNumber: batch.batchNumber,
          fileName,
          fileUrl,
          fileVersion,
          notes,
        },
      });

      return res.status(201).json({
        message: "Arquivo de diagramação anexado com sucesso.",
        attachment,
      });
    } catch (err: any) {
      console.error("Erro ao anexar arquivo de diagramação:", err);
      return res.status(500).json({ error: "Erro interno ao registrar arquivo de diagramação." });
    }
  }
);

// -----------------------------------------------------------------------------
// 4. POST /api/production/batches/:batchId/complete-and-forward
// Conclusão da etapa do setor com assinatura PIN e encaminhamento ao próximo setor
// -----------------------------------------------------------------------------
productionRouter.post(
  "/batches/:batchId/complete-and-forward",
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { batchId } = req.params;
      const user = req.user!;
      const parseResult = completeBatchSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          error: "Dados inválidos.",
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { pin, notes, ...sectorMetrics } = parseResult.data;

      // 1. Consulta do lote e setor atual
      const batch = await prisma.opBatch.findUnique({
        where: { id: batchId },
        include: {
          currentSector: true,
          productionOrder: {
            include: {
              quotation: {
                include: { attachments: true },
              },
            },
          },
        },
      });

      if (!batch) {
        return res.status(404).json({ error: "Lote de produção não encontrado." });
      }

      const currentSectorCode = batch.currentSector.code;

      // 2. RBAC: Apenas ADMIN, GESTOR ou OPERADOR do próprio setor podem concluir a operação
      if (user.role !== "ADMIN" && user.role !== "GESTOR") {
        if (user.role !== "OPERADOR") {
          return res.status(403).json({
            error: `Acesso negado: O perfil '${user.role}' não possui permissão para concluir operações industriais de chão de fábrica.`,
          });
        }
        if (user.sectorCode !== currentSectorCode) {
          return res.status(403).json({
            error: `Acesso negado: Você pertence a '${user.sectorCode || "Nenhum"}' e não pode concluir operações em '${currentSectorCode}'.`,
          });
        }
      }

      // 3. Validação estrita do PIN de assinatura individual do operador
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser || !dbUser.signaturePinHash) {
        return res.status(403).json({
          error: "Usuário não possui PIN de assinatura digital cadastrado. Cadastre seu PIN no perfil.",
        });
      }

      const isPinValid = await verifyPin(pin, dbUser.signaturePinHash);
      if (!isPinValid) {
        return res.status(403).json({ error: "PIN de assinatura incorreto. Operação negada." });
      }

      // 4. Validações técnicas específicas por setor
      // Setor 06 (Diagramação): Bloqueio de avanço se não houver arquivo de diagramação
      if (currentSectorCode === "DIAGRAMACAO") {
        const hasDiagramFile =
          Boolean(sectorMetrics.diagramFileUrl) ||
          batch.productionOrder.quotation?.attachments?.some((a) =>
            a.fileName.includes("[DIAGRAMACAO") || a.fileType === "ARTWORK_VECTOR"
          );

        if (!hasDiagramFile) {
          return res.status(400).json({
            error:
              "Bloqueio de avanço: É obrigatório anexar e registrar os arquivos de diagramação antes de encaminhar para a Impressão.",
          });
        }
      }

      // Setor 07 (Impressão): Validação de máquina e quantidades
      if (currentSectorCode === "IMPRESSAO") {
        if (!sectorMetrics.machine) {
          return res.status(400).json({ error: "É obrigatório registrar a máquina/plotter utilizada na Impressão." });
        }
      }

      // Setor 09 (Calandra): Validação de parâmetros térmicos (temperatura e velocidade/tempo)
      if (currentSectorCode === "CALANDRA") {
        if (!sectorMetrics.machine || !sectorMetrics.temperature || !sectorMetrics.speedOrTime) {
          return res.status(400).json({
            error: "É obrigatório registrar a máquina, temperatura e velocidade/tempo do processo de termotransferência da Calandra.",
          });
        }
      }

      // Setor 10 (Separação): Validação de conferência de integridade
      if (currentSectorCode === "SEPARACAO") {
        if (!sectorMetrics.integrityVerified) {
          return res.status(400).json({
            error: "É obrigatório confirmar a conferência de identificação e integridade dos materiais antes de finalizar a Separação.",
          });
        }
      }

      // Setor 12 (Costura): Validação de fechamento do recebimento da oficina
      let costuraApprovedQuantity: number | null = null;
      if (currentSectorCode === "COSTURA" || batch.currentSector.sequenceOrder === 12) {
        if (batch.isUnderRework) {
          // Lote em retrabalho vindo da Qualidade: não requer novo romaneio de oficina externa
          const reworkQty = sectorMetrics.reworkQuantity !== undefined ? Number(sectorMetrics.reworkQuantity) : batch.quantity;
          if (reworkQty <= 0) {
            return res.status(400).json({
              error: "Avanço bloqueado: Quantidade retrabalhada deve ser maior que zero.",
            });
          }
          costuraApprovedQuantity = reworkQty;
        } else {
          const lastManifest = await prisma.dispatchManifest.findFirst({
            where: { opBatchId: batch.id },
            orderBy: { createdAt: "desc" },
            include: {
              receipts: true,
            },
          });

          if (!lastManifest || !lastManifest.isReceiptClosed) {
            return res.status(400).json({
              error: "Avanço bloqueado: O lote não pode avançar para a Qualidade sem que o recebimento da oficina esteja concluído e fechado.",
            });
          }

          costuraApprovedQuantity = lastManifest.receipts.reduce((sum, r) => sum + r.totalReceivedOk, 0);
          if (costuraApprovedQuantity <= 0) {
            return res.status(400).json({
              error: "Avanço bloqueado: Nenhuma peça foi recebida com conformidade (OK) para prosseguir para a Qualidade.",
            });
          }
        }
      }

      // 5. Determinação do próximo setor
      const nextSectorCode = NEXT_SECTOR_MAP[currentSectorCode];
      let destinationSector = null;

      if (nextSectorCode) {
        destinationSector = await prisma.sector.findFirst({
          where: {
            OR: [
              { code: nextSectorCode },
              { sequenceOrder: getSectorSequenceIndex(nextSectorCode) + 1 },
            ],
          },
        });
        if (!destinationSector) {
          return res.status(500).json({ error: `Setor de destino '${nextSectorCode}' não encontrado.` });
        }
      }

      // 6. Execução transacional segura da movimentação
      const nowIso = new Date().toISOString();
      const result = await prisma.$transaction(async (tx) => {
        // Gerar Assinatura Digital HMAC-SHA-256 no servidor
        const signatureHash = generateDigitalSignature({
          batchId: batch.id,
          operatorId: user.id,
          fromSectorId: batch.currentSectorId,
          toSectorId: destinationSector ? destinationSector.id : batch.currentSectorId,
          timestamp: nowIso,
        });

        const structuredNotes = JSON.stringify({
          notes: notes || null,
          sectorMetrics,
          operatorName: user.name,
          completedSector: currentSectorCode,
        });

        // Registrar a movimentação
        const movement = await tx.opMovement.create({
          data: {
            opBatchId: batch.id,
            fromSectorId: batch.currentSectorId,
            toSectorId: destinationSector ? destinationSector.id : batch.currentSectorId,
            operatorId: user.id,
            movementType: "FORWARD",
            receivedAt: batch.updatedAt,
            startedAt: batch.updatedAt,
            finishedAt: new Date(),
            digitalSignatureHash: signatureHash,
            signerPinVerified: true,
            notes: structuredNotes,
          },
          include: {
            fromSector: true,
            toSector: true,
            operator: { select: { id: true, name: true, role: true } },
          },
        });

        // Atualizar o lote
        const isEndOfStage3 = currentSectorCode === "SEPARACAO" && !destinationSector;
        const isDespacheDest = destinationSector?.code === "DESPACHE_OFICINA" || destinationSector?.sequenceOrder === 11;
        const isQualidadeDest = destinationSector?.code === "QUALIDADE" || destinationSector?.sequenceOrder === 13;
        const isExpedicaoDest = destinationSector?.code === "EXPEDICAO" || destinationSector?.sequenceOrder === 14;
        const targetStatus = (isDespacheDest || isQualidadeDest || isExpedicaoDest)
          ? "PENDING"
          : isEndOfStage3
          ? "COMPLETED"
          : "WAITING";

        const updatedBatch = await tx.opBatch.update({
          where: { id: batch.id },
          data: {
            currentSectorId: destinationSector ? destinationSector.id : batch.currentSectorId,
            batchStatus: targetStatus,
            quantity: costuraApprovedQuantity !== null ? costuraApprovedQuantity : batch.quantity,
            assignedOperatorId: null,
            isUnderRework: false,
            reworkReason: null,
          },
          include: {
            currentSector: true,
            productionOrder: true,
          },
        });

        return { movement, updatedBatch, destinationSector, isEndOfStage3 };
      });

      // 7. Auditoria append-only
      await logAudit({
        userId: user.id,
        action: "BATCH_SECTOR_FORWARD",
        entityName: "OpBatch",
        entityId: batch.id,
        newValues: {
          batchNumber: batch.batchNumber,
          fromSector: currentSectorCode,
          toSector: nextSectorCode || "SEPARACAO_CONCLUIDA",
          signatureHash: result.movement.digitalSignatureHash,
          sectorMetrics,
        },
      });

      // 8. Emissão Socket.io direcionada
      let eventEmitter = io
        .to(`sector_${currentSectorCode}`)
        .to("sector_ADMIN")
        .to("sector_GESTAO");

      if (nextSectorCode) {
        eventEmitter = eventEmitter.to(`sector_${nextSectorCode}`);
      }

      eventEmitter.emit("batch_moved", {
        opId: batch.productionOrderId,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        fromSectorCode: currentSectorCode,
        toSectorCode: nextSectorCode || "SEPARACAO_CONCLUIDA",
        operatorName: user.name,
      });

      return res.json({
        message: result.isEndOfStage3
          ? `Lote ${batch.batchNumber} concluído com sucesso na Separação (Etapa 3 finalizada com sucesso)!`
          : `Lote ${batch.batchNumber} concluído em ${currentSectorCode} e encaminhado para ${nextSectorCode}.`,
        batch: result.updatedBatch,
        movement: result.movement,
      });
    } catch (err: any) {
      console.error("Erro ao concluir etapa de produção:", err);
      return res.status(500).json({ error: "Erro interno ao processar conclusão do setor." });
    }
  }
);

// -----------------------------------------------------------------------------
// 5. POST /api/production/batches/:batchId/return
// Devolução com motivo para setor anterior (com assinatura digital PIN)
// -----------------------------------------------------------------------------
productionRouter.post("/batches/:batchId/return", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId } = req.params;
    const user = req.user!;
    const parseResult = returnBatchSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: "Dados inválidos.",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { pin, targetSectorCode, reason } = parseResult.data;

    // 1. Consulta de lote e setores
    const batch = await prisma.opBatch.findUnique({
      where: { id: batchId },
      include: { currentSector: true, productionOrder: true },
    });

    if (!batch) {
      return res.status(404).json({ error: "Lote não encontrado." });
    }

    const currentSectorCode = batch.currentSector.code;

    // 2. RBAC: Apenas ADMIN, GESTOR ou OPERADOR do próprio setor podem devolver lotes
    if (user.role !== "ADMIN" && user.role !== "GESTOR") {
      if (user.role !== "OPERADOR") {
        return res.status(403).json({
          error: `Acesso negado: O perfil '${user.role}' não possui permissão para devolver lotes de produção.`,
        });
      }
      if (user.sectorCode !== currentSectorCode) {
        return res.status(403).json({
          error: `Acesso negado: Você pertence a '${user.sectorCode || "Nenhum"}' e não pode devolver lotes de '${currentSectorCode}'.`,
        });
      }
    }

    // 3. Validar PIN do operador
    const pinCheck = await assertAndVerifyUserPin(user.id, pin);
    if (!pinCheck.success) {
      return res.status(pinCheck.status).json({ error: pinCheck.error });
    }

    // Validação de sequência e sentido: deve pertencer aos 14 setores e não pode devolver para frente
    const currentIdx = getSectorSequenceIndex(currentSectorCode);
    const targetIdx = getSectorSequenceIndex(targetSectorCode);

    if (currentIdx === -1 || targetIdx === -1) {
      return res.status(400).json({
        error: `Devolução inválida: O setor atual ('${currentSectorCode}') ou o de destino ('${targetSectorCode}') não pertence à sequência oficial de produção.`,
      });
    }

    if (targetIdx >= currentIdx) {
      return res.status(400).json({
        error: `Devolução inválida: O setor de destino '${targetSectorCode}' não precede o setor atual '${currentSectorCode}'. A devolução só é permitida para setores anteriores no fluxo produtivo.`,
      });
    }

    const targetSector = await prisma.sector.findUnique({
      where: { code: targetSectorCode },
    });

    if (!targetSector) {
      return res.status(404).json({ error: `Setor de destino '${targetSectorCode}' não encontrado.` });
    }

    const nowIso = new Date().toISOString();
    const result = await prisma.$transaction(async (tx) => {
      const signatureHash = generateDigitalSignature({
        batchId: batch.id,
        operatorId: user.id,
        fromSectorId: batch.currentSectorId,
        toSectorId: targetSector.id,
        timestamp: nowIso,
      });

      const movement = await tx.opMovement.create({
        data: {
          opBatchId: batch.id,
          fromSectorId: batch.currentSectorId,
          toSectorId: targetSector.id,
          operatorId: user.id,
          movementType: "REWORK_RETURN",
          receivedAt: batch.updatedAt,
          finishedAt: new Date(),
          digitalSignatureHash: signatureHash,
          signerPinVerified: true,
          notes: `Devolvido de ${currentSectorCode} para ${targetSectorCode}. Motivo: ${reason}`,
        },
        include: {
          fromSector: true,
          toSector: true,
          operator: { select: { id: true, name: true, role: true } },
        },
      });

      const updatedBatch = await tx.opBatch.update({
        where: { id: batch.id },
        data: {
          currentSectorId: targetSector.id,
          batchStatus: "WAITING",
          assignedOperatorId: null,
          isUnderRework: true,
          reworkOriginSectorId: batch.currentSectorId,
          reworkReason: reason,
        },
        include: {
          currentSector: true,
          productionOrder: true,
        },
      });

      return { movement, updatedBatch };
    });

    await logAudit({
      userId: user.id,
      action: "BATCH_SECTOR_RETURNED",
      entityName: "OpBatch",
      entityId: batch.id,
      newValues: {
        batchNumber: batch.batchNumber,
        fromSector: currentSectorCode,
        toSector: targetSectorCode,
        reason,
        signatureHash: result.movement.digitalSignatureHash,
      },
    });

    // Notificar salas envolvidas
    io.to(`sector_${currentSectorCode}`)
      .to(`sector_${targetSectorCode}`)
      .to("sector_ADMIN")
      .to("sector_GESTAO")
      .emit("batch_returned", {
        opId: batch.productionOrderId,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        fromSectorCode: currentSectorCode,
        toSectorCode: targetSectorCode,
        reason,
        operatorName: user.name,
      });

    return res.json({
      message: `Lote ${batch.batchNumber} devolvido para ${targetSectorCode} com sucesso.`,
      batch: result.updatedBatch,
      movement: result.movement,
    });
  } catch (err: any) {
    console.error("Erro ao devolver lote:", err);
    return res.status(500).json({ error: "Erro interno ao processar devolução." });
  }
});

// -----------------------------------------------------------------------------
// 6. GET /api/production/batches/:batchId/history
// Histórico completo de rastreabilidade e assinaturas daquele lote
// -----------------------------------------------------------------------------
productionRouter.get("/batches/:batchId/history", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId } = req.params;

    const batch = await prisma.opBatch.findUnique({
      where: { id: batchId },
      include: {
        currentSector: true,
        productionOrder: {
          include: { customer: true },
        },
        movements: {
          orderBy: { createdAt: "asc" },
          include: {
            fromSector: true,
            toSector: true,
            operator: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });

    if (!batch) {
      return res.status(404).json({ error: "Lote não encontrado." });
    }

    return res.json({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      quantity: batch.quantity,
      currentSector: batch.currentSector,
      status: batch.batchStatus,
      isUnderRework: batch.isUnderRework,
      reworkReason: batch.reworkReason,
      opNumber: batch.productionOrder.opNumber,
      customerName: batch.productionOrder.customer.companyName,
      movements: batch.movements,
    });
  } catch (err: any) {
    console.error("Erro ao consultar histórico do lote:", err);
    return res.status(500).json({ error: "Erro interno ao consultar histórico." });
  }
});
