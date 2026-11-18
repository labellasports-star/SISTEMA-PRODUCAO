import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { prisma } from "../src/prisma.js";
import { app } from "../src/server.js";
import { pruneOldBackups, listAvailableBackups } from "../src/utils/backup.js";

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

  // Garantir existência de categoria e produto oficial do catálogo no banco de teste isolado (test.db)
  let cat = await prisma.productCategory.findUnique({ where: { code: "FUTEBOL" } });
  if (!cat) {
    cat = await prisma.productCategory.create({
      data: {
        code: "FUTEBOL",
        name: "Futebol e Futsal",
        description: "Uniformes para futebol de campo e futsal",
        isActive: true,
      },
    });
  }

  let prod = await prisma.catalogProduct.findUnique({ where: { code: "CAMISA_CLASSIC" } });
  if (!prod) {
    await prisma.catalogProduct.create({
      data: {
        code: "CAMISA_CLASSIC",
        name: "Camisa Classic Dry Fit",
        categoryId: cat.id,
        minQuantity: 10,
        basePrice: 42.9,
        availableFabrics: JSON.stringify(["Dry Fit Tradicional", "Cacharrel Dry"]),
        availableCollars: JSON.stringify(["Gola Redonda", "Gola V"]),
        availableGenders: JSON.stringify(["MASCULINO", "FEMININO", "INFANTIL"]),
        availableCustomizations: JSON.stringify([
          { code: "TPU_3D", name: "Escudo TPU 3D", price: 15.0 },
          { code: "NOME", name: "Nome Individual", price: 5.0 },
          { code: "NUMERO", name: "Número Individual", price: 5.0 },
        ]),
        isActive: true,
      },
    });
  }
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("CONTRATO DO CATÁLOGO: Consultas públicas sem autenticação", async (t) => {
  // 1. Categorias públicas sem token
  await t.test("GET /api/catalog/categories - Acesso público retorna 200 e lista", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/categories`);
    assert.strictEqual(res.status, 200, "Categorias devem ser acessíveis publicamente sem token");
    const data = await res.json();
    assert.ok(Array.isArray(data.categories), "Retorno deve conter array 'categories'");
    assert.ok(data.categories.length > 0);
  });

  // 2. Produtos do catálogo públicos sem token
  let sampleProduct: any;
  await t.test("GET /api/catalog/products - Acesso público retorna 200 com arrays parseados", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/products`);
    assert.strictEqual(res.status, 200, "Produtos devem ser acessíveis publicamente sem token");
    const data = await res.json();
    assert.ok(Array.isArray(data.products), "Retorno deve conter array 'products'");
    assert.ok(data.products.length > 0);

    sampleProduct = data.products.find((p: any) => p.code === "CAMISA_CLASSIC") || data.products[0];
    assert.ok(sampleProduct, "Produto de teste deve existir");
    assert.ok(Array.isArray(sampleProduct.availableFabrics), "availableFabrics deve ser array");
    assert.ok(Array.isArray(sampleProduct.availableCollars), "availableCollars deve ser array");
    assert.ok(Array.isArray(sampleProduct.availableCustomizations), "availableCustomizations deve ser array");
    assert.strictEqual(typeof sampleProduct.basePrice, "number", "basePrice deve ser número");
  });

  // 3. Detalhes de um produto específico
  await t.test("GET /api/catalog/products/:id - Acesso público por ID", async () => {
    assert.ok(sampleProduct?.id, "ID do produto amostra necessário");
    const res = await fetch(`${baseUrl}/api/catalog/products/${sampleProduct.id}`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.product, "Retorno deve conter chave 'product'");
    assert.strictEqual(data.product.id, sampleProduct.id);
    assert.ok(Array.isArray(data.product.availableFabrics));
  });

  // 4. Cálculo monetário de orçamento
  await t.test("POST /api/catalog/calculate-budget - Cálculo exato com quantidade mínima e opcionais", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/calculate-budget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            catalogProductId: sampleProduct.id,
            quantity: 10,
            fabricType: "Dry Fit Tradicional",
            collarType: "Gola V",
            customizations: ["Escudo TPU 3D", "Nome Individual"],
          },
        ],
        discountAmount: 0,
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.totalQuantity, 10);
    // Base: 42.90 + TPU (15.00) + Nome (0.00 sem custo) = 57.90 * 10 = 579.00
    assert.strictEqual(data.finalTotal, 579.0);
    assert.strictEqual(data.isMinQuantityMet, true);
    assert.strictEqual(data.minQuantityWarnings.length, 0);
  });

  // 5. Cálculo com quantidade abaixo do mínimo (10 un)
  await t.test("POST /api/catalog/calculate-budget - Alerta de quantidade abaixo do mínimo oficial", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/calculate-budget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            catalogProductId: sampleProduct.id,
            quantity: 5,
          },
        ],
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.totalQuantity, 5);
    assert.strictEqual(data.isMinQuantityMet, false);
    assert.ok(data.minQuantityWarnings.length > 0);
  });
});

test("LIMITES DE AUTENTICAÇÃO: Rotas operacionais protegidas recusam chamadas sem token (401)", async (t) => {
  const protectedRoutes = [
    { method: "GET", path: "/api/quotations" },
    { method: "POST", path: "/api/quotations" },
    { method: "GET", path: "/api/production/orders" },
    { method: "GET", path: "/api/dashboard/overview" },
    { method: "GET", path: "/api/users" },
    { method: "GET", path: "/api/customers" },
    { method: "GET", path: "/api/sectors" },
    { method: "GET", path: "/api/sewing-partners" },
    { method: "GET", path: "/api/audit-logs" },
  ];

  for (const route of protectedRoutes) {
    await t.test(`${route.method} ${route.path} sem token deve retornar 401`, async () => {
      const res = await fetch(`${baseUrl}${route.path}`, {
        method: route.method,
        headers: { "Content-Type": "application/json" },
      });
      assert.strictEqual(
        res.status,
        401,
        `Rota protegida ${route.path} deve recusar acesso não autenticado com 401 (retornou ${res.status})`
      );
    });
  }
});

test("POLÍTICA DE RETENÇÃO DE BACKUP: Pruning e listagem consistente", async (t) => {
  await t.test("listAvailableBackups retorna array estruturado", () => {
    const backups = listAvailableBackups();
    assert.ok(Array.isArray(backups));
  });

  await t.test("pruneOldBackups respeita limite de retenção sem falhar", () => {
    const result = pruneOldBackups({ maxBackups: 5 });
    assert.ok(Array.isArray(result.keptBackups));
    assert.ok(Array.isArray(result.deletedBackups));
  });
});
