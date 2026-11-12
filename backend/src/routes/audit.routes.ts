import { Router, Response } from "express";
import { prisma } from "../prisma.js";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../middleware/auth.js";

export const auditRouter = Router();

auditRouter.use(authenticateToken);
auditRouter.use(requireRole("ADMIN", "GESTOR"));

// GET /api/audit-logs
auditRouter.get("/", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    res.json(logs);
  } catch (error) {
    console.error("Erro ao buscar logs de auditoria:", error);
    res.status(500).json({ error: "Erro ao buscar trilha de auditoria." });
  }
});
