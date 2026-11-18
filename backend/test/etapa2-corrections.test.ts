import "./setup.js";
import http from "http";
import { io as ioClient, Socket } from "socket.io-client";
import { app, server } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

async function runCorrectionsTests() {
  await verifyTestDatabaseIsolation();
  console.log("===============================================================");
  console.log("=== TESTES DE HOMOLOGAÇÃO DAS CORREÇÕES — ETAPA 2 ===");
  console.log("=== RBAC, MÁQUINA DE ESTADOS, SOCKET.IO, UPLOAD, LOTES ===");
  console.log("===============================================================\n");

  let actualPort = 4004;
  if (!server.listening) {
    await new Promise<void>((resolve) => server.listen(actualPort, "127.0.0.1", resolve));
  } else {
    const addr = server.address();
    if (typeof addr === "object" && addr) {
      actualPort = addr.port;
    }
  }
  const baseUrl = `http://127.0.0.1:${actualPort}`;

  let adminToken = "";
  let sellerToken = "";
  let designerToken = "";
  let operatorToken = "";

  let testQuotationId = "";
  let testOpId = "";
  let uploadedFileName = "";

  let passedTests = 0;
  const totalTests = 15;

  try {
    // -------------------------------------------------------------------------
    // SETUP: Autenticação e Usuários
    // -------------------------------------------------------------------------
    console.log("[SETUP] Autenticando Administrador e obtendo setores...");
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@fabrica.com", password: "admin123" }),
    });
    const adminData = await adminLoginRes.json();
    adminToken = adminData.token;

    const sectorsRes = await fetch(`${baseUrl}/api/sectors`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const sectors = await sectorsRes.json();
    const vendasSector = sectors.find((s: any) => s.code === "VENDAS");
    const designSector = sectors.find((s: any) => s.code === "DESIGN" || s.code === "DESIGNER");
    const sacSector = sectors.find((s: any) => s.code === "SAC_INTERNO");

    const ts = Date.now();

    // Vendedor
    const sellerRes = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "Vendedor Teste",
        email: `seller.${ts}@fabrica.com`,
        password: "senha123",
        role: "VENDEDOR",
        sectorId: vendasSector.id,
      }),
    });
    const sellerUser = await sellerRes.json();
    const sellerLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `seller.${ts}@fabrica.com`, password: "senha123" }),
    });
    sellerToken = (await sellerLogin.json()).token;

    // Designer
    const designerRes = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "Designer Teste",
        email: `designer.${ts}@fabrica.com`,
        password: "senha123",
        role: "DESIGNER",
        sectorId: designSector.id,
      }),
    });
    const designerUser = await designerRes.json();
    const designerLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `designer.${ts}@fabrica.com`, password: "senha123" }),
    });
    designerToken = (await designerLogin.json()).token;

    // Operador
    const operatorRes = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "Operador Teste",
        email: `operator.${ts}@fabrica.com`,
        password: "senha123",
        role: "OPERADOR",
        sectorId: sacSector.id,
        signaturePin: "1234",
      }),
    });
    const operatorLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `operator.${ts}@fabrica.com`, password: "senha123" }),
    });
    operatorToken = (await operatorLogin.json()).token;

    // Cliente e Orçamento Base para Testes
    const customerRes = await fetch(`${baseUrl}/api/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        companyName: `Atlética Universitária ${ts}`,
        contactName: "Mariana Teste",
        phone: `1199999${String(ts).slice(-4)}`,
      }),
    });
    const customer = await customerRes.json();

    const quotRes = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        customerId: customer.id,
        teamName: "Time Canários",
        totalQuantity: 100,
        budgetAmount: 4500,
        items: [
          { productModel: "Camisa DryFit", size: "M", quantity: 60 },
          { productModel: "Camisa DryFit", size: "G", quantity: 40 },
        ],
      }),
    });
    const quotData = await quotRes.json();
    testQuotationId = quotData.id;
    console.log(`✔ Ambiente preparado. Orçamento ${quotData.quotationNumber} criado.\n`);

    // -------------------------------------------------------------------------
    // TEST 1: Designer proibido de alterar status comercial (403 Forbidden)
    // -------------------------------------------------------------------------
    console.log("[TEST 1/15] Verificando proibição RBAC: Designer não pode alterar status do orçamento...");
    const t1Res = await fetch(`${baseUrl}/api/quotations/${testQuotationId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${designerToken}` },
      body: JSON.stringify({ status: "ORCAMENTO_PREPARACAO" }),
    });
    if (t1Res.status === 403) {
      console.log("✔ [TEST 1 APROVADO] Designer recebeu 403 Forbidden.");
      passedTests++;
    } else {
      throw new Error(`[TEST 1 FALHOU] Esperado 403, recebido ${t1Res.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Operador proibido de alterar status comercial (403 Forbidden)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2/15] Verificando proibição RBAC: Operador não pode alterar status do orçamento...");
    const t2Res = await fetch(`${baseUrl}/api/quotations/${testQuotationId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${operatorToken}` },
      body: JSON.stringify({ status: "ORCAMENTO_PREPARACAO" }),
    });
    if (t2Res.status === 403) {
      console.log("✔ [TEST 2 APROVADO] Operador recebeu 403 Forbidden.");
      passedTests++;
    } else {
      throw new Error(`[TEST 2 FALHOU] Esperado 403, recebido ${t2Res.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: Vendedor autorizado a fazer transição válida de status
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3/15] Vendedor executando transição válida (NOVA_SOLICITACAO -> ORCAMENTO_PREPARACAO)...");
    const t3Res = await fetch(`${baseUrl}/api/quotations/${testQuotationId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({ status: "ORCAMENTO_PREPARACAO" }),
    });
    const t3Data = await t3Res.json();
    if (t3Res.status === 200 && t3Data.status === "ORCAMENTO_PREPARACAO") {
      console.log("✔ [TEST 3 APROVADO] Transição válida autorizada e aplicada com sucesso.");
      passedTests++;
    } else {
      throw new Error(`[TEST 3 FALHOU] Esperado 200, recebido ${t3Res.status}: ${JSON.stringify(t3Data)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Transição inválida bloqueada pela Máquina de Estados (400 Bad Request)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4/15] Tentativa de salto inválido na Máquina de Estados (ORCAMENTO_PREPARACAO -> CONVERTIDA_VENDA)...");
    const t4Res = await fetch(`${baseUrl}/api/quotations/${testQuotationId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({ status: "CONVERTIDA_VENDA" }),
    });
    const t4Data = await t4Res.json();
    if (t4Res.status === 400 && (t4Data.error?.includes("Transição de status") || t4Data.error?.includes("inválida"))) {
      console.log(`✔ [TEST 4 APROVADO] Máquina de estados bloqueou transição inválida: "${t4Data.error}"`);
      passedTests++;
    } else {
      throw new Error(`[TEST 4 FALHOU] Esperado 400 com erro de transição, recebido ${t4Res.status}: ${JSON.stringify(t4Data)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Conexão real Socket.io recebe evento em tempo real
    // -------------------------------------------------------------------------
    console.log("\n[TEST 5/15] Conectando cliente Socket.io e aguardando evento 'quotation_status_changed'...");
    const socket: Socket = ioClient(baseUrl, {
      transports: ["websocket", "polling"],
      auth: { token: sellerToken },
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout ao conectar socket")), 3000);
      socket.on("connect", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    const eventReceivedPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout aguardando evento quotation_status_changed")), 4000);
      socket.on("quotation_status_changed", (data) => {
        if (data.id === testQuotationId) {
          clearTimeout(timeout);
          resolve(data);
        }
      });
    });

    // Disparar transição válida para gerar o evento (ORCAMENTO_PREPARACAO -> ORCAMENTO_ENVIADO)
    await fetch(`${baseUrl}/api/quotations/${testQuotationId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({ status: "ORCAMENTO_ENVIADO" }),
    });

    const receivedEvent = await eventReceivedPromise;
    if (receivedEvent && receivedEvent.toStatus === "ORCAMENTO_ENVIADO") {
      console.log(`✔ [TEST 5 APROVADO] Evento Socket.io recebido em tempo real: para status "${receivedEvent.toStatus}".`);
      passedTests++;
    } else {
      throw new Error("[TEST 5 FALHOU] Evento Socket.io recebido com dados incorretos.");
    }

    // -------------------------------------------------------------------------
    // TEST 6: Simulação de recarregamento automático da UI com Socket.io
    // -------------------------------------------------------------------------
    console.log("\n[TEST 6/15] Verificando gatilho de recarregamento da interface pelo listener...");
    let uiReloadCount = 0;
    const uiListener = () => {
      uiReloadCount++;
    };
    socket.on("quotation_status_changed", uiListener);

    // Próxima transição: ORCAMENTO_ENVIADO -> SOLICITACAO_ARTE
    await fetch(`${baseUrl}/api/quotations/${testQuotationId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({ status: "SOLICITACAO_ARTE" }),
    });

    await new Promise((r) => setTimeout(r, 600));
    socket.off("quotation_status_changed", uiListener);

    if (uiReloadCount > 0) {
      console.log(`✔ [TEST 6 APROVADO] Interface notificou ${uiReloadCount} recarregamento(s) de tela reativo(s).`);
      passedTests++;
    } else {
      throw new Error("[TEST 6 FALHOU] Nenhum recarregamento disparado pelo listener da UI.");
    }

    // -------------------------------------------------------------------------
    // TEST 7: Desconexão e reconexão controlada do Socket
    // -------------------------------------------------------------------------
    console.log("\n[TEST 7/15] Testando comportamento de desconexão e reconexão do Socket...");
    socket.disconnect();
    if (!socket.connected) {
      console.log("✔ Socket desconectado com sucesso.");
    }
    socket.connect();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout na reconexão do socket")), 3000);
      socket.on("connect", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    if (socket.connected) {
      console.log("✔ [TEST 7 APROVADO] Socket reconectado e pronto para receber novos eventos.");
      passedTests++;
    }
    socket.disconnect();

    // -------------------------------------------------------------------------
    // TEST 8: Upload multipart real com validação de magic bytes (PNG)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 8/15] Testando upload real multipart (PNG válido com magic bytes)...");
    // PNG válido mínimo: assinatura 89 50 4E 47 0D 0A 1A 0A
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82,
    ]);

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([validPngBuffer], { type: "image/png" }),
      "uniforme-referencia.png"
    );

    const uploadRes = await fetch(`${baseUrl}/api/files/upload?category=references`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: formData,
    });
    const uploadData = await uploadRes.json();

    if (uploadRes.status === 201 && uploadData.fileName) {
      uploadedFileName = uploadData.fileName;
      console.log(`✔ [TEST 8 APROVADO] Upload realizado com sucesso: ${uploadedFileName} (${uploadData.fileSize} bytes)`);
      passedTests++;
    } else {
      throw new Error(`[TEST 8 FALHOU] Esperado 201, recebido ${uploadRes.status}: ${JSON.stringify(uploadData)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 9: Rejeição de arquivo com spoofing de extensão (magic bytes falsos)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 9/15] Testando rejeição de spoofing (arquivo de texto renomeado para .png)...");
    const fakeBuffer = Buffer.from("ISTO_E_UM_TEXTO_COMUM_E_NAO_PNG");
    const fakeForm = new FormData();
    fakeForm.append("file", new Blob([fakeBuffer], { type: "image/png" }), "virus_disfarcado.png");

    const fakeRes = await fetch(`${baseUrl}/api/files/upload?category=references`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: fakeForm,
    });
    const fakeData = await fakeRes.json();

    if (fakeRes.status === 400 && fakeData.error?.includes("magic bytes")) {
      console.log(`✔ [TEST 9 APROVADO] Servidor detectou spoofing e rejeitou com 400: "${fakeData.error}"`);
      passedTests++;
    } else {
      throw new Error(`[TEST 9 FALHOU] Esperado 400 rejeitando spoofing, recebido ${fakeRes.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 10: Rejeição de arquivo com extensão proibida (.exe / .bat)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 10/15] Testando bloqueio de extensão proibida (.exe)...");
    const exeForm = new FormData();
    exeForm.append("file", new Blob([Buffer.from("malware")], { type: "application/octet-stream" }), "executavel.exe");

    const exeRes = await fetch(`${baseUrl}/api/files/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: exeForm,
    });
    const exeData = await exeRes.json();

    if (exeRes.status === 400 && exeData.error?.includes("não permitida")) {
      console.log(`✔ [TEST 10 APROVADO] Extensão proibida bloqueada: "${exeData.error}"`);
      passedTests++;
    } else {
      throw new Error(`[TEST 10 FALHOU] Esperado 400 com erro de extensão não permitida, recebido ${exeRes.status}: ${JSON.stringify(exeData)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 11: Acesso autenticado aos arquivos e proteção contra Path Traversal
    // -------------------------------------------------------------------------
    console.log("\n[TEST 11/15] Testando controle de acesso e proteção contra Directory Traversal...");
    // Acesso não autenticado (deve falhar 401)
    const unauthFileRes = await fetch(`${baseUrl}/api/files/references/${uploadedFileName}`);
    if (unauthFileRes.status !== 401) {
      throw new Error(`[TEST 11 FALHOU] Acesso anônimo deveria retornar 401, retornou ${unauthFileRes.status}`);
    }

    // Acesso autenticado (deve retornar 200 com bytes)
    const authFileRes = await fetch(`${baseUrl}/api/files/references/${uploadedFileName}`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    if (authFileRes.status !== 200) {
      throw new Error(`[TEST 11 FALHOU] Acesso autenticado retornou ${authFileRes.status}`);
    }

    // Tentativa de Directory Traversal (deve ser contido)
    const traversalRes = await fetch(`${baseUrl}/api/files/references/..%2F..%2Fpackage.json`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    if (traversalRes.status === 404 || traversalRes.status === 400) {
      console.log("✔ [TEST 11 APROVADO] Acesso autenticado funcionando e tentativa de Directory Traversal bloqueada.");
      passedTests++;
    } else {
      throw new Error(`[TEST 11 FALHOU] Tentativa de traversal retornou ${traversalRes.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 12: Preservação de versões históricas de arte (não sobrescrita)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 12/15] Submetendo Versão 1 e Versão 2 de arte e verificando integridade do histórico...");
    // Designer assume o desenvolvimento
    await fetch(`${baseUrl}/api/design/${testQuotationId}/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${designerToken}` },
    });

    // Submete Versão 1
    const v1Res = await fetch(`${baseUrl}/api/design/${testQuotationId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${designerToken}` },
      body: JSON.stringify({
        previewUrl: "http://storage.com/arte-v1.png",
        vectorUrl: "http://storage.com/arte-v1.cdr",
        changeNotes: "Primeira proposta do layout",
      }),
    });
    const v1Data = await v1Res.json();

    // Submete Versão 2
    const v2Res = await fetch(`${baseUrl}/api/design/${testQuotationId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${designerToken}` },
      body: JSON.stringify({
        previewUrl: "http://storage.com/arte-v2.png",
        vectorUrl: "http://storage.com/arte-v2.cdr",
        changeNotes: "Ajuste na cor da manga solicitado pelo cliente",
      }),
    });
    const v2Data = await v2Res.json();

    // Consultar detalhes do orçamento
    const quotDetailRes = await fetch(`${baseUrl}/api/quotations/${testQuotationId}`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    const quotDetail = await quotDetailRes.json();
    const versions = quotDetail.designBrief?.versions || [];

    if (versions.length === 2 && versions[0].versionNumber === 2 && versions[1].versionNumber === 1) {
      console.log("✔ [TEST 12 APROVADO] Ambas as versões (V1 e V2) permanecem preservadas no histórico.");
      passedTests++;
    } else {
      throw new Error(`[TEST 12 FALHOU] Esperado 2 versões no histórico, encontrado: ${versions.length}`);
    }

    // -------------------------------------------------------------------------
    // TEST 13: Conversão em OP e criação de sublote respeitando o limite da OP
    // -------------------------------------------------------------------------
    console.log("\n[TEST 13/15] Convertendo em OP e criando sublote dentro do limite contratado...");
    // Aprovação formal pelo cliente
    await fetch(`${baseUrl}/api/quotations/${testQuotationId}/client-approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        decision: "APPROVED",
        approvedByPerson: "Mariana Teste",
        feedbackNotes: "Aprovado!",
      }),
    });

    // Converter em OP (totalQuantityOrdered: 100)
    // A conversão inicial cria o lote L01 com saldo total. Vamos criar um orçamento direto sem conversão ou fracionar o lote L01
    // Para testar POST /api/production-orders/:opId/batches, vamos criar uma nova OP com total de 100 e sem lotes prévios
    const testOp = await prisma.productionOrder.create({
      data: {
        opNumber: `OP-TEST-${ts}`,
        customerId: customer.id,
        title: "OP de Teste de Lotes",
        productType: "Uniformes",
        totalQuantityOrdered: 100,
        sacApprovalStatus: "APPROVED",
      },
    });
    testOpId = testOp.id;

    // Criar Lote 1 de 60 peças
    const batch1Res = await fetch(`${baseUrl}/api/production-orders/${testOpId}/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ quantity: 60, sectorCode: "SAC_INTERNO" }),
    });
    const batch1Data = await batch1Res.json();

    if (batch1Res.status === 201 && batch1Data.totalAllocated === 60) {
      console.log(`✔ [TEST 13 APROVADO] Lote L01 criado com 60 pcs (alocado: 60/100 pcs).`);
      passedTests++;
    } else {
      throw new Error(`[TEST 13 FALHOU] Falha ao criar primeiro lote: ${JSON.stringify(batch1Data)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 14: Rejeição estrita quando lote ultrapassa a capacidade da OP
    // -------------------------------------------------------------------------
    console.log("\n[TEST 14/15] Tentando criar lote que ultrapassa o total da OP (tentativa de +50 pcs quando resta 40 pcs)...");
    const overflowBatchRes = await fetch(`${baseUrl}/api/production-orders/${testOpId}/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ quantity: 50, sectorCode: "SAC_INTERNO" }),
    });
    const overflowData = await overflowBatchRes.json();

    if (overflowBatchRes.status === 400 && overflowData.error?.includes("excede o total autorizado")) {
      console.log(`✔ [TEST 14 APROVADO] Servidor rejeitou lote excedente com 400: "${overflowData.error}"`);
      passedTests++;
    } else {
      throw new Error(`[TEST 14 FALHOU] Esperado 400 rejeitando lote excedente, recebido ${overflowBatchRes.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 15: Concorrência simulada (duas requisições simultâneas disputando saldo restante)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 15/15] Disputa concorrente simultânea: Saldo restante é 40 pcs. Dois requests disputam 30 pcs...");
    // 60 já alocados de 100. Restam 40.
    // Requisição A pede 30 pcs.
    // Requisição B pede 30 pcs.
    // Soma = 60 + 30 + 30 = 120 > 100.
    // EXATAMENTE UMA DEVE PASSAR E A OUTRA DEVE SER REJEITADA COM 400.
    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/production-orders/${testOpId}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ quantity: 30, sectorCode: "SAC_INTERNO" }),
      }),
      fetch(`${baseUrl}/api/production-orders/${testOpId}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ quantity: 30, sectorCode: "SAC_INTERNO" }),
      }),
    ]);

    const statusA = resA.status;
    const statusB = resB.status;

    const oneSucceeded = (statusA === 201 && statusB === 400) || (statusA === 400 && statusB === 201);

    // Verificar estado real do banco de dados
    const finalBatches = await prisma.opBatch.findMany({ where: { productionOrderId: testOpId } });
    const finalTotal = finalBatches.reduce((acc, b) => acc + b.quantity, 0);

    if (oneSucceeded && finalTotal <= 100) {
      console.log(`✔ [TEST 15 APROVADO] Concorrência controlada transacionalmente! Uma requisição passou (201) e a outra foi bloqueada (400). Total final no banco: ${finalTotal}/100 pcs.`);
      passedTests++;
    } else {
      throw new Error(`[TEST 15 FALHOU] Falha de concorrência: Status A=${statusA}, Status B=${statusB}, Total alocado=${finalTotal}`);
    }

    // -------------------------------------------------------------------------
    // RELATÓRIO FINAL DA HOMOLOGAÇÃO
    // -------------------------------------------------------------------------
    console.log("\n===============================================================");
    console.log(`=== HOMOLOGAÇÃO DAS CORREÇÕES CONCLUÍDA: ${passedTests}/${totalTests} PASSARAM ===`);
    console.log("===============================================================");
  } catch (err: any) {
    console.error("\n❌ ERRO DURANTE A SUÍTE DE TESTES:", err.message || err);
    process.exit(1);
  } finally {
    if (server.listening) {
      server.close();
    }
  }
}

runCorrectionsTests();
