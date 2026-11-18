import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { hashPassword, hashPin, generateToken } from "../src/utils/security.js";
import { getReferencesDir } from "../src/utils/storageConfig.js";

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

test("Autorização por PIN para vendas < 10 peças e Correção de Download Seguro de Anexos", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("SenhaForte123@");
  const validManagerPin = "8899";
  const managerPinHash = await hashPin(validManagerPin);

  // Setores
  const sectorVendas = await prisma.sector.findUnique({ where: { code: "VENDAS" } });
  const sectorDesign = await prisma.sector.findUnique({ where: { code: "DESIGNER" } });
  assert.ok(sectorVendas && sectorDesign, "Setores VENDAS e DESIGNER devem existir");

  // Usuários: Vendedor 1, Vendedor 2 (isolamento), Gestor (com PIN), Designer
  const seller1 = await prisma.user.create({
    data: {
      name: `Vendedor Um ${timestamp}`,
      email: `vendedor1.${timestamp}@labella.com`,
      passwordHash,
      role: "VENDEDOR",
      sectorId: sectorVendas.id,
      isActive: true,
    },
  });

  const seller2 = await prisma.user.create({
    data: {
      name: `Vendedor Dois ${timestamp}`,
      email: `vendedor2.${timestamp}@labella.com`,
      passwordHash,
      role: "VENDEDOR",
      sectorId: sectorVendas.id,
      isActive: true,
    },
  });

  const manager = await prisma.user.create({
    data: {
      name: `Gestor Comercial ${timestamp}`,
      email: `gestor.${timestamp}@labella.com`,
      passwordHash,
      signaturePinHash: managerPinHash,
      role: "GESTOR",
      sectorId: sectorVendas.id,
      isActive: true,
    },
  });

  const designer = await prisma.user.create({
    data: {
      name: `Designer Teste ${timestamp}`,
      email: `designer.${timestamp}@labella.com`,
      passwordHash,
      role: "DESIGNER",
      sectorId: sectorDesign.id,
      isActive: true,
    },
  });

  const seller1Token = generateToken({ userId: seller1.id, email: seller1.email, role: seller1.role });
  const seller2Token = generateToken({ userId: seller2.id, email: seller2.email, role: seller2.role });
  const managerToken = generateToken({ userId: manager.id, email: manager.email, role: manager.role });
  const designerToken = generateToken({ userId: designer.id, email: designer.email, role: designer.role });

  // Produto de catálogo para testes
  let catalogProduct = await prisma.catalogProduct.findFirst();
  if (!catalogProduct) {
    let category = await prisma.category.findFirst();
    if (!category) {
      category = await prisma.category.create({ data: { name: "Linha Teste", slug: `teste-${timestamp}` } });
    }
    catalogProduct = await prisma.catalogProduct.create({
      data: {
        code: `REG_${timestamp}`,
        name: "Regata Confort Esportiva",
        categoryId: category.id,
        basePrice: 38.9,
        minQuantity: 10,
        availableFabrics: JSON.stringify(["Dry Fit Tradicional"]),
        availableCollars: JSON.stringify(["Gola Careca"]),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // PARTE 1: AUTORIZAÇÃO POR PIN PARA VENDAS < 10 PEÇAS
  // ---------------------------------------------------------------------------

  await t.test("1.1. Rejeitar quantidades 0, negativas ou fracionadas", async () => {
    // Qtd = 0
    let res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        customer: { companyName: "Cliente Zero", contactName: "Contato", phone: "(11) 99999-9999" },
        teamName: "Time Zero",
        totalQuantity: 0,
        items: [{ productModel: "Regata Teste", size: "G", catalogProductId: catalogProduct!.id, quantity: 0 }],
      }),
    });
    assert.equal(res.status, 400);

    // Qtd = -3
    res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        customer: { companyName: "Cliente Negativo", contactName: "Contato", phone: "(11) 99999-9999" },
        teamName: "Time Negativo",
        totalQuantity: -3,
        items: [{ productModel: "Regata Teste", size: "G", catalogProductId: catalogProduct!.id, quantity: -3 }],
      }),
    });
    assert.equal(res.status, 400);

    // Qtd = 4.5 (fracionada)
    res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        customer: { companyName: "Cliente Fracionado", contactName: "Contato", phone: "(11) 99999-9999" },
        teamName: "Time Fracionado",
        totalQuantity: 4.5,
        items: [{ productModel: "Regata Teste", size: "G", catalogProductId: catalogProduct!.id, quantity: 4.5 }],
      }),
    });
    assert.equal(res.status, 400);
  });

  let quotation3PiecesId: string;

  await t.test("1.2. Criação com 3 peças: Falha sem PIN (400)", async () => {
    const res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        customer: { companyName: "Time Três Peças", contactName: "Contato 3", phone: "(11) 98888-7777" },
        teamName: "Futebol 3",
        totalQuantity: 3,
        budgetAmount: 116.7,
        items: [
          {
            productModel: "Regata Confort Esportiva",
            size: "G",
            catalogProductId: catalogProduct!.id,
            quantity: 3,
            unitPrice: 38.9,
          },
        ],
      }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.toLowerCase().includes("gestor ou administrador"));
  });

  await t.test("1.3. Criação com 3 peças: Falha com PIN inválido (403)", async () => {
    const res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        customer: { companyName: "Time Três Peças", contactName: "Contato 3", phone: "(11) 98888-7777" },
        teamName: "Futebol 3",
        totalQuantity: 3,
        budgetAmount: 116.7,
        managerPin: "0000", // PIN inválido
        items: [
          {
            productModel: "Regata Confort Esportiva",
            size: "G",
            catalogProductId: catalogProduct!.id,
            quantity: 3,
            unitPrice: 38.9,
          },
        ],
      }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.includes("PIN"));
  });

  await t.test("1.4. Criação com 3 peças: Sucesso com PIN válido de Gestor (201)", async () => {
    const res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        customer: { companyName: "Time Três Peças", contactName: "Contato 3", phone: "(11) 98888-7777" },
        teamName: "Futebol 3",
        totalQuantity: 3,
        budgetAmount: 116.7,
        managerPin: validManagerPin,
        managerId: manager.id,
        items: [
          {
            productModel: "Regata Confort Esportiva",
            size: "G",
            catalogProductId: catalogProduct!.id,
            quantity: 3,
            unitPrice: 38.9,
          },
        ],
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    quotation3PiecesId = data.id;

    assert.equal(data.totalQuantity, 3);
    assert.equal(data.minQtyAuthorizedById, manager.id);
    assert.equal(data.minQtyApprovedQuantity, 3);
    assert.equal(data.minQtyRequestedById, seller1.id);
    assert.ok(data.minQtyAuthorizedAt);

    // Validação de segurança: o PIN não deve constar em lugar nenhum
    assert.equal((data as any).managerPin, undefined);
    assert.equal((data as any).pin, undefined);

    // Verificar no banco de dados diretamente
    const dbRecord = await prisma.quotation.findUnique({
      where: { id: data.id },
      include: { minQtyAuthorizedBy: true, minQtyRequestedBy: true },
    });
    assert.equal(dbRecord?.minQtyAuthorizedById, manager.id);
    assert.equal(dbRecord?.minQtyApprovedQuantity, 3);
    assert.equal(dbRecord?.minQtyAuthorizedBy?.name, manager.name);
    assert.equal(dbRecord?.minQtyRequestedBy?.name, seller1.name);
  });

  await t.test("1.5. Criação com 9 peças com PIN válido de Gestor (201)", async () => {
    const res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        customer: { companyName: "Time Nove Peças", contactName: "Contato 9", phone: "(11) 98888-7777" },
        teamName: "Futebol 9",
        totalQuantity: 9,
        budgetAmount: 350.1,
        managerPin: validManagerPin,
        managerId: manager.id,
        items: [
          {
            productModel: "Regata Confort Esportiva",
            size: "G",
            catalogProductId: catalogProduct!.id,
            quantity: 9,
            unitPrice: 38.9,
          },
        ],
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.totalQuantity, 9);
    assert.equal(data.minQtyApprovedQuantity, 9);
    assert.equal(data.minQtyAuthorizedById, manager.id);
  });

  await t.test("1.6. Criação com 10 peças: Sucesso SEM PIN (201)", async () => {
    const res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        customer: { companyName: "Time Dez Peças", contactName: "Contato 10", phone: "(11) 98888-7777" },
        teamName: "Futebol 10",
        totalQuantity: 10,
        budgetAmount: 389.0,
        items: [
          {
            productModel: "Regata Confort Esportiva",
            size: "G",
            catalogProductId: catalogProduct!.id,
            quantity: 10,
            unitPrice: 38.9,
          },
        ],
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.totalQuantity, 10);
    assert.equal(data.minQtyAuthorizedById, null);
    assert.equal(data.minQtyApprovedQuantity, null);
  });

  await t.test("1.7. Edição mantendo a quantidade aprovada (3 un): Preserva autorização sem pedir PIN", async () => {
    const res = await fetch(`${baseUrl}/api/quotations/${quotation3PiecesId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        teamName: "Futebol 3 Atualizado",
        totalQuantity: 3,
        items: [
          {
            productModel: "Regata Confort Esportiva",
            size: "G",
            catalogProductId: catalogProduct!.id,
            quantity: 3,
            unitPrice: 38.9,
          },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.totalQuantity, 3);
    assert.equal(data.minQtyApprovedQuantity, 3);
    assert.equal(data.minQtyAuthorizedById, manager.id);
  });

  await t.test("1.8. Alteração de quantidade abaixo de 10 (3 -> 4) sem novo PIN: Rejeitada (400)", async () => {
    const res = await fetch(`${baseUrl}/api/quotations/${quotation3PiecesId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        totalQuantity: 4,
        items: [
          {
            productModel: "Regata Confort Esportiva",
            size: "G",
            catalogProductId: catalogProduct!.id,
            quantity: 4,
            unitPrice: 38.9,
          },
        ],
      }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes("PIN") || data.error.includes("autorização"));
  });

  await t.test("1.9. Alteração de quantidade abaixo de 10 (3 -> 4) com PIN válido: Aprovada (200)", async () => {
    const res = await fetch(`${baseUrl}/api/quotations/${quotation3PiecesId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        totalQuantity: 4,
        managerPin: validManagerPin,
        items: [
          {
            productModel: "Regata Confort Esportiva",
            size: "G",
            catalogProductId: catalogProduct!.id,
            quantity: 4,
            unitPrice: 38.9,
          },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.totalQuantity, 4);
    assert.equal(data.minQtyApprovedQuantity, 4);
  });

  await t.test("1.10. Alteração de quantidade para 10 ou mais (4 -> 12): Limpa necessidade de autorização", async () => {
    const res = await fetch(`${baseUrl}/api/quotations/${quotation3PiecesId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        totalQuantity: 12,
        items: [
          {
            productModel: "Regata Confort Esportiva",
            size: "G",
            catalogProductId: catalogProduct!.id,
            quantity: 12,
            unitPrice: 38.9,
          },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.totalQuantity, 12);
    assert.equal(data.minQtyAuthorizedById, null);
    assert.equal(data.minQtyApprovedQuantity, null);
  });

  await t.test("1.11. Encaminhar cotação < 10 peças exige autorização válida", async () => {
    // 1. Criar cotação com 5 peças com PIN
    const createRes = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        customer: { companyName: "Time Cinco Peças", contactName: "Contato 5", phone: "(11) 98888-7777" },
        teamName: "Futebol 5",
        totalQuantity: 5,
        budgetAmount: 194.5,
        managerPin: validManagerPin,
        items: [{ productModel: "Regata Confort Esportiva", size: "G", catalogProductId: catalogProduct!.id, quantity: 5, unitPrice: 38.9 }],
      }),
    });
    assert.equal(createRes.status, 201);
    const q5 = await createRes.json();

    // 2. Encaminhar para SOLICITACAO_ARTE (deve permitir porque minQtyApprovedQuantity == 5)
    const forwardRes = await fetch(`${baseUrl}/api/quotations/${q5.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({ status: "SOLICITACAO_ARTE" }),
    });
    assert.equal(forwardRes.status, 200);

    // 3. Simular cotação com totalQuantity = 7 mas sem aprovação
    const unapprovedCustomer = await prisma.customer.create({
      data: { companyName: "Cliente Não Aprovado", contactName: "Contato", phone: "(11) 99999-9999", sellerId: seller1.id },
    });
    const unapprovedQ = await prisma.quotation.create({
      data: {
        quotationNumber: `ORC-TEST-${timestamp}`,
        sellerId: seller1.id,
        customerId: unapprovedCustomer.id,
        teamName: "Equipe Não Aprovada",
        totalQuantity: 7,
        budgetAmount: 272.3,
        status: "NOVA_SOLICITACAO",
      },
    });

    const blockedForward = await fetch(`${baseUrl}/api/quotations/${unapprovedQ.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({ status: "SOLICITACAO_ARTE" }),
    });
    assert.equal(blockedForward.status, 400);
    const blockData = await blockedForward.json();
    assert.ok(blockData.error.toLowerCase().includes("autorização por pin"));

    // 4. Conversão em OP de cotação não aprovada deve ser bloqueada
    const blockedConvert = await fetch(`${baseUrl}/api/quotations/${unapprovedQ.id}/convert-to-op`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({ promisedDeliveryDate: new Date().toISOString() }),
    });
    assert.equal(blockedConvert.status, 400);
  });

  // ---------------------------------------------------------------------------
  // PARTE 2: CORREÇÃO DO DOWNLOAD DE ANEXOS (CDR, PSD, AI, PDF, JPG, PNG)
  // ---------------------------------------------------------------------------

  const refDir = getReferencesDir();
  const fileFormats = [
    { ext: "cdr", header: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]), size: 1024 },
    { ext: "psd", header: Buffer.from([0x38, 0x42, 0x50, 0x53, 0x00, 0x01, 0x00, 0x00]), size: 2048 },
    { ext: "ai", header: Buffer.from("%PDF-1.5 AI File Test Vector", "utf8"), size: 1500 },
    { ext: "pdf", header: Buffer.from("%PDF-1.4 Documento de Briefing", "utf8"), size: 1200 },
    { ext: "jpg", header: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]), size: 800 },
    { ext: "png", header: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), size: 900 },
  ];

  const attachmentCustomer = await prisma.customer.create({
    data: { companyName: "Cliente Anexos Teste", contactName: "Contato", phone: "(11) 99999-9999", sellerId: seller1.id },
  });

  // Criar cotação para testar anexos
  const quotationAttachments = await prisma.quotation.create({
    data: {
      quotationNumber: `ORC-ATT-${timestamp}`,
      sellerId: seller1.id,
      customerId: attachmentCustomer.id,
      teamName: "Time Anexos Teste",
      totalQuantity: 15,
      budgetAmount: 583.5,
      status: "NOVA_SOLICITACAO",
    },
  });

  const createdAttachments: Array<{ ext: string; originalName: string; filename: string; fileUrl: string }> = [];

  for (const fmt of fileFormats) {
    const filename = `${crypto.randomUUID()}-teste_arte.${fmt.ext}`;
    const filePath = path.join(refDir, filename);
    const content = Buffer.concat([fmt.header, Buffer.alloc(fmt.size - fmt.header.length, 0x41)]);
    fs.writeFileSync(filePath, content);

    const originalName = `projeto_oficial_${fmt.ext}.${fmt.ext}`;
    const fileUrl = `/api/files/references/${filename}`;

    const att = await prisma.quotationAttachment.create({
      data: {
        quotationId: quotationAttachments.id,
        fileName: filename,
        originalName,
        fileExtension: fmt.ext,
        fileType: "REFERENCE",
        fileUrl,
        fileSize: fmt.size,
        uploadedById: seller1.id,
      },
    });

    createdAttachments.push({ ext: fmt.ext, originalName, filename, fileUrl });
  }

  await t.test("2.1. Download direto SEM token retorna 401 Unauthorized", async () => {
    const att = createdAttachments[0];
    const res = await fetch(`${baseUrl}${att.fileUrl}`);
    assert.equal(res.status, 401);
  });

  await t.test("2.2. Download com token via query parameter (?token=...) entrega arquivo completo com nome original", async () => {
    for (const att of createdAttachments) {
      const res = await fetch(`${baseUrl}${att.fileUrl}?token=${seller1Token}`);
      assert.equal(res.status, 200, `Falha no download de .${att.ext}`);

      // Content-Disposition deve conter o nome original do arquivo
      const disposition = res.headers.get("content-disposition");
      assert.ok(disposition, `Header Content-Disposition ausente para .${att.ext}`);
      assert.ok(
        disposition.includes(encodeURIComponent(att.originalName)) || disposition.includes(att.originalName),
        `Content-Disposition não contém nome original '${att.originalName}'`
      );

      // Conferir se o arquivo baixado foi recebido integralmente
      const buffer = Buffer.from(await res.arrayBuffer());
      const formatDef = fileFormats.find((f) => f.ext === att.ext)!;
      assert.equal(buffer.length, formatDef.size, `Tamanho recebido difere do original para .${att.ext}`);
    }
  });

  await t.test("2.3. Isolamento entre vendedores: Vendedor 2 não consegue baixar anexos do Vendedor 1 (403)", async () => {
    for (const att of createdAttachments) {
      const res = await fetch(`${baseUrl}${att.fileUrl}?token=${seller2Token}`);
      assert.equal(res.status, 403, `Vendedor 2 não deveria ter acesso a .${att.ext}`);
      const body = await res.json();
      assert.ok(body.error.includes("Acesso negado"));
    }
  });

  await t.test("2.4. Designer ganha acesso para download de todos os formatos após encaminhamento para SOLICITACAO_ARTE", async () => {
    // 1. Antes de encaminhar, Designer não tem acesso
    let res = await fetch(`${baseUrl}${createdAttachments[0].fileUrl}?token=${designerToken}`);
    assert.equal(res.status, 403);

    // 2. Encaminhar cotação para o Design
    await prisma.quotation.update({
      where: { id: quotationAttachments.id },
      data: { status: "SOLICITACAO_ARTE" },
    });

    // 3. Após encaminhamento, Designer consegue baixar todos os formatos (CDR, PSD, AI, PDF, JPG, PNG)
    for (const att of createdAttachments) {
      res = await fetch(`${baseUrl}${att.fileUrl}?token=${designerToken}`);
      assert.equal(res.status, 200, `Designer deveria conseguir baixar .${att.ext} após encaminhamento`);
      const disposition = res.headers.get("content-disposition");
      assert.ok(disposition?.includes(att.originalName) || disposition?.includes(encodeURIComponent(att.originalName)));
    }
  });

  await t.test("2.5. Vínculo de anexos e downloads preservados após conversão em Ordem de Produção", async () => {
    // Converter cotação em OP (com arte formalmente aprovada)
    await prisma.quotation.update({
      where: { id: quotationAttachments.id },
      data: { status: "ORCAMENTO_APROVADO", isArtworkApproved: true },
    });

    const convertRes = await fetch(`${baseUrl}/api/quotations/${quotationAttachments.id}/convert-to-op`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${seller1Token}` },
      body: JSON.stringify({
        promisedDeliveryDate: new Date(Date.now() + 86400000 * 10).toISOString(),
      }),
    });
    assert.equal(convertRes.status, 201);

    // Download pelo vendedor responsável continua funcionando perfeitamente
    const att = createdAttachments[0];
    const res = await fetch(`${baseUrl}${att.fileUrl}?token=${seller1Token}`);
    assert.equal(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.length, 1024);
  });

  await t.test("2.6. Arquivo inexistente retorna 404 claro com mensagem de erro", async () => {
    const res = await fetch(`${baseUrl}/api/files/references/arquivo-inexistente-${timestamp}.pdf?token=${seller1Token}`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "Arquivo não encontrado.");
  });

  // Limpeza de arquivos temporários de teste
  for (const att of createdAttachments) {
    const p = path.join(refDir, att.filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});
