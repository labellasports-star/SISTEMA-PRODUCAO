import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import http from "node:http";
import { hashPin, hashPassword } from "../src/utils/security.js";

test("Grade de Tamanhos, Seleção de Gênero e Regras de PIN na Pré-Venda", async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(resolve));
  });

  const timestamp = Date.now();

  // 1. Criar usuários de teste
  const seller = await prisma.user.create({
    data: {
      name: `Vendedor Grade ${timestamp}`,
      email: `vendedor.grade.${timestamp}@labella.com`,
      passwordHash: await hashPassword("senha123"),
      role: "VENDEDOR",
    },
  });

  const manager = await prisma.user.create({
    data: {
      name: `Gestor Grade ${timestamp}`,
      email: `gestor.grade.${timestamp}@labella.com`,
      passwordHash: await hashPassword("senha123"),
      role: "GESTOR",
      signaturePinHash: await hashPin("1234"),
    },
  });

  // Login do Vendedor
  const resLoginSeller = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: seller.email, password: "senha123" }),
  });
  assert.equal(resLoginSeller.status, 200);
  const { token: sellerToken } = await resLoginSeller.json();

  // Obter produto do catálogo
  const catalogProduct = await prisma.catalogProduct.findFirst({
    where: { isActive: true },
  });
  assert.ok(catalogProduct, "Deve existir ao menos um produto no catálogo");

  await t.test("Rejeita cotação se gênero não for informado em alguma linha", async () => {
    const res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: "Time Sem Gênero",
          contactName: "Contato",
          phone: "11988887777",
        },
        teamName: "Time Sem Gênero",
        productModel: catalogProduct.name,
        catalogProductId: catalogProduct.id,
        totalQuantity: 10,
        budgetAmount: catalogProduct.basePrice * 10,
        items: [
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "", // Vazio / não selecionado
            size: "M",
            quantity: 10,
          },
        ],
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes("Gênero"), "Deve informar erro de gênero obrigatório");
  });

  await t.test("Rejeita cotação se tamanho não for informado em alguma linha", async () => {
    const res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: "Time Sem Tamanho",
          contactName: "Contato",
          phone: "11988887777",
        },
        teamName: "Time Sem Tamanho",
        productModel: catalogProduct.name,
        catalogProductId: catalogProduct.id,
        totalQuantity: 10,
        budgetAmount: catalogProduct.basePrice * 10,
        items: [
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "MASCULINO",
            size: "   ", // Vazio
            quantity: 10,
          },
        ],
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes("Tamanho"), "Deve informar erro de tamanho obrigatório");
  });

  await t.test("Rejeita cotação se quantidade de alguma linha não for inteiro positivo", async () => {
    const res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: "Time Qtd Inválida",
          contactName: "Contato",
          phone: "11988887777",
        },
        teamName: "Time Qtd Inválida",
        productModel: catalogProduct.name,
        catalogProductId: catalogProduct.id,
        totalQuantity: 0,
        budgetAmount: 0,
        items: [
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "MASCULINO",
            size: "M",
            quantity: 0,
          },
        ],
      }),
    });

    assert.equal(res.status, 400);
  });

  await t.test("Rejeita cotação se tamanho for incompatível com o gênero selecionado", async () => {
    // 1. Infantil com tamanho de adulto 'M' deve ser rejeitado
    const resInfantilM = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: "Time Incompatível 1",
          contactName: "Contato",
          phone: "11988887777",
        },
        teamName: "Time Incompatível",
        productModel: catalogProduct.name,
        catalogProductId: catalogProduct.id,
        totalQuantity: 10,
        items: [
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "INFANTIL",
            size: "M", // Incompatível com Infantil
            quantity: 10,
          },
        ],
      }),
    });
    assert.equal(resInfantilM.status, 400);
    const body1 = await resInfantilM.json();
    assert.ok(body1.error.includes("Infantil"));

    // 2. Masculino com tamanho infantil '6ANOS' deve ser rejeitado
    const resMasc6Anos = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: "Time Incompatível 2",
          contactName: "Contato",
          phone: "11988887777",
        },
        teamName: "Time Incompatível 2",
        productModel: catalogProduct.name,
        catalogProductId: catalogProduct.id,
        totalQuantity: 10,
        items: [
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "MASCULINO",
            size: "6ANOS", // Incompatível com Masculino
            quantity: 10,
          },
        ],
      }),
    });
    assert.equal(resMasc6Anos.status, 400);
    const body2 = await resMasc6Anos.json();
    assert.ok(body2.error.includes("Masculino"));
  });

  await t.test("Cria ficha com novos tamanhos oficiais: Infantil 6ANOS e Feminino X4", async () => {
    const res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: "Time 6ANOS e X4",
          contactName: "Valéria",
          phone: "11999998888",
        },
        teamName: "Vôlei Misto Especial",
        productModel: catalogProduct.name,
        catalogProductId: catalogProduct.id,
        totalQuantity: 11,
        items: [
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "INFANTIL",
            size: "6ANOS",
            quantity: 5,
          },
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "FEMININO",
            size: "X4",
            quantity: 6,
          },
        ],
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.totalQuantity, 11);

    const getRes = await fetch(`${baseUrl}/api/quotations/${data.id}`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    const details = await getRes.json();
    assert.equal(details.items.length, 2);
    assert.ok(details.items.some((i: any) => i.gender === "INFANTIL" && i.size === "6ANOS" && i.quantity === 5));
    assert.ok(details.items.some((i: any) => i.gender === "FEMININO" && i.size === "X4" && i.quantity === 6));
  });

  let createdQuotationId = "";

  await t.test("Cria ficha com grade combinando tamanhos e gêneros (4 Fem P, 6 Masc M, 3 Inf 8 = 13 peças)", async () => {
    const gradeItems = [
      {
        catalogProductId: catalogProduct.id,
        productModel: catalogProduct.name,
        gender: "FEMININO",
        size: "P",
        quantity: 4,
      },
      {
        catalogProductId: catalogProduct.id,
        productModel: catalogProduct.name,
        gender: "MASCULINO",
        size: "M",
        quantity: 6,
      },
      {
        catalogProductId: catalogProduct.id,
        productModel: catalogProduct.name,
        gender: "INFANTIL",
        size: "8",
        quantity: 3,
      },
    ];

    const res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: `Atlética Grade ${timestamp}`,
          contactName: "Mariana Souza",
          phone: "11977778888",
        },
        teamName: "Futsal Universitário",
        productModel: catalogProduct.name,
        catalogProductId: catalogProduct.id,
        fabricType: "Dry Fit Tradicional",
        collarType: "Gola Careca",
        totalQuantity: 13,
        budgetAmount: catalogProduct.basePrice * 13,
        items: gradeItems,
      }),
    });

    assert.equal(res.status, 201);
    const created = await res.json();
    createdQuotationId = created.id;

    assert.equal(created.totalQuantity, 13, "Quantidade total deve ser a soma das 3 linhas (13)");
    assert.equal(Number(created.budgetAmount), Number((catalogProduct.basePrice * 13).toFixed(2)));

    // Verificar se os itens foram persistidos corretamente
    const detailsRes = await fetch(`${baseUrl}/api/quotations/${created.id}`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    assert.equal(detailsRes.status, 200);
    const details = await detailsRes.json();

    assert.equal(details.items.length, 3);
    const femP = details.items.find((i: any) => i.gender === "FEMININO" && i.size === "P");
    assert.ok(femP);
    assert.equal(femP.quantity, 4);

    const mascM = details.items.find((i: any) => i.gender === "MASCULINO" && i.size === "M");
    assert.ok(mascM);
    assert.equal(mascM.quantity, 6);

    const inf8 = details.items.find((i: any) => i.gender === "INFANTIL" && i.size === "8");
    assert.ok(inf8);
    assert.equal(inf8.quantity, 3);
  });

  await t.test("Regra de PIN: Grade somando 9 peças (< 10) exige PIN e valida com sucesso", async () => {
    // 1. Tentativa sem PIN deve falhar com 400
    const resWithoutPin = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: "Time Pequeno",
          contactName: "Carlos",
          phone: "11988889999",
        },
        teamName: "Time 9 Peças",
        productModel: catalogProduct.name,
        catalogProductId: catalogProduct.id,
        totalQuantity: 9,
        items: [
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "FEMININO",
            size: "P",
            quantity: 4,
          },
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "MASCULINO",
            size: "M",
            quantity: 5,
          },
        ],
      }),
    });

    assert.equal(resWithoutPin.status, 400, "Sem PIN deve retornar 400");
    const errBody = await resWithoutPin.json();
    assert.ok(errBody.error.includes("PIN"));

    // 2. Com PIN correto do gestor deve autorizar
    const resWithPin = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: "Time Pequeno Aprovado",
          contactName: "Carlos",
          phone: "11988889999",
        },
        teamName: "Time 9 Peças Aprovado",
        productModel: catalogProduct.name,
        catalogProductId: catalogProduct.id,
        totalQuantity: 9,
        managerPin: "1234",
        managerId: manager.id,
        items: [
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "FEMININO",
            size: "P",
            quantity: 4,
          },
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "MASCULINO",
            size: "M",
            quantity: 5,
          },
        ],
      }),
    });

    assert.equal(resWithPin.status, 201);
    const createdWithPin = await resWithPin.json();
    assert.equal(createdWithPin.totalQuantity, 9);
    assert.equal(createdWithPin.minQtyApprovedQuantity, 9);
    assert.equal(createdWithPin.minQtyAuthorizedById, manager.id);
  });

  await t.test("Regra de PIN: Grade somando 10 peças não exige PIN", async () => {
    const res10 = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: "Time 10 Peças",
          contactName: "Bruno",
          phone: "11988889999",
        },
        teamName: "Time 10 Peças",
        productModel: catalogProduct.name,
        catalogProductId: catalogProduct.id,
        totalQuantity: 10,
        items: [
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "FEMININO",
            size: "P",
            quantity: 4,
          },
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "MASCULINO",
            size: "M",
            quantity: 6,
          },
        ],
      }),
    });

    assert.equal(res10.status, 201, "Com 10 peças deve criar sem PIN");
    const created10 = await res10.json();
    assert.equal(created10.totalQuantity, 10);
  });

  await t.test("Criação de item 'Outros' com grade de múltiplos tamanhos e cálculo de subtotal", async () => {
    const resOutros = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: "Cliente Especial Outros",
          contactName: "Renata",
          phone: "11944445555",
        },
        teamName: "Colete Personalizado",
        productModel: "Outros",
        isCustomModel: true,
        customModelName: "Colete Dupla Face Pro",
        items: [
          {
            productModel: "Outros",
            isCustomModel: true,
            customModelName: "Colete Dupla Face Pro",
            gender: "UNISSEX",
            size: "G",
            quantity: 10,
            unitPrice: 45.0,
          },
          {
            productModel: "Outros",
            isCustomModel: true,
            customModelName: "Colete Dupla Face Pro",
            gender: "INFANTIL",
            size: "12",
            quantity: 5,
            unitPrice: 45.0,
          },
        ],
      }),
    });

    assert.equal(resOutros.status, 201);
    const createdOutros = await resOutros.json();
    assert.equal(createdOutros.totalQuantity, 15);
    // 15 * 45.0 = 675.00
    assert.equal(Number(createdOutros.budgetAmount), 675.0);
  });

  await t.test("Edição da ficha: restaura grade, altera quantidades e adiciona nova linha", async () => {
    // Atualizar a cotação criada no teste 4 (que tinha 13 peças)
    // Mudando para: Fem P = 5, Masc M = 7, Inf 8 = 3, Masc GG = 2 => Total 17
    const updateRes = await fetch(`${baseUrl}/api/quotations/${createdQuotationId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        teamName: "Futsal Universitário Atualizado",
        items: [
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "FEMININO",
            size: "P",
            quantity: 5,
          },
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "MASCULINO",
            size: "M",
            quantity: 7,
          },
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "INFANTIL",
            size: "8",
            quantity: 3,
          },
          {
            catalogProductId: catalogProduct.id,
            productModel: catalogProduct.name,
            gender: "MASCULINO",
            size: "GG",
            quantity: 2,
          },
        ],
      }),
    });

    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.totalQuantity, 17, "Total de peças recalculado pela soma da grade deve ser 17");
    assert.equal(Number(updated.budgetAmount), Number((catalogProduct.basePrice * 17).toFixed(2)));

    // Conferir na consulta de detalhes
    const getRes = await fetch(`${baseUrl}/api/quotations/${createdQuotationId}`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    assert.equal(getRes.status, 200);
    const fresh = await getRes.json();
    assert.equal(fresh.items.length, 4, "Deve conter 4 linhas na grade");
  });

  await t.test("Ficha Universal consolida a grade de tamanhos corretamente", async () => {
    const resUni = await fetch(`${baseUrl}/api/universal-sheet/quotation/${createdQuotationId}`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });

    assert.equal(resUni.status, 200);
    const sheet = await resUni.json();

    assert.ok(sheet.consolidatedSizeGrid, "Deve retornar consolidatedSizeGrid");
    assert.equal(sheet.consolidatedSizeGrid["P"], 5);
    assert.equal(sheet.consolidatedSizeGrid["M"], 7);
    assert.equal(sheet.consolidatedSizeGrid["8"], 3);
    assert.equal(sheet.consolidatedSizeGrid["GG"], 2);
    assert.equal(sheet.items.length, 4);
  });
});
