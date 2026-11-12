import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../middleware/auth.js";
import { generateDigitalSignature, verifyPin } from "../utils/security.js";
import { logAudit } from "../utils/audit.js";
import { io } from "../server.js";

export const sacRouter = Router();

sacRouter.use(authenticateToken);

// GET /api/sac/queue - Fila de conferência técnica do SAC Interno (Setor 04)
sacRouter.get("/queue", async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const sacSector = await prisma.sector.findUnique({ where: { code: "SAC_INTERNO" } });
    if (!sacSector) {
      res.status(500).json({ error: "Setor SAC Interno não cadastrado." });
      return;
    }

    const ops = await prisma.productionOrder.findMany({
      where: {
        sacApprovalStatus: "PENDING_REVIEW",
        batches: {
          some: { currentSectorId: sacSector.id },
        },
      },
      include: {
        customer: true,
        batches: {
          where: { currentSectorId: sacSector.id },
        },
        quotation: {
          include: {
            seller: { select: { id: true, name: true, phone: true } },
            designer: { select: { id: true, name: true } },
            items: true,
            attachments: true,
            designBrief: {
              include: {
                versions: { orderBy: { versionNumber: "desc" }, take: 1 },
              },
            },
          },
        },
      },
      orderBy: [{ priority: "desc" }, { promisedDeliveryDate: "asc" }],
    });

    res.json(ops);
  } catch (error) {
    console.error("Erro ao listar fila do SAC:", error);
    res.status(500).json({ error: "Erro ao buscar fila do SAC Interno." });
  }
});

// POST /api/sac/:opId/approve - SAC APROVA a OP e encaminha para Pré-Diagramação (Setor 05)
const approveSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, "O PIN deve conter de 4 a 8 dígitos."),
  notes: z.string().optional(),
});

sacRouter.post(
  "/:opId/approve",
  requireRole("OPERADOR", "GESTOR", "ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { opId } = req.params;
      const user = req.user!;

      // RBAC: Apenas ADMIN, GESTOR ou OPERADOR alocado especificamente no setor SAC_INTERNO podem aprovar
      if (user.role === "OPERADOR" && user.sectorCode !== "SAC_INTERNO") {
        res.status(403).json({
          error: `Acesso negado: Operadores do setor '${user.sectorCode || "Nenhum"}' não possuem permissão para realizar aprovação no SAC Interno.`,
        });
        return;
      }

      const parseResult = approveSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.errors[0].message });
        return;
      }

      // Validar PIN de assinatura do operador
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser || !dbUser.signaturePinHash) {
        res.status(400).json({ error: "Você precisa cadastrar um PIN de assinatura antes de aprovar a OP." });
        return;
      }

      const isPinValid = await verifyPin(parseResult.data.pin, dbUser.signaturePinHash);
      if (!isPinValid) {
        res.status(403).json({ error: "PIN de assinatura incorreto. Operação negada." });
        return;
      }

      const op: any = await prisma.productionOrder.findUnique({
        where: { id: opId },
        include: {
          batches: true,
          quotation: true,
        },
      });

      if (!op) {
        res.status(404).json({ error: "Ordem de Produção não encontrada." });
        return;
      }

      const sacSector = await prisma.sector.findUnique({ where: { code: "SAC_INTERNO" } });
      const preDiagSector = await prisma.sector.findUnique({ where: { code: "PRE_DIAGRAMACAO" } });

      if (!sacSector || !preDiagSector) {
        res.status(500).json({ error: "Setores fabris não localizados no banco." });
        return;
      }

      const vendasSector = await prisma.sector.findUnique({ where: { code: "VENDAS" } });
      const nowIso = new Date().toISOString();

      // Executar transação atômica
      const updatedOp = await prisma.$transaction(async (tx) => {
        // 1. Atualizar aprovação da OP
        const updated = await tx.productionOrder.update({
          where: { id: opId },
          data: {
            sacApprovalStatus: "APPROVED",
            sacReviewedById: req.user!.id,
            sacReviewedAt: new Date(),
          },
        });

        // 2. Movimentar todos os lotes desta OP (no SAC ou retornados a Vendas) para Pré-Diagramação
        for (const batch of op.batches.filter(
          (b) => b.currentSectorId === sacSector.id || (vendasSector && b.currentSectorId === vendasSector.id)
        )) {
          const originSectorId = batch.currentSectorId;
          await tx.opBatch.update({
            where: { id: batch.id },
            data: {
              currentSectorId: preDiagSector.id,
              batchStatus: "WAITING",
              reworkReason: null,
            },
          });

          // Gerar assinatura digital HMAC-SHA-256
          const signatureHash = generateDigitalSignature({
            batchId: batch.id,
            operatorId: req.user!.id,
            fromSectorId: originSectorId,
            toSectorId: preDiagSector.id,
            timestamp: nowIso,
          });

          await tx.opMovement.create({
            data: {
              opBatchId: batch.id,
              fromSectorId: sacSector.id,
              toSectorId: preDiagSector.id,
              operatorId: req.user!.id,
              receivedAt: new Date(),
              startedAt: new Date(),
              finishedAt: new Date(),
              digitalSignatureHash: signatureHash,
              signerPinVerified: true,
              notes: parseResult.data.notes || "OP conferida e aprovada pelo SAC Interno. Liberada para Pré-Diagramação.",
              movementType: "FORWARD",
            },
          });
        }

        return updated;
      });

      await logAudit({
        userId: req.user!.id,
        action: "SAC_OP_APPROVED",
        entityName: "ProductionOrder",
        entityId: opId,
        newValues: { sacApprovalStatus: "APPROVED", targetSector: "PRE_DIAGRAMACAO" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      // Notificar setor de Pré-Diagramação em tempo real
      io.to("sector_PRE_DIAGRAMACAO").emit("new_op_received", {
        opId: op.id,
        opNumber: op.opNumber,
        title: op.title,
        message: "Nova OP liberada pelo SAC Interno!",
      });

      res.json({
        success: true,
        message: `OP ${op.opNumber} aprovada pelo SAC Interno com sucesso! Encaminhada para Pré-Diagramação.`,
        productionOrder: updatedOp,
      });
    } catch (error) {
      console.error("Erro na aprovação do SAC:", error);
      res.status(500).json({ error: "Erro ao processar aprovação do SAC." });
    }
  }
);

// POST /api/sac/:opId/reject - SAC REPROVA a OP e devolve para Vendas (Setor 03)
const rejectSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/, "O PIN deve conter de 4 a 8 dígitos."),
  reason: z.string().min(5, "O motivo da reprovação é obrigatório e deve detalhar o que precisa de correção."),
});

sacRouter.post(
  "/:opId/reject",
  requireRole("OPERADOR", "GESTOR", "ADMIN"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { opId } = req.params;
      const user = req.user!;

      // RBAC: Apenas ADMIN, GESTOR ou OPERADOR alocado especificamente no setor SAC_INTERNO podem reprovar
      if (user.role === "OPERADOR" && user.sectorCode !== "SAC_INTERNO") {
        res.status(403).json({
          error: `Acesso negado: Operadores do setor '${user.sectorCode || "Nenhum"}' não possuem permissão para realizar reprovação no SAC Interno.`,
        });
        return;
      }

      const parseResult = rejectSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.errors[0].message });
        return;
      }

      // Validar PIN do operador
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser || !dbUser.signaturePinHash) {
        res.status(400).json({ error: "Você precisa cadastrar um PIN de assinatura antes de reprovar a OP." });
        return;
      }

      const isPinValid = await verifyPin(parseResult.data.pin, dbUser.signaturePinHash);
      if (!isPinValid) {
        res.status(403).json({ error: "PIN de assinatura incorreto. Operação negada." });
        return;
      }

      const op: any = await prisma.productionOrder.findUnique({
        where: { id: opId },
        include: { batches: true },
      });

      if (!op) {
        res.status(404).json({ error: "Ordem de Produção não encontrada." });
        return;
      }

      const sacSector = await prisma.sector.findUnique({ where: { code: "SAC_INTERNO" } });
      const vendasSector = await prisma.sector.findUnique({ where: { code: "VENDAS" } });

      if (!sacSector || !vendasSector) {
        res.status(500).json({ error: "Setores fabris não encontrados no banco." });
        return;
      }

      const nowIso = new Date().toISOString();

      const updatedOp = await prisma.$transaction(async (tx) => {
        // 1. Atualizar OP com motivo de reprovação
        const updated = await tx.productionOrder.update({
          where: { id: opId },
          data: {
            sacApprovalStatus: "REJECTED",
            sacRejectionReason: parseResult.data.reason,
            sacReviewedById: req.user!.id,
            sacReviewedAt: new Date(),
          },
        });

        // 2. Devolver lotes para Vendas
        for (const batch of op.batches.filter((b) => b.currentSectorId === sacSector.id)) {
          await tx.opBatch.update({
            where: { id: batch.id },
            data: {
              currentSectorId: vendasSector.id,
              batchStatus: "REWORK",
              reworkReason: parseResult.data.reason,
            },
          });

          const signatureHash = generateDigitalSignature({
            batchId: batch.id,
            operatorId: req.user!.id,
            fromSectorId: sacSector.id,
            toSectorId: vendasSector.id,
            timestamp: nowIso,
          });

          await tx.opMovement.create({
            data: {
              opBatchId: batch.id,
              fromSectorId: sacSector.id,
              toSectorId: vendasSector.id,
              operatorId: req.user!.id,
              receivedAt: new Date(),
              startedAt: new Date(),
              finishedAt: new Date(),
              digitalSignatureHash: signatureHash,
              signerPinVerified: true,
              notes: `Reprovado pelo SAC Interno: ${parseResult.data.reason}`,
              movementType: "RETURN",
            },
          });
        }

        return updated;
      });

      await logAudit({
        userId: req.user!.id,
        action: "SAC_OP_REJECTED",
        entityName: "ProductionOrder",
        entityId: opId,
        newValues: { reason: parseResult.data.reason, targetSector: "VENDAS" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      // Notificar Vendas
      io.to("sector_VENDAS").emit("op_returned_from_sac", {
        opId: op.id,
        opNumber: op.opNumber,
        reason: parseResult.data.reason,
      });

      res.json({
        success: true,
        message: `OP ${op.opNumber} reprovada e devolvida para Vendas para correção.`,
        productionOrder: updatedOp,
      });
    } catch (error) {
      console.error("Erro na reprovação do SAC:", error);
      res.status(500).json({ error: "Erro ao processar reprovação do SAC." });
    }
  }
);

// POST /api/sac/:opId/resubmit - Vendedor reenvia OP retificada ao SAC
const resubmitSchema = z.object({
  correctionNotes: z.string().min(3, "Descreva as correções efetuadas para reanálise do SAC."),
});

sacRouter.post(
  "/:opId/resubmit",
  requireRole("VENDEDOR", "ADMIN", "GESTOR"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { opId } = req.params;
      const parseResult = resubmitSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.errors[0].message });
        return;
      }

      const op: any = await prisma.productionOrder.findUnique({
        where: { id: opId },
        include: { batches: true },
      });

      if (!op) {
        res.status(404).json({ error: "Ordem de Produção não encontrada." });
        return;
      }

      const sacSector = await prisma.sector.findUnique({ where: { code: "SAC_INTERNO" } });
      const vendasSector = await prisma.sector.findUnique({ where: { code: "VENDAS" } });

      if (!sacSector || !vendasSector) {
        res.status(500).json({ error: "Setores fabris não localizados." });
        return;
      }

      const nowIso = new Date().toISOString();

      await prisma.$transaction(async (tx) => {
        await tx.productionOrder.update({
          where: { id: opId },
          data: {
            sacApprovalStatus: "PENDING_REVIEW",
          },
        });

        for (const batch of op.batches.filter((b) => b.currentSectorId === vendasSector.id)) {
          await tx.opBatch.update({
            where: { id: batch.id },
            data: {
              currentSectorId: sacSector.id,
              batchStatus: "WAITING",
              reworkReason: null,
            },
          });

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
              notes: `OP retificada pelo vendedor: ${parseResult.data.correctionNotes}`,
              movementType: "FORWARD",
            },
          });
        }
      });

      io.to("sector_SAC_INTERNO").emit("new_op_received", {
        opId: op.id,
        opNumber: op.opNumber,
        message: "OP retificada reenviada para reanálise do SAC!",
      });

      res.json({
        success: true,
        message: `OP ${op.opNumber} reenviada ao SAC Interno para reanálise.`,
      });
    } catch (error) {
      console.error("Erro ao reenviar ao SAC:", error);
      res.status(500).json({ error: "Erro ao reenviar OP ao SAC." });
    }
  }
);
