import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../middleware/auth.js";
import { generateDigitalSignature } from "../utils/security.js";
import { logAudit } from "../utils/audit.js";
import { io } from "../server.js";

export const conversionRouter = Router();

conversionRouter.use(authenticateToken);

const convertSchema = z.object({
  promisedDeliveryDate: z.string().min(1, "Prazo final de entrega acordado é obrigatório."),
  finalNegotiatedAmount: z.number().min(0).optional(),
  technicalNotes: z.string().optional(),
});

// Gera número sequencial de OP único atômico: OP - 2001, OP - 2002, OP - 2003...
export async function generateNextOpNumber(tx?: any): Promise<string> {
  const db = tx || prisma;
  const allOps = await db.productionOrder.findMany({
    select: { opNumber: true },
  });

  let maxSequence = 2000;
  for (const op of allOps) {
    if (op.opNumber) {
      const match = op.opNumber.match(/^OP\s*-\s*(\d+)$/i);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed > maxSequence) {
          maxSequence = parsed;
        }
      }
    }
  }

  let nextSequence = maxSequence + 1;
  let candidate = `OP - ${nextSequence}`;

  while (await db.productionOrder.findUnique({ where: { opNumber: candidate } })) {
    nextSequence++;
    candidate = `OP - ${nextSequence}`;
  }

  return candidate;
}

// POST /api/quotations/:id/convert-to-op
conversionRouter.post(
  "/:id/convert-to-op",
  requireRole("VENDEDOR", "ADMIN", "GESTOR"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const parseResult = convertSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.errors[0].message });
        return;
      }

      const quotation: any = await prisma.quotation.findUnique({
        where: { id },
        include: {
          customer: true,
          items: true,
          designBrief: {
            include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
          },
          productionOrder: true,
        },
      });

      if (!quotation) {
        res.status(404).json({ error: "Orçamento não encontrado." });
        return;
      }

      // Validação de isolamento horizontal: apenas o vendedor responsável ou gestão/admin podem converter
      if (req.user!.role === "VENDEDOR" && quotation.sellerId !== req.user!.id) {
        res.status(403).json({
          error: "Acesso negado: Você não é o vendedor responsável por esta ficha.",
        });
        return;
      }

      // REGRA DE NEGÓCIO 1: Prevenção de duplicação de OP
      if (quotation.productionOrder || quotation.status === "CONVERTIDA_VENDA") {
        res.status(409).json({
          error: `Este orçamento já foi convertido anteriormente na OP ${quotation.productionOrder?.opNumber || ""}.`,
        });
        return;
      }

      // REGRA DE NEGÓCIO 2: Bloqueio de conversão sem aprovação de arte
      if (!quotation.isArtworkApproved) {
        res.status(400).json({
          error: "Conversão bloqueada: A arte deste pedido precisa ser formalmente aprovada pelo cliente antes de gerar a OP.",
        });
        return;
      }

      // REGRA DE NEGÓCIO 3: Autorização obrigatória por PIN para pedidos abaixo de 10 peças
      if (quotation.totalQuantity < 10) {
        if (!quotation.minQtyAuthorizedById || quotation.minQtyApprovedQuantity !== quotation.totalQuantity) {
          res.status(400).json({
            error: `Conversão bloqueada: Esta ficha possui quantidade abaixo de 10 peças (${quotation.totalQuantity} peças) e não possui autorização por PIN de gestor/administrador válida para esta quantidade.`,
          });
          return;
        }
      }

      const latestArtwork = quotation.designBrief?.versions[0];
      const approvedArtworkUrl = latestArtwork?.vectorUrl || latestArtwork?.previewUrl || "";

      // Obter os setores 03 (Vendas) e 04 (SAC Interno)
      const vendasSector = await prisma.sector.findUnique({ where: { code: "VENDAS" } });
      const sacSector = await prisma.sector.findUnique({ where: { code: "SAC_INTERNO" } });

      if (!vendasSector || !sacSector) {
        res.status(500).json({ error: "Setores fabris Vendas ou SAC Interno não cadastrados no banco." });
        return;
      }

      const opNumber = await generateNextOpNumber();
      const batchNumber = `${opNumber} - 1/1`;
      const finalAmount = parseResult.data.finalNegotiatedAmount ?? quotation.budgetAmount;

      // Executar transação atômica completa com prevenção de concorrência e idempotência
      const result = await prisma.$transaction(async (tx) => {
        // Validação atômica sob lock transacional para impedir conversões duplicadas ou simultâneas
        const fresh = await tx.quotation.findUnique({
          where: { id: quotation.id },
          include: { productionOrder: true },
        });

        if (fresh?.productionOrder || fresh?.status === "CONVERTIDA_VENDA") {
          const err: any = new Error(
            `Este orçamento já foi convertido anteriormente na OP ${fresh?.productionOrder?.opNumber || ""}.`
          );
          err.code = "ALREADY_CONVERTED";
          throw err;
        }

        // 1. Criar a Ordem de Produção Principal
        const op = await tx.productionOrder.create({
          data: {
            opNumber,
            customerId: quotation.customerId,
            quotationId: quotation.id,
            title: `${quotation.teamName} - ${quotation.totalQuantity} pcs`,
            productType: quotation.productsSummary || "Uniformes Personalizados",
            totalQuantityOrdered: quotation.totalQuantity,
            totalQuantityDone: 0,
            priority: "NORMAL",
            status: "ACTIVE",
            promisedDeliveryDate: new Date(parseResult.data.promisedDeliveryDate),
            technicalNotes: parseResult.data.technicalNotes || quotation.observations,
            artworkUrl: approvedArtworkUrl,
            sacApprovalStatus: "PENDING_REVIEW",
          },
        });

        // 2. Criar o primeiro lote da OP com saldo integral
        const batch = await tx.opBatch.create({
          data: {
            batchNumber,
            subdivisionCode: "1/1",
            productionOrderId: op.id,
            quantity: quotation.totalQuantity,
            currentSectorId: sacSector.id,
            batchStatus: "WAITING",
          },
        });

        // 3. Registrar a movimentação de Vendas para SAC Interno com assinatura
        const nowIso = new Date().toISOString();
        const signatureHash = generateDigitalSignature({
          batchId: batch.id,
          operatorId: req.user!.id,
          fromSectorId: vendasSector.id,
          toSectorId: sacSector.id,
          timestamp: nowIso,
        });

        await tx.opMovement.create({
          data: {
            opBatchId: batch.id,
            fromSectorId: vendasSector.id,
            toSectorId: sacSector.id,
            operatorId: req.user!.id,
            receivedAt: new Date(),
            startedAt: new Date(),
            finishedAt: new Date(),
            digitalSignatureHash: signatureHash,
            signerPinVerified: true,
            notes: `OP gerada a partir do orçamento ${quotation.quotationNumber}. Encaminhada para conferência técnica do SAC Interno.`,
            movementType: "FORWARD",
          },
        });

        // 4. Atualizar o Orçamento para CONVERTIDA_VENDA
        await tx.quotation.update({
          where: { id: quotation.id },
          data: {
            status: "CONVERTIDA_VENDA",
            budgetAmount: finalAmount,
            timeline: {
              create: {
                fromStatus: quotation.status,
                toStatus: "CONVERTIDA_VENDA",
                userId: req.user!.id,
                notes: `Orçamento convertido com sucesso na OP oficial ${opNumber}.`,
              },
            },
          },
        });

        return { op, batch };
      });

      // Registrar auditoria
      await logAudit({
        userId: req.user!.id,
        action: "QUOTATION_CONVERTED_TO_OP",
        entityName: "ProductionOrder",
        entityId: result.op.id,
        newValues: {
          opNumber: result.op.opNumber,
          quotationId: quotation.id,
          totalQuantity: quotation.totalQuantity,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      // Notificar em tempo real o painel do SAC Interno via WebSocket
      io.to("sector_SAC_INTERNO").emit("new_op_received", {
        opId: result.op.id,
        opNumber: result.op.opNumber,
        batchNumber: result.batch.batchNumber,
        teamName: quotation.teamName,
        totalQuantity: quotation.totalQuantity,
      });

      res.status(201).json({
        success: true,
        message: `Orçamento convertido com sucesso! OP ${opNumber} gerada e enviada para o SAC Interno.`,
        productionOrder: result.op,
        initialBatch: result.batch,
      });
    } catch (error: any) {
      if (error?.code === "ALREADY_CONVERTED" || error?.code === "P2002") {
        res.status(409).json({
          error: error.message || "Este orçamento já foi convertido anteriormente em Ordem de Produção.",
        });
        return;
      }
      console.error("Erro na conversão para OP:", error);
      res.status(500).json({ error: "Erro interno ao converter pedido em Ordem de Produção." });
    }
  }
);
