import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, requireRole, AuthenticatedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";

export const sewingRouter = Router();

sewingRouter.use(authenticateToken);

const createPartnerSchema = z.object({
  type: z.enum(["INTERNAL", "EXTERNAL"]),
  name: z.string().min(2, "Nome da oficina é obrigatório."),
  documentNumber: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  basePricePerPc: z.number().min(0, "Preço por peça não pode ser negativo.").default(0.0),
  notes: z.string().optional(),
});

// GET /api/sewing-partners - Listar oficinas
sewingRouter.get("/", async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const partners = await prisma.sewingPartner.findMany({
      include: {
        _count: {
          select: { dispatches: true },
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    res.json(partners);
  } catch (error) {
    console.error("Erro ao listar oficinas de costura:", error);
    res.status(500).json({ error: "Erro ao listar oficinas." });
  }
});

// POST /api/sewing-partners - Criar oficina (Admin ou Gestor)
sewingRouter.post(
  "/",
  requireRole("ADMIN", "GESTOR"),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const parseResult = createPartnerSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: parseResult.error.errors[0].message });
        return;
      }

      const partner = await prisma.sewingPartner.create({
        data: parseResult.data as any,
      });

      await logAudit({
        userId: req.user!.id,
        action: "SEWING_PARTNER_CREATED",
        entityName: "SewingPartner",
        entityId: partner.id,
        newValues: partner,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.status(201).json(partner);
    } catch (error) {
      console.error("Erro ao criar oficina:", error);
      res.status(500).json({ error: "Erro ao criar parceiro de costura." });
    }
  }
);
