import { Router, Response } from "express";
import { prisma } from "../prisma.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";

export const sectorsRouter = Router();

sectorsRouter.use(authenticateToken);

// GET /api/sectors - Lista todos os 14 setores com contadores operacionais
sectorsRouter.get("/", async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const sectors = await prisma.sector.findMany({
      orderBy: { sequenceOrder: "asc" },
      include: {
        _count: {
          select: {
            users: { where: { isActive: true } },
            currentBatches: true,
          },
        },
      },
    });

    // Buscar detalhamento de status de lotes por setor
    const batchesGrouped = await prisma.opBatch.groupBy({
      by: ["currentSectorId", "batchStatus"],
      _count: { id: true },
    });

    const formattedSectors = sectors.map((s) => {
      const sectorBatches = batchesGrouped.filter((b) => b.currentSectorId === s.id);
      const waitingCount = sectorBatches.find((b) => b.batchStatus === "WAITING")?._count.id || 0;
      const inProgressCount = sectorBatches.find((b) => b.batchStatus === "IN_PROGRESS")?._count.id || 0;
      const reworkCount = sectorBatches.find((b) => b.batchStatus === "REWORK")?._count.id || 0;
      const completedCount = sectorBatches.find((b) => b.batchStatus === "COMPLETED")?._count.id || 0;

      return {
        id: s.id,
        sequenceOrder: s.sequenceOrder,
        code: s.code,
        name: s.name,
        description: s.description,
        allowsExternalDispatch: s.allowsExternalDispatch,
        allowsReworkOrigin: s.allowsReworkOrigin,
        isActive: s.isActive,
        activeUsersCount: s._count.users,
        totalBatches: s._count.currentBatches,
        metrics: {
          waiting: waitingCount,
          inProgress: inProgressCount,
          rework: reworkCount,
          completed: completedCount,
        },
      };
    });

    res.json(formattedSectors);
  } catch (error) {
    console.error("Erro ao listar setores:", error);
    res.status(500).json({ error: "Erro ao listar setores." });
  }
});

// GET /api/sectors/:id/operators - Operadores alocados a um setor específico
sectorsRouter.get("/:id/operators", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const operators = await prisma.user.findMany({
      where: {
        sectorId: id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        signaturePinHash: true,
      },
      orderBy: { name: "asc" },
    });

    res.json(
      operators.map((op) => ({
        id: op.id,
        name: op.name,
        email: op.email,
        role: op.role,
        hasPin: !!op.signaturePinHash,
      }))
    );
  } catch (error) {
    console.error("Erro ao listar operadores do setor:", error);
    res.status(500).json({ error: "Erro ao buscar operadores." });
  }
});
