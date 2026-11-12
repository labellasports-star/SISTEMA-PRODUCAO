import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/prisma.js";
import { hashPassword, generateToken } from "../src/utils/security.js";
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
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("Ficha Universal do Pedido: Acesso Multi-Setorial e Proteção RBAC", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("SenhaForte123@");

  // Setores
  const sectorDesign = await prisma.sector.findUnique({ where: { code: "DESIGNER" } });
  const sectorCostura = await prisma.sector.findUnique({ where: { code: "COSTURA" } });
  assert.ok(sectorDesign && sectorCostura);

  // Vendedor
  const vendedor = await prisma.user.create({
    data: {
      name: `Vendedor Sheet ${timestamp}`,
      email: `vend.sheet.${timestamp}@teste.com`,
      passwordHash,
      role: "VENDEDOR",
      isActive: true,
    },
  });

  // Designer
  const designer = await prisma.user.create({
    data: {
      name: `Designer Sheet ${timestamp}`,
      email: `des.sheet.${timestamp}@teste.com`,
      passwordHash,
      role: "DESIGNER",
      sectorId: sectorDesign.id,
      isActive: true,
    },
  });

  // Operador da Costura
  const operadorCostura = await prisma.user.create({
    data: {
      name: `Operador Costura ${timestamp}`,
      email: `op.costura.${timestamp}@teste.com`,
      passwordHash,
      role: "OPERADOR",
      sectorId: sectorCostura.id,
      isActive: true,
    },
  });

  // Admin
  const admin = await prisma.user.create({
    data: {
      name: `Admin Sheet ${timestamp}`,
      email: `adm.sheet.${timestamp}@teste.com`,
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
  });

  const tokenOperador = generateToken({
    userId: operadorCostura.id,
    id: operadorCostura.id,
    name: operadorCostura.name,
    email: operadorCostura.email,
    role: operadorCostura.role,
    sectorId: operadorCostura.sectorId,
    sectorCode: "COSTURA",
  });

  const tokenAdmin = generateToken({
    userId: admin.id,
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  });

  const tokenDesigner = generateToken({
    userId: designer.id,
    id: designer.id,
    name: designer.name,
    email: designer.email,
    role: designer.role,
    sectorId: designer.sectorId,
    sectorCode: "DESIGNER",
  });

  // Criar dados completos do pedido
  const cliente = await prisma.customer.create({
    data: {
      companyName: `Atlética Lobos ${timestamp}`,
      contactName: "Lucas Capitão",
      phone: "11999998888",
    },
  });

  const cotação = await prisma.quotation.create({
    data: {
      quotationNumber: `ORC-SHEET-${timestamp}`,
      customerId: cliente.id,
      teamName: "Atlética Lobos Futsal",
      status: "CONVERTIDA_VENDA",
      totalQuantity: 30,
      budgetAmount: 1850.50,
      desiredDeadline: new Date(Date.now() + 86400000 * 15),
      observations: "Camisas Classic azul royal com detalhes em amarelo.",
      isArtworkApproved: true,
      artworkApprovedBy: "Lucas Capitão",
      sellerId: vendedor.id,
      designerId: designer.id,
      items: {
        create: [
          {
            productModel: "Classic",
            gender: "MASCULINO",
            size: "M",
            quantity: 20,
            customName: "LOBOS",
            fabricType: "Dry Fit 100% Poliéster",
          },
          {
            productModel: "Classic",
            gender: "MASCULINO",
            size: "G",
            quantity: 10,
            customName: "LOBOS",
            fabricType: "Dry Fit 100% Poliéster",
          },
        ],
      },
      attachments: {
        create: [
          {
            fileName: "foto_referencia_camisa_antiga.jpg",
            fileType: "REFERENCE",
            fileExtension: "JPG",
            fileUrl: "/uploads/references/foto_ref.jpg",
            uploadedById: vendedor.id,
          },
        ],
      },
      designBrief: {
        create: {
          briefingText: "Escudo do lobo no peito esquerdo, gola redonda.",
          predominantColors: "Azul Royal e Amarelo",
          printType: "Sublimação Total",
          status: "COMPLETED",
          versions: {
            create: [
              {
                versionNumber: 1,
                previewUrl: "/uploads/artwork/mockup_v1.jpg",
                vectorUrl: "/uploads/artwork/vetor_v1.pdf",
                changeNotes: "Primeira proposta enviada",
                designerId: designer.id,
                status: "APPROVED",
              },
            ],
          },
        },
      },
    },
  });

  const op = await prisma.productionOrder.create({
    data: {
      opNumber: `OP-SHEET-${timestamp}`,
      customerId: cliente.id,
      quotationId: cotação.id,
      title: "30 Camisas Classic Atlética Lobos",
      productType: "Camisas",
      totalQuantityOrdered: 30,
      status: "ACTIVE",
      promisedDeliveryDate: new Date(Date.now() + 86400000 * 15),
      technicalNotes: "Atenção ao tom de azul royal.",
    },
  });

  const batch = await prisma.opBatch.create({
    data: {
      batchNumber: `OP-SHEET-${timestamp}-L01`,
      productionOrderId: op.id,
      quantity: 30,
      currentSectorId: sectorCostura.id,
      batchStatus: "WAITING",
    },
  });

  await t.test("1. Operador de qualquer setor pode consultar a Ficha Universal por ID da OP", async () => {
    const res = await fetch(`${baseUrl}/api/universal-sheet/orders/${op.id}`, {
      headers: { Authorization: `Bearer ${tokenOperador}` },
    });

    assert.equal(res.status, 200, "Operador deve conseguir visualizar a ficha sem assumir o lote");
    const data = await res.json();

    assert.equal(data.opNumber, op.opNumber);
    assert.equal(data.customer.companyName, cliente.companyName);
    assert.equal(data.seller.name, vendedor.name);
    assert.equal(data.designer.name, designer.name);
    assert.equal(data.totalQuantityOrdered, 30);
    assert.equal(data.consolidatedSizeGrid.M, 20);
    assert.equal(data.consolidatedSizeGrid.G, 10);
    assert.equal(data.references.length, 1);
    assert.equal(data.references[0].fileName, "foto_referencia_camisa_antiga.jpg");
    assert.equal(data.artwork.approvedVersion.versionNumber, 1);
    assert.equal(data.artwork.approvedVersion.status, "APPROVED");
  });

  await t.test("2. RBAC: Operador de chão de fábrica NÃO visualiza valores financeiros", async () => {
    const res = await fetch(`${baseUrl}/api/universal-sheet/orders/${op.id}`, {
      headers: { Authorization: `Bearer ${tokenOperador}` },
    });

    const data = await res.json();
    assert.equal(data.quotation?.budgetAmount, undefined, "Operador não deve ver budgetAmount");
    assert.equal(data.financialSummary, undefined, "Operador não deve ver financialSummary");
  });

  await t.test("3. RBAC: Administrador visualiza valores financeiros e dados completos", async () => {
    const res = await fetch(`${baseUrl}/api/universal-sheet/orders/${op.id}`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });

    const data = await res.json();
    assert.equal(data.quotation?.budgetAmount, 1850.50, "Admin deve ver budgetAmount");
  });

  await t.test("4. Consulta por lote (by-batch) resolve a mesma ficha universal", async () => {
    const res = await fetch(`${baseUrl}/api/universal-sheet/by-batch/${batch.id}`, {
      headers: { Authorization: `Bearer ${tokenOperador}` },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.opNumber, op.opNumber);
  });

  await t.test("5. Designer pode consultar a Ficha da Cotação antes de assumir (pré-OP)", async () => {
    const res = await fetch(`${baseUrl}/api/universal-sheet/quotations/${cotação.id}`, {
      headers: { Authorization: `Bearer ${tokenDesigner}` },
    });

    assert.equal(res.status, 200, "Designer deve consultar a cotação diretamente");
    const data = await res.json();
    assert.equal(data.teamName, "Atlética Lobos Futsal");
    assert.equal(data.briefing.predominantColors, "Azul Royal e Amarelo");
    assert.equal(data.references.length, 1);
  });
});
