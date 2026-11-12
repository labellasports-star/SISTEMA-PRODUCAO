import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { hashPassword, hashPin } from "../utils/security.js";
import { logAudit } from "../utils/audit.js";
import { authenticateToken, requireAdmin, AuthenticatedRequest } from "../middleware/auth.js";

export const usersRouter = Router();

// Todas as rotas de usuários exigem autenticação de Administrador
usersRouter.use(authenticateToken);
usersRouter.use(requireAdmin);

const createUserSchema = z.object({
  name: z.string().min(2, "Nome deve conter no mínimo 2 caracteres."),
  email: z.string().email("E-mail em formato inválido."),
  password: z.string().min(6, "A senha deve conter no mínimo 6 caracteres."),
  role: z.enum(["ADMIN", "GESTOR", "OPERADOR", "VENDEDOR", "DESIGNER"]),
  sectorId: z.string().uuid("ID do setor inválido.").nullable().optional(),
  signaturePin: z.string().regex(/^\d{4,8}$/, "O PIN deve conter de 4 a 8 dígitos.").optional(),
  phone: z.string().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["ADMIN", "GESTOR", "OPERADOR", "VENDEDOR", "DESIGNER"]).optional(),
  sectorId: z.string().uuid().nullable().optional(),
  password: z.string().min(6).optional(),
  signaturePin: z.string().regex(/^\d{4,8}$/).optional(),
  phone: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/users - Listar usuários
usersRouter.get("/", async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      include: {
        sector: {
          select: { id: true, name: true, code: true, sequenceOrder: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const sanitizedUsers = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      sectorId: u.sectorId,
      sector: u.sector,
      isActive: u.isActive,
      phone: u.phone,
      hasPin: !!u.signaturePinHash,
      createdAt: u.createdAt,
    }));

    res.json(sanitizedUsers);
  } catch (error) {
    console.error("Erro ao listar usuários:", error);
    res.status(500).json({ error: "Erro ao buscar usuários." });
  }
});

// POST /api/users - Criar usuário
usersRouter.post("/", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = createUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const data = parseResult.data;
    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });

    if (existing) {
      res.status(409).json({ error: "Já existe um usuário cadastrado com este e-mail." });
      return;
    }

    let sectorId = data.sectorId || null;
    if (!sectorId) {
      if (data.role === "VENDEDOR") {
        const s =
          (await prisma.sector.findUnique({ where: { code: "VENDAS" } })) ||
          (await prisma.sector.findFirst({ where: { sequenceOrder: 3 } }));
        sectorId = s?.id || null;
      } else if (data.role === "DESIGNER") {
        const s =
          (await prisma.sector.findUnique({ where: { code: "DESIGNER" } })) ||
          (await prisma.sector.findUnique({ where: { code: "DESIGN" } })) ||
          (await prisma.sector.findFirst({ where: { sequenceOrder: 2 } }));
        sectorId = s?.id || null;
      }
    }

    const passwordHash = await hashPassword(data.password);
    const signaturePinHash = data.signaturePin ? await hashPin(data.signaturePin) : null;

    const newUser = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase().trim(),
        passwordHash,
        signaturePinHash,
        role: data.role,
        sectorId,
        phone: data.phone || null,
        isActive: true,
      },
      include: { sector: true },
    });

    await logAudit({
      userId: req.user!.id,
      action: "USER_CREATED",
      entityName: "User",
      entityId: newUser.id,
      newValues: { name: newUser.name, email: newUser.email, role: newUser.role, sectorId: newUser.sectorId },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json({
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      sectorId: newUser.sectorId,
      sector: newUser.sector,
      hasPin: !!newUser.signaturePinHash,
      isActive: newUser.isActive,
    });
  } catch (error) {
    console.error("Erro ao criar usuário:", error);
    res.status(500).json({ error: "Erro ao criar usuário." });
  }
});

// PUT /api/users/:id - Atualizar usuário
usersRouter.put("/:id", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const parseResult = updateUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }

    const updateData: any = {};
    if (parseResult.data.name !== undefined) updateData.name = parseResult.data.name;
    if (parseResult.data.role !== undefined) updateData.role = parseResult.data.role;
    if (parseResult.data.sectorId !== undefined) updateData.sectorId = parseResult.data.sectorId;
    if (parseResult.data.phone !== undefined) updateData.phone = parseResult.data.phone;
    if (parseResult.data.isActive !== undefined) updateData.isActive = parseResult.data.isActive;

    if (parseResult.data.password) {
      updateData.passwordHash = await hashPassword(parseResult.data.password);
    }
    if (parseResult.data.signaturePin) {
      updateData.signaturePinHash = await hashPin(parseResult.data.signaturePin);
    }

    const updated: any = await prisma.user.update({
      where: { id },
      data: updateData,
      include: { sector: true },
    });

    await logAudit({
      userId: req.user!.id,
      action: "USER_UPDATED",
      entityName: "User",
      entityId: id,
      oldValues: { name: existingUser.name, role: existingUser.role, isActive: existingUser.isActive },
      newValues: { name: updated.name, role: updated.role, isActive: updated.isActive },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      sectorId: updated.sectorId,
      sector: updated.sector,
      isActive: updated.isActive,
      hasPin: !!updated.signaturePinHash,
    });
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    res.status(500).json({ error: "Erro ao atualizar usuário." });
  }
});
