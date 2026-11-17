import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";
import { assertAndVerifyUserPin } from "../utils/security.js";
import { io } from "../server.js";

export const batchesRouter = Router();

batchesRouter.use(["/production-orders", "/batches"], authenticateToken);

const createBatchSchema = z.object({
  quantity: z.number().int().min(1, "A quantidade do lote deve ser no mínimo 1 peça."),
  sectorCode: z.string().optional().default("SAC_INTERNO"),
  notes: z.string().optional(),
});

const splitBatchSchema = z.object({
  splitQuantity: z.number().int().min(1, "A quantidade desmembrada deve ser de no mínimo 1 peça."),
  pin: z.string().min(4, "PIN de 4 a 8 dígitos é obrigatório.").optional(),
  notes: z.string().optional(),
});

const subdivideOpSchema = z.object({
  subdivisions: z
    .array(
      z.object({
        quantity: z.number().int().min(1, "Cada sublote deve ter no mínimo 1 peça."),
        notes: z.string().optional(),
        sizeGrid: z.record(z.string(), z.number().int().min(0)).optional(),
      })
    )
    .min(2, "A OP deve ser desmembrada em no mínimo 2 sublotes."),
  pin: z.string().min(4, "PIN de 4 a 8 dígitos é obrigatório."),
  notes: z.string().optional(),
});

const updateBatchSchema = z.object({
  quantity: z.number().int().min(1, "A quantidade deve ser de no mínimo 1 peça."),
});

// Listar lotes de uma Ordem de Produção
batchesRouter.get(
  ["/production-orders/:opId/batches", "/batches/production-orders/:opId/batches"],
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { opId } = req.params;
    const op = await prisma.productionOrder.findUnique({
      where: { id: opId },
      include: {
        batches: {
          include: {
            currentSector: true,
            assignedOperator: { select: { id: true, name: true, role: true } },
          },
          orderBy: { batchNumber: "asc" },
        },
      },
    });

    if (!op) {
      return res.status(404).json({ error: "Ordem de Produção não encontrada." });
    }

    const totalAllocated = op.batches.reduce((sum, b) => sum + b.quantity, 0);

    return res.json({
      opId: op.id,
      opNumber: op.opNumber,
      totalQuantityOrdered: op.totalQuantityOrdered,
      totalAllocatedInBatches: totalAllocated,
      remainingUnallocated: op.totalQuantityOrdered - totalAllocated,
      batches: op.batches,
    });
  } catch (err: any) {
    console.error("Erro ao consultar lotes da OP:", err);
    return res.status(500).json({ error: "Erro interno ao buscar lotes." });
  }
});

// Criar novo lote com validação estrita de soma <= totalQuantityOrdered
batchesRouter.post(
  ["/production-orders/:opId/batches", "/batches/production-orders/:opId/batches"],
  requireRole("GESTOR", "ADMIN", "VENDEDOR", "OPERADOR"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { opId } = req.params;
      const parseResult = createBatchSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          error: "Dados inválidos.",
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { quantity, sectorCode, notes } = parseResult.data;

      // Execução transacional para concorrência segura
      const result = await prisma.$transaction(async (tx) => {
        const op = await tx.productionOrder.findUnique({
          where: { id: opId },
          include: { batches: true },
        });

        if (!op) {
          throw new Error("NOT_FOUND: Ordem de Produção não encontrada.");
        }

        const currentSum = op.batches.reduce((sum, b) => sum + b.quantity, 0);
        const projectedSum = currentSum + quantity;

        if (projectedSum > op.totalQuantityOrdered) {
          throw new Error(
            `EXCEEDS_CAPACITY: A soma dos lotes (${projectedSum} pcs) excede o total autorizado na OP (${op.totalQuantityOrdered} pcs). Saldo disponível: ${
              op.totalQuantityOrdered - currentSum
            } pcs.`
          );
        }

        let targetSector = await tx.sector.findUnique({ where: { code: sectorCode } });
        if (!targetSector) {
          targetSector = await tx.sector.findUnique({ where: { code: "SAC_INTERNO" } });
        }
        if (!targetSector) {
          throw new Error("SECTOR_NOT_FOUND: Setor inicial do lote não encontrado.");
        }

        const batchCount = op.batches.length + 1;
        const batchNumber = `${op.opNumber}-L${String(batchCount).padStart(2, "0")}`;

        const newBatch = await tx.opBatch.create({
          data: {
            batchNumber,
            productionOrderId: op.id,
            quantity,
            currentSectorId: targetSector.id,
            batchStatus: "WAITING",
          },
          include: {
            currentSector: true,
          },
        });

        return { op, newBatch, currentSum, projectedSum };
      });

      // Registrar auditoria
      await logAudit({
        userId: req.user?.id,
        action: "CREATE_BATCH",
        entityName: "OpBatch",
        entityId: result.newBatch.id,
        newValues: {
          batchNumber: result.newBatch.batchNumber,
          quantity: result.newBatch.quantity,
          opNumber: result.op.opNumber,
          notes,
        },
      });

      // Notificação restrita aos setores autorizados (Setor do lote, SAC Interno, Vendas, Admin, Gestão)
      const currentSectorCode = result.newBatch.currentSector?.code;
      let targetEmitter = io
        .to("sector_SAC_INTERNO")
        .to("sector_VENDAS")
        .to("sector_ADMIN")
        .to("sector_GESTAO");

      if (currentSectorCode) {
        targetEmitter = targetEmitter.to(`sector_${currentSectorCode}`);
      }

      targetEmitter.emit("batch_created", {
        opId: result.op.id,
        opNumber: result.op.opNumber,
        batch: result.newBatch,
      });

      return res.status(201).json({
        message: "Lote criado com sucesso.",
        batch: result.newBatch,
        totalAllocated: result.projectedSum,
        totalAuthorized: result.op.totalQuantityOrdered,
      });
    } catch (err: any) {
      if (err.message?.startsWith("NOT_FOUND")) {
        return res.status(404).json({ error: err.message.replace("NOT_FOUND: ", "") });
      }
      if (err.message?.startsWith("EXCEEDS_CAPACITY")) {
        return res.status(400).json({ error: err.message.replace("EXCEEDS_CAPACITY: ", "") });
      }
      if (err.message?.startsWith("SECTOR_NOT_FOUND")) {
        return res.status(400).json({ error: err.message.replace("SECTOR_NOT_FOUND: ", "") });
      }
      console.error("Erro ao criar lote:", err);
      return res.status(500).json({ error: "Erro interno ao processar criação de lote." });
    }
  }
);

// Desmembrar/Fracionar um lote existente
batchesRouter.post(
  "/batches/:batchId/split",
  requireRole("GESTOR", "ADMIN", "OPERADOR"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { batchId } = req.params;
      const parseResult = splitBatchSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          error: "Dados inválidos.",
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { splitQuantity, pin, notes } = parseResult.data;

      if (pin) {
        const pinCheck = await assertAndVerifyUserPin(req.user!.id, pin);
        if (!pinCheck.success) {
          return res.status(pinCheck.status).json({ error: pinCheck.error });
        }
      }

      const result = await prisma.$transaction(async (tx) => {
        const sourceBatch = await tx.opBatch.findUnique({
          where: { id: batchId },
          include: {
            currentSector: true,
            productionOrder: {
              include: { batches: true },
            },
          },
        });

        if (!sourceBatch) {
          throw new Error("NOT_FOUND: Lote de origem não encontrado.");
        }

        // RBAC: Operador só pode fracionar lote posicionado no seu setor de lotação
        if (
          req.user!.role === "OPERADOR" &&
          (req.user!.sectorId !== sourceBatch.currentSectorId ||
            (req.user!.sectorCode && sourceBatch.currentSector?.code && req.user!.sectorCode !== sourceBatch.currentSector.code))
        ) {
          throw new Error(
            `FORBIDDEN_SECTOR: Acesso negado: Operadores do setor '${req.user!.sectorCode || "Nenhum"}' não possuem permissão para fracionar lotes posicionados no setor '${sourceBatch.currentSector?.code || sourceBatch.currentSectorId}'.`
          );
        }

        if (splitQuantity >= sourceBatch.quantity) {
          throw new Error(
            `INVALID_SPLIT: A quantidade a desmembrar (${splitQuantity}) deve ser estritamente menor que a quantidade do lote atual (${sourceBatch.quantity}).`
          );
        }

        const remainingQty = sourceBatch.quantity - splitQuantity;

        // Atualizar lote de origem
        const updatedSource = await tx.opBatch.update({
          where: { id: sourceBatch.id },
          data: { quantity: remainingQty },
        });

        // Gerar número para novo sub-lote
        const allBatches = sourceBatch.productionOrder.batches;
        const nextNum = allBatches.length + 1;
        const newBatchNumber = `${sourceBatch.productionOrder.opNumber}-L${String(nextNum).padStart(2, "0")}`;

        const newBatch = await tx.opBatch.create({
          data: {
            batchNumber: newBatchNumber,
            productionOrderId: sourceBatch.productionOrderId,
            quantity: splitQuantity,
            currentSectorId: sourceBatch.currentSectorId,
            batchStatus: sourceBatch.batchStatus,
            parentBatchId: sourceBatch.id,
            subdivisionCode: `Sublote ${nextNum}`,
          },
          include: {
            currentSector: true,
          },
        });

        return { updatedSource, newBatch, op: sourceBatch.productionOrder };
      });

      await logAudit({
        userId: req.user?.id,
        action: "SPLIT_BATCH",
        entityName: "OpBatch",
        entityId: result.newBatch.id,
        oldValues: { sourceBatchId: batchId, previousQty: result.updatedSource.quantity + result.newBatch.quantity },
        newValues: {
          sourceBatchId: batchId,
          sourceRemainingQty: result.updatedSource.quantity,
          newBatchId: result.newBatch.id,
          newBatchNumber: result.newBatch.batchNumber,
          splitQuantity,
          notes,
        },
      });

      const currentSectorCode = result.newBatch.currentSector?.code;
      let targetSplitEmitter = io
        .to("sector_SAC_INTERNO")
        .to("sector_VENDAS")
        .to("sector_ADMIN")
        .to("sector_GESTAO");

      if (currentSectorCode) {
        targetSplitEmitter = targetSplitEmitter.to(`sector_${currentSectorCode}`);
      }

      targetSplitEmitter.emit("batch_split", {
        opId: result.op.id,
        originalBatch: result.updatedSource,
        newBatch: result.newBatch,
      });

      return res.status(201).json({
        message: "Lote desmembrado com sucesso.",
        originalBatch: result.updatedSource,
        newBatch: result.newBatch,
      });
    } catch (err: any) {
      if (err.message?.startsWith("FORBIDDEN_SECTOR")) {
        return res.status(403).json({ error: err.message.replace("FORBIDDEN_SECTOR: ", "") });
      }
      if (err.message?.startsWith("NOT_FOUND")) {
        return res.status(404).json({ error: err.message.replace("NOT_FOUND: ", "") });
      }
      if (err.message?.startsWith("INVALID_SPLIT")) {
        return res.status(400).json({ error: err.message.replace("INVALID_SPLIT: ", "") });
      }
      console.error("Erro ao fracionar lote:", err);
      return res.status(500).json({ error: "Erro interno ao processar fracionamento do lote." });
    }
  }
);

// Atualizar quantidade de um lote (com validação estrita da soma da OP)
batchesRouter.put(
  "/batches/:batchId",
  requireRole("GESTOR", "ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { batchId } = req.params;
      const parseResult = updateBatchSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          error: "Dados inválidos.",
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { quantity } = parseResult.data;

      const result = await prisma.$transaction(async (tx) => {
        const batch = await tx.opBatch.findUnique({
          where: { id: batchId },
          include: {
            productionOrder: {
              include: { batches: true },
            },
          },
        });

        if (!batch) {
          throw new Error("NOT_FOUND: Lote não encontrado.");
        }

        const op = batch.productionOrder;
        const otherBatchesSum = op.batches
          .filter((b) => b.id !== batch.id)
          .reduce((sum, b) => sum + b.quantity, 0);

        const projectedSum = otherBatchesSum + quantity;

        if (projectedSum > op.totalQuantityOrdered) {
          throw new Error(
            `EXCEEDS_CAPACITY: A nova quantidade (${quantity}) faria o total da OP atingir ${projectedSum} pcs, excedendo o limite de ${op.totalQuantityOrdered} pcs.`
          );
        }

        const updated = await tx.opBatch.update({
          where: { id: batchId },
          data: { quantity },
        });

        return { updated, op, projectedSum };
      });

      await logAudit({
        userId: req.user?.id,
        action: "UPDATE_BATCH_QUANTITY",
        entityName: "OpBatch",
        entityId: batchId,
        newValues: { quantity, totalAllocated: result.projectedSum },
      });

      return res.json({
        message: "Quantidade do lote atualizada com sucesso.",
        batch: result.updated,
        totalAllocated: result.projectedSum,
      });
    } catch (err: any) {
      if (err.message?.startsWith("NOT_FOUND")) {
        return res.status(404).json({ error: err.message.replace("NOT_FOUND: ", "") });
      }
      if (err.message?.startsWith("EXCEEDS_CAPACITY")) {
        return res.status(400).json({ error: err.message.replace("EXCEEDS_CAPACITY: ", "") });
      }
      console.error("Erro ao atualizar lote:", err);
      return res.status(500).json({ error: "Erro interno ao atualizar lote." });
    }
  }
);

// Desmembrar/Subdividir uma OP inteira em N sublotes (ex: OP - 2001 - 1/5, OP - 2001 - 2/5, etc.)
batchesRouter.post(
  ["/production-orders/:opId/subdivide", "/batches/production-orders/:opId/subdivide"],
  requireRole("GESTOR", "ADMIN"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { opId } = req.params;
      const parseResult = subdivideOpSchema.safeParse(req.body);

      if (!parseResult.success) {
        return res.status(400).json({
          error: "Dados de desmembramento inválidos.",
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const { subdivisions, pin, notes } = parseResult.data;

      // 1. Validar PIN do usuário
      const pinCheck = await assertAndVerifyUserPin(req.user!.id, pin);
      if (!pinCheck.success) {
        return res.status(pinCheck.status).json({ error: pinCheck.error });
      }

      // 2. Buscar OP e verificar quantidades
      const op = await prisma.productionOrder.findUnique({
        where: { id: opId },
        include: {
          batches: {
            include: { currentSector: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!op) {
        return res.status(404).json({ error: "Ordem de Produção não encontrada." });
      }

      const totalSubdivided = subdivisions.reduce((sum, item) => sum + item.quantity, 0);
      if (totalSubdivided !== op.totalQuantityOrdered) {
        return res.status(400).json({
          error: `A soma das quantidades dos sublotes (${totalSubdivided} pcs) deve ser exatamente igual ao total encomendado na OP (${op.totalQuantityOrdered} pcs).`,
        });
      }

      const totalParts = subdivisions.length;

      // 3. Execução transacional para conservação e rastreabilidade estrita
      const result = await prisma.$transaction(async (tx) => {
        const createdBatches = [];
        const initialBatch = op.batches[0];

        // Se houver lote inicial único, reaproveitamos como parte 1/N preservando seu ID e histórico
        if (initialBatch && op.batches.length === 1) {
          const part1 = subdivisions[0];
          const part1Number = `${op.opNumber} - 1/${totalParts}`;
          const updatedFirst = await tx.opBatch.update({
            where: { id: initialBatch.id },
            data: {
              batchNumber: part1Number,
              subdivisionCode: `1/${totalParts}`,
              quantity: part1.quantity,
              sizeGridJson: part1.sizeGrid ? JSON.stringify(part1.sizeGrid) : null,
            },
            include: { currentSector: true },
          });
          createdBatches.push(updatedFirst);

          // Criar partes 2 a N
          for (let i = 1; i < totalParts; i++) {
            const part = subdivisions[i];
            const partNumber = `${op.opNumber} - ${i + 1}/${totalParts}`;
            const newSubBatch = await tx.opBatch.create({
              data: {
                batchNumber: partNumber,
                subdivisionCode: `${i + 1}/${totalParts}`,
                parentBatchId: initialBatch.id,
                productionOrderId: op.id,
                quantity: part.quantity,
                sizeGridJson: part.sizeGrid ? JSON.stringify(part.sizeGrid) : null,
                currentSectorId: initialBatch.currentSectorId,
                batchStatus: initialBatch.batchStatus,
              },
              include: { currentSector: true },
            });
            createdBatches.push(newSubBatch);
          }
        } else {
          // Se não há lotes ou se já há lotes, determinar setor padrão
          const sacSector = await tx.sector.findUnique({ where: { code: "SAC_INTERNO" } });
          const defaultSectorId = op.batches[0]?.currentSectorId || sacSector?.id;

          if (!defaultSectorId) {
            throw new Error("Não foi possível determinar o setor para os sublotes.");
          }

          // Se já haviam múltiplos lotes e estamos redividindo
          for (let i = 0; i < totalParts; i++) {
            const part = subdivisions[i];
            const partNumber = `${op.opNumber} - ${i + 1}/${totalParts}`;
            const newSubBatch = await tx.opBatch.create({
              data: {
                batchNumber: partNumber,
                subdivisionCode: `${i + 1}/${totalParts}`,
                productionOrderId: op.id,
                quantity: part.quantity,
                sizeGridJson: part.sizeGrid ? JSON.stringify(part.sizeGrid) : null,
                currentSectorId: defaultSectorId,
                batchStatus: "WAITING",
              },
              include: { currentSector: true },
            });
            createdBatches.push(newSubBatch);
          }
        }

        return { op, createdBatches };
      });

      // 4. Registrar em auditoria
      await logAudit({
        userId: req.user!.id,
        action: "SUBDIVIDE_OP_BATCHES",
        entityName: "ProductionOrder",
        entityId: op.id,
        newValues: {
          opNumber: op.opNumber,
          totalParts,
          totalQuantity: op.totalQuantityOrdered,
          sublots: result.createdBatches.map((b) => ({
            id: b.id,
            batchNumber: b.batchNumber,
            quantity: b.quantity,
          })),
          notes,
        },
      });

      // 5. Emitir evento Socket.io
      io.to("sector_ADMIN")
        .to("sector_GESTAO")
        .to("sector_SAC_INTERNO")
        .emit("op_subdivided", {
          opId: op.id,
          opNumber: op.opNumber,
          totalParts,
          batches: result.createdBatches,
        });

      return res.status(201).json({
        success: true,
        message: `OP ${op.opNumber} desmembrada com sucesso em ${totalParts} sublotes.`,
        opNumber: op.opNumber,
        totalQuantityOrdered: op.totalQuantityOrdered,
        totalParts,
        batches: result.createdBatches,
      });
    } catch (err: any) {
      console.error("Erro ao desmembrar OP:", err);
      return res.status(500).json({ error: err.message || "Erro interno ao desmembrar OP." });
    }
  }
);
