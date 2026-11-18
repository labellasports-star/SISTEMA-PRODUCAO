import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";

export const designRouter = Router();

designRouter.use(authenticateToken);

// GET /api/design/queue - Fila de arte com prioridades e prazos
designRouter.get("/queue", async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const queue = await prisma.quotation.findMany({
      where: {
        status: {
          in: ["SOLICITACAO_ARTE", "DESENVOLVIMENTO_ARTE", "ARTE_EM_ALTERACAO"],
        },
      },
      include: {
        customer: true,
        seller: { select: { id: true, name: true, phone: true } },
        designer: { select: { id: true, name: true } },
        items: true,
        designBrief: {
          include: {
            versions: {
              orderBy: { versionNumber: "desc" },
            },
          },
        },
        attachments: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ desiredDeadline: "asc" }, { createdAt: "asc" }],
    });

    res.json(queue);
  } catch (error) {
    console.error("Erro ao listar fila do designer:", error);
    res.status(500).json({ error: "Erro ao buscar fila de artes." });
  }
});

// POST /api/design/:quotationId/claim - Designer assume o desenvolvimento da arte
designRouter.post(
  "/:quotationId/claim",
  requireRole("DESIGNER", "ADMIN", "GESTOR"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { quotationId } = req.params;

      const quotation: any = await prisma.quotation.findUnique({
        where: { id: quotationId },
        include: { designBrief: true },
      });

      if (!quotation) {
        res.status(404).json({ error: "Orçamento não encontrado." });
        return;
      }

      // Atualizar designer responsável e transicionar status
      const updated = await prisma.quotation.update({
        where: { id: quotationId },
        data: {
          designerId: req.user!.id,
          status: "DESENVOLVIMENTO_ARTE",
          timeline: {
            create: {
              fromStatus: quotation.status,
              toStatus: "DESENVOLVIMENTO_ARTE",
              userId: req.user!.id,
              notes: `Designer ${req.user!.name} assumiu o desenvolvimento da arte.`,
            },
          },
        },
      });

      if (quotation.designBrief) {
        await prisma.designBrief.update({
          where: { id: quotation.designBrief.id },
          data: { status: "IN_PROGRESS" },
        });
      }

      await logAudit({
        userId: req.user!.id,
        action: "DESIGN_CLAIMED",
        entityName: "Quotation",
        entityId: quotationId,
        newValues: { designerId: req.user!.id, status: "DESENVOLVIMENTO_ARTE" },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json(updated);
    } catch (error) {
      console.error("Erro ao assumir arte:", error);
      res.status(500).json({ error: "Erro ao assumir desenvolvimento da arte." });
    }
  }
);

// POST /api/design/:quotationId/versions - Enviar nova versão da arte desenvolvida
const newVersionSchema = z.object({
  previewUrl: z.string().min(1, "A imagem de prévia (PNG/JPG) é obrigatória para o cliente visualizar."),
  vectorUrl: z.string().optional(),
  changeNotes: z.string().optional(),
});

designRouter.post(
  "/:quotationId/versions",
  requireRole("DESIGNER", "ADMIN", "GESTOR"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { quotationId } = req.params;
      const parseResult = newVersionSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.errors[0].message });
        return;
      }

      const quotation: any = await prisma.quotation.findUnique({
        where: { id: quotationId },
        include: {
          designBrief: {
            include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
          },
        },
      });

      if (!quotation) {
        res.status(404).json({ error: "Orçamento não encontrado." });
        return;
      }

      // Se ainda não existir briefing criado, cria automaticamente
      let briefId = quotation.designBrief?.id;
      if (!briefId) {
        const newBrief = await prisma.designBrief.create({
          data: {
            quotationId,
            briefingText: quotation.observations || "Briefing inicial da arte",
            status: "IN_PROGRESS",
          },
        });
        briefId = newBrief.id;
      }

      const lastVersionNumber = quotation.designBrief?.versions[0]?.versionNumber || 0;
      const nextVersionNumber = lastVersionNumber + 1;

      const createdVersion = await prisma.artworkVersion.create({
        data: {
          designBriefId: briefId,
          versionNumber: nextVersionNumber,
          previewUrl: parseResult.data.previewUrl,
          vectorUrl: parseResult.data.vectorUrl || null,
          changeNotes: parseResult.data.changeNotes || `Versão ${nextVersionNumber} finalizada pelo designer.`,
          designerId: req.user!.id,
          status: "SUBMITTED",
        },
        include: {
          designer: { select: { id: true, name: true } },
        },
      });

      // Transiciona o status do orçamento para AGUARDANDO_APROVACAO_ARTE
      const updatedQuotation = await prisma.quotation.update({
        where: { id: quotationId },
        data: {
          status: "AGUARDANDO_APROVACAO_ARTE",
          timeline: {
            create: {
              fromStatus: quotation.status,
              toStatus: "AGUARDANDO_APROVACAO_ARTE",
              userId: req.user!.id,
              notes: `Arte Versão ${nextVersionNumber} anexada. Encaminhada para apresentação ao cliente.`,
            },
          },
        },
      });

      await logAudit({
        userId: req.user!.id,
        action: "ARTWORK_VERSION_SUBMITTED",
        entityName: "ArtworkVersion",
        entityId: createdVersion.id,
        newValues: { quotationId, versionNumber: nextVersionNumber },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      // Emissão Socket.io restrita aos setores autorizados (Vendas, Design e Gestão)
      const { io } = await import("../server.js");
      io.to("sector_VENDAS")
        .to("sector_DESIGN")
        .to("sector_DESIGNER")
        .to("sector_ADMIN")
        .to("sector_GESTAO")
        .emit("artwork_version_submitted", {
          quotationId,
          quotationNumber: updatedQuotation.quotationNumber,
          teamName: updatedQuotation.teamName,
          versionNumber: nextVersionNumber,
          previewUrl: createdVersion.previewUrl,
          designerName: req.user!.name,
        });

      res.status(201).json(createdVersion);
    } catch (error) {
      console.error("Erro ao enviar versão de arte:", error);
      res.status(500).json({ error: "Erro ao cadastrar versão de arte." });
    }
  }
);
