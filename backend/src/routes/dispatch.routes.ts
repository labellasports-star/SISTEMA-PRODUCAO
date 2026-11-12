import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { verifyPin, generateDigitalSignature } from "../utils/security.js";
import { logAudit } from "../utils/audit.js";
import { io } from "../server.js";

export const dispatchRouter = Router();

dispatchRouter.use(authenticateToken);

// Função auxiliar para geração atômica de número de Romaneio: RE-YYYY-00001
export async function generateNextManifestNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `RE-${currentYear}-`;

  const allManifests = await prisma.dispatchManifest.findMany({
    where: { manifestNumber: { startsWith: prefix } },
    select: { manifestNumber: true },
  });

  let maxSequence = 0;
  for (const m of allManifests) {
    if (m.manifestNumber) {
      const parts = m.manifestNumber.split("-");
      if (parts.length === 3) {
        const parsed = parseInt(parts[2], 10);
        if (!isNaN(parsed) && parsed > maxSequence) {
          maxSequence = parsed;
        }
      }
    }
  }

  let nextSequence = maxSequence + 1;
  let candidate = `${prefix}${nextSequence.toString().padStart(5, "0")}`;

  while (await prisma.dispatchManifest.findUnique({ where: { manifestNumber: candidate } })) {
    nextSequence++;
    candidate = `${prefix}${nextSequence.toString().padStart(5, "0")}`;
  }

  return candidate;
}

const dispatchBatchSchema = z.object({
  sewingPartnerId: z.string().uuid("ID da oficina de costura inválido."),
  expectedReturnDate: z.string().min(1, "Data prevista de retorno é obrigatória."),
  sizeGridBreakdown: z.record(z.string(), z.number().int().min(0)),
  pin: z.string().min(4, "PIN de 4 a 6 dígitos é obrigatório."),
  notes: z.string().optional(),
});

// -----------------------------------------------------------------------------
// 1. POST /api/production/batches/:batchId/dispatch
// Despacho de lote do Setor 11 (DESPACHE_OFICINA) para Setor 12 (COSTURA)
// -----------------------------------------------------------------------------
dispatchRouter.post("/batches/:batchId/dispatch", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId } = req.params;
    const user = req.user!;
    const parseResult = dispatchBatchSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: "Dados de despache inválidos.",
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { sewingPartnerId, expectedReturnDate, sizeGridBreakdown, pin, notes } = parseResult.data;

    // 1. Consulta do lote
    const batch = await prisma.opBatch.findUnique({
      where: { id: batchId },
      include: {
        currentSector: true,
        productionOrder: {
          include: { customer: true },
        },
      },
    });

    if (!batch) {
      return res.status(404).json({ error: "Lote de produção não encontrado." });
    }

    const currentSectorCode = batch.currentSector.code;
    const isDespacheSector =
      currentSectorCode === "DESPACHE_OFICINA" ||
      batch.currentSector.sequenceOrder === 11;

    if (!isDespacheSector) {
      return res.status(400).json({
        error: `Despache para oficina permitido apenas no setor 'Despache para Oficina' (Setor 11). O lote encontra-se em '${currentSectorCode}'.`,
      });
    }

    // 2. RBAC estrito: Apenas operadores do setor de Despache, GESTOR ou ADMIN
    if (user.role !== "ADMIN" && user.role !== "GESTOR") {
      if (user.role !== "OPERADOR") {
        return res.status(403).json({
          error: `Acesso negado: O perfil '${user.role}' não possui permissão para despachar lotes de produção.`,
        });
      }

      const isUserInDespache =
        user.sectorCode === "DESPACHE_OFICINA" ||
        (user as any).sectorSequence === 11;

      if (!isUserInDespache) {
        return res.status(403).json({
          error: `Acesso negado: Você pertence a '${user.sectorCode || "Nenhum"}' e não pode realizar despaches no setor 'Despache para Oficina'.`,
        });
      }
    }

    // 3. Validação do PIN de assinatura digital do operador
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

    // 4. Validação da Oficina de Costura
    const partner = await prisma.sewingPartner.findUnique({
      where: { id: sewingPartnerId },
    });

    if (!partner || !partner.isActive) {
      return res.status(400).json({
        error: "Oficina de costura não encontrada ou inativa no sistema.",
      });
    }

    // 5. Validação da Data Prevista de Retorno (deve ser futura)
    const returnDate = new Date(expectedReturnDate);
    if (isNaN(returnDate.getTime()) || returnDate <= new Date()) {
      return res.status(400).json({
        error: "O prazo acordado de retorno deve ser uma data e hora futura.",
      });
    }

    // 6. Validação das quantidades por tamanho (coerência com o lote)
    const totalGrid = Object.values(sizeGridBreakdown).reduce((sum, qty) => sum + qty, 0);
    if (totalGrid !== batch.quantity) {
      return res.status(400).json({
        error: `A soma das quantidades da grade (${totalGrid} peças) diverge da quantidade total do lote (${batch.quantity} peças).`,
      });
    }

    // 7. Determinação do Setor de Destino (Setor 12: COSTURA)
    const nextSector = await prisma.sector.findUnique({
      where: { code: "COSTURA" },
    });

    if (!nextSector) {
      return res.status(500).json({ error: "Setor de destino (Costura) não configurado no sistema." });
    }

    // 8. Geração do número de Romaneio atômico
    const manifestNumber = await generateNextManifestNumber();

    // 9. Assinatura Digital HMAC-SHA-256
    const nowIso = new Date().toISOString();
    const signatureHash = generateDigitalSignature({
      batchId: batch.id,
      operatorId: user.id,
      fromSectorId: batch.currentSectorId,
      toSectorId: nextSector.id,
      timestamp: nowIso,
    });

    // 10. Payload estruturado para QR Code
    const qrPayload = JSON.stringify({
      manifestNumber,
      batchNumber: batch.batchNumber,
      opNumber: batch.productionOrder.opNumber,
      customerName: batch.productionOrder.customer?.companyName || "Cliente",
      partnerName: partner.name,
      totalQuantity: batch.quantity,
      expectedReturnDate: returnDate.toISOString().split("T")[0],
      signatureHash: signatureHash.substring(0, 16),
      issuedAt: nowIso,
    });

    // 11. Transação segura atômica
    const result = await prisma.$transaction(async (tx) => {
      // Criação do Romaneio de Envio
      const manifest = await tx.dispatchManifest.create({
        data: {
          manifestNumber,
          opBatchId: batch.id,
          productionOrderId: batch.productionOrderId,
          sewingPartnerId: partner.id,
          totalQuantity: batch.quantity,
          sizeGridBreakdown: JSON.stringify(sizeGridBreakdown),
          expectedReturnDate: returnDate,
          createdById: user.id,
          digitalSignatureHash: signatureHash,
          qrPayload,
          notes: notes || null,
        },
        include: {
          sewingPartner: true,
          createdBy: { select: { id: true, name: true, role: true } },
          productionOrder: { include: { customer: true } },
        },
      });

      // Registro de movimentação física com assinatura HMAC
      const movement = await tx.opMovement.create({
        data: {
          opBatchId: batch.id,
          fromSectorId: batch.currentSectorId,
          toSectorId: nextSector.id,
          operatorId: user.id,
          movementType: "FORWARD",
          receivedAt: batch.updatedAt,
          startedAt: batch.updatedAt,
          finishedAt: new Date(),
          digitalSignatureHash: signatureHash,
          signerPinVerified: true,
          notes: JSON.stringify({
            manifestNumber,
            sewingPartner: partner.name,
            expectedReturnDate: returnDate.toISOString(),
            sizeGrid: sizeGridBreakdown,
            notes: notes || null,
          }),
        },
        include: {
          fromSector: true,
          toSector: true,
          operator: { select: { id: true, name: true, role: true } },
        },
      });

      // Atualização do lote para o Setor 12 (Costura)
      const updatedBatch = await tx.opBatch.update({
        where: { id: batch.id },
        data: {
          currentSectorId: nextSector.id,
          batchStatus: "WAITING",
          assignedOperatorId: null,
          isUnderRework: false,
          reworkReason: null,
        },
        include: {
          currentSector: true,
          productionOrder: true,
        },
      });

      // Sincronizar registro de remessa legado SewingDispatch
      await tx.sewingDispatch.create({
        data: {
          dispatchNumber: manifestNumber.replace("RE-", "REM-"),
          opBatchId: batch.id,
          sewingPartnerId: partner.id,
          quantitySent: batch.quantity,
          expectedReturnDate: returnDate,
          pricePerPiece: partner.basePricePerPc,
          totalPrice: partner.basePricePerPc * batch.quantity,
          status: "SENT",
          notes: notes || null,
        },
      });

      return { manifest, movement, updatedBatch };
    });

    // 12. Auditoria append-only
    await logAudit({
      userId: user.id,
      action: "BATCH_DISPATCHED_TO_SEWING",
      entityName: "DispatchManifest",
      entityId: result.manifest.id,
      newValues: {
        manifestNumber: result.manifest.manifestNumber,
        batchNumber: batch.batchNumber,
        partnerName: partner.name,
        totalQuantity: batch.quantity,
        expectedReturnDate: returnDate.toISOString(),
        signatureHash,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // 13. Notificação via Socket.io
    io.to("sector_DESPACHE_OFICINA")
      .to("sector_COSTURA")
      .to("sector_ADMIN")
      .to("sector_GESTAO")
      .emit("batch_dispatched", {
        manifestNumber: result.manifest.manifestNumber,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        opNumber: batch.productionOrder.opNumber,
        partnerName: partner.name,
        totalQuantity: batch.quantity,
        dispatchedBy: user.name,
      });

    return res.status(201).json({
      message: `Lote ${batch.batchNumber} despachado com sucesso para ${partner.name}! Romaneio ${result.manifest.manifestNumber} gerado.`,
      manifest: result.manifest,
      batch: result.updatedBatch,
      movement: result.movement,
    });
  } catch (err: any) {
    console.error("Erro ao processar despache para oficina:", err);
    return res.status(500).json({ error: "Erro interno ao processar despache para oficina." });
  }
});

// -----------------------------------------------------------------------------
// 2. GET /api/production/dispatch/manifests/:id
// Consulta de Romaneio por ID
// -----------------------------------------------------------------------------
dispatchRouter.get("/dispatch/manifests/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const manifest = await prisma.dispatchManifest.findUnique({
      where: { id },
      include: {
        sewingPartner: true,
        createdBy: { select: { id: true, name: true, role: true, email: true } },
        lastReprintBy: { select: { id: true, name: true, role: true } },
        opBatch: {
          include: {
            currentSector: true,
          },
        },
        productionOrder: {
          include: {
            customer: true,
            quotation: { select: { quotationNumber: true, teamName: true } },
          },
        },
      },
    });

    if (!manifest) {
      return res.status(404).json({ error: "Romaneio de envio não encontrado." });
    }

    return res.json(manifest);
  } catch (err: any) {
    console.error("Erro ao consultar romaneio:", err);
    return res.status(500).json({ error: "Erro ao consultar romaneio." });
  }
});

// -----------------------------------------------------------------------------
// 3. GET /api/production/dispatch/manifests/by-batch/:batchId
// Consulta do Romaneio de Envio ativo pelo ID do lote
// -----------------------------------------------------------------------------
dispatchRouter.get("/dispatch/manifests/by-batch/:batchId", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchId } = req.params;
    const manifest = await prisma.dispatchManifest.findFirst({
      where: { opBatchId: batchId },
      orderBy: { createdAt: "desc" },
      include: {
        sewingPartner: true,
        createdBy: { select: { id: true, name: true, role: true } },
        lastReprintBy: { select: { id: true, name: true, role: true } },
        productionOrder: { include: { customer: true } },
      },
    });

    if (!manifest) {
      return res.status(404).json({ error: "Nenhum romaneio de envio encontrado para este lote." });
    }

    return res.json(manifest);
  } catch (err: any) {
    console.error("Erro ao consultar romaneio por lote:", err);
    return res.status(500).json({ error: "Erro ao buscar romaneio do lote." });
  }
});

// -----------------------------------------------------------------------------
// 4. POST /api/production/dispatch/manifests/:id/reprint
// Reimpressão com registro em AuditLog e preservação do número original
// -----------------------------------------------------------------------------
const reprintSchema = z.object({
  reason: z.string().optional(),
});

dispatchRouter.post("/dispatch/manifests/:id/reprint", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const parseResult = reprintSchema.safeParse(req.body);
    const reason = parseResult.success && parseResult.data.reason ? parseResult.data.reason : "Reimpressão solicitada";

    // RBAC: Despache, Gestor ou Admin
    if (user.role !== "ADMIN" && user.role !== "GESTOR") {
      const isDespacheOp =
        user.role === "OPERADOR" &&
        (user.sectorCode === "DESPACHE_OFICINA" || user.sectorCode === "COSTURA");
      if (!isDespacheOp) {
        return res.status(403).json({
          error: "Acesso negado: Você não possui permissão para reimprimir romaneios de envio.",
        });
      }
    }

    const manifest = await prisma.dispatchManifest.findUnique({
      where: { id },
    });

    if (!manifest) {
      return res.status(404).json({ error: "Romaneio de envio não encontrado." });
    }

    const updated = await prisma.dispatchManifest.update({
      where: { id },
      data: {
        reprintCount: manifest.reprintCount + 1,
        lastReprintAt: new Date(),
        lastReprintById: user.id,
      },
      include: {
        sewingPartner: true,
        createdBy: { select: { id: true, name: true } },
        lastReprintBy: { select: { id: true, name: true } },
        productionOrder: { include: { customer: true } },
      },
    });

    await logAudit({
      userId: user.id,
      action: "MANIFEST_REPRINTED",
      entityName: "DispatchManifest",
      entityId: manifest.id,
      oldValues: { reprintCount: manifest.reprintCount },
      newValues: {
        manifestNumber: manifest.manifestNumber,
        reprintCount: updated.reprintCount,
        reason,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return res.json({
      message: `Reimpressão do Romaneio ${manifest.manifestNumber} registrada com sucesso. Total de reimpressões: ${updated.reprintCount}.`,
      manifest: updated,
    });
  } catch (err: any) {
    console.error("Erro ao registrar reimpressão do romaneio:", err);
    return res.status(500).json({ error: "Erro interno ao processar reimpressão." });
  }
});

// -----------------------------------------------------------------------------
// 5. GET /api/production/dispatch/manifests/:id/qr-code
// Obtenção do payload de QR Code para renderização no cliente
// -----------------------------------------------------------------------------
dispatchRouter.get("/dispatch/manifests/:id/qr-code", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const manifest = await prisma.dispatchManifest.findUnique({
      where: { id },
      select: { manifestNumber: true, qrPayload: true, digitalSignatureHash: true },
    });

    if (!manifest) {
      return res.status(404).json({ error: "Romaneio de envio não encontrado." });
    }

    return res.json({
      manifestNumber: manifest.manifestNumber,
      qrPayload: manifest.qrPayload,
      digitalSignatureHash: manifest.digitalSignatureHash,
    });
  } catch (err: any) {
    console.error("Erro ao consultar QR Code do romaneio:", err);
    return res.status(500).json({ error: "Erro ao gerar dados de QR Code." });
  }
});
