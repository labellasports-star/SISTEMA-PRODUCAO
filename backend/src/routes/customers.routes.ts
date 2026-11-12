import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";

export const customersRouter = Router();

customersRouter.use(authenticateToken);

const customerSchema = z.object({
  companyName: z.string().min(2, "Nome da empresa/cliente é obrigatório."),
  contactName: z.string().min(2, "Nome do contato responsável é obrigatório."),
  email: z.string().email("E-mail em formato inválido.").optional().or(z.literal("")),
  phone: z.string().min(8, "Telefone de contato é obrigatório."),
  cityState: z.string().optional(),
  notes: z.string().optional(),
  sellerId: z.string().optional().nullable(),
});

// GET /api/customers - Listar clientes com busca por nome, telefone ou empresa
customersRouter.get("/", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const search = req.query.search as string;
    const whereClause: any = {};

    if (search) {
      whereClause.OR = [
        { companyName: { contains: search } },
        { contactName: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where: whereClause,
      include: {
        seller: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: {
            quotations: true,
            productionOrders: true,
          },
        },
      },
      orderBy: { companyName: "asc" },
      take: 50,
    });

    res.json(customers);
  } catch (error) {
    console.error("Erro ao listar clientes:", error);
    res.status(500).json({ error: "Erro ao buscar clientes." });
  }
});

// POST /api/customers - Cadastrar ou recuperar cliente evitando duplicações
customersRouter.post("/", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parseResult = customerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const data = parseResult.data;

    // Verificar se já existe cliente cadastrado com o mesmo telefone ou empresa
    const cleanPhone = data.phone.replace(/\D/g, "");
    const existing = await prisma.customer.findFirst({
      where: {
        OR: [
          { phone: data.phone },
          { companyName: data.companyName.trim() },
        ],
      },
    });

    if (existing) {
      res.status(200).json({
        ...existing,
        isExisting: true,
        message: "Cliente já existente selecionado automaticamente.",
      });
      return;
    }

    let sellerId: string | null = null;
    if (req.user!.role === "VENDEDOR") {
      sellerId = req.user!.id;
    } else if (data.sellerId && (req.user!.role === "ADMIN" || req.user!.role === "GESTOR")) {
      sellerId = data.sellerId;
    }

    const newCustomer = await prisma.customer.create({
      data: {
        companyName: data.companyName.trim(),
        contactName: data.contactName.trim(),
        email: data.email || null,
        phone: data.phone.trim(),
        cityState: data.cityState || null,
        notes: data.notes || null,
        sellerId,
      },
    });

    await logAudit({
      userId: req.user!.id,
      action: "CUSTOMER_CREATED",
      entityName: "Customer",
      entityId: newCustomer.id,
      newValues: newCustomer,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.status(201).json(newCustomer);
  } catch (error) {
    console.error("Erro ao cadastrar cliente:", error);
    res.status(500).json({ error: "Erro ao cadastrar cliente." });
  }
});

// GET /api/customers/:id - Detalhes do cliente
customersRouter.get("/:id", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        seller: {
          select: { id: true, name: true, email: true },
        },
        quotations: {
          select: {
            id: true,
            quotationNumber: true,
            teamName: true,
            status: true,
            sellerId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!customer) {
      res.status(404).json({ error: "Cliente não encontrado." });
      return;
    }

    res.json(customer);
  } catch (error) {
    console.error("Erro ao buscar detalhes do cliente:", error);
    res.status(500).json({ error: "Erro ao buscar cliente." });
  }
});

// PUT /api/customers/:id - Atualizar cliente (VENDEDOR dono, ADMIN ou GESTOR)
const updateCustomerSchema = z.object({
  companyName: z.string().min(2, "Nome da empresa/cliente é obrigatório.").optional(),
  contactName: z.string().min(2, "Nome do contato responsável é obrigatório.").optional(),
  email: z.string().email("E-mail em formato inválido.").optional().or(z.literal("")),
  phone: z.string().min(8, "Telefone de contato é obrigatório.").optional(),
  cityState: z.string().optional(),
  notes: z.string().optional(),
  sellerId: z.string().optional().nullable(),
});

customersRouter.put("/:id", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const parseResult = updateCustomerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.errors[0].message });
      return;
    }

    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      res.status(404).json({ error: "Cliente não encontrado." });
      return;
    }

    // Propriedade horizontal: Vendedor só altera seus próprios clientes (sellerId === user.id)
    // Cliente sem sellerId só pode ser alterado por ADMIN ou GESTOR
    if (req.user!.role === "VENDEDOR") {
      if (!customer.sellerId || customer.sellerId !== req.user!.id) {
        res.status(403).json({
          error: "Acesso negado: Vendedores só possuem permissão para alterar clientes de sua própria carteira.",
        });
        return;
      }
    }

    const data = parseResult.data;
    const canChangeSeller = req.user!.role === "ADMIN" || req.user!.role === "GESTOR";
    const updated = await prisma.customer.update({
      where: { id },
      data: {
        ...(data.companyName ? { companyName: data.companyName.trim() } : {}),
        ...(data.contactName ? { contactName: data.contactName.trim() } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.phone ? { phone: data.phone.trim() } : {}),
        ...(data.cityState !== undefined ? { cityState: data.cityState || null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
        ...(canChangeSeller && data.sellerId !== undefined ? { sellerId: data.sellerId } : {}),
      },
    });

    await logAudit({
      userId: req.user!.id,
      action: "CUSTOMER_UPDATED",
      entityName: "Customer",
      entityId: id,
      oldValues: customer,
      newValues: updated,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json(updated);
  } catch (error) {
    console.error("Erro ao atualizar cliente:", error);
    res.status(500).json({ error: "Erro ao atualizar cliente." });
  }
});

// DELETE /api/customers/:id - Excluir cliente (VENDEDOR dono, ADMIN ou GESTOR)
customersRouter.delete("/:id", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      res.status(404).json({ error: "Cliente não encontrado." });
      return;
    }

    // Propriedade horizontal: Vendedor só exclui seus próprios clientes (sellerId === user.id)
    // Cliente sem sellerId só pode ser excluído por ADMIN ou GESTOR
    if (req.user!.role === "VENDEDOR") {
      if (!customer.sellerId || customer.sellerId !== req.user!.id) {
        res.status(403).json({
          error: "Acesso negado: Vendedores só possuem permissão para excluir clientes de sua própria carteira.",
        });
        return;
      }
    }

    await prisma.customer.delete({ where: { id } });

    await logAudit({
      userId: req.user!.id,
      action: "CUSTOMER_DELETED",
      entityName: "Customer",
      entityId: id,
      oldValues: customer,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ message: "Cliente excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir cliente:", error);
    res.status(500).json({ error: "Erro ao excluir cliente." });
  }
});
