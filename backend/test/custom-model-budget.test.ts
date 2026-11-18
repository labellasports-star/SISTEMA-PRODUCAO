import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { hashPassword, generateToken } from "../src/utils/security.js";

let server: http.Server;
let baseUrl: string;

test.before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("Cálculo Automático do Orçamento para Modelo 'Outros', Troca de Modelo e Multi-Produtos", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("SenhaForte123@");

  // Garantir setor e usuário vendedor
  const sectorVendas = await prisma.sector.findUnique({ where: { code: "VENDAS" } });
  assert.ok(sectorVendas, "Setor VENDAS deve existir");

  const seller = await prisma.user.create({
    data: {
      name: `Vendedor Teste ${timestamp}`,
      email: `vendedor.calc.${timestamp}@labella.com`,
      passwordHash,
      role: "VENDEDOR",
      sectorId: sectorVendas.id,
      isActive: true,
    },
  });

  const sellerToken = generateToken({
    userId: seller.id,
    email: seller.email,
    role: seller.role,
  });

  // Obter ou criar um produto de catálogo para os testes comparativos
  let catalogProduct = await prisma.catalogProduct.findFirst();
  if (!catalogProduct) {
    let category = await prisma.category.findFirst();
    if (!category) {
      category = await prisma.category.create({
        data: { name: "Linha Futebol", slug: `futebol-${timestamp}` },
      });
    }
    catalogProduct = await prisma.catalogProduct.create({
      data: {
        code: `CAM_TEST_${timestamp}`,
        name: "Camisa Teste Catálogo",
        categoryId: category.id,
        basePrice: 50.0,
        minQuantity: 10,
        availableFabrics: JSON.stringify(["Dry Fit Tradicional", "Dry Fit Premium"]),
        availableCollars: JSON.stringify(["Gola Careca", "Gola V"]),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 1. Teste de POST /api/catalog/calculate-budget com modelo "Outros"
  // ---------------------------------------------------------------------------
  await t.test("1.1. Calcular 50 peças a R$ 38,90 para modelo 'Outros' resulta em R$ 1.945,00", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/calculate-budget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            isCustomModel: true,
            customModelName: "Camisa Retrô Especial",
            unitPrice: "38,90",
            quantity: 50,
          },
        ],
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.totalQuantity, 50);
    assert.equal(data.finalTotal, 1945.0);
    assert.equal(data.totalItemsAmount, 1945.0);
    assert.equal(data.items[0].basePrice, 38.9);
    assert.equal(data.items[0].unitPrice, 38.9);
    assert.equal(data.items[0].subtotal, 1945.0);
    assert.equal(data.items[0].productName, "Camisa Retrô Especial");
  });

  await t.test("1.2. Calcular com opcionais: TPU 3D (+15) e Nome/Número (+0)", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/calculate-budget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            isCustomModel: true,
            customModelName: "Jaqueta Corta Vento Especial",
            unitPrice: "38,90",
            quantity: 50,
            customizations: ["Escudo TPU 3D", "Nome", "Número"],
          },
        ],
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    // 38.90 + 15 (TPU) + 0 (Nome) + 0 (Número) = 53.90
    // 53.90 * 50 = 2695.00
    assert.equal(data.items[0].basePrice, 38.9);
    assert.equal(data.items[0].customizationTotalPerUnit, 15.0);
    assert.equal(data.items[0].unitPrice, 53.9);
    assert.equal(data.items[0].subtotal, 2695.0);
    assert.equal(data.finalTotal, 2695.0);
    assert.equal(data.totalItemsAmount, 2695.0);
  });

  await t.test("1.3. Validações: rejeitar modelo vazio ou preço unitário <= 0", async () => {
    // Modelo vazio
    const resVazio = await fetch(`${baseUrl}/api/catalog/calculate-budget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            isCustomModel: true,
            customModelName: "",
            unitPrice: "38,90",
            quantity: 50,
          },
        ],
      }),
    });
    assert.equal(resVazio.status, 400);

    // Preço zerado
    const resPreco = await fetch(`${baseUrl}/api/catalog/calculate-budget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            isCustomModel: true,
            customModelName: "Camisa Polo Especial",
            unitPrice: 0,
            quantity: 50,
          },
        ],
      }),
    });
    assert.equal(resPreco.status, 400);
  });

  // ---------------------------------------------------------------------------
  // 2. Teste de Criação de Cotação (POST /api/quotations) com modelo "Outros"
  // ---------------------------------------------------------------------------
  let quotationId = "";

  await t.test("2. Criar pré-venda com modelo 'Outros' valida e recalcula no backend", async () => {
    const res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: `Atlética Engenharia ${timestamp}`,
          contactName: "Lucas Mendes",
          phone: "(11) 98888-7777",
        },
        teamName: "Lobos da Engenharia",
        totalQuantity: 50,
        budgetAmount: 1945.0,
        items: [
          {
            isCustomModel: true,
            customModelName: "Regata Especial Sublimada",
            productModel: "Regata Especial Sublimada",
            size: "G",
            unitPrice: "38,90",
            quantity: 50,
            fabricType: "Dry Fit Tradicional",
            collarType: "Gola Careca",
            customizationNotes: "Nome Individual, Número Individual",
          },
        ],
      }),
    });

    assert.equal(res.status, 201);
    const created = await res.json();
    quotationId = created.id;

    assert.equal(created.totalQuantity, 50);
    assert.equal(created.budgetAmount, 1945.0);
    assert.equal(created.items.length, 1);
    assert.equal(created.items[0].isCustomModel, true);
    assert.equal(created.items[0].customModelName, "Regata Especial Sublimada");
    assert.equal(created.items[0].unitPrice, 38.9);
    assert.equal(created.items[0].subtotal, 1945.0);
  });

  // ---------------------------------------------------------------------------
  // 3. Teste de Edição da Cotação (PUT /api/quotations/:id) com modelo "Outros"
  // ---------------------------------------------------------------------------
  await t.test("3. Ao editar a pré-venda, recalcula o orçamento automaticamente no backend", async () => {
    // Altera para 60 peças a R$ 45,00
    // 60 * 45,00 = 2.700,00
    const res = await fetch(`${baseUrl}/api/quotations/${quotationId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        teamName: "Lobos da Engenharia 2026",
        items: [
          {
            isCustomModel: true,
            customModelName: "Regata Especial Sublimada Ouro",
            productModel: "Regata Especial Sublimada Ouro",
            size: "G",
            unitPrice: "45,00",
            quantity: 60,
            fabricType: "Dry Fit Tradicional",
            collarType: "Gola Careca",
          },
        ],
      }),
    });

    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.totalQuantity, 60);
    assert.equal(updated.budgetAmount, 2700.0);
    assert.equal(updated.items[0].unitPrice, 45.0);
    assert.equal(updated.items[0].subtotal, 2700.0);
  });

  // ---------------------------------------------------------------------------
  // 4. Alternar entre "Outros" e um modelo cadastrado no catálogo
  // ---------------------------------------------------------------------------
  await t.test("4. Alternar de 'Outros' para um produto cadastrado aplica o preço do catálogo", async () => {
    // Alterna para o produto do catálogo
    const catalogBasePrice = catalogProduct.basePrice;
    const qty = 20;
    const expectedSubtotal = Number((catalogBasePrice * qty).toFixed(2));

    const res = await fetch(`${baseUrl}/api/quotations/${quotationId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            catalogProductId: catalogProduct.id,
            isCustomModel: false,
            productModel: catalogProduct.name,
            size: "G",
            quantity: qty,
            fabricType: "Dry Fit Tradicional",
            collarType: "Gola Careca",
          },
        ],
      }),
    });

    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.totalQuantity, qty);
    assert.equal(updated.budgetAmount, expectedSubtotal);
    assert.equal(updated.items[0].catalogProductId, catalogProduct.id);
    assert.equal(updated.items[0].isCustomModel, false);
    assert.equal(updated.items[0].unitPrice, catalogBasePrice);
    assert.equal(updated.items[0].subtotal, expectedSubtotal);
  });

  // ---------------------------------------------------------------------------
  // 5. Cotação com múltiplos itens: Catálogo + Outros somados no mesmo orçamento
  // ---------------------------------------------------------------------------
  await t.test("5. Multi-produtos: soma itens do catálogo e itens 'Outros' no mesmo orçamento", async () => {
    // Item 1: Catálogo (15 peças x basePrice)
    // Item 2: Outros (25 peças x R$ 40,00 = R$ 1.000,00)
    const qtyCatalog = 15;
    const catalogSubtotal = Number((catalogProduct.basePrice * qtyCatalog).toFixed(2));
    const qtyCustom = 25;
    const customSubtotal = Number((40.0 * qtyCustom).toFixed(2));
    const totalExpected = Number((catalogSubtotal + customSubtotal).toFixed(2));

    const res = await fetch(`${baseUrl}/api/quotations/${quotationId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            catalogProductId: catalogProduct.id,
            isCustomModel: false,
            productModel: catalogProduct.name,
            size: "G",
            quantity: qtyCatalog,
          },
          {
            isCustomModel: true,
            customModelName: "Meião Especial Personalizado",
            productModel: "Meião Especial Personalizado",
            size: "G",
            unitPrice: "40,00",
            quantity: qtyCustom,
          },
        ],
      }),
    });

    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.totalQuantity, qtyCatalog + qtyCustom);
    assert.equal(updated.budgetAmount, totalExpected);
    assert.equal(updated.items.length, 2);

    const itemCat = updated.items.find((i: any) => !i.isCustomModel);
    const itemCust = updated.items.find((i: any) => i.isCustomModel);

    assert.ok(itemCat && itemCust);
    assert.equal(itemCat.subtotal, catalogSubtotal);
    assert.equal(itemCust.subtotal, customSubtotal);
  });
});
