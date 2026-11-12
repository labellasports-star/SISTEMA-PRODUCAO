import { Router, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../prisma.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { verifyPin, generateDigitalSignature, assertAndVerifyUserPin } from "../utils/security.js";
import { logAudit } from "../utils/audit.js";
import { io } from "../server.js";

export const expedicaoRouter = Router();

expedicaoRouter.use(authenticateToken);

// Helper RBAC para Setor 14 (Expedição, Embalagem e Entrega)
function hasExpedicaoAccess(user: AuthenticatedRequest["user"]): boolean {
  if (!user) return false;
  if (user.role === "ADMIN" || user.role === "GESTOR") return true;
  if (user.role === "OPERADOR" && user.sectorCode === "EXPEDICAO") {
    return true;
  }
  return false;
}

// -----------------------------------------------------------------------------
// 1. REGISTRO DE VOLUMES DE UM LOTE (SETOR 14 - EXPEDICAO)
// -----------------------------------------------------------------------------

const volumeItemSchema = z.object({
  volumeNumber: z.number().int().min(1, "Número do volume deve ser maior que zero."),
  sizeBreakdown: z.record(z.string(), z.number().int().min(0)),
  weightKg: z.number().min(0).optional(),
});

const registerVolumesSchema = z.object({
  volumes: z.array(volumeItemSchema).min(1, "É obrigatório informar ao menos um volume."),
  pin: z.string().min(4, "PIN de 4 a 8 dígitos é obrigatório.").optional(),
});

// POST /api/production/batches/:batchId/volumes
expedicaoRouter.post("/batches/:batchId/volumes", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId } = req.params;
    const user = req.user!;

    // 1. RBAC estrito verificado antes de validar corpo
    if (!hasExpedicaoAccess(user)) {
      return res.status(403).json({
        error: `Acesso negado: O setor ou perfil '${user.sectorCode || user.role}' não possui permissão para registrar volumes de expedição.`,
      });
    }

    const parseResult = registerVolumesSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Dados de volumes inválidos.",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { volumes, pin } = parseResult.data;

    if (pin) {
      const pinResult = await assertAndVerifyUserPin(user.id, pin);
      if (!pinResult.success) {
        return res.status(pinResult.status).json({ error: pinResult.error });
      }
    }

    // 2. Buscar lote
    const batch = await prisma.opBatch.findUnique({
      where: { id: batchId },
      include: {
        currentSector: true,
        productionOrder: true,
        packageVolumes: true,
      },
    });

    if (!batch) {
      return res.status(404).json({ error: "Lote não encontrado." });
    }

    const isExpedicaoSector =
      batch.currentSector.code === "EXPEDICAO" ||
      batch.currentSector.sequenceOrder === 14;

    if (!isExpedicaoSector) {
      return res.status(400).json({
        error: `Operação bloqueada: O lote ${batch.batchNumber} está no setor '${batch.currentSector.name}' e não em Expedição / Entrega.`,
      });
    }

    // 3. Validação de Coerência: soma das peças de todos os volumes deve igualar a quantidade do lote
    let totalPiecesVolumes = 0;
    for (const vol of volumes) {
      const volQty = Object.values(vol.sizeBreakdown).reduce((sum, q) => sum + q, 0);
      if (volQty <= 0) {
        return res.status(400).json({
          error: `Volume ${vol.volumeNumber} inválido: A quantidade de peças do volume deve ser maior que zero.`,
        });
      }
      totalPiecesVolumes += volQty;
    }

    if (totalPiecesVolumes !== batch.quantity) {
      return res.status(400).json({
        error: `Incoerência de volumes: A soma das peças dos volumes (${totalPiecesVolumes}) difere da quantidade total do lote (${batch.quantity}).`,
      });
    }

    // 4. Gravação atômica dos volumes
    const createdVolumes = await prisma.$transaction(async (tx) => {
      // Remove volumes não vinculados a romaneio de entrega anteriores
      await tx.packageVolume.deleteMany({
        where: { opBatchId: batch.id, deliveryManifestId: null },
      });

      const newVols = [];
      for (const v of volumes) {
        const volQty = Object.values(v.sizeBreakdown).reduce((sum, q) => sum + q, 0);
        const randomHex = crypto.randomBytes(3).toString("hex").toUpperCase();
        const labelQrCode = `VOL-${batch.batchNumber}-V${String(v.volumeNumber).padStart(2, "0")}-${randomHex}`;

        const pv = await tx.packageVolume.create({
          data: {
            opBatchId: batch.id,
            volumeNumber: v.volumeNumber,
            labelQrCode,
            sizeBreakdown: JSON.stringify(v.sizeBreakdown),
            quantity: volQty,
            weightKg: v.weightKg || null,
            createdById: user.id,
          },
        });
        newVols.push(pv);
      }

      // Se o lote estiver PENDING, atualiza para IN_PROGRESS
      if (batch.batchStatus === "PENDING" || batch.batchStatus === "WAITING") {
        await tx.opBatch.update({
          where: { id: batch.id },
          data: { batchStatus: "IN_PROGRESS" },
        });
      }

      return newVols;
    });

    // 5. Auditoria imutável
    await logAudit({
      userId: user.id,
      action: "PACKAGE_VOLUMES_REGISTERED",
      entityName: "OpBatch",
      entityId: batch.id,
      newValues: {
        batchNumber: batch.batchNumber,
        totalVolumes: createdVolumes.length,
        totalPieces: totalPiecesVolumes,
      },
    });

    return res.status(201).json({
      message: `${createdVolumes.length} volumes registrados com sucesso para o lote ${batch.batchNumber}.`,
      volumes: createdVolumes,
    });
  } catch (err: any) {
    console.error("Erro ao registrar volumes de expedição:", err);
    return res.status(500).json({ error: "Erro interno ao registrar volumes." });
  }
});

// -----------------------------------------------------------------------------
// 2. GERAÇÃO DE ROMANEIO DE ENTREGA (DELIVERY MANIFEST)
// -----------------------------------------------------------------------------

const createDeliveryManifestSchema = z.object({
  carrierName: z.string().min(2, "Nome da transportadora ou entregador é obrigatório."),
  carrierDocument: z.string().optional(),
  carrierPhone: z.string().optional(),
  pin: z.string().min(4, "PIN de 4 a 8 dígitos é obrigatório.").optional(),
  notes: z.string().optional(),
});

// POST /api/production/batches/:batchId/delivery-manifest
expedicaoRouter.post("/batches/:batchId/delivery-manifest", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId } = req.params;
    const user = req.user!;

    if (!hasExpedicaoAccess(user)) {
      return res.status(403).json({
        error: `Acesso negado: O setor ou perfil '${user.sectorCode || user.role}' não possui permissão para gerar romaneios de entrega.`,
      });
    }

    const parseResult = createDeliveryManifestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Dados do romaneio de entrega inválidos.",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { carrierName, carrierDocument, carrierPhone, pin, notes } = parseResult.data;

    if (pin) {
      const pinResult = await assertAndVerifyUserPin(user.id, pin);
      if (!pinResult.success) {
        return res.status(pinResult.status).json({ error: pinResult.error });
      }
    }

    const batch = await prisma.opBatch.findUnique({
      where: { id: batchId },
      include: {
        currentSector: true,
        productionOrder: {
          include: { customer: true },
        },
        packageVolumes: {
          where: { deliveryManifestId: null },
        },
      },
    });

    if (!batch) {
      return res.status(404).json({ error: "Lote não encontrado." });
    }

    if (batch.packageVolumes.length === 0) {
      return res.status(400).json({
        error: "É obrigatório registrar os volumes do lote antes de gerar o romaneio de entrega.",
      });
    }

    // Gerar número sequencial único RD-YYYY-XXXXX
    const year = new Date().getFullYear();
    const manifestPrefix = `RD-${year}-`;
    const countThisYear = await prisma.deliveryManifest.count({
      where: { manifestNumber: { startsWith: manifestPrefix } },
    });

    let manifestNumber = `${manifestPrefix}${String(countThisYear + 1).padStart(5, "0")}`;
    let exists = await prisma.deliveryManifest.findUnique({ where: { manifestNumber } });
    let counterOffset = 1;
    while (exists) {
      manifestNumber = `${manifestPrefix}${String(countThisYear + 1 + counterOffset).padStart(5, "0")}`;
      exists = await prisma.deliveryManifest.findUnique({ where: { manifestNumber } });
      counterOffset++;
    }

    // Consolidar grade e total a partir dos volumes
    const consolidatedGrid: Record<string, number> = {};
    let totalPieces = 0;

    for (const v of batch.packageVolumes) {
      totalPieces += v.quantity;
      try {
        const grid = JSON.parse(v.sizeBreakdown);
        for (const [sz, qty] of Object.entries(grid)) {
          consolidatedGrid[sz] = (consolidatedGrid[sz] || 0) + Number(qty);
        }
      } catch (_) {}
    }

    const nowIso = new Date().toISOString();

    // Assinatura digital HMAC-SHA-256 no servidor
    const signatureHash = generateDigitalSignature({
      batchId: batch.id,
      operatorId: user.id,
      fromSectorId: batch.currentSectorId,
      toSectorId: batch.currentSectorId,
      timestamp: nowIso,
    });

    const qrPayload = JSON.stringify({
      manifestNumber,
      opNumber: batch.productionOrder.opNumber,
      batchNumber: batch.batchNumber,
      customer: batch.productionOrder.customer.companyName,
      totalQuantity: totalPieces,
      volumesCount: batch.packageVolumes.length,
      carrierName,
      issuedAt: nowIso,
      signatureHash,
    });

    const manifest = await prisma.$transaction(async (tx) => {
      const dm = await tx.deliveryManifest.create({
        data: {
          manifestNumber,
          productionOrderId: batch.productionOrderId,
          opBatchId: batch.id,
          customerId: batch.productionOrder.customerId,
          totalQuantity: totalPieces,
          sizeGridBreakdown: JSON.stringify(consolidatedGrid),
          carrierName,
          carrierDocument: carrierDocument || null,
          carrierPhone: carrierPhone || null,
          notes: notes || null,
          digitalSignatureHash: signatureHash,
          qrPayload,
          dispatchedById: user.id,
        },
      });

      // Vincular volumes ao romaneio
      await tx.packageVolume.updateMany({
        where: { id: { in: batch.packageVolumes.map((v) => v.id) } },
        data: { deliveryManifestId: dm.id },
      });

      return dm;
    });

    await logAudit({
      userId: user.id,
      action: "DELIVERY_MANIFEST_CREATED",
      entityName: "DeliveryManifest",
      entityId: manifest.id,
      newValues: {
        manifestNumber: manifest.manifestNumber,
        batchNumber: batch.batchNumber,
        carrierName,
        totalQuantity: totalPieces,
        signatureHash,
      },
    });

    io.to("sector_EXPEDICAO").to("sector_ADMIN").to("sector_GESTAO").emit("delivery_manifest_created", {
      manifestId: manifest.id,
      manifestNumber: manifest.manifestNumber,
      batchNumber: batch.batchNumber,
      totalQuantity: totalPieces,
    });

    return res.status(201).json({
      message: `Romaneio de Entrega ${manifest.manifestNumber} gerado com sucesso!`,
      manifest,
    });
  } catch (err: any) {
    console.error("Erro ao gerar romaneio de entrega:", err);
    return res.status(500).json({ error: "Erro interno ao gerar romaneio de entrega." });
  }
});

// -----------------------------------------------------------------------------
// 3. CONSULTA E REIMPRESSÃO DE ROMANEIO DE ENTREGA
// -----------------------------------------------------------------------------

// GET /api/production/delivery-manifests/:manifestId
expedicaoRouter.get("/delivery-manifests/:manifestId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { manifestId } = req.params;
    const user = req.user!;

    if (!hasExpedicaoAccess(user)) {
      return res.status(403).json({
        error: `Acesso negado: O setor ou perfil '${user.sectorCode || user.role}' não possui permissão para consultar romaneios de entrega.`,
      });
    }

    const manifest = await prisma.deliveryManifest.findUnique({
      where: { id: manifestId },
      include: {
        customer: true,
        productionOrder: true,
        opBatch: true,
        volumes: {
          include: { createdBy: { select: { id: true, name: true } } },
        },
        dispatchedBy: { select: { id: true, name: true, role: true } },
        lastReprintBy: { select: { id: true, name: true, role: true } },
      },
    });

    if (!manifest) {
      return res.status(404).json({ error: "Romaneio de entrega não encontrado." });
    }

    return res.json({ manifest });
  } catch (err: any) {
    console.error("Erro ao consultar romaneio de entrega:", err);
    return res.status(500).json({ error: "Erro interno ao consultar romaneio de entrega." });
  }
});

// POST /api/production/delivery-manifests/:manifestId/reprint
expedicaoRouter.post("/delivery-manifests/:manifestId/reprint", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { manifestId } = req.params;
    const user = req.user!;

    if (!hasExpedicaoAccess(user)) {
      return res.status(403).json({
        error: `Acesso negado: O setor ou perfil '${user.sectorCode || user.role}' não possui permissão para reimprimir romaneios de entrega.`,
      });
    }

    const manifest = await prisma.deliveryManifest.findUnique({
      where: { id: manifestId },
    });

    if (!manifest) {
      return res.status(404).json({ error: "Romaneio de entrega não encontrado." });
    }

    const updated = await prisma.deliveryManifest.update({
      where: { id: manifestId },
      data: {
        reprintCount: manifest.reprintCount + 1,
        lastReprintAt: new Date(),
        lastReprintById: user.id,
      },
    });

    await logAudit({
      userId: user.id,
      action: "DELIVERY_MANIFEST_REPRINTED",
      entityName: "DeliveryManifest",
      entityId: manifest.id,
      newValues: {
        manifestNumber: manifest.manifestNumber,
        newReprintCount: updated.reprintCount,
      },
    });

    return res.json({
      message: `Reimpressão registrada com sucesso (Cópia #${updated.reprintCount}).`,
      manifest: updated,
    });
  } catch (err: any) {
    console.error("Erro ao reimprimir romaneio de entrega:", err);
    return res.status(500).json({ error: "Erro interno ao processar reimpressão." });
  }
});

// -----------------------------------------------------------------------------
// 4. BAIXA DA ENTREGA (DELIVERED) COM PIN E FECHAMENTO DA OP
// -----------------------------------------------------------------------------

const deliverManifestSchema = z.object({
  pin: z.string().min(4, "PIN de assinatura digital é obrigatório."),
  deliveredRecipient: z.string().min(2, "Nome da pessoa que recebeu a entrega é obrigatório."),
  notes: z.string().optional(),
  deliveredAt: z.string().optional(),
});

// POST /api/production/delivery-manifests/:manifestId/deliver
expedicaoRouter.post("/delivery-manifests/:manifestId/deliver", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { manifestId } = req.params;
    const user = req.user!;

    if (!hasExpedicaoAccess(user)) {
      return res.status(403).json({
        error: `Acesso negado: O setor ou perfil '${user.sectorCode || user.role}' não possui permissão para dar baixa em entregas.`,
      });
    }

    const parseResult = deliverManifestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Dados de confirmação da entrega inválidos.",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { pin, deliveredRecipient, notes, deliveredAt } = parseResult.data;

    // 1. Validar PIN do expedidor
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !dbUser.signaturePinHash) {
      return res.status(403).json({ error: "Expedidor não possui PIN de assinatura digital cadastrado." });
    }

    const isPinValid = await verifyPin(pin, dbUser.signaturePinHash);
    if (!isPinValid) {
      return res.status(403).json({ error: "PIN de assinatura incorreto. Baixa de entrega negada." });
    }

    // 2. Buscar manifesto de entrega
    const manifest = await prisma.deliveryManifest.findUnique({
      where: { id: manifestId },
      include: {
        opBatch: { include: { currentSector: true } },
        productionOrder: {
          include: { batches: true },
        },
      },
    });

    if (!manifest) {
      return res.status(404).json({ error: "Romaneio de entrega não encontrado." });
    }

    if (manifest.isDelivered) {
      return res.status(400).json({ error: "Este romaneio de entrega já foi baixado anteriormente." });
    }

    const nowIso = new Date().toISOString();
    const deliveryTimestamp = deliveredAt ? new Date(deliveredAt) : new Date();

    const transactionResult = await prisma.$transaction(async (tx) => {
      // Assinatura digital da entrega
      const deliverySigHash = generateDigitalSignature({
        batchId: manifest.opBatchId || manifest.id,
        operatorId: user.id,
        fromSectorId: manifest.opBatch?.currentSectorId || manifest.id,
        toSectorId: manifest.opBatch?.currentSectorId || manifest.id,
        timestamp: nowIso,
      });

      // Atualiza o manifesto de entrega
      const updatedManifest = await tx.deliveryManifest.update({
        where: { id: manifest.id },
        data: {
          isDelivered: true,
          deliveredAt: deliveryTimestamp,
          deliveredRecipient,
          deliveredNotes: notes || null,
          digitalSignatureHash: deliverySigHash,
        },
      });

      // Atualiza o lote para DELIVERED
      let updatedBatch = null;
      if (manifest.opBatchId) {
        updatedBatch = await tx.opBatch.update({
          where: { id: manifest.opBatchId },
          data: {
            batchStatus: "DELIVERED",
            assignedOperatorId: null,
          },
        });

        // Registra movimentação de entrega final
        await tx.opMovement.create({
          data: {
            opBatchId: manifest.opBatchId,
            fromSectorId: manifest.opBatch!.currentSectorId,
            toSectorId: manifest.opBatch!.currentSectorId,
            operatorId: user.id,
            movementType: "FORWARD",
            receivedAt: manifest.opBatch!.updatedAt,
            finishedAt: deliveryTimestamp,
            digitalSignatureHash: deliverySigHash,
            signerPinVerified: true,
            notes: JSON.stringify({
              action: "DELIVERY_COMPLETED",
              recipient: deliveredRecipient,
              manifestNumber: manifest.manifestNumber,
            }),
          },
        });
      }

      // 3. Regra de Fechamento da OP:
      // A OP só fecha quando TODOS os lotes e sublotes estiverem com status DELIVERED.
      // Se houver qualquer lote em setor anterior ou em retrabalho, a OP NÃO pode fechar!
      const allBatchesOfOrder = await tx.opBatch.findMany({
        where: { productionOrderId: manifest.productionOrderId },
      });

      const allDelivered = allBatchesOfOrder.every(
        (b) => b.batchStatus === "DELIVERED" && !b.isUnderRework
      );

      let orderClosed = false;
      let updatedOrder = null;

      if (allDelivered && allBatchesOfOrder.length > 0) {
        const totalDeliveredQty = allBatchesOfOrder.reduce((sum, b) => sum + b.quantity, 0);

        updatedOrder = await tx.productionOrder.update({
          where: { id: manifest.productionOrderId },
          data: {
            status: "COMPLETED",
            totalQuantityDone: totalDeliveredQty,
            totalQuantityDelivered: totalDeliveredQty,
          },
        });
        orderClosed = true;

        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "PRODUCTION_ORDER_COMPLETED",
            entityName: "ProductionOrder",
            entityId: manifest.productionOrderId,
            newValues: JSON.stringify({
              opNumber: manifest.productionOrder.opNumber,
              totalQuantityDelivered: totalDeliveredQty,
              allBatchesCount: allBatchesOfOrder.length,
              closedByManifest: manifest.manifestNumber,
            }),
            ipAddress: "127.0.0.1",
            userAgent: "PCP Industrial Expedição",
          },
        });
      }

      return { updatedManifest, updatedBatch, orderClosed, updatedOrder };
    });

    await logAudit({
      userId: user.id,
      action: "DELIVERY_COMPLETED",
      entityName: "DeliveryManifest",
      entityId: manifest.id,
      newValues: {
        manifestNumber: manifest.manifestNumber,
        deliveredRecipient,
        orderClosed: transactionResult.orderClosed,
      },
    });

    io.to("sector_EXPEDICAO").to("sector_ADMIN").to("sector_GESTAO").emit("delivery_completed", {
      manifestId: manifest.id,
      manifestNumber: manifest.manifestNumber,
      orderClosed: transactionResult.orderClosed,
    });

    return res.json({
      message: transactionResult.orderClosed
        ? `Entrega confirmada com sucesso! Todos os lotes foram entregues e a OP ${manifest.productionOrder.opNumber} foi CONCLUÍDA!`
        : `Entrega confirmada para o romaneio ${manifest.manifestNumber}. Lote marcado como entregue.`,
      manifest: transactionResult.updatedManifest,
      orderClosed: transactionResult.orderClosed,
      order: transactionResult.updatedOrder,
    });
  } catch (err: any) {
    console.error("Erro ao dar baixa na entrega:", err);
    return res.status(500).json({ error: "Erro interno ao registrar baixa da entrega." });
  }
});

// -----------------------------------------------------------------------------
// 5. REABERTURA DE OP FECHADA (ESTRITAMENTE ADMIN)
// -----------------------------------------------------------------------------

const reopenOrderSchema = z.object({
  justification: z.string().min(5, "Justificativa detalhada de reabertura é obrigatória (mínimo 5 caracteres)."),
});

// POST /api/production/orders/:orderId/reopen
expedicaoRouter.post("/orders/:orderId/reopen", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const user = req.user!;

    // Restrição: Apenas ADMIN pode reabrir OP concluída
    if (user.role !== "ADMIN") {
      return res.status(403).json({
        error: "Acesso negado: Apenas administradores do sistema podem reabrir ordens de produção concluídas.",
      });
    }

    const parseResult = reopenOrderSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Justificativa de reabertura inválida.",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { justification } = parseResult.data;

    const order = await prisma.productionOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({ error: "Ordem de Produção não encontrada." });
    }

    if (order.status !== "COMPLETED") {
      return res.status(400).json({
        error: `A OP ${order.opNumber} não está concluída (status atual: '${order.status}'). Apenas OPs concluídas podem ser reabertas.`,
      });
    }

    const updated = await prisma.productionOrder.update({
      where: { id: orderId },
      data: { status: "ACTIVE" },
    });

    await logAudit({
      userId: user.id,
      action: "PRODUCTION_ORDER_REOPENED",
      entityName: "ProductionOrder",
      entityId: order.id,
      oldValues: { status: "COMPLETED" },
      newValues: { status: "ACTIVE", justification },
    });

    io.to("sector_ADMIN").to("sector_GESTAO").emit("order_reopened", {
      orderId: order.id,
      opNumber: order.opNumber,
      reopenedBy: user.name,
      justification,
    });

    return res.json({
      message: `Ordem de Produção ${order.opNumber} reaberta com sucesso pelo Administrador.`,
      order: updated,
    });
  } catch (err: any) {
    console.error("Erro ao reabrir OP:", err);
    return res.status(500).json({ error: "Erro interno ao reabrir Ordem de Produção." });
  }
});
