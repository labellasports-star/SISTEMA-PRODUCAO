import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { comparePassword, generateToken, hashPin, verifyPin } from "../utils/security.js";
import { logAudit } from "../utils/audit.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email("E-mail em formato inválido."),
  password: z.string().min(1, "A senha é obrigatória."),
});

// POST /api/auth/login
authRouter.post("/login", async (req, res): Promise<void> => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const { email, password } = parseResult.data;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { sector: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: "Credenciais inválidas ou usuário inativo." });
      return;
    }

    const passwordMatch = await comparePassword(password, user.passwordHash);
    if (!passwordMatch) {
      res.status(401).json({ error: "Credenciais inválidas." });
      return;
    }

    const token = generateToken({ userId: user.id });

    // Registro na auditoria
    await logAudit({
      userId: user.id,
      action: "USER_LOGIN_SUCCESS",
      entityName: "User",
      entityId: user.id,
      newValues: { email: user.email, role: user.role, sector: user.sector?.name },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        sectorId: user.sectorId,
        sectorName: user.sector?.name || null,
        sectorCode: user.sector?.code || null,
        sector: user.sector ? {
          id: user.sector.id,
          name: user.sector.name,
          code: user.sector.code,
          sequenceOrder: user.sector.sequenceOrder,
        } : undefined,
        hasPin: !!user.signaturePinHash,
      },
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro interno ao processar autenticação." });
  }
});

// GET /api/auth/me
authRouter.get("/me", authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  res.json({ user: req.user });
});

// POST /api/auth/verify-pin
// Utilizado para autorizar assinaturas operacionais de OPs
const pinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, "O PIN deve conter de 4 a 6 dígitos numéricos."),
});

authRouter.post("/verify-pin", authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = pinSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.signaturePinHash) {
      res.status(400).json({
        error: "Este usuário ainda não possui um PIN de assinatura cadastrado. Cadastre o PIN antes de assinar.",
      });
      return;
    }

    const isPinValid = await verifyPin(parseResult.data.pin, user.signaturePinHash);
    if (!isPinValid) {
      res.status(403).json({ error: "PIN de assinatura incorreto. Verifique e tente novamente." });
      return;
    }

    res.json({ success: true, message: "PIN de assinatura verificado com sucesso." });
  } catch (error) {
    console.error("Erro ao validar PIN:", error);
    res.status(500).json({ error: "Erro interno ao verificar PIN." });
  }
});

// POST /api/auth/set-pin
authRouter.post("/set-pin", authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = pinSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const userId = req.user!.id;
    const pinHash = await hashPin(parseResult.data.pin);

    await prisma.user.update({
      where: { id: userId },
      data: { signaturePinHash: pinHash },
    });

    await logAudit({
      userId,
      action: "USER_PIN_UPDATED",
      entityName: "User",
      entityId: userId,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ success: true, message: "PIN individual cadastrado com sucesso!" });
  } catch (error) {
    console.error("Erro ao cadastrar PIN:", error);
    res.status(500).json({ error: "Erro interno ao cadastrar PIN." });
  }
});
