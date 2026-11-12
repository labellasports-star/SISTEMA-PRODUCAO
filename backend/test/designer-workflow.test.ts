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

test("Fluxo Aprimorado do Designer: Pré-Visualização, Versionamento e Homologação", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("SenhaForte123@");

  const sectorDesign = await prisma.sector.findUnique({ where: { code: "DESIGNER" } });
  assert.ok(sectorDesign);

  const vendedor = await prisma.user.create({
    data: {
      name: `Vendedor Designer Test ${timestamp}`,
      email: `vend.des.${timestamp}@teste.com`,
      passwordHash,
      role: "VENDEDOR",
      isActive: true,
    },
  });

  const designer = await prisma.user.create({
    data: {
      name: `Designer Test ${timestamp}`,
      email: `designer.${timestamp}@teste.com`,
      passwordHash,
      role: "DESIGNER",
      sectorId: sectorDesign.id,
      isActive: true,
    },
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

  const tokenVendedor = generateToken({
    userId: vendedor.id,
    id: vendedor.id,
    name: vendedor.name,
    email: vendedor.email,
    role: vendedor.role,
  });

  const cliente = await prisma.customer.create({
    data: {
      companyName: `Cliente Designer Test ${timestamp}`,
      contactName: "Mariana",
      phone: "11977776666",
    },
  });

  // 1. Criar cotação na fila de arte com imagens de referência
  const cotação = await prisma.quotation.create({
    data: {
      quotationNumber: `ORC-DES-${timestamp}`,
      customerId: cliente.id,
      teamName: "Time Feminino Estrelas",
      status: "SOLICITACAO_ARTE",
      totalQuantity: 25,
      budgetAmount: 1400.0,
      sellerId: vendedor.id,
      observations: "Camisas baby look na cor lilás com detalhes em prata.",
      attachments: {
        create: [
          {
            fileName: "referencia_lilas.png",
            fileType: "REFERENCE",
            fileExtension: "PNG",
            fileUrl: "/uploads/references/referencia_lilas.png",
            uploadedById: vendedor.id,
          },
        ],
      },
    },
  });

  await t.test("1. Designer visualiza detalhes e referências do cliente ANTES de assumir o pedido", async () => {
    const res = await fetch(`${baseUrl}/api/universal-sheet/quotations/${cotação.id}`, {
      headers: { Authorization: `Bearer ${tokenDesigner}` },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.teamName, "Time Feminino Estrelas");
    assert.equal(data.status, "SOLICITACAO_ARTE");
    assert.equal(data.references.length, 1);
    assert.equal(data.references[0].fileName, "referencia_lilas.png");
    assert.equal(data.artwork.allVersions.length, 0, "Ainda não deve ter nenhuma versão de arte");
  });

  await t.test("2. Designer assume formalmente o pedido na fila", async () => {
    const res = await fetch(`${baseUrl}/api/design/${cotação.id}/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenDesigner}` },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.designerId, designer.id);
    assert.equal(data.status, "DESENVOLVIMENTO_ARTE");
  });

  await t.test("3. Designer envia versão 1 da arte", async () => {
    const res = await fetch(`${baseUrl}/api/design/${cotação.id}/versions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenDesigner}`,
      },
      body: JSON.stringify({
        previewUrl: "/uploads/artwork/estrelas_v1_mockup.png",
        vectorUrl: "/uploads/artwork/estrelas_v1_curvas.pdf",
        changeNotes: "Primeira versão criada com gola v lilás e estrelas no degradê.",
      }),
    });

    assert.equal(res.status, 201);
    const version1 = await res.json();
    assert.equal(version1.versionNumber, 1);
    assert.equal(version1.status, "SUBMITTED");
    assert.equal(version1.designerId, designer.id);
  });

  await t.test("4. Cliente solicita alteração através do vendedor (Versão 1 fica REVISION_REQUESTED)", async () => {
    const res = await fetch(`${baseUrl}/api/quotations/${cotação.id}/client-approval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenVendedor}`,
      },
      body: JSON.stringify({
        decision: "REVISION_REQUESTED",
        feedbackNotes: "O tom de lilás precisa ser mais escuro e o escudo mais alto.",
      }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.quotation.status, "ARTE_EM_ALTERACAO");
    assert.equal(data.quotation.isArtworkApproved, false);

    const v1 = await prisma.artworkVersion.findFirst({
      where: { designBrief: { quotationId: cotação.id }, versionNumber: 1 },
    });
    assert.equal(v1?.status, "REVISION_REQUESTED");
  });

  await t.test("5. Designer envia versão 2 corrigida", async () => {
    const res = await fetch(`${baseUrl}/api/design/${cotação.id}/versions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenDesigner}`,
      },
      body: JSON.stringify({
        previewUrl: "/uploads/artwork/estrelas_v2_mockup.png",
        vectorUrl: "/uploads/artwork/estrelas_v2_curvas.pdf",
        changeNotes: "Ajustado tom de lilás mais escuro e reposicionado o escudo.",
      }),
    });

    assert.equal(res.status, 201);
    const version2 = await res.json();
    assert.equal(version2.versionNumber, 2);
    assert.equal(version2.status, "SUBMITTED");
  });

  await t.test("6. Cliente aprova versão 2 (Versão 2 torna-se APPROVED / Arte Homologada)", async () => {
    const res = await fetch(`${baseUrl}/api/quotations/${cotação.id}/client-approval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenVendedor}`,
      },
      body: JSON.stringify({
        decision: "APPROVED",
        approvedByPerson: "Mariana Capitã",
        feedbackNotes: "Ficou perfeito! Aprovado para produção.",
      }),
    });

    assert.equal(res.status, 200);

    const v2 = await prisma.artworkVersion.findFirst({
      where: { designBrief: { quotationId: cotação.id }, versionNumber: 2 },
    });
    assert.equal(v2?.status, "APPROVED");

    // Verificar na Ficha Universal que a versão 2 é a oficial homologada
    const sheetRes = await fetch(`${baseUrl}/api/universal-sheet/quotations/${cotação.id}`, {
      headers: { Authorization: `Bearer ${tokenVendedor}` },
    });
    const sheetData = await sheetRes.json();
    assert.equal(sheetData.artwork.approvedVersion.versionNumber, 2);
    assert.equal(sheetData.artwork.approvedVersion.status, "APPROVED");
    assert.equal(sheetData.isArtworkApproved, true);
    assert.equal(sheetData.artworkApprovedBy, "Mariana Capitã");
  });
});
