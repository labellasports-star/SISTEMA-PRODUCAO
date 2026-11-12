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
          designBrief: {
            include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
          },
        },
      });

      if (!quotation) {
        res.status(404).json({ error: "Orçamento não encontrado." });
        return;
      }

      const { decision, approvedByPerson, feedbackNotes } = parseResult.data;
      const latestVersion = quotation.designBrief?.versions[0];

      if (decision === "APPROVED") {
        if (!latestVersion) {
          res.status(400).json({
            error: "Não é possível aprovar a arte sem que o designer tenha anexado ao menos uma versão final.",
          });
          return;
        }

        // Marcar versão como aprovada
        await prisma.artworkVersion.update({
          where: { id: latestVersion.id },
          data: { status: "APPROVED" },
        });

        const updated = await prisma.quotation.update({
          where: { id },
          data: {
            isArtworkApproved: true,
            artworkApprovalDate: new Date(),
            artworkApprovedBy: approvedByPerson || quotation.customer.contactName,
            artworkApprovalNotes: feedbackNotes,
            status: "ORCAMENTO_APROVADO",
            timeline: {
              create: {
                fromStatus: quotation.status,
                toStatus: "ORCAMENTO_APROVADO",
                userId: req.user!.id,
                notes: `Arte aprovada pelo cliente (${approvedByPerson || "Cliente"}). Parecer: ${feedbackNotes}`,
              },
            },
          },
        });

        await logAudit({
          userId: req.user!.id,
          action: "ARTWORK_APPROVED_BY_CLIENT",
          entityName: "Quotation",
          entityId: id,
          newValues: { isArtworkApproved: true, approvedBy: approvedByPerson },
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
            decision: "APPROVED",
            isArtworkApproved: true,
            status: updated.status,
            approvedByPerson,
          });

        res.json({
          success: true,
          message: "Arte e orçamento aprovados pelo cliente com sucesso! Pronto para conversão em venda.",
          quotation: updated,
        });
      } else {
        // Solicitação de Alteração da Arte pelo cliente
        if (latestVersion) {
          await prisma.artworkVersion.update({
            where: { id: latestVersion.id },
            data: { status: "REVISION_REQUESTED" },
          });
        }

        const updated = await prisma.quotation.update({
          where: { id },
          data: {
            isArtworkApproved: false,
            status: "ARTE_EM_ALTERACAO",
            timeline: {
              create: {
                fromStatus: quotation.status,
                toStatus: "ARTE_EM_ALTERACAO",
                userId: req.user!.id,
                notes: `Cliente solicitou alterações na arte: ${feedbackNotes}. Retornado para a fila do Designer.`,
              },
            },
          },
        });

        await logAudit({
          userId: req.user!.id,
          action: "ARTWORK_REVISION_REQUESTED",
          entityName: "Quotation",
          entityId: id,
          newValues: { feedbackNotes, status: "ARTE_EM_ALTERACAO" },
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
        });

        const { io } = await import("../server.js");
        io.to("sector_VENDAS")
          .to("sector_DESIGN")
          .to("sector_ADMIN")
          .to("sector_GESTAO")
          .emit("client_approval_updated", {
            quotationId: id,
            quotationNumber: updated.quotationNumber,
            decision: "REVISION_REQUESTED",
            isArtworkApproved: false,
            status: updated.status,
            feedbackNotes,
          });

        res.json({
          success: true,
          message: "Alterações solicitadas registradas e arte devolvida para o Designer.",
          quotation: updated,
        });
      }
    } catch (error) {
      console.error("Erro ao registrar aprovação do cliente:", error);
      res.status(500).json({ error: "Erro ao processar aprovação do cliente." });
    }
  }
);
