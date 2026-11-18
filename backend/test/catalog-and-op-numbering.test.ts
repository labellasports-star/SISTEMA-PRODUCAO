import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/prisma.js";
import { hashPassword, hashPin, generateToken } from "../src/utils/security.js";
import { app } from "../src/server.js";
import http from "node:http";

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

  // Garantir existência de categoria e produto oficial do catálogo no banco de teste
  let cat = await prisma.productCategory.findUnique({ where: { code: "FUTEBOL" } });
  if (!cat) {
    cat = await prisma.productCategory.create({
      data: {
        code: "FUTEBOL",
        name: "Futebol e Futsal",
        description: "Uniformes para futebol de campo, futsal e society",
        displayOrder: 1,
      },
    });
  }

  let prod = await prisma.catalogProduct.findUnique({ where: { code: "CAMISA_CLASSIC" } });
  if (!prod) {
    prod = await prisma.catalogProduct.create({
      data: {
        code: "CAMISA_CLASSIC",
        name: "Camisa de Jogo Classic",
        categoryId: cat.id,
        minQuantity: 10,
        basePrice: 42.9,
        availableFabrics: JSON.stringify(["Dry Fit Tradicional", "Cacharrel Dry"]),
        availableCollars: JSON.stringify(["Gola Redonda Careca", "Gola V"]),
        availableGenders: JSON.stringify(["MASCULINO", "FEMININO", "INFANTIL"]),
        availableCustomizations: JSON.stringify([
          { name: "Escudo TPU 3D", price: 15.0 },
          { name: "Nome Individual", price: 5.0 },
          { name: "Número Individual", price: 5.0 },
        ]),
      },
    });
  }
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("Catálogo Oficial: Consulta de categorias, produtos e cálculo de orçamento", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("SenhaForte123@");

  const gestor = await prisma.user.create({
    data: {
      name: `Gestor Catalog ${timestamp}`,
      email: `gestor.catalog.${timestamp}@teste.com`,
      passwordHash,
      role: "GESTOR",
      isActive: true,
    },
  });
  const gestorToken = generateToken({ userId: gestor.id, role: gestor.role });

  // 1. Listar categorias
  await t.test("GET /api/catalog/categories - Listagem de categorias oficiais", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/categories`, {
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.categories));
    assert.ok(data.categories.length > 0);
  });

  // 2. Listar produtos
  let testProduct: any;
  await t.test("GET /api/catalog/products - Listagem de produtos com opções", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/products`, {
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.products));
    assert.ok(data.products.length > 0);
    testProduct = data.products.find((p: any) => p.code === "CAMISA_CLASSIC") || data.products[0];
    assert.ok(testProduct);
    assert.strictEqual(testProduct.minQuantity, 10);
    assert.ok(Array.isArray(testProduct.availableFabrics));
    assert.ok(Array.isArray(testProduct.availableCollars));
  });

  // 3. Detalhes de produto específico
  await t.test("GET /api/catalog/products/:id - Detalhes individuais", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/products/${testProduct.id}`, {
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.product.id, testProduct.id);
  });

  // 4. Motor de cálculo de orçamento com regras e congelamento
  await t.test("POST /api/catalog/calculate-budget - Cálculo seguro e snapshot congelado", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/calculate-budget`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gestorToken}`,
      },
      body: JSON.stringify({
        items: [
          {
            productId: testProduct.id,
            quantity: 20, // acima do mínimo de 10
            customizations: [
              { name: "Escudo TPU 3D", additionalPrice: 15.0 },
              { name: "Nome Individual", additionalPrice: 5.0 },
            ],
          },
        ],
        discountAmount: 50.0,
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.totalQuantity, 20);
    assert.strictEqual(data.isMinQuantityMet, true);

    // Preço esperado: (42.90 + 15.00 + 0.00) * 20 = 57.90 * 20 = 1158.00 (Nome sem custo)
    // Total com desconto: 1158.00 - 50.00 = 1108.00
    const expectedSubtotal = (testProduct.basePrice + 15.0 + 0.0) * 20;
    const expectedTotal = expectedSubtotal - 50.0;

    assert.strictEqual(data.grossAmount, Number(expectedSubtotal.toFixed(2)));
    assert.strictEqual(data.discountAmount, 50.0);
    assert.strictEqual(data.netAmount, Number(expectedTotal.toFixed(2)));
    assert.ok(data.frozenRulesSnapshot);
    assert.ok(data.frozenRulesSnapshot.effectiveDate);
  });
});

test("Numeração Oficial de OP (OP - 2001, OP - 2002) e Subdivisão de Sublotes (1/N)", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("SenhaForte123@");
  const signaturePinHash = await hashPin("123456");

  const admin = await prisma.user.create({
    data: {
      name: `Admin OP ${timestamp}`,
      email: `admin.op.${timestamp}@teste.com`,
      passwordHash,
      signaturePinHash,
      role: "ADMIN",
      isActive: true,
    },
  });
  const adminToken = generateToken({ userId: admin.id, role: admin.role });

  const customer = await prisma.customer.create({
    data: {
      companyName: `Cliente Teste OP ${timestamp}`,
      contactName: "Diretor Esportivo",
      phone: "11999998888",
    },
  });

  // Criar orçamento aprovado comercialmente e formalmente com arte aprovada
  const quotation = await prisma.quotation.create({
    data: {
      quotationNumber: `ORC-TEST-${timestamp}`,
      customerId: customer.id,
      teamName: "Time Alfa 2026",
      totalQuantity: 60,
      budgetAmount: 3774.0,
      status: "AGUARDANDO_APROVACAO_ARTE",
      isArtworkApproved: true,
      sellerId: admin.id,
      items: {
        create: [
          {
            productModel: "Camisa de Jogo Classic",
            gender: "UNISSEX",
            size: "G",
            quantity: 60,
            unitPrice: 62.9,
            subtotal: 3774.0,
          },
        ],
      },
    },
  });

  let createdOp: any;

  // 1. Conversão em OP oficial com formato OP - 2001, OP - 2002...
  await t.test("POST /api/quotations/:id/convert-to-op - Gera OP - 2001 e lote inicial 1/1", async () => {
    const res = await fetch(`${baseUrl}/api/quotations/${quotation.id}/convert-to-op`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        promisedDeliveryDate: new Date(Date.now() + 864000000).toISOString(),
        technicalNotes: "Entrega urgente para abertura do campeonato.",
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    createdOp = body.productionOrder;

    assert.ok(createdOp);
    // Validação estrita do padrão OP - 2001, OP - 2002...
    assert.match(createdOp.opNumber, /^OP\s*-\s*\d+$/i);
    const opSeq = parseInt(createdOp.opNumber.replace(/[^0-9]/g, ""), 10);
    assert.ok(opSeq >= 2001, `A numeração deve iniciar a partir de 2001. Obtido: ${createdOp.opNumber}`);

    // Lote inicial formatado como OP - 2001 - 1/1 com subdivisionCode '1/1'
    assert.ok(body.initialBatch);
    assert.strictEqual(body.initialBatch.subdivisionCode, "1/1");
    assert.strictEqual(body.initialBatch.batchNumber, `${createdOp.opNumber} - 1/1`);
  });

  // 2. Idempotência / Prevenção de duplicidade
  await t.test("POST /api/quotations/:id/convert-to-op - Idempotência / Prevenção de duplicidade", async () => {
    const res = await fetch(`${baseUrl}/api/quotations/${quotation.id}/convert-to-op`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        promisedDeliveryDate: new Date().toISOString(),
      }),
    });

    assert.strictEqual(res.status, 409);
  });

  // 3. Desmembramento / Subdivisão de OP em múltiplos sublotes (1/N)
  await t.test("POST /api/batches/production-orders/:opId/subdivide - Desmembramento em 3 sublotes", async () => {
    // 60 peças desmembradas em: Parte 1 = 20, Parte 2 = 25, Parte 3 = 15 (Soma = 60)
    const res = await fetch(`${baseUrl}/api/batches/production-orders/${createdOp.id}/subdivide`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        subdivisions: [
          { quantity: 20, notes: "Sublote Branco Titular" },
          { quantity: 25, notes: "Sublote Preto Reserva" },
          { quantity: 15, notes: "Sublote Goleiro Amarelo" },
        ],
        pin: "123456",
        notes: "Desmembramento para processos paralelos de estamparia",
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.totalParts, 3);
    assert.strictEqual(body.batches.length, 3);

    // Validar nomenclatura estrita: OP - 2001 - 1/3, OP - 2001 - 2/3, OP - 2001 - 3/3
    assert.strictEqual(body.batches[0].batchNumber, `${createdOp.opNumber} - 1/3`);
    assert.strictEqual(body.batches[0].subdivisionCode, "1/3");
    assert.strictEqual(body.batches[0].quantity, 20);

    assert.strictEqual(body.batches[1].batchNumber, `${createdOp.opNumber} - 2/3`);
    assert.strictEqual(body.batches[1].subdivisionCode, "2/3");
    assert.strictEqual(body.batches[1].quantity, 25);

    assert.strictEqual(body.batches[2].batchNumber, `${createdOp.opNumber} - 3/3`);
    assert.strictEqual(body.batches[2].subdivisionCode, "3/3");
    assert.strictEqual(body.batches[2].quantity, 15);

    // Conservação matemática da quantidade total
    const sum = body.batches.reduce((acc: number, b: any) => acc + b.quantity, 0);
    assert.strictEqual(sum, 60);
  });

  // 4. Bloqueio de desmembramento quando soma diverge do total da OP
  await t.test("POST /api/batches/production-orders/:opId/subdivide - Rejeita se a soma divergir", async () => {
    const res = await fetch(`${baseUrl}/api/batches/production-orders/${createdOp.id}/subdivide`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        subdivisions: [
          { quantity: 20 },
          { quantity: 20 }, // soma 40 != 60
        ],
        pin: "123456",
      }),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /deve ser exatamente igual ao total/i);
  });

  // 5. Bloqueio de desmembramento sem PIN ou PIN incorreto
  await t.test("POST /api/batches/production-orders/:opId/subdivide - Rejeita com PIN inválido", async () => {
    const res = await fetch(`${baseUrl}/api/batches/production-orders/${createdOp.id}/subdivide`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        subdivisions: [{ quantity: 30 }, { quantity: 30 }],
        pin: "999999", // incorreto
      }),
    });

    assert.strictEqual(res.status, 403);
  });

  // 6. Ficha Universal do Pedido acessível sem exigir PIN e com dados dos sublotes
  await t.test("GET /api/universal-sheet/orders/:opId - Consulta livre de PIN com sublotes", async () => {
    const res = await fetch(`${baseUrl}/api/universal-sheet/orders/${createdOp.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const sheet = await res.json();
    assert.strictEqual(sheet.opNumber, createdOp.opNumber);
    assert.strictEqual(sheet.totalQuantityOrdered, 60);
    assert.strictEqual(sheet.batches.length, 3);
    assert.strictEqual(sheet.batches[0].batchNumber, `${createdOp.opNumber} - 1/3`);
  });
});
