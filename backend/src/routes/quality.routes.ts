import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { verifyPin, generateDigitalSignature } from "../utils/security.js";
import { logAudit } from "../utils/audit.js";
import { io } from "../server.js";
import { getSectorSequenceIndex } from "./production.routes.js";

export const qualityRouter = Router();

qualityRouter.use(authenticateToken);

// Helper para verificar se usuário tem acesso operacional ao módulo de Qualidade
function hasQualityAccess(user: AuthenticatedRequest["user"]): boolean {
  if (!user) return false;
  if (user.role === "ADMIN" || user.role === "GESTOR") return true;
  if (user.role === "OPERADOR" && user.sectorCode === "QUALIDADE") return true;
  return false;
}

// -----------------------------------------------------------------------------
// 1. TIPOS DE DEFEITO (DEFECT TYPES)
// -----------------------------------------------------------------------------

// GET /api/production/quality/defect-types
// Listagem de tipos de defeito (QUALIDADE, GESTOR, ADMIN)
qualityRouter.get("/quality/defect-types", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!hasQualityAccess(user)) {
      return res.status(403).json({
        error: `Acesso negado: O setor ou perfil '${user.sectorCode || user.role}' não possui permissão para acessar os tipos de defeito.`,
      });
    }

    const defectTypes = await prisma.defectType.findMany({
      orderBy: { name: "asc" },
    });

    return res.json({ defectTypes });
  } catch (err: any) {
    console.error("Erro ao listar tipos de defeito:", err);
    return res.status(500).json({ error: "Erro interno ao listar tipos de defeito." });
  }
});

const createDefectTypeSchema = z.object({
  code: z.string().min(2, "Código deve ter no mínimo 2 caracteres.").transform(v => v.toUpperCase().trim().replace(/\s+/g, "_")),
  name: z.string().min(3, "Nome do tipo de defeito deve ter no mínimo 3 caracteres.").trim(),
});

// POST /api/production/quality/defect-types
// Criação de novos tipos de defeito (estritamente GESTOR e ADMIN)
qualityRouter.post("/quality/defect-types", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== "ADMIN" && user.role !== "GESTOR") {
      return res.status(403).json({
        error: "Acesso negado: Apenas administradores e gestores podem cadastrar novos tipos de defeito.",
      });
    }

    const parseResult = createDefectTypeSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Dados inválidos.",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { code, name } = parseResult.data;

    const existing = await prisma.defectType.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ error: `Já existe um tipo de defeito cadastrado com o código '${code}'.` });
    }

    const defectType = await prisma.defectType.create({
      data: { code, name, isActive: true },
    });

    await logAudit({
      userId: user.id,
      action: "DEFECT_TYPE_CREATED",
      entityName: "DefectType",
      entityId: defectType.id,
      newValues: { code, name },
    });

    return res.status(201).json({
      message: "Tipo de defeito cadastrado com sucesso.",
      defectType,
    });
  } catch (err: any) {
    console.error("Erro ao cadastrar tipo de defeito:", err);
    return res.status(500).json({ error: "Erro interno ao cadastrar tipo de defeito." });
  }
});

// PATCH /api/production/quality/defect-types/:id/toggle
// Ativação / desativação de tipo de defeito (estritamente GESTOR e ADMIN)
qualityRouter.patch("/quality/defect-types/:id/toggle", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== "ADMIN" && user.role !== "GESTOR") {
      return res.status(403).json({
        error: "Acesso negado: Apenas administradores e gestores podem alterar status de tipos de defeito.",
      });
    }

    const { id } = req.params;
    const defectType = await prisma.defectType.findUnique({ where: { id } });
    if (!defectType) {
      return res.status(404).json({ error: "Tipo de defeito não encontrado." });
    }

    const updated = await prisma.defectType.update({
      where: { id },
      data: { isActive: !defectType.isActive },
    });

    await logAudit({
      userId: user.id,
      action: "DEFECT_TYPE_TOGGLED",
      entityName: "DefectType",
      entityId: id,
      oldValues: { isActive: defectType.isActive },
      newValues: { isActive: updated.isActive },
    });

    return res.json({
      message: `Tipo de defeito '${updated.name}' foi ${updated.isActive ? "ativado" : "desativado"} com sucesso.`,
      defectType: updated,
    });
  } catch (err: any) {
    console.error("Erro ao alterar status do tipo de defeito:", err);
    return res.status(500).json({ error: "Erro interno ao atualizar tipo de defeito." });
  }
});

// -----------------------------------------------------------------------------
// 2. INSPEÇÃO DE QUALIDADE (SETOR 13)
// -----------------------------------------------------------------------------

const defectItemSchema = z.object({
  defectTypeId: z.string().min(1, "Tipo de defeito é obrigatório."),
  size: z.string().min(1, "Tamanho é obrigatório."),
  quantity: z.number().int().min(1, "Quantidade do defeito deve ser maior que zero."),
});

const qualityInspectionSchema = z.object({
  pin: z.string().min(4, "PIN de assinatura digital é obrigatório."),
  result: z.enum(["APPROVED_TOTAL", "APPROVED_PARTIAL", "REJECTED_TOTAL"], {
    errorMap: () => ({ message: "Resultado deve ser APPROVED_TOTAL, APPROVED_PARTIAL ou REJECTED_TOTAL." }),
  }),
  totalApproved: z.number().int().min(0, "Total de aprovadas não pode ser negativo."),
  totalDefective: z.number().int().min(0, "Total de defeituosas não pode ser negativo."),
  reworkTargetSectorCode: z.string().optional(),
  reworkReason: z.string().optional(),
  notes: z.string().optional(),
  defects: z.array(defectItemSchema).optional(),
});

// POST /api/production/batches/:batchId/quality-inspection
qualityRouter.post("/batches/:batchId/quality-inspection", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId } = req.params;
    const user = req.user!;

    // 1. RBAC verificado antes de qualquer parse de body
    if (!hasQualityAccess(user)) {
      return res.status(403).json({
        error: `Acesso negado: O setor ou perfil '${user.sectorCode || user.role}' não possui permissão para inspecionar lotes na Qualidade.`,
      });
    }

    const parseResult = qualityInspectionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Dados de inspeção inválidos.",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const {
      pin,
      result,
      totalApproved,
      totalDefective,
      reworkTargetSectorCode,
      reworkReason,
      notes,
      defects = [],
    } = parseResult.data;

    // 2. Buscar lote
    const batch = await prisma.opBatch.findUnique({
      where: { id: batchId },
      include: {
        currentSector: true,
        productionOrder: {
          include: { batches: true },
        },
      },
    });

    if (!batch) {
      return res.status(404).json({ error: "Lote não encontrado." });
    }

    // Verificar se o lote está no setor de Qualidade (Seq 13 ou code QUALIDADE)
    const isQualidadeSector = batch.currentSector.code === "QUALIDADE" || batch.currentSector.sequenceOrder === 13;
    if (!isQualidadeSector) {
      return res.status(400).json({
        error: `Inspeção bloqueada: O lote ${batch.batchNumber} está no setor '${batch.currentSector.name}' e não em Qualidade Pós-Costura.`,
      });
    }

    // 3. Prevenção de duplicidade de inspeção
    const existingInspection = await prisma.qualityInspection.findFirst({
      where: { opBatchId: batch.id },
    });
    if (existingInspection) {
      return res.status(409).json({
        error: "Inspeção bloqueada: Este lote já foi inspecionado pela Qualidade.",
      });
    }

    // 4. Regras de coerência matemática e de negócio
    if (totalApproved + totalDefective !== batch.quantity) {
      return res.status(400).json({
        error: `Incoerência de quantidades: A soma de aprovadas (${totalApproved}) e com defeito (${totalDefective}) deve ser exatamente igual ao total do lote (${batch.quantity}).`,
      });
    }

    if (result === "APPROVED_TOTAL") {
      if (totalDefective > 0 || totalApproved !== batch.quantity) {
        return res.status(400).json({
          error: "Para aprovação total (APPROVED_TOTAL), a quantidade com defeito deve ser 0 e as aprovadas devem ser 100% do lote.",
        });
      }
    } else if (result === "REJECTED_TOTAL") {
      if (totalApproved > 0 || totalDefective !== batch.quantity) {
        return res.status(400).json({
          error: "Para rejeição total (REJECTED_TOTAL), a quantidade aprovada deve ser 0 e as com defeito devem ser 100% do lote.",
        });
      }
    } else if (result === "APPROVED_PARTIAL") {
      if (totalApproved <= 0 || totalDefective <= 0) {
        return res.status(400).json({
          error: "Para aprovação parcial (APPROVED_PARTIAL), é obrigatório haver ao menos uma peça aprovada e ao menos uma com defeito.",
        });
      }
    }

    // Validação de defeitos informados
    if (totalDefective > 0) {
      if (!defects || defects.length === 0) {
        return res.status(400).json({
          error: "É obrigatório especificar os tipos de defeito e tamanhos para todas as peças com defeito.",
        });
      }

      const sumDefects = defects.reduce((sum, d) => sum + d.quantity, 0);
      if (sumDefects !== totalDefective) {
        return res.status(400).json({
          error: `Incoerência nos defeitos: A soma das quantidades de defeitos apontados (${sumDefects}) deve ser igual ao total de defeituosas (${totalDefective}).`,
        });
      }
    }

    // Validação do setor de retrabalho se houver peças com defeito
    let reworkSector: any = null;
    const targetReworkCode = reworkTargetSectorCode || "COSTURA";
    if (result !== "APPROVED_TOTAL") {
      if (!reworkReason || reworkReason.trim().length === 0) {
        return res.status(400).json({
          error: "É obrigatório fornecer a justificativa do retrabalho para lotes reprovados ou parcialmente aprovados.",
        });
      }

      const currentIdx = getSectorSequenceIndex(batch.currentSector.code);
      const targetIdx = getSectorSequenceIndex(targetReworkCode);

      if (currentIdx === -1 || targetIdx === -1 || targetIdx >= currentIdx) {
        return res.status(400).json({
          error: `Setor de retrabalho inválido: '${targetReworkCode}' deve preceder o setor de Qualidade.`,
        });
      }

      reworkSector = await prisma.sector.findFirst({
        where: {
          OR: [
            { code: targetReworkCode },
            { sequenceOrder: targetIdx + 1 },
          ],
        },
      });

      if (!reworkSector) {
        return res.status(404).json({ error: `Setor de retrabalho '${targetReworkCode}' não encontrado.` });
      }
    }

    // 5. Validar PIN do operador
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !dbUser.signaturePinHash) {
      return res.status(403).json({ error: "Inspetor não possui PIN de assinatura digital cadastrado." });
    }

    const isPinValid = await verifyPin(pin, dbUser.signaturePinHash);
    if (!isPinValid) {
      return res.status(403).json({ error: "PIN de assinatura incorreto. Inspeção negada." });
    }

    // 6. Detectar romaneio e oficina de origem da costura
    const lastManifest = await prisma.dispatchManifest.findFirst({
      where: { opBatchId: batch.id },
      orderBy: { createdAt: "desc" },
    });

    const dispatchManifestId = lastManifest ? lastManifest.id : null;
    const sewingPartnerId = lastManifest ? lastManifest.sewingPartnerId : null;

    // Buscar setor de Expedição (Setor 14)
    const expedicaoSector = await prisma.sector.findFirst({
      where: {
        OR: [
          { code: "EXPEDICAO" },
          { sequenceOrder: 14 },
        ],
      },
    });

    if (!expedicaoSector && (result === "APPROVED_TOTAL" || result === "APPROVED_PARTIAL")) {
      return res.status(500).json({ error: "Setor de destino 'EXPEDICAO' não encontrado no sistema." });
    }

    const nowIso = new Date().toISOString();

    // 7. Execução transacional atômica
    const transactionResult = await prisma.$transaction(async (tx) => {
      // Cria a inspeção
      const inspection = await tx.qualityInspection.create({
        data: {
          opBatchId: batch.id,
          dispatchManifestId,
          sewingPartnerId,
          inspectorId: user.id,
          inspectedAt: new Date(),
          result,
          totalInspected: batch.quantity,
          totalApproved,
          totalDefective,
          notes: notes || null,
        },
      });

      // Cria os itens de defeito
      if (defects.length > 0) {
        for (const def of defects) {
          await tx.qualityInspectionDefect.create({
            data: {
              qualityInspectionId: inspection.id,
              defectTypeId: def.defectTypeId,
              size: def.size,
              quantity: def.quantity,
            },
          });
        }
      }

      let forwardMovement: any = null;
      let reworkMovement: any = null;
      let updatedMainBatch: any = null;
      let newReworkBatch: any = null;

      if (result === "APPROVED_TOTAL") {
        // Avança o lote completo para EXPEDICAO com status PENDING
        const sigHash = generateDigitalSignature({
          batchId: batch.id,
          operatorId: user.id,
          fromSectorId: batch.currentSectorId,
          toSectorId: expedicaoSector!.id,
          timestamp: nowIso,
        });

        // Atualiza a assinatura na inspeção
        await tx.qualityInspection.update({
          where: { id: inspection.id },
          data: { digitalSignatureHash: sigHash },
        });

        forwardMovement = await tx.opMovement.create({
          data: {
            opBatchId: batch.id,
            fromSectorId: batch.currentSectorId,
            toSectorId: expedicaoSector!.id,
            operatorId: user.id,
            movementType: "FORWARD",
            receivedAt: batch.updatedAt,
            finishedAt: new Date(),
            digitalSignatureHash: sigHash,
            signerPinVerified: true,
            notes: JSON.stringify({
              action: "QUALITY_APPROVED_TOTAL",
              inspected: batch.quantity,
              notes,
            }),
          },
        });

        updatedMainBatch = await tx.opBatch.update({
          where: { id: batch.id },
          data: {
            currentSectorId: expedicaoSector!.id,
            batchStatus: "PENDING",
            assignedOperatorId: null,
            isUnderRework: false,
            reworkReason: null,
          },
          include: { currentSector: true, productionOrder: true },
        });
      } else if (result === "REJECTED_TOTAL") {
        // Retorna o lote inteiro para o setor de retrabalho com REWORK_RETURN
        const sigHash = generateDigitalSignature({
          batchId: batch.id,
          operatorId: user.id,
          fromSectorId: batch.currentSectorId,
          toSectorId: reworkSector.id,
          timestamp: nowIso,
        });

        await tx.qualityInspection.update({
          where: { id: inspection.id },
          data: { digitalSignatureHash: sigHash },
        });

        reworkMovement = await tx.opMovement.create({
          data: {
            opBatchId: batch.id,
            fromSectorId: batch.currentSectorId,
            toSectorId: reworkSector.id,
            operatorId: user.id,
            movementType: "REWORK_RETURN",
            receivedAt: batch.updatedAt,
            finishedAt: new Date(),
            digitalSignatureHash: sigHash,
            signerPinVerified: true,
            notes: `Retrabalho integral apontado na Qualidade para ${targetReworkCode}. Motivo: ${reworkReason}`,
          },
        });

        updatedMainBatch = await tx.opBatch.update({
          where: { id: batch.id },
          data: {
            currentSectorId: reworkSector.id,
            batchStatus: "WAITING",
            assignedOperatorId: null,
            isUnderRework: true,
            reworkOriginSectorId: batch.currentSectorId,
            reworkReason,
            reworkNotes: notes || null,
          },
          include: { currentSector: true, productionOrder: true },
        });
      } else if (result === "APPROVED_PARTIAL") {
        // Aprovadas: lote principal avança para EXPEDICAO
        const sigApproved = generateDigitalSignature({
          batchId: batch.id,
          operatorId: user.id,
          fromSectorId: batch.currentSectorId,
          toSectorId: expedicaoSector!.id,
          timestamp: nowIso,
        });

        await tx.qualityInspection.update({
          where: { id: inspection.id },
          data: { digitalSignatureHash: sigApproved },
        });

        forwardMovement = await tx.opMovement.create({
          data: {
            opBatchId: batch.id,
            fromSectorId: batch.currentSectorId,
            toSectorId: expedicaoSector!.id,
            operatorId: user.id,
            movementType: "FORWARD",
            receivedAt: batch.updatedAt,
            finishedAt: new Date(),
            digitalSignatureHash: sigApproved,
            signerPinVerified: true,
            notes: JSON.stringify({
              action: "QUALITY_APPROVED_PARTIAL_MAIN",
              quantityApproved: totalApproved,
              notes,
            }),
          },
        });

        updatedMainBatch = await tx.opBatch.update({
          where: { id: batch.id },
          data: {
            quantity: totalApproved,
            currentSectorId: expedicaoSector!.id,
            batchStatus: "PENDING",
            assignedOperatorId: null,
            isUnderRework: false,
            reworkReason: null,
          },
          include: { currentSector: true, productionOrder: true },
        });

        // Defeituosas: cria novo sublote para retrabalho
        const allBatches = batch.productionOrder.batches;
        const nextNum = allBatches.length + 1;
        const newBatchNumber = `${batch.productionOrder.opNumber}-L${String(nextNum).padStart(2, "0")}`;

        newReworkBatch = await tx.opBatch.create({
          data: {
            batchNumber: newBatchNumber,
            productionOrderId: batch.productionOrderId,
            quantity: totalDefective,
            currentSectorId: reworkSector.id,
            batchStatus: "WAITING",
            isUnderRework: true,
            reworkOriginSectorId: batch.currentSectorId,
            reworkReason,
            reworkNotes: notes || null,
          },
          include: { currentSector: true, productionOrder: true },
        });

        const sigDefective = generateDigitalSignature({
          batchId: newReworkBatch.id,
          operatorId: user.id,
          fromSectorId: batch.currentSectorId,
          toSectorId: reworkSector.id,
          timestamp: nowIso,
        });

        reworkMovement = await tx.opMovement.create({
          data: {
            opBatchId: newReworkBatch.id,
            fromSectorId: batch.currentSectorId,
            toSectorId: reworkSector.id,
            operatorId: user.id,
            movementType: "REWORK_RETURN",
            receivedAt: new Date(),
            finishedAt: new Date(),
            digitalSignatureHash: sigDefective,
            signerPinVerified: true,
            notes: `Sublote gerado por fracionamento de qualidade para retrabalho em ${targetReworkCode}. Motivo: ${reworkReason}`,
          },
        });
      }

      return {
        inspection,
        forwardMovement,
        reworkMovement,
        updatedMainBatch,
        newReworkBatch,
      };
    });

    // 8. Auditoria imutável
    await logAudit({
      userId: user.id,
      action: "QUALITY_INSPECTION_COMPLETED",
      entityName: "QualityInspection",
      entityId: transactionResult.inspection.id,
      newValues: {
        batchNumber: batch.batchNumber,
        result,
        totalInspected: batch.quantity,
        totalApproved,
        totalDefective,
        reworkTargetSectorCode: reworkSector ? reworkSector.code : null,
      },
    });

    // 9. Notificações Socket.io direcionadas
    let emitter = io.to("sector_QUALIDADE").to("sector_ADMIN").to("sector_GESTAO");
    if (expedicaoSector && (result === "APPROVED_TOTAL" || result === "APPROVED_PARTIAL")) {
      emitter = emitter.to("sector_EXPEDICAO");
    }
    if (reworkSector) {
      emitter = emitter.to(`sector_${reworkSector.code}`);
    }

    emitter.emit("quality_inspection_done", {
      inspectionId: transactionResult.inspection.id,
      batchNumber: batch.batchNumber,
      result,
      totalApproved,
      totalDefective,
      updatedBatch: transactionResult.updatedMainBatch,
      newReworkBatch: transactionResult.newReworkBatch,
    });

    emitter.emit("batch_moved", {
      opId: batch.productionOrderId,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      fromSectorCode: "QUALIDADE",
      toSectorCode: result === "REJECTED_TOTAL" ? (reworkSector?.code || "COSTURA") : "EXPEDICAO",
      operatorName: user.name,
    });

    return res.status(201).json({
      message: `Inspeção concluída com sucesso: ${result}.`,
      inspection: transactionResult.inspection,
      updatedBatch: transactionResult.updatedMainBatch,
      newReworkBatch: transactionResult.newReworkBatch,
    });
  } catch (err: any) {
    console.error("Erro ao registrar inspeção de qualidade:", err);
    return res.status(500).json({ error: "Erro interno ao processar inspeção de qualidade." });
  }
});

// -----------------------------------------------------------------------------
// 3. RELATÓRIO DE DEFEITOS POR OFICINA (DEFECT REPORT)
// -----------------------------------------------------------------------------

// GET /api/production/quality/defect-report?from=...&to=...
qualityRouter.get("/quality/defect-report", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;

    // RBAC verificado no início
    if (!hasQualityAccess(user)) {
      return res.status(403).json({
        error: `Acesso negado: O setor ou perfil '${user.sectorCode || user.role}' não possui permissão para acessar o relatório de defeitos.`,
      });
    }

    const { from, to } = req.query;

    const dateFilter: any = {};
    if (from && typeof from === "string") {
      dateFilter.gte = new Date(from);
    }
    if (to && typeof to === "string") {
      dateFilter.lte = new Date(to);
    }

    const inspections = await prisma.qualityInspection.findMany({
      where: Object.keys(dateFilter).length > 0 ? { inspectedAt: dateFilter } : undefined,
      include: {
        sewingPartner: true,
        inspector: { select: { id: true, name: true } },
        defects: {
          include: {
            defectType: true,
          },
        },
      },
    });

    let totalInspected = 0;
    let totalApproved = 0;
    let totalDefective = 0;

    // Agrupamento por oficina de costura
    const workshopMap: Record<string, {
      partnerId: string | null;
      partnerName: string;
      partnerType: string | null;
      totalInspected: number;
      totalApproved: number;
      totalDefective: number;
      defectsCountByType: Record<string, { name: string; count: number }>;
    }> = {};

    for (const insp of inspections) {
      totalInspected += insp.totalInspected;
      totalApproved += insp.totalApproved;
      totalDefective += insp.totalDefective;

      const pKey = insp.sewingPartnerId || "INTERNAL_OR_UNASSIGNED";
      if (!workshopMap[pKey]) {
        workshopMap[pKey] = {
          partnerId: insp.sewingPartnerId,
          partnerName: insp.sewingPartner?.name || "Célula Interna / Sem Oficina",
          partnerType: insp.sewingPartner?.type || "INTERNAL",
          totalInspected: 0,
          totalApproved: 0,
          totalDefective: 0,
          defectsCountByType: {},
        };
      }

      workshopMap[pKey].totalInspected += insp.totalInspected;
      workshopMap[pKey].totalApproved += insp.totalApproved;
      workshopMap[pKey].totalDefective += insp.totalDefective;

      for (const def of insp.defects) {
        const typeCode = def.defectType.code;
        if (!workshopMap[pKey].defectsCountByType[typeCode]) {
          workshopMap[pKey].defectsCountByType[typeCode] = {
            name: def.defectType.name,
            count: 0,
          };
        }
        workshopMap[pKey].defectsCountByType[typeCode].count += def.quantity;
      }
    }

    const overallDefectRate = totalInspected > 0 ? Number(((totalDefective / totalInspected) * 100).toFixed(2)) : 0;

    const workshops = Object.values(workshopMap).map((w) => {
      const defectRate = w.totalInspected > 0 ? Number(((w.totalDefective / w.totalInspected) * 100).toFixed(2)) : 0;
      const topDefects = Object.entries(w.defectsCountByType)
        .map(([code, item]) => ({
          code,
          name: item.name,
          count: item.count,
        }))
        .sort((a, b) => b.count - a.count);

      return {
        partnerId: w.partnerId,
        partnerName: w.partnerName,
        partnerType: w.partnerType,
        totalInspected: w.totalInspected,
        totalApproved: w.totalApproved,
        totalDefective: w.totalDefective,
        defectRate,
        topDefects,
      };
    }).sort((a, b) => b.defectRate - a.defectRate);

    return res.json({
      summary: {
        totalInspections: inspections.length,
        totalInspected,
        totalApproved,
        totalDefective,
        defectRate: overallDefectRate,
      },
      workshops,
    });
  } catch (err: any) {
    console.error("Erro ao gerar relatório de defeitos:", err);
    return res.status(500).json({ error: "Erro interno ao gerar relatório de defeitos." });
  }
});
