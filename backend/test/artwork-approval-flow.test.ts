import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { hashPassword, generateToken } from "../src/utils/security.js";
import { getArtworkDir } from "../src/utils/storageConfig.js";

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

test("Fluxo Completo de Aprovação da Arte na Pré-Venda", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("SenhaForte123@");

  // 1. Setores
  const sectorVendas = await prisma.sector.findUnique({ where: { code: "VENDAS" } });
  const sectorDesigner = await prisma.sector.findUnique({ where: { code: "DESIGNER" } });
  const sectorSac = await prisma.sector.findUnique({ where: { code: "SAC_INTERNO" } });
  assert.ok(sectorVendas && sectorDesigner && sectorSac, "Setores VENDAS, DESIGNER e SAC_INTERNO devem existir");

  // 2. Usuários: Vendedor 1 (dono), Vendedor 2 (isolamento), Designer, Operador SAC (próximo setor)
  const seller1 = await prisma.user.create({
    data: {
      name: `Vendedor Resp ${timestamp}`,
      email: `vendedor.resp.${timestamp}@labella.com`,
      passwordHash,
      role: "VENDEDOR",
      sectorId: sectorVendas.id,
      isActive: true,
    },
  });

  const seller2 = await prisma.user.create({
    data: {
      name: `Vendedor Outro ${timestamp}`,
      email: `vendedor.outro.${timestamp}@labella.com`,
      passwordHash,
      role: "VENDEDOR",
      sectorId: sectorVendas.id,
      isActive: true,
    },
  });

  const designer = await prisma.user.create({
    data: {
      name: `Arte Finalista ${timestamp}`,
      email: `designer.${timestamp}@labella.com`,
      passwordHash,
      role: "DESIGNER",
      sectorId: sectorDesigner.id,
      isActive: true,
    },
  });

  const operatorSac = await prisma.user.create({
    data: {
      name: `Operador SAC ${timestamp}`,
      email: `sac.${timestamp}@labella.com`,
      passwordHash,
      role: "OPERADOR",
      sectorId: sectorSac.id,
      isActive: true,
    },
  });

  const tokenSeller1 = generateToken({ userId: seller1.id, email: seller1.email, role: seller1.role });
  const tokenSeller2 = generateToken({ userId: seller2.id, email: seller2.email, role: seller2.role });
  const tokenDesigner = generateToken({ userId: designer.id, email: designer.email, role: designer.role });
  const tokenSac = generateToken({ userId: operatorSac.id, email: operatorSac.email, role: operatorSac.role });

  // 3. Criar arquivos físicos de arte no diretório de artwork para testar downloads reais
  const artworkDir = getArtworkDir();
  if (!fs.existsSync(artworkDir)) fs.mkdirSync(artworkDir, { recursive: true });

  const artFile1 = `arte-v1-${timestamp}.png`;
  const artFile2 = `arte-v2-${timestamp}.png`;
  fs.writeFileSync(path.join(artworkDir, artFile1), Buffer.from("MOCKUP_V1_CONTENT"));
  fs.writeFileSync(path.join(artworkDir, artFile2), Buffer.from("MOCKUP_V2_CONTENT_REVISED"));

  // 4. Criação da Pré-Venda pelo Vendedor 1
  let quotationId = "";
  await t.test("Vendedor 1 cria a pré-venda e envia para solicitação de arte", async () => {
    const resCreate = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSeller1}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: `Atlética Teste ${timestamp}`,
          contactName: "Capitão Silva",
          phone: "11999990000",
        },
        teamName: "Falcões Dourados",
        productModel: "CAMISA_FUTEBOL_ELITE",
        fabricType: "Dry Fit Tradicional",
        collarType: "Gola V",
        totalQuantity: 20,
        budgetAmount: 1100.0,
        desiredDeadline: new Date(Date.now() + 10 * 86400000).toISOString(),
        briefingText: "Camisa azul royal com detalhes dourados no ombro.",
      }),
    });

    assert.equal(resCreate.status, 201);
    const data = await resCreate.json();
    quotationId = data.id;
    assert.ok(quotationId);

    // Mover para SOLICITACAO_ARTE
    const resMove = await fetch(`${baseUrl}/api/quotations/${quotationId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSeller1}`,
      },
      body: JSON.stringify({ status: "SOLICITACAO_ARTE" }),
    });
    assert.equal(resMove.status, 200);
  });

  // 5. Designer assume o desenvolvimento e anexa a Versão 1
  await t.test("Designer assume e entrega a Versão 1 da arte", async () => {
    // Claim
    const resClaim = await fetch(`${baseUrl}/api/design/${quotationId}/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenDesigner}` },
    });
    assert.equal(resClaim.status, 200);

    // Anexar versão 1
    const resV1 = await fetch(`${baseUrl}/api/design/${quotationId}/versions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenDesigner}`,
      },
      body: JSON.stringify({
        previewUrl: `/api/files/artwork/${artFile1}`,
        changeNotes: "Primeira versão do layout enviada para aprovação do cliente.",
      }),
    });

    assert.equal(resV1.status, 201);
    const dataV1 = await resV1.json();
    assert.equal(dataV1.versionNumber, 1);
    assert.equal(dataV1.status, "SUBMITTED");

    // Verificar se o status da cotação agora é AGUARDANDO_APROVACAO_ARTE
    const resCheck = await fetch(`${baseUrl}/api/quotations/${quotationId}`, {
      headers: { Authorization: `Bearer ${tokenSeller1}` },
    });
    const checkData = await resCheck.json();
    assert.equal(checkData.status, "AGUARDANDO_APROVACAO_ARTE");
    assert.equal(checkData.designerId, designer.id);
    assert.equal(checkData.designBrief?.versions?.length, 1);
  });

  // 6. Teste de isolamento de download e decisão entre vendedores
  await t.test("Vendedor responsável consegue baixar v1; Outro vendedor recebe 403", async () => {
    // Vendedor 1 baixa v1 -> 200
    const resDlOwner = await fetch(`${baseUrl}/api/files/artwork/${artFile1}?token=${encodeURIComponent(tokenSeller1)}`);
    assert.equal(resDlOwner.status, 200);
    const textOwner = await resDlOwner.text();
    assert.equal(textOwner, "MOCKUP_V1_CONTENT");

    // Vendedor 2 tenta baixar v1 -> 403 Forbidden
    const resDlOther = await fetch(`${baseUrl}/api/files/artwork/${artFile1}?token=${encodeURIComponent(tokenSeller2)}`);
    assert.equal(resDlOther.status, 403);

    // Vendedor 2 tenta decidir sobre a arte de Vendedor 1 -> 403 Forbidden
    const resDecideOther = await fetch(`${baseUrl}/api/quotations/${quotationId}/client-approval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSeller2}`,
      },
      body: JSON.stringify({
        decision: "APPROVED",
        approvedByPerson: "Impostor",
        feedbackNotes: "Tentativa não autorizada",
      }),
    });
    assert.equal(resDecideOther.status, 403);
  });

  // 7. Vendedor responsável solicita "Alteração de arte"
  await t.test("Vendedor responsável registra solicitação de alteração e ficha retorna ao mesmo designer", async () => {
    const resRev = await fetch(`${baseUrl}/api/quotations/${quotationId}/client-approval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSeller1}`,
      },
      body: JSON.stringify({
        decision: "REVISION_REQUESTED",
        feedbackNotes: "Cliente pediu para clarear o azul royal e incluir o patrocinador na manga esquerda.",
      }),
    });

    assert.equal(resRev.status, 200);
    const revData = await resRev.json();
    assert.equal(revData.quotation.status, "ARTE_EM_ALTERACAO");
    assert.equal(revData.quotation.isArtworkApproved, false);
    assert.equal(revData.quotation.designerId, designer.id); // Mantém o mesmo designer

    // Verificar na fila do designer
    const resQueue = await fetch(`${baseUrl}/api/design/queue`, {
      headers: { Authorization: `Bearer ${tokenDesigner}` },
    });
    const queueData = await resQueue.json();
    const itemInQueue = queueData.find((q: any) => q.id === quotationId);
    assert.ok(itemInQueue, "Ficha deve estar na fila do designer");
    assert.equal(itemInQueue.status, "ARTE_EM_ALTERACAO");
    assert.equal(itemInQueue.artworkApprovalNotes, "Cliente pediu para clarear o azul royal e incluir o patrocinador na manga esquerda.");
  });

  // 8. Bloqueio de encaminhamento antes da aprovação da nova versão
  await t.test("Impedir encaminhamento para OP ou Orçamento Aprovado enquanto arte estiver em alteração", async () => {
    // Tentar converter em OP
    const resConvertFail = await fetch(`${baseUrl}/api/quotations/${quotationId}/convert-to-op`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSeller1}`,
      },
      body: JSON.stringify({
        promisedDeliveryDate: new Date(Date.now() + 15 * 86400000).toISOString(),
      }),
    });
    assert.equal(resConvertFail.status, 400);

    // Tentar avançar status diretamente
    const resStatusFail = await fetch(`${baseUrl}/api/quotations/${quotationId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSeller1}`,
      },
      body: JSON.stringify({ status: "ORCAMENTO_APROVADO" }),
    });
    assert.equal(resStatusFail.status, 400);
  });

  // 9. Designer envia Versão 2
  await t.test("Designer envia Versão 2 e status retorna para AGUARDANDO_APROVACAO_ARTE", async () => {
    const resV2 = await fetch(`${baseUrl}/api/design/${quotationId}/versions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenDesigner}`,
      },
      body: JSON.stringify({
        previewUrl: `/api/files/artwork/${artFile2}`,
        changeNotes: "Versão 2: Azul clareado e logotipo do patrocinador adicionado na manga.",
      }),
    });

    assert.equal(resV2.status, 201);
    const dataV2 = await resV2.json();
    assert.equal(dataV2.versionNumber, 2);
    assert.equal(dataV2.status, "SUBMITTED");

    // Verificar histórico de versões
    const resCheck = await fetch(`${baseUrl}/api/quotations/${quotationId}`, {
      headers: { Authorization: `Bearer ${tokenSeller1}` },
    });
    const checkData = await resCheck.json();
    assert.equal(checkData.status, "AGUARDANDO_APROVACAO_ARTE");
    assert.equal(checkData.designBrief?.versions?.length, 2);
    assert.equal(checkData.designBrief.versions[0].versionNumber, 2);
    assert.equal(checkData.designBrief.versions[1].versionNumber, 1);
    assert.equal(checkData.designBrief.versions[1].status, "REVISION_REQUESTED");
  });

  // 10. Vendedor responsável aprova Versão 2 e encaminha para o próximo setor (SAC Interno / OP)
  await t.test("Vendedor responsável aprova Versão 2 e converte em OP para SAC Interno", async () => {
    // 10.1 Aprovação da versão 2
    const resApprove = await fetch(`${baseUrl}/api/quotations/${quotationId}/client-approval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSeller1}`,
      },
      body: JSON.stringify({
        decision: "APPROVED",
        approvedByPerson: "Capitão Silva",
        feedbackNotes: "Arte v2 aprovada pelo cliente sem ressalvas.",
      }),
    });

    assert.equal(resApprove.status, 200);
    const approveData = await resApprove.json();
    assert.equal(approveData.quotation.status, "ORCAMENTO_APROVADO");
    assert.equal(approveData.quotation.isArtworkApproved, true);
    assert.equal(approveData.quotation.artworkApprovedBy, "Capitão Silva");

    // 10.2 Conversão em OP e encaminhamento ao próximo setor (SAC_INTERNO)
    const resConvert = await fetch(`${baseUrl}/api/quotations/${quotationId}/convert-to-op`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSeller1}`,
      },
      body: JSON.stringify({
        promisedDeliveryDate: new Date(Date.now() + 15 * 86400000).toISOString(),
        technicalNotes: "Cuidar sublimação do azul royal para manter a tonalidade da v2.",
      }),
    });

    assert.equal(resConvert.status, 201);
    const convertData = await resConvert.json();
    assert.ok(convertData.productionOrder);
    assert.equal(convertData.productionOrder.artworkUrl, `/api/files/artwork/${artFile2}`);

    // 10.3 Próximo setor (SAC Interno) consegue acessar e baixar a Versão 2 aprovada
    const resDlSac = await fetch(`${baseUrl}/api/files/artwork/${artFile2}?token=${encodeURIComponent(tokenSac)}`);
    assert.equal(resDlSac.status, 200);
    const sacContent = await resDlSac.text();
    assert.equal(sacContent, "MOCKUP_V2_CONTENT_REVISED");

    // Vendedor 2 continua sem acesso ao arquivo
    const resDlOtherStillBlocked = await fetch(`${baseUrl}/api/files/artwork/${artFile2}?token=${encodeURIComponent(tokenSeller2)}`);
    assert.equal(resDlOtherStillBlocked.status, 403);

    // Tentativa repetida de conversão é bloqueada com 409 Conflict (garante OP única)
    const resDuplicateConvert = await fetch(`${baseUrl}/api/quotations/${quotationId}/convert-to-op`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSeller1}`,
      },
      body: JSON.stringify({
        promisedDeliveryDate: new Date(Date.now() + 15 * 86400000).toISOString(),
      }),
    });
    assert.equal(resDuplicateConvert.status, 409, "Segunda tentativa de conversão deve retornar 409");
  });

  // Caminho alternativo: Cliente aprova a Versão 1 de primeira
  await t.test("Caminho direto: Cliente aprova a v1 de primeira, vendedor revisa e converte em OP", async () => {
    const resCreateDirect = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSeller1}`,
      },
      body: JSON.stringify({
        customer: {
          companyName: `Atlética Direta ${timestamp}`,
          contactName: "Cliente Direto",
          phone: "11988880000",
        },
        teamName: "Time Aprovação Direta v1",
        productModel: "CAMISA_FUTEBOL_ELITE",
        fabricType: "Dry Fit Tradicional",
        collarType: "Gola Careca",
        totalQuantity: 20,
        budgetAmount: 800,
        desiredDeadline: new Date(Date.now() + 10 * 86400000).toISOString(),
        briefingText: "Layout direto v1",
      }),
    });

    assert.equal(resCreateDirect.status, 201);
    const directQuotation = await resCreateDirect.json();

    // Mover para SOLICITACAO_ARTE
    await fetch(`${baseUrl}/api/quotations/${directQuotation.id}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSeller1}`,
      },
      body: JSON.stringify({ status: "SOLICITACAO_ARTE" }),
    });

    const directArtFile = `arte-direct-v1-${timestamp}.png`;
    fs.writeFileSync(path.join(artworkDir, directArtFile), Buffer.from("MOCKUP_DIRECT_V1"));

    // Designer assume e anexa Versão 1
    await fetch(`${baseUrl}/api/design/${directQuotation.id}/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenDesigner}` },
    });

    await fetch(`${baseUrl}/api/design/${directQuotation.id}/versions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenDesigner}`,
      },
      body: JSON.stringify({
        previewUrl: `/api/files/artwork/${directArtFile}`,
        changeNotes: "Versão 1 aprovada de primeira pelo cliente",
      }),
    });

    // Vendedor 1 aprova diretamente a v1
    const resApproveDirect = await fetch(`${baseUrl}/api/quotations/${directQuotation.id}/client-approval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSeller1}`,
      },
      body: JSON.stringify({
        decision: "APPROVED",
        approvedByPerson: "Cliente Direto",
        feedbackNotes: "Aprovado de primeira sem alterações.",
      }),
    });

    assert.equal(resApproveDirect.status, 200);

    // Vendedor 1 revisa e converte diretamente em OP
    const resConvertDirect = await fetch(`${baseUrl}/api/quotations/${directQuotation.id}/convert-to-op`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSeller1}`,
      },
      body: JSON.stringify({
        promisedDeliveryDate: new Date(Date.now() + 10 * 86400000).toISOString(),
        technicalNotes: "Produzir com arte v1 oficial aprovada de primeira.",
      }),
    });

    assert.equal(resConvertDirect.status, 201);
    const convertDirectData = await resConvertDirect.json();
    assert.equal(convertDirectData.productionOrder.artworkUrl, `/api/files/artwork/${directArtFile}`);

    // SAC Interno acessa a v1 aprovada
    const resDlSacDirect = await fetch(`${baseUrl}/api/files/artwork/${directArtFile}?token=${encodeURIComponent(tokenSac)}`);
    assert.equal(resDlSacDirect.status, 200);
    const sacContentDirect = await resDlSacDirect.text();
    assert.equal(sacContentDirect, "MOCKUP_DIRECT_V1");
  });
});
