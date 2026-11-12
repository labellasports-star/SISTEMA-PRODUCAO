import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { verifyPin, generateDigitalSignature } from "../utils/security.js";
import { logAudit } from "../utils/audit.js";
import { io } from "../server.js";
import { getSectorSequenceIndex } from "./production.routes.js";

export const costuraRouter = Router();

costuraRouter.use(authenticateToken);

// Esquemas de validação Zod
const receiptItemSchema = z.object({
  size: z.string().min(1, "Identificação do tamanho é obrigatória."),
  quantityReceivedOk: z.number().int().min(0).default(0),
  quantityMissing: z.number().int().min(0).default(0),
  quantityDamaged: z.number().int().min(0).default(0),
});

const sewingReceiptSchema = z.object({
  pin: z.string().min(4, "PIN de assinatura digital é obrigatório."),
  items: z.array(receiptItemSchema).min(1, "É obrigatório informar ao menos um item recebido da oficina."),
  notes: z.string().optional(),
});

const closeReceiptSchema = z.object({
  pin: z.string().min(4, "PIN de assinatura digital é obrigatório."),
  justification: z.string().min(5, "Justificativa detalhada de encerramento com divergência é obrigatória (mínimo 5 caracteres)."),
});

// -----------------------------------------------------------------------------
// 1. POST /api/production/batches/:batchId/sewing-receipt
// Registro de recebimento (parcial ou total) da oficina para o Setor 12 (Costura)
// -----------------------------------------------------------------------------
costuraRouter.post("/batches/:batchId/sewing-receipt", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId } = req.params;
    const user = req.user!;

    // 1. RBAC estrito: Apenas OPERADOR de Costura, GESTOR ou ADMIN
    if (user.role !== "ADMIN" && user.role !== "GESTOR") {
      if (user.role !== "OPERADOR") {
        return res.status(403).json({
          error: `Acesso negado: O perfil '${user.role}' não possui permissão para registrar recebimentos de costura.`,
        });
      }

      const isUserInCostura =
        user.sectorCode === "COSTURA" ||
        (user as any).sectorSequence === 12;

      if (!isUserInCostura) {
        return res.status(403).json({
          error: `Acesso negado: Você pertence a '${user.sectorCode || "Nenhum"}' e não pode registrar recebimentos na Costura.`,
        });
      }
    }

    const parseResult = sewingReceiptSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Dados de recebimento inválidos.",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { pin, items, notes } = parseResult.data;

    // 2. Buscar lote
    const batch = await prisma.opBatch.findUnique({
      where: { id: batchId },
      include: {
        currentSector: true,
        productionOrder: { include: { customer: true } },
      },
    });

    if (!batch) {
      return res.status(404).json({ error: "Lote de produção não encontrado." });
    }

    const currentSectorCode = batch.currentSector.code;
    const isCosturaSector =
      currentSectorCode === "COSTURA" ||
      batch.currentSector.sequenceOrder === 12;

    if (!isCosturaSector) {
      return res.status(400).json({
        error: `Recebimento de oficina permitido apenas no setor 'Costura' (Setor 12). O lote está em '${currentSectorCode}'.`,
      });
    }

    // 3. Validação do PIN de assinatura
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

    // 4. Buscar Romaneio ativo (DispatchManifest)
    const manifest = await prisma.dispatchManifest.findFirst({
      where: { opBatchId: batch.id },
      orderBy: { createdAt: "desc" },
      include: {
        sewingPartner: true,
        receipts: {
          include: { items: true },
        },
      },
    });

    if (!manifest) {
      return res.status(400).json({
        error: "Nenhum romaneio de envio para oficina foi encontrado para este lote.",
      });
    }

    if (manifest.isReceiptClosed) {
      return res.status(400).json({
        error: "O romaneio deste lote já se encontra encerrado. Não são permitidos novos recebimentos.",
      });
    }

    // 5. Parse da grade enviada no romaneio
    let sizeGridSent: Record<string, number> = {};
    try {
      sizeGridSent = JSON.parse(manifest.sizeGridBreakdown);
    } catch {
      sizeGridSent = {};
    }

    // 6. Calcular somatório acumulado prévio por tamanho
    const previousTotalsPerSize: Record<string, { ok: number; missing: number; damaged: number; total: number }> = {};
    for (const size of Object.keys(sizeGridSent)) {
      previousTotalsPerSize[size] = { ok: 0, missing: 0, damaged: 0, total: 0 };
    }

    for (const r of manifest.receipts) {
      for (const item of r.items) {
        if (!previousTotalsPerSize[item.size]) {
          previousTotalsPerSize[item.size] = { ok: 0, missing: 0, damaged: 0, total: 0 };
        }
        previousTotalsPerSize[item.size].ok += item.quantityReceivedOk;
        previousTotalsPerSize[item.size].missing += item.quantityMissing;
        previousTotalsPerSize[item.size].damaged += item.quantityDamaged;
        previousTotalsPerSize[item.size].total +=
          item.quantityReceivedOk + item.quantityMissing + item.quantityDamaged;
      }
    }

    // 7. Validar coerência do novo recebimento contra a grade enviada
    let newItemsTotal = 0;
    let newItemsOk = 0;
    let newItemsMissing = 0;
    let newItemsDamaged = 0;

    for (const item of items) {
      const itemSum = item.quantityReceivedOk + item.quantityMissing + item.quantityDamaged;
      if (itemSum < 0) {
        return res.status(400).json({ error: `Quantidades negativas no tamanho ${item.size} são inválidas.` });
      }

      const prev = previousTotalsPerSize[item.size] || { ok: 0, missing: 0, damaged: 0, total: 0 };
      const accumulatedSize = prev.total + itemSum;
      const sentForSize = sizeGridSent[item.size] || 0;

      if (accumulatedSize > sentForSize) {
        return res.status(400).json({
          error: `A soma acumulada das peças do tamanho '${item.size}' (${accumulatedSize}) excede o total enviado no romaneio (${sentForSize}).`,
        });
      }

      newItemsTotal += itemSum;
      newItemsOk += item.quantityReceivedOk;
      newItemsMissing += item.quantityMissing;
      newItemsDamaged += item.quantityDamaged;
    }

    const previousGrandTotal = Object.values(previousTotalsPerSize).reduce((acc, curr) => acc + curr.total, 0);
    const updatedGrandTotal = previousGrandTotal + newItemsTotal;

    if (updatedGrandTotal > manifest.totalQuantity) {
      return res.status(400).json({
        error: `A soma acumulada de todas as peças (${updatedGrandTotal}) excede o total enviado no romaneio (${manifest.totalQuantity}).`,
      });
    }

    // 8. Assinatura Digital HMAC-SHA-256 do Comprovante de Recebimento
    const nowIso = new Date().toISOString();
    const signatureHash = generateDigitalSignature({
      batchId: batch.id,
      operatorId: user.id,
      fromSectorId: batch.currentSectorId,
      toSectorId: batch.currentSectorId,
      timestamp: nowIso,
    });

    const nextReceiptNumber = manifest.receipts.length + 1;
    const isCompletedNow = updatedGrandTotal === manifest.totalQuantity;

    // 9. Transação atômica
    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.sewingReceipt.create({
        data: {
          dispatchManifestId: manifest.id,
          opBatchId: batch.id,
          receiptNumber: nextReceiptNumber,
          operatorId: user.id,
          totalReceivedOk: newItemsOk,
          totalMissing: newItemsMissing,
          totalDamaged: newItemsDamaged,
          digitalSignatureHash: signatureHash,
          notes: notes || null,
          items: {
            create: items.map((it) => ({
              size: it.size,
              quantityReceivedOk: it.quantityReceivedOk,
              quantityMissing: it.quantityMissing,
              quantityDamaged: it.quantityDamaged,
            })),
          },
        },
        include: {
          items: true,
          operator: { select: { id: true, name: true, role: true } },
        },
      });

      // Atualizar status do romaneio
      let newReceiptStatus = "PARTIALLY_RECEIVED";
      let isReceiptClosed = false;
      let closedAt = null;
      let closedById = null;

      if (isCompletedNow) {
        isReceiptClosed = true;
        closedAt = new Date();
        closedById = user.id;

        const totalMissingGrand =
          Object.values(previousTotalsPerSize).reduce((acc, c) => acc + c.missing, 0) + newItemsMissing;
        const totalDamagedGrand =
          Object.values(previousTotalsPerSize).reduce((acc, c) => acc + c.damaged, 0) + newItemsDamaged;

        newReceiptStatus = totalMissingGrand === 0 && totalDamagedGrand === 0 ? "CLOSED" : "CLOSED_WITH_DIVERGENCE";
      }

      const updatedManifest = await tx.dispatchManifest.update({
        where: { id: manifest.id },
        data: {
          receiptStatus: newReceiptStatus,
          isReceiptClosed,
          closedAt,
          closedById,
        },
        include: {
          sewingPartner: true,
        },
      });

      // Manter lote em Costura, com status IN_PROGRESS para permitir novos recebimentos até fechar
      await tx.opBatch.update({
        where: { id: batch.id },
        data: {
          batchStatus: "IN_PROGRESS",
        },
      });

      return { receipt, manifest: updatedManifest };
    });

    // 10. Audit Log e Notificação Socket.io
    await logAudit({
      userId: user.id,
      action: "SEWING_RECEIPT_REGISTERED",
      entityName: "SewingReceipt",
      entityId: result.receipt.id,
      newValues: {
        batchId: batch.id,
        manifestNumber: manifest.manifestNumber,
        receiptNumber: nextReceiptNumber,
        totalReceivedOk: newItemsOk,
        totalMissing: newItemsMissing,
        totalDamaged: newItemsDamaged,
        isReceiptClosed: result.manifest.isReceiptClosed,
      },
    });

    io.to("sector_COSTURA").emit("batch_updated", {
      type: "SEWING_RECEIPT_REGISTERED",
      batchId: batch.id,
      manifestId: manifest.id,
      receiptNumber: nextReceiptNumber,
      isReceiptClosed: result.manifest.isReceiptClosed,
    });

    return res.status(201).json({
      message: `Recebimento #${nextReceiptNumber} registrado com sucesso para o romaneio ${manifest.manifestNumber}.`,
      receipt: result.receipt,
      manifest: result.manifest,
    });
  } catch (err: any) {
    console.error("Erro ao registrar recebimento de costura:", err);
    return res.status(500).json({ error: "Erro interno ao processar recebimento da oficina." });
  }
});

// -----------------------------------------------------------------------------
// 2. POST /api/production/batches/:batchId/close-receipt
// Fechamento manual com divergência (autorizado apenas para GESTOR ou ADMIN com justificativa)
// -----------------------------------------------------------------------------
costuraRouter.post("/batches/:batchId/close-receipt", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId } = req.params;
    const user = req.user!;

    // RBAC: Apenas ADMIN ou GESTOR podem autorizar encerramento com divergência
    if (user.role !== "ADMIN" && user.role !== "GESTOR") {
      return res.status(403).json({
        error: `Acesso negado: Apenas Gestores e Administradores podem encerrar romaneios com divergência de peças.`,
      });
    }

    const parseResult = closeReceiptSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Dados de fechamento inválidos.",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { pin, justification } = parseResult.data;

    // Validação do PIN do gestor
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser || !dbUser.signaturePinHash) {
      return res.status(403).json({
        error: "Usuário não possui PIN de assinatura digital cadastrado.",
      });
    }

    const isPinValid = await verifyPin(pin, dbUser.signaturePinHash);
    if (!isPinValid) {
      return res.status(403).json({ error: "PIN de assinatura incorreto. Operação negada." });
    }

    const manifest = await prisma.dispatchManifest.findFirst({
      where: { opBatchId: batchId },
      orderBy: { createdAt: "desc" },
    });

    if (!manifest) {
      return res.status(404).json({ error: "Romaneio deste lote não encontrado." });
    }

    if (manifest.isReceiptClosed) {
      return res.status(400).json({ error: "Este romaneio já está encerrado." });
    }

    const updated = await prisma.dispatchManifest.update({
      where: { id: manifest.id },
      data: {
        isReceiptClosed: true,
        receiptStatus: "CLOSED_WITH_DIVERGENCE",
        closedAt: new Date(),
        closedById: user.id,
        divergenceJustification: justification,
      },
    });

    await logAudit({
      userId: user.id,
      action: "SEWING_RECEIPT_CLOSED_WITH_DIVERGENCE",
      entityName: "DispatchManifest",
      entityId: manifest.id,
      newValues: {
        batchId,
        justification,
        closedBy: user.name,
      },
    });

    io.to("sector_COSTURA").emit("batch_updated", {
      type: "SEWING_RECEIPT_CLOSED_WITH_DIVERGENCE",
      batchId,
      manifestId: manifest.id,
    });

    return res.json({
      message: "Romaneio encerrado com divergência autorizada com sucesso.",
      manifest: updated,
    });
  } catch (err: any) {
    console.error("Erro ao encerrar romaneio com divergência:", err);
    return res.status(500).json({ error: "Erro interno ao encerrar romaneio." });
  }
});

// -----------------------------------------------------------------------------
// 3. GET /api/production/batches/:batchId/sewing-receipts
// Consulta de todos os recebimentos e status do romaneio de um lote
// -----------------------------------------------------------------------------
costuraRouter.get("/batches/:batchId/sewing-receipts", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId } = req.params;

    const manifest = await prisma.dispatchManifest.findFirst({
      where: { opBatchId: batchId },
      orderBy: { createdAt: "desc" },
      include: {
        sewingPartner: true,
        receipts: {
          include: {
            items: true,
            operator: { select: { id: true, name: true, role: true } },
          },
          orderBy: { receiptNumber: "asc" },
        },
      },
    });

    if (!manifest) {
      return res.status(404).json({ error: "Nenhum romaneio encontrado para este lote." });
    }

    const totalReceivedOk = manifest.receipts.reduce((sum, r) => sum + r.totalReceivedOk, 0);
    const totalMissing = manifest.receipts.reduce((sum, r) => sum + r.totalMissing, 0);
    const totalDamaged = manifest.receipts.reduce((sum, r) => sum + r.totalDamaged, 0);
    const totalAccounted = totalReceivedOk + totalMissing + totalDamaged;
    const remainingToReceive = Math.max(0, manifest.totalQuantity - totalAccounted);

    return res.json({
      manifest,
      summary: {
        totalSent: manifest.totalQuantity,
        totalReceivedOk,
        totalMissing,
        totalDamaged,
        totalAccounted,
        remainingToReceive,
        isReceiptClosed: manifest.isReceiptClosed,
        receiptStatus: manifest.receiptStatus,
      },
      receipts: manifest.receipts,
    });
  } catch (err: any) {
    console.error("Erro ao consultar histórico de recebimentos:", err);
    return res.status(500).json({ error: "Erro interno ao carregar recebimentos." });
  }
});

// -----------------------------------------------------------------------------
// 4. GET /api/production/sewing/yield-report
// Relatório de rendimento por oficina e período com detecção de atrasos
// -----------------------------------------------------------------------------
costuraRouter.get("/sewing/yield-report", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;

    // RBAC: Apenas GESTOR, ADMIN e operadores de COSTURA
    if (user.role !== "ADMIN" && user.role !== "GESTOR") {
      const isCostura = user.sectorCode === "COSTURA" || (user as any).sectorSequence === 12;
      if (!isCostura) {
        return res.status(403).json({
          error: "Acesso negado: Usuário não possui permissão para visualizar o relatório de rendimento de costura.",
        });
      }
    }

    const { sewingPartnerId, from, to } = req.query;

    const whereManifest: any = {};
    if (sewingPartnerId && typeof sewingPartnerId === "string") {
      whereManifest.sewingPartnerId = sewingPartnerId;
    }

    if (from || to) {
      whereManifest.createdAt = {};
      if (from && typeof from === "string") {
        whereManifest.createdAt.gte = new Date(from);
      }
      if (to && typeof to === "string") {
        whereManifest.createdAt.lte = new Date(to);
      }
    }

    const manifests = await prisma.dispatchManifest.findMany({
      where: whereManifest,
      include: {
        sewingPartner: true,
        receipts: {
          include: { items: true },
          orderBy: { receivedAt: "desc" },
        },
      },
    });

    // Agrupar por oficina
    const partnersMap: Record<string, {
      sewingPartnerId: string;
      sewingPartnerName: string;
      totalDispatches: number;
      totalSent: number;
      totalReceivedOk: number;
      totalMissing: number;
      totalDamaged: number;
      delayedDispatchesCount: number;
      manifests: any[];
    }> = {};

    const now = new Date();

    for (const m of manifests) {
      const pId = m.sewingPartnerId;
      if (!partnersMap[pId]) {
        partnersMap[pId] = {
          sewingPartnerId: pId,
          sewingPartnerName: m.sewingPartner.name,
          totalDispatches: 0,
          totalSent: 0,
          totalReceivedOk: 0,
          totalMissing: 0,
          totalDamaged: 0,
          delayedDispatchesCount: 0,
          manifests: [],
        };
      }

      const pGroup = partnersMap[pId];
      pGroup.totalDispatches++;
      pGroup.totalSent += m.totalQuantity;

      const mOk = m.receipts.reduce((sum, r) => sum + r.totalReceivedOk, 0);
      const mMissing = m.receipts.reduce((sum, r) => sum + r.totalMissing, 0);
      const mDamaged = m.receipts.reduce((sum, r) => sum + r.totalDamaged, 0);

      pGroup.totalReceivedOk += mOk;
      pGroup.totalMissing += mMissing;
      pGroup.totalDamaged += mDamaged;

      // Detecção de Atraso
      let isDelayed = false;
      const expected = new Date(m.expectedReturnDate);

      if (m.receipts.length > 0) {
        // Data do último recebimento
        const lastReceiptDate = new Date(m.receipts[0].receivedAt);
        if (lastReceiptDate.getTime() > expected.getTime()) {
          isDelayed = true;
        }
      } else if (now.getTime() > expected.getTime()) {
        isDelayed = true;
      }

      if (isDelayed) {
        pGroup.delayedDispatchesCount++;
      }

      pGroup.manifests.push({
        id: m.id,
        manifestNumber: m.manifestNumber,
        totalQuantity: m.totalQuantity,
        receivedOk: mOk,
        missing: mMissing,
        damaged: mDamaged,
        expectedReturnDate: m.expectedReturnDate,
        isReceiptClosed: m.isReceiptClosed,
        receiptStatus: m.receiptStatus,
        isDelayed,
      });
    }

    const reports = Object.values(partnersMap).map((p) => {
      const yieldPercentage =
        p.totalSent > 0 ? Number(((p.totalReceivedOk / p.totalSent) * 100).toFixed(2)) : 0;

      return {
        ...p,
        yieldPercentage,
      };
    });

    return res.json({
      from: from || null,
      to: to || null,
      totalPartners: reports.length,
      reports,
    });
  } catch (err: any) {
    console.error("Erro ao gerar relatório de rendimento de costura:", err);
    return res.status(500).json({ error: "Erro interno ao gerar relatório de rendimento." });
  }
});
