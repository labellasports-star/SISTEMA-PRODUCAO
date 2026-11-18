import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";

export const approvalRouter = Router();

approvalRouter.use(authenticateToken);

const clientApprovalSchema = z.object({
  decision: z.enum(["APPROVED", "REVISION_REQUESTED"]),
  approvedByPerson: z.string().optional(),
  feedbackNotes: z.string().min(3, "Observações do cliente são obrigatórias para formalização."),
});

// POST /api/quotations/:id/client-approval
approvalRouter.post(
  "/:id/client-approval",
  requireRole("VENDEDOR", "ADMIN", "GESTOR"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const parseResult = clientApprovalSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.errors[0].message });
        return;
      }

      const quotation: any = await prisma.quotation.findUnique({
        where: { id },
        include: {
          customer: true,
          designer: { select: { id: true, name: true } },
          designBrief: {
            include: {
              versions: {
                orderBy: { versionNumber: "desc" },
                take: 1,
                include: { designer: { select: { id: true, name: true } } },
              },
            },
          },
        },
      });

      if (!quotation) {
        res.status(404).json({ error: "Orçamento não encontrado." });
        return;
      }

      // Validação de isolamento horizontal: apenas o vendedor responsável ou gestão/admin podem decidir
      if (req.user!.role === "VENDEDOR" && quotation.sellerId !== req.user!.id) {
        res.status(403).json({
          error: "Acesso negado: Você não é o vendedor responsável por esta ficha.",
        });
        return;
      }

      // Validação de máquina de estados: apenas em AGUARDANDO_APROVACAO_ARTE
      if (quotation.status !== "AGUARDANDO_APROVACAO_ARTE") {
        res.status(400).json({
          error: `Transição inválida: A ficha está no status '${quotation.status}', mas deve estar em 'AGUARDANDO_APROVACAO_ARTE' para registrar a decisão do cliente.`,
        });
        return;
      }

      const { decision, approvedByPerson, feedbackNotes } = parseResult.data;
      const latestVersion = quotation.designBrief?.versions[0];

      if (!latestVersion) {
        res.status(400).json({
          error: "Não é possível decidir sobre a arte sem que o designer tenha anexado ao menos uma versão.",
        });
        return;
      }

      if (decision === "APPROVED") {
        // Marcar versão como aprovada
        await prisma.artworkVersion.update({
          where: { id: latestVersion.id },
          data: { status: "APPROVED" },
        });

        const approverName = approvedByPerson || quotation.customer?.contactName || "Cliente";

        const updated = await prisma.quotation.update({
          where: { id },
          data: {
            isArtworkApproved: true,
            artworkApprovalDate: new Date(),
            artworkApprovedBy: approverName,
            artworkApprovalNotes: feedbackNotes,
            status: "ORCAMENTO_APROVADO",
            timeline: {
              create: {
                fromStatus: quotation.status,
                toStatus: "ORCAMENTO_APROVADO",
                userId: req.user!.id,
                notes: `Arte (v${latestVersion.versionNumber}) aprovada pelo cliente (${approverName}). Parecer: ${feedbackNotes}`,
              },
            },
          },
        });

        await logAudit({
          userId: req.user!.id,
          action: "ARTWORK_APPROVED_BY_CLIENT",
          entityName: "Quotation",
          entityId: id,
          newValues: {
            versionNumber: latestVersion.versionNumber,
            isArtworkApproved: true,
            approvedBy: approverName,
            feedbackNotes,
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });

        const { io } = await import("../server.js");
        io.to("sector_VENDAS")
          .to("sector_DESIGN")
          .to("sector_DESIGNER")
          .to("sector_ADMIN")
          .to("sector_GESTAO")
          .emit("client_approval_updated", {
            quotationId: id,
            quotationNumber: updated.quotationNumber,
            versionNumber: latestVersion.versionNumber,
            decision: "APPROVED",
            isArtworkApproved: true,
            status: updated.status,
            approvedByPerson: approverName,
          });

        res.json({
          success: true,
          message: `Arte v${latestVersion.versionNumber} aprovada com sucesso! Pronto para conferência e encaminhamento.`,
          quotation: updated,
        });
      } else {
        // Solicitação de Alteração da Arte pelo cliente
        await prisma.artworkVersion.update({
          where: { id: latestVersion.id },
          data: { status: "REVISION_REQUESTED" },
        });

        const designerName = quotation.designer?.name || latestVersion.designer?.name || "Designer";

        const updated = await prisma.quotation.update({
          where: { id },
          data: {
            isArtworkApproved: false,
            artworkApprovalNotes: feedbackNotes,
            status: "ARTE_EM_ALTERACAO",
            timeline: {
              create: {
                fromStatus: quotation.status,
                toStatus: "ARTE_EM_ALTERACAO",
                userId: req.user!.id,
                notes: `Cliente solicitou alterações na arte (v${latestVersion.versionNumber}): ${feedbackNotes}. Retornado para a fila do designer ${designerName}.`,
              },
            },
          },
        });

        await logAudit({
          userId: req.user!.id,
          action: "ARTWORK_REVISION_REQUESTED",
          entityName: "Quotation",
          entityId: id,
          newValues: {
            versionNumber: latestVersion.versionNumber,
            feedbackNotes,
            status: "ARTE_EM_ALTERACAO",
            designerId: quotation.designerId,
          },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });

        const { io } = await import("../server.js");
        io.to("sector_VENDAS")
          .to("sector_DESIGN")
          .to("sector_DESIGNER")
          .to("sector_ADMIN")
          .to("sector_GESTAO")
          .emit("client_approval_updated", {
            quotationId: id,
            quotationNumber: updated.quotationNumber,
            versionNumber: latestVersion.versionNumber,
            decision: "REVISION_REQUESTED",
            isArtworkApproved: false,
            status: updated.status,
            feedbackNotes,
          });

        res.json({
          success: true,
          message: `Alterações solicitadas na arte v${latestVersion.versionNumber} registradas e devolvidas para o designer ${designerName}.`,
          quotation: updated,
        });
      }
    } catch (error) {
      console.error("Erro ao registrar aprovação do cliente:", error);
      res.status(500).json({ error: "Erro ao processar aprovação do cliente." });
    }
  }
);
