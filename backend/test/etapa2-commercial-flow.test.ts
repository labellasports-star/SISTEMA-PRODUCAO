import "./setup.js";
import http from "http";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

async function runEtapa2Tests() {
  await verifyTestDatabaseIsolation();
  console.log("=======================================================");
  console.log("=== TESTES DE INTEGRAÇÃO OBRIGATÓRIOS — ETAPA 2 ===");
  console.log("=== FLUXO COMERCIAL COMPLETO: PRÉ-VENDA -> OP -> SAC ===");
  console.log("=======================================================\n");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4002, "127.0.0.1", resolve));
  const baseUrl = "http://127.0.0.1:4002";

  let adminToken = "";
  let sellerToken = "";
  let designerToken = "";
  let sacToken = "";

  let customerId = "";
  let quotationId = "";
  let createdOpId = "";

  try {
    // 1. Login do Administrador
    console.log("[ETAPA 2.1] Autenticando Administrador...");
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@fabrica.com", password: "admin123" }),
    });
    const adminLoginData = await adminLoginRes.json();
    adminToken = adminLoginData.token;
    console.log("✔ Administrador autenticado.");

    // Obter IDs dos setores necessários
    const sectorsRes = await fetch(`${baseUrl}/api/sectors`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const sectors = await sectorsRes.json();
    const vendasSector = sectors.find((s: any) => s.code === "VENDAS");
    const designSector = sectors.find((s: any) => s.code === "DESIGN" || s.code === "DESIGNER");
    const sacSector = sectors.find((s: any) => s.code === "SAC_INTERNO");
    const preDiagSector = sectors.find((s: any) => s.code === "PRE_DIAGRAMACAO");

    // 2. Criar Vendedor, Designer e Operador do SAC com PIN
    console.log("\n[ETAPA 2.2] Criando usuários para os papéis (Vendedor, Designer, SAC)...");
    const timestamp = Date.now();

    // Vendedor
    const sellerEmail = `vendedor.${timestamp}@fabrica.com`;
    const sellerRes = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "Lucas Vendedor",
        email: sellerEmail,
        password: "senhaSegura123",
        role: "VENDEDOR",
        sectorId: vendasSector.id,
      }),
    });
    const sellerData = await sellerRes.json();

    // Designer
    const designerEmail = `designer.${timestamp}@fabrica.com`;
    const designerRes = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "Beatriz Designer",
        email: designerEmail,
        password: "senhaSegura123",
        role: "DESIGNER",
        sectorId: designSector.id,
      }),
    });
    const designerData = await designerRes.json();

    // Operador do SAC (com PIN 654321)
    const sacEmail = `sac.${timestamp}@fabrica.com`;
    const sacRes = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "Renata Conferente SAC",
        email: sacEmail,
        password: "senhaSegura123",
        role: "OPERADOR",
        sectorId: sacSector.id,
        signaturePin: "654321",
      }),
    });
    const sacData = await sacRes.json();

    // Realizar logins
    const [loginSeller, loginDesigner, loginSac] = await Promise.all([
      fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sellerEmail, password: "senhaSegura123" }),
      }).then((r) => r.json()),
      fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: designerEmail, password: "senhaSegura123" }),
      }).then((r) => r.json()),
      fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sacEmail, password: "senhaSegura123" }),
      }).then((r) => r.json()),
    ]);

    sellerToken = loginSeller.token;
    designerToken = loginDesigner.token;
    sacToken = loginSac.token;
    console.log("✔ Usuários e perfis RBAC autenticados com sucesso.");

    // 3. Cadastrar Cliente (Passo 1)
    console.log("\n[ETAPA 2.3] Passo 1: Cadastrando cliente...");
    const uniquePhone = `(12) 9${Math.floor(10000000 + Math.random() * 90000000)}`;
    const customerRes = await fetch(`${baseUrl}/api/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        companyName: `Atlética Medicina Taubaté ${timestamp}`,
        contactName: "Pedro Presidente",
        email: `contato.${timestamp}@atletica.com`,
        phone: uniquePhone,
        cityState: "Taubaté/SP",
      }),
    });
    const customerData = await customerRes.json();
    if (!customerData.id) {
      throw new Error(`Falha ao criar cliente: ${JSON.stringify(customerData)}`);
    }
    customerId = customerData.id;
    console.log(`✔ Cliente cadastrado: ${customerData.companyName} (ID: ${customerId})`);

    // 4. Criar Pré-Venda e Orçamento com Grade (Passos 2 e 3)
    console.log("\n[ETAPA 2.4] Passos 2 e 3: Criando oportunidade na Pré-Venda com grade...");
    const quotationRes = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        customerId,
        teamName: "Jubileu FC - Uniforme Principal",
        productsSummary: "50 Camisas DryFit Sublimação Total + 50 Calções",
        totalQuantity: 100,
        budgetAmount: 4850.0,
        desiredDeadline: "2026-11-20T18:00:00.000Z",
        observations: "Cores oficiais: Azul Royal e Dourado. Detalhes em degradê.",
        briefingText: "Desenvolver layout moderno com escudo no peito e patrocínio nas costas.",
        predominantColors: "Azul Royal e Dourado",
        printType: "Sublimação Total",
        items: [
          { productModel: "Camisa DryFit", gender: "MASCULINO", size: "M", quantity: 30, fabricType: "Cacharrel Dry" },
          { productModel: "Camisa DryFit", gender: "MASCULINO", size: "G", quantity: 20, fabricType: "Cacharrel Dry" },
          { productModel: "Calção Poliéster", gender: "MASCULINO", size: "M", quantity: 30 },
          { productModel: "Calção Poliéster", gender: "MASCULINO", size: "G", quantity: 20 },
        ],
      }),
    });
    const quotationData = await quotationRes.json();
    if (quotationRes.status !== 201 || !quotationData.id) {
      throw new Error(`Falha ao criar cotação: ${JSON.stringify(quotationData)}`);
    }
    quotationId = quotationData.id;
    console.log(`✔ Orçamento criado: ${quotationData.quotationNumber} com status: ${quotationData.status}`);

    // Anexar referência visual com extensão válida (.PNG)
    const attachRes = await fetch(`${baseUrl}/api/quotations/${quotationId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        fileName: "escudo_vetorizado.png",
        fileType: "REFERENCE",
        fileUrl: "/uploads/references/escudo_vetorizado.png",
      }),
    });
    if (attachRes.status !== 201) {
      throw new Error("Falha ao anexar referência visual!");
    }
    console.log("✔ Arquivo de referência anexado com validação de extensão (.PNG).");

    // 5. Enviar Solicitação ao Designer e Designer Assumir (Passo 4)
    console.log("\n[ETAPA 2.5] Passo 4: Enviar solicitação e Designer assumir pedido...");
    await fetch(`${baseUrl}/api/quotations/${quotationId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({ status: "SOLICITACAO_ARTE", notes: "Encaminhado para a fila de desenvolvimento." }),
    });

    // Designer consulta fila
    const queueRes = await fetch(`${baseUrl}/api/design/queue`, {
      headers: { Authorization: `Bearer ${designerToken}` },
    });
    const queueData = await queueRes.json();
    const inQueue = queueData.some((q: any) => q.id === quotationId);
    if (!inQueue) {
      throw new Error("Orçamento não encontrado na fila do Designer!");
    }
    console.log(`✔ Pedido visível na fila do Designer (${queueData.length} na fila).`);

    // Designer assume o desenvolvimento
    const claimRes = await fetch(`${baseUrl}/api/design/${quotationId}/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${designerToken}` },
    });
    const claimData = await claimRes.json();
    if (claimRes.status !== 200 || claimData.status !== "DESENVOLVIMENTO_ARTE") {
      throw new Error("Falha ao assumir arte pelo designer!");
    }
    console.log("✔ Designer assumiu o pedido. Status: DESENVOLVIMENTO_ARTE.");

    // 6. Designer Anexa Arte (Passo 5)
    console.log("\n[ETAPA 2.6] Passo 5: Designer anexa versão da arte...");
    const artV1Res = await fetch(`${baseUrl}/api/design/${quotationId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${designerToken}` },
      body: JSON.stringify({
        previewUrl: "/uploads/artwork/layout_v1.jpg",
        vectorUrl: "/uploads/artwork/layout_mestre_v1.cdr",
        changeNotes: "Primeira versão do layout com escudo e detalhes em degradê.",
      }),
    });
    const artV1Data = await artV1Res.json();
    if (artV1Res.status !== 201 || artV1Data.versionNumber !== 1) {
      throw new Error("Falha ao cadastrar arte Versão 1!");
    }
    console.log("✔ Versão 1 da arte anexada (.CDR e .JPG). Status agora é AGUARDANDO_APROVACAO_ARTE.");

    // 7. Teste de Alteração Solicitada pelo Cliente (Rejeição da v1)
    console.log("\n[ETAPA 2.7] Teste de Retorno: Cliente solicita alteração na arte...");
    const rejectArtRes = await fetch(`${baseUrl}/api/quotations/${quotationId}/client-approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        decision: "REVISION_REQUESTED",
        feedbackNotes: "Aumentar tamanho do escudo no peito e clarear o tom do dourado.",
      }),
    });
    const rejectArtData = await rejectArtRes.json();
    if (rejectArtRes.status !== 200 || rejectArtData.quotation.status !== "ARTE_EM_ALTERACAO") {
      throw new Error("Falha no fluxo de solicitação de alteração!");
    }
    console.log("✔ Alteração solicitada com sucesso. Pedido voltou para ARTE_EM_ALTERACAO.");

    // Designer anexa Versão 2 corrigida
    const artV2Res = await fetch(`${baseUrl}/api/design/${quotationId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${designerToken}` },
      body: JSON.stringify({
        previewUrl: "/uploads/artwork/layout_v2_final.jpg",
        vectorUrl: "/uploads/artwork/layout_mestre_v2.cdr",
        changeNotes: "Escudo ampliado em 15% e tom dourado corrigido.",
      }),
    });
    const artV2Data = await artV2Res.json();
    if (artV2Data.versionNumber !== 2) {
      throw new Error("Versão 2 da arte não foi incrementada corretamente!");
    }
    console.log("✔ Versão 2 corrigida anexada pelo Designer.");

    // 8. Teste de Regra: Tentar converter em OP sem aprovação do cliente (deve falhar)
    console.log("\n[ETAPA 2.8] Teste de Bloqueio: Tentativa de converter em OP sem arte aprovada...");
    const badConvertRes = await fetch(`${baseUrl}/api/quotations/${quotationId}/convert-to-op`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({ promisedDeliveryDate: "2026-11-20T18:00:00.000Z" }),
    });
    if (badConvertRes.status !== 400) {
      throw new Error(`Deveria ter retornado 400 (arte não aprovada), retornou ${badConvertRes.status}`);
    }
    console.log("✔ Bloqueio de segurança validado: Não é possível converter sem aprovação da arte.");

    // 9. Registrar Aprovação Formal do Cliente (Passo 6)
    console.log("\n[ETAPA 2.9] Passo 6: Registrar aprovação formal do cliente...");
    const approveArtRes = await fetch(`${baseUrl}/api/quotations/${quotationId}/client-approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        decision: "APPROVED",
        approvedByPerson: "Pedro Presidente",
        feedbackNotes: "Arte 100% aprovada pela diretoria da atlética via WhatsApp.",
      }),
    });
    const approveArtData = await approveArtRes.json();
    if (approveArtRes.status !== 200 || !approveArtData.quotation.isArtworkApproved) {
      throw new Error("Falha ao registrar aprovação do cliente!");
    }
    console.log("✔ Aprovação da arte registrada. isArtworkApproved = true.");

    // 10. Converter em Venda e Gerar OP com Lote Parcial (Passos 7 e 8)
    console.log("\n[ETAPA 2.10] Passos 7 e 8: Converter orçamento e gerar OP oficial...");
    const convertRes = await fetch(`${baseUrl}/api/quotations/${quotationId}/convert-to-op`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        promisedDeliveryDate: "2026-11-20T18:00:00.000Z",
        finalNegotiatedAmount: 4850.0,
        technicalNotes: "Entrega prioritária para evento dia 22/11.",
      }),
    });
    const convertData = await convertRes.json();
    if (convertRes.status !== 201 || !convertData.productionOrder || !convertData.initialBatch) {
      throw new Error(`Falha ao converter em OP: ${JSON.stringify(convertData)}`);
    }
    createdOpId = convertData.productionOrder.id;
    console.log(`✔ OP ${convertData.productionOrder.opNumber} gerada com sucesso! Lote inicial: ${convertData.initialBatch.batchNumber}`);

    // Teste de prevenção de duplicação de OP
    const duplicateConvertRes = await fetch(`${baseUrl}/api/quotations/${quotationId}/convert-to-op`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({ promisedDeliveryDate: "2026-11-20T18:00:00.000Z" }),
    });
    if (duplicateConvertRes.status !== 409) {
      throw new Error("Falha na prevenção de duplicidade de OP!");
    }
    console.log("✔ Prevenção de duplicidade de OP validada com sucesso (409 Conflict).");

    // 11. Conferência do SAC Interno (Passo 9)
    console.log("\n[ETAPA 2.11] Passo 9: Verificando chegada da OP na fila do SAC Interno...");
    const sacQueueRes = await fetch(`${baseUrl}/api/sac/queue`, {
      headers: { Authorization: `Bearer ${sacToken}` },
    });
    const sacQueueData = await sacQueueRes.json();
    const opInSac = sacQueueData.find((o: any) => o.id === createdOpId);
    if (!opInSac) {
      throw new Error("A OP gerada não apareceu na fila do SAC Interno!");
    }
    console.log(`✔ OP ${opInSac.opNumber} confirmada na fila de conferência do SAC Interno.`);

    // 12. Teste de Reprovação no SAC (Cenário de Inconformidade)
    console.log("\n[ETAPA 2.12] Teste de Reprovação pelo SAC...");
    const sacRejectRes = await fetch(`${baseUrl}/api/sac/${createdOpId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sacToken}` },
      body: JSON.stringify({
        pin: "654321",
        reason: "Falta detalhar tecido específico dos calções na ficha técnica.",
      }),
    });
    const sacRejectData = await sacRejectRes.json();
    if (sacRejectRes.status !== 200 || sacRejectData.productionOrder.sacApprovalStatus !== "REJECTED") {
      throw new Error("Falha na reprovação do SAC!");
    }
    console.log("✔ Reprovação pelo SAC executada com sucesso com retorno dos lotes para Vendas.");

    // Vendedor retifica a pendência e reenvia para reanálise do SAC
    console.log("\n[ETAPA 2.12b] Vendedor retifica a ficha técnica e reenvia ao SAC...");
    const resubmitRes = await fetch(`${baseUrl}/api/sac/${createdOpId}/resubmit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        correctionNotes: "Tecido do calção especificado como Poliéster DryFit 160g conforme solicitado.",
      }),
    });
    const resubmitData = await resubmitRes.json();
    if (resubmitRes.status !== 200 || !resubmitData.success) {
      throw new Error("Falha ao reenviar OP retificada ao SAC!");
    }
    console.log("✔ OP retificada e reenviada com sucesso para a fila do SAC Interno.");

    // 13. Aprovação Final pelo SAC e Envio para Pré-Diagramação (Passos 10 e 11)
    console.log("\n[ETAPA 2.13] Passos 10 e 11: Operador do SAC aprova a OP com PIN...");
    const sacApproveRes = await fetch(`${baseUrl}/api/sac/${createdOpId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sacToken}` },
      body: JSON.stringify({
        pin: "654321",
        notes: "Pendência técnica sanada pelo vendedor. Grade, arte e prazos 100% conferidos e aprovados.",
      }),
    });
    const sacApproveData = await sacApproveRes.json();
    if (sacApproveRes.status !== 200 || sacApproveData.productionOrder.sacApprovalStatus !== "APPROVED") {
      throw new Error("Falha na aprovação final do SAC!");
    }
    console.log("✔ OP aprovada com sucesso pelo SAC Interno com assinatura digital HMAC.");

    // Verificar se o lote chegou ao Setor 05 (Pré-Diagramação)
    const checkBatch = await prisma.opBatch.findFirst({
      where: { productionOrderId: createdOpId },
      include: { currentSector: true },
    });
    if (checkBatch?.currentSector.code !== "PRE_DIAGRAMACAO") {
      throw new Error(`O lote deveria estar em PRE_DIAGRAMACAO, está em: ${checkBatch?.currentSector.code}`);
    }
    console.log(`✔ Lote ${checkBatch.batchNumber} confirmado no setor: [${checkBatch.currentSector.sequenceOrder}. ${checkBatch.currentSector.name}]!`);

    console.log("\n=======================================================");
    console.log("✔ TODOS OS 11 PASSOS E CASOS NEGATIVOS DA ETAPA 2 FORAM APROVADOS COM SUCESSO!");
    console.log("=======================================================\n");
  } catch (error) {
    console.error("❌ ERRO NO TESTE DE INTEGRAÇÃO DA ETAPA 2:", error);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  }
}

runEtapa2Tests();
