import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";

export const catalogRouter = Router();

// -----------------------------------------------------------------------------
// 1. GET /api/catalog/categories
// Listar todas as categorias oficiais de produtos
// -----------------------------------------------------------------------------
catalogRouter.get("/categories", async (_req: Request, res: Response): Promise<void> => {
  try {
    const categories = await prisma.productCategory.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: { products: { where: { isActive: true } } },
        },
      },
      orderBy: { name: "asc" },
    });

    res.json({ categories });
  } catch (err: any) {
    console.error("Erro ao listar categorias do catálogo:", err);
    res.status(500).json({ error: "Erro interno ao buscar categorias do catálogo." });
  }
});

// -----------------------------------------------------------------------------
// 2. GET /api/catalog/products
// Listar produtos do catálogo oficial com filtros
// -----------------------------------------------------------------------------
catalogRouter.get("/products", async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId, search } = req.query;

    const where: any = { isActive: true };

    if (categoryId && typeof categoryId === "string" && categoryId.trim() !== "") {
      where.categoryId = categoryId;
    }

    if (search && typeof search === "string" && search.trim() !== "") {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const products = await prisma.catalogProduct.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
    });

    // Parse dos campos JSON para consumo direto no frontend
    const formatted = products.map((p) => ({
      ...p,
      availableFabrics: p.availableFabrics ? JSON.parse(p.availableFabrics) : [],
      availableCollars: p.availableCollars ? JSON.parse(p.availableCollars) : [],
      availableGenders: p.availableGenders ? JSON.parse(p.availableGenders) : [],
      availableCustomizations: p.availableCustomizations ? JSON.parse(p.availableCustomizations) : [],
    }));

    res.json({ products: formatted });
  } catch (err: any) {
    console.error("Erro ao listar produtos do catálogo:", err);
    res.status(500).json({ error: "Erro interno ao buscar produtos do catálogo." });
  }
});

// -----------------------------------------------------------------------------
// 3. GET /api/catalog/products/:id
// Detalhes completos de um produto
// -----------------------------------------------------------------------------
catalogRouter.get("/products/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const product = await prisma.catalogProduct.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!product) {
      res.status(404).json({ error: "Produto do catálogo não encontrado." });
      return;
    }

    res.json({
      product: {
        ...product,
        availableFabrics: product.availableFabrics ? JSON.parse(product.availableFabrics) : [],
        availableCollars: product.availableCollars ? JSON.parse(product.availableCollars) : [],
        availableGenders: product.availableGenders ? JSON.parse(product.availableGenders) : [],
        availableCustomizations: product.availableCustomizations
          ? JSON.parse(product.availableCustomizations)
          : [],
      },
    });
  } catch (err: any) {
    console.error("Erro ao buscar produto do catálogo:", err);
    res.status(500).json({ error: "Erro interno ao buscar produto." });
  }
});

// -----------------------------------------------------------------------------
// 4. POST /api/catalog/calculate-budget
// Motor seguro de cálculo monetário de orçamento
// -----------------------------------------------------------------------------
const calculateSchema = z.object({
  items: z
    .array(
      z.object({
        catalogProductId: z.string().optional(),
        productId: z.string().optional(),
        quantity: z.number().int().min(1, "Quantidade deve ser maior que zero."),
        fabricType: z.string().optional(),
        collarType: z.string().optional(),
        customizations: z
          .union([
            z.array(z.string()),
            z.array(
              z.object({
                name: z.string().optional(),
                code: z.string().optional(),
                additionalPrice: z.number().optional(),
                price: z.number().optional(),
              })
            ),
          ])
          .optional()
          .default([]),
      })
    )
    .min(1, "Informe ao menos um produto para o cálculo do orçamento."),
  discountAmount: z.number().min(0, "Desconto não pode ser negativo.").optional().default(0),
});

catalogRouter.post("/calculate-budget", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = calculateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: "Dados de cálculo inválidos.",
        details: parseResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { items, discountAmount } = parseResult.data;

    let totalQuantity = 0;
    let totalItemsAmount = 0;
    const calculatedItems = [];
    const minQuantityWarnings: string[] = [];

    for (const item of items) {
      const prodId = item.catalogProductId || item.productId;
      if (!prodId) {
        res.status(400).json({ error: "ID do produto do catálogo é obrigatório." });
        return;
      }

      const product = await prisma.catalogProduct.findUnique({
        where: { id: prodId },
        include: { category: true },
      });

      if (!product) {
        res.status(404).json({ error: `Produto ID '${prodId}' não encontrado no catálogo.` });
        return;
      }

      // Validação de quantidade mínima recomendada do site (10 un)
      if (item.quantity < product.minQuantity) {
        minQuantityWarnings.push(
          `O produto '${product.name}' possui quantidade mínima padrão de ${product.minQuantity} unidades (informado: ${item.quantity}). Exceção sujeita à autorização gerencial.`
        );
      }

      const availableCustoms: any[] = product.availableCustomizations
        ? JSON.parse(product.availableCustomizations)
        : [];

      // Somar adicionais selecionados
      let customizationTotalPerUnit = 0;
      const appliedCustomizations: Array<{ name: string; price: number }> = [];

      for (const custom of item.customizations as any[]) {
        if (typeof custom === "string") {
          const found = availableCustoms.find(
            (c: any) => c.code === custom || c.name === custom
          );
          if (found) {
            customizationTotalPerUnit += found.price;
            appliedCustomizations.push({ name: found.name, price: found.price });
          }
        } else if (typeof custom === "object" && custom !== null) {
          const price = custom.additionalPrice ?? custom.price ?? 0;
          const name = custom.name || custom.code || "Personalização";
          customizationTotalPerUnit += price;
          appliedCustomizations.push({ name, price });
        }
      }

      // Preço unitário final = Preço Base + Adicionais por peça
      const unitPrice = Number((product.basePrice + customizationTotalPerUnit).toFixed(2));
      const subtotal = Number((unitPrice * item.quantity).toFixed(2));

      totalQuantity += item.quantity;
      totalItemsAmount += subtotal;

      calculatedItems.push({
        catalogProductId: product.id,
        productCode: product.code,
        productName: product.name,
        categoryName: product.category.name,
        quantity: item.quantity,
        basePrice: product.basePrice,
        customizationTotalPerUnit,
        appliedCustomizations,
        unitPrice,
        subtotal,
        fabricType: item.fabricType || (product.availableFabrics ? JSON.parse(product.availableFabrics)[0] : "Dry Fit"),
        collarType: item.collarType || (product.availableCollars ? JSON.parse(product.availableCollars)[0] : "Padrão"),
      });
    }

    // Cálculo final com arredondamento seguro
    totalItemsAmount = Number(totalItemsAmount.toFixed(2));
    const finalDiscount = Math.min(discountAmount, totalItemsAmount);
    const finalTotal = Number((totalItemsAmount - finalDiscount).toFixed(2));

    // Snapshot congelado dos preços oficiais e regras aplicadas
    const frozenRulesSnapshot = {
      calculatedAt: new Date().toISOString(),
      items: calculatedItems,
      totalQuantity,
      totalItemsAmount,
      discountAmount: finalDiscount,
      finalTotal,
      pricingEffectiveDate: new Date().toISOString(),
      effectiveDate: new Date().toISOString(),
    };

    res.json({
      totalQuantity,
      totalItemsAmount,
      grossAmount: totalItemsAmount,
      discountAmount: finalDiscount,
      finalTotal,
      netAmount: finalTotal,
      isMinQuantityMet: minQuantityWarnings.length === 0,
      items: calculatedItems,
      minQuantityWarnings,
      frozenRulesSnapshot,
    });
  } catch (err: any) {
    console.error("Erro no cálculo do orçamento:", err);
    res.status(500).json({ error: "Erro interno no cálculo do orçamento." });
  }
});
