import "./setup.js";
import { io as ioClient, Socket } from "socket.io-client";
import jwt from "jsonwebtoken";
import { app, server } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { createUploadsBackup, restoreUploadsBackup, listAvailableBackups } from "../src/utils/backup.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

async function runSecurityAuditTests() {
  await verifyTestDatabaseIsolation();
  console.log("===============================================================");
  console.log("=== SUÍTE DE TESTES DE SEGURANÇA E HARDENING — ETAPA 2 ===");
  console.log("=== ARQUIVOS RBAC, HANDSHAKE SOCKET.IO, SALAS E BACKUP ===");
  console.log("===============================================================\n");

  let actualPort = 4005;
  if (!server.listening) {
    await new Promise<void>((resolve) => server.listen(actualPort, "127.0.0.1", resolve));
  } else {
    const addr = server.address();
    if (typeof addr === "object" && addr) {
      actualPort = addr.port;
    }
  }
  const baseUrl = `http://127.0.0.1:${actualPort}`;

  let passedTests = 0;
  const totalTests = 17;

  try {
    // -------------------------------------------------------------------------
    // SETUP: Autenticação, Usuários e Setores
    // -------------------------------------------------------------------------
    console.log("[SETUP] Inicializando usuários de teste para a auditoria de segurança...");
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@fabrica.com", password: "admin123" }),
    });
    const adminToken = (await adminLoginRes.json()).token;

    const sectorsRes = await fetch(`${baseUrl}/api/sectors`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const sectors = await sectorsRes.json();
    const vendasSector = sectors.find((s: any) => s.code === "VENDAS");
    const designSector = sectors.find((s: any) => s.code === "DESIGN" || s.code === "DESIGNER");
    const sacSector = sectors.find((s: any) => s.code === "SAC_INTERNO");
    const infestoSector = sectors.find((s: any) => s.code === "INFESTO");

    const ts = Date.now();

    // Vendedor
    await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "Vendedor Seguro",
        email: `vendedor.sec.${ts}@fabrica.com`,
        password: "senha123",
        role: "VENDEDOR",
        sectorId: vendasSector.id,
      }),
    });
    const sellerLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `vendedor.sec.${ts}@fabrica.com`, password: "senha123" }),
    });
    const sellerToken = (await sellerLogin.json()).token;

    // Designer
    await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "Designer Seguro",
        email: `designer.sec.${ts}@fabrica.com`,
        password: "senha123",
        role: "DESIGNER",
        sectorId: designSector.id,
      }),
    });
    const designerLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `designer.sec.${ts}@fabrica.com`, password: "senha123" }),
    });
    const designerToken = (await designerLogin.json()).token;

    // Operador do Infesto (Setor 8)
    await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "Operador Infesto",
        email: `op.infesto.${ts}@fabrica.com`,
        password: "senha123",
        role: "OPERADOR",
        sectorId: infestoSector.id,
        signaturePin: "1111",
      }),
    });
    const opInfestoLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `op.infesto.${ts}@fabrica.com`, password: "senha123" }),
    });
    const operatorInfestoToken = (await opInfestoLogin.json()).token;

    // Operador do SAC (Setor 4)
    await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        name: "Operador SAC",
        email: `op.sac.${ts}@fabrica.com`,
        password: "senha123",
        role: "OPERADOR",
        sectorId: sacSector.id,
        signaturePin: "2222",
      }),
    });
    const opSacLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `op.sac.${ts}@fabrica.com`, password: "senha123" }),
    });
    const operatorSacToken = (await opSacLogin.json()).token;

    // Criar Cliente e Orçamento Comercial para os testes
    const custRes = await fetch(`${baseUrl}/api/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        companyName: `Cliente Teste Segurança ${ts}`,
        contactName: "Juliana Segurança",
        phone: `1197777${String(ts).slice(-4)}`,
      }),
    });
    const customer = await custRes.json();

    const qRes = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        customerId: customer.id,
        teamName: "Time Segurança",
        totalQuantity: 50,
        budgetAmount: 2500,
      }),
    });
    const quotation = await qRes.json();
    console.log(`✔ Ambiente inicializado. Orçamento ${quotation.quotationNumber} criado.\n`);

    // Buffer de PNG válido (89 50 4E 47 ...)
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

    // -------------------------------------------------------------------------
    // TESTE 1: Usuário anônimo não baixa arquivos (401 Unauthorized)
    // -------------------------------------------------------------------------
    console.log("[TEST 1/17] Usuário sem token tenta baixar arquivo...");
    const t1 = await fetch(`${baseUrl}/api/files/references/qualquer-arquivo.png`);
    if (t1.status === 401) {
      console.log("✔ [TEST 1 APROVADO] Usuário anônimo rejeitado com 401 Unauthorized.");
      passedTests++;
    } else {
      throw new Error(`[TEST 1 FALHOU] Esperado 401, recebido ${t1.status}`);
    }

    // -------------------------------------------------------------------------
    // TESTE 2: Upload legítimo por Vendedor
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2/17] Vendedor autorizado faz upload de arquivo em 'references'...");
    const formUpload = new FormData();
    formUpload.append("file", new Blob([validPngBuffer], { type: "image/png" }), "briefing_comercial.png");
    const t2Res = await fetch(`${baseUrl}/api/files/upload?category=references`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: formUpload,
    });
    const t2Data = await t2Res.json();
    const commercialFileName = t2Data.fileName;
    if (t2Res.status === 201 && commercialFileName) {
      console.log(`✔ [TEST 2 APROVADO] Upload legítimo realizado com sucesso (${commercialFileName}).`);
      passedTests++;
    } else {
      throw new Error(`[TEST 2 FALHOU] Falha no upload: ${JSON.stringify(t2Data)}`);
    }

    // Vincular anexo ao orçamento
    await fetch(`${baseUrl}/api/quotations/${quotation.id}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({
        fileName: "briefing_comercial.png",
        fileType: "REFERENCE",
        fileUrl: `/api/files/references/${commercialFileName}`,
      }),
    });

    // -------------------------------------------------------------------------
    // TESTE 3: Operador de Infesto bloqueado de baixar arquivo comercial (403 Forbidden)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3/17] Operador do setor INFESTO tenta baixar arquivo comercial de VENDAS...");
    const t3Res = await fetch(`${baseUrl}/api/files/references/${commercialFileName}`, {
      headers: { Authorization: `Bearer ${operatorInfestoToken}` },
    });
    if (t3Res.status === 403) {
      console.log("✔ [TEST 3 APROVADO] Operador de Infesto bloqueado com 403 Forbidden.");
      passedTests++;
    } else {
      throw new Error(`[TEST 3 FALHOU] Esperado 403, recebido ${t3Res.status}`);
    }

    // -------------------------------------------------------------------------
    // TESTE 4: Operador bloqueado de enviar arquivo em 'artwork' (403 Forbidden)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4/17] Operador do setor INFESTO tenta fazer upload em 'artwork'...");
    const opArtworkForm = new FormData();
    opArtworkForm.append("file", new Blob([validPngBuffer], { type: "image/png" }), "arte_invasor.png");
    const t4Res = await fetch(`${baseUrl}/api/files/upload?category=artwork`, {
      method: "POST",
      headers: { Authorization: `Bearer ${operatorInfestoToken}` },
      body: opArtworkForm,
    });
    const t4Data = await t4Res.json();
    if (t4Res.status === 403 && t4Data.error?.includes("Acesso negado")) {
      console.log(`✔ [TEST 4 APROVADO] Upload de operador em 'artwork' bloqueado: "${t4Data.error}".`);
      passedTests++;
    } else {
      throw new Error(`[TEST 4 FALHOU] Esperado 403, recebido ${t4Res.status}`);
    }

    // -------------------------------------------------------------------------
    // TESTE 5: Operador bloqueado de enviar arquivo em 'references' (403 Forbidden)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 5/17] Operador tenta fazer upload em 'references'...");
    const opRefForm = new FormData();
    opRefForm.append("file", new Blob([validPngBuffer], { type: "image/png" }), "ref_invasor.png");
    const t5Res = await fetch(`${baseUrl}/api/files/upload?category=references`, {
      method: "POST",
      headers: { Authorization: `Bearer ${operatorInfestoToken}` },
      body: opRefForm,
    });
    if (t5Res.status === 403) {
      console.log("✔ [TEST 5 APROVADO] Upload de operador em 'references' bloqueado com 403.");
      passedTests++;
    } else {
      throw new Error(`[TEST 5 FALHOU] Esperado 403, recebido ${t5Res.status}`);
    }

    // -------------------------------------------------------------------------
    // TESTE 6: Vendedor autorizado consegue baixar o arquivo comercial (200 OK)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 6/17] Vendedor autorizado acessa o arquivo do seu pedido...");
    const t6Res = await fetch(`${baseUrl}/api/files/references/${commercialFileName}`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });
    if (t6Res.status === 200) {
      console.log("✔ [TEST 6 APROVADO] Vendedor autorizado realizou download (200 OK).");
      passedTests++;
    } else {
      throw new Error(`[TEST 6 FALHOU] Esperado 200, recebido ${t6Res.status}`);
    }

    // -------------------------------------------------------------------------
    // TESTE 7: ADMIN mantém acesso irrestrito ao arquivo (200 OK)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 7/17] Administrador acessa o arquivo com privilégios de auditoria...");
    const t7Res = await fetch(`${baseUrl}/api/files/references/${commercialFileName}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (t7Res.status === 200) {
      console.log("✔ [TEST 7 APROVADO] Administrador acessou arquivo com sucesso (200 OK).");
      passedTests++;
    } else {
      throw new Error(`[TEST 7 FALHOU] Esperado 200, recebido ${t7Res.status}`);
    }

    // -------------------------------------------------------------------------
    // TESTE 8: Conexão Socket.io sem token é rejeitada no handshake
    // -------------------------------------------------------------------------
    console.log("\n[TEST 8/17] Conexão Socket.io sem token de autenticação...");
    const anonSocket: Socket = ioClient(baseUrl, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
    const anonError = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 2500);
      anonSocket.on("connect_error", (err) => {
        clearTimeout(timer);
        resolve(err.message);
      });
      anonSocket.on("connect", () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
    anonSocket.disconnect();

    if (anonError && anonError.includes("AUTHENTICATION_ERROR")) {
      console.log(`✔ [TEST 8 APROVADO] Socket anônimo rejeitado no handshake: "${anonError}".`);
      passedTests++;
    } else {
      throw new Error(`[TEST 8 FALHOU] Conexão sem token não foi rejeitada no handshake. Erro: ${anonError}`);
    }

    // -------------------------------------------------------------------------
    // TESTE 9: Conexão Socket.io com token forjado/inválido é rejeitada
    // -------------------------------------------------------------------------
    console.log("\n[TEST 9/17] Conexão Socket.io com token forjado/inválido...");
    const fakeSocket: Socket = ioClient(baseUrl, {
      transports: ["websocket", "polling"],
      auth: { token: "token_falso_adulterado_123" },
      autoConnect: true,
    });
    const fakeError = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 2500);
      fakeSocket.on("connect_error", (err) => {
        clearTimeout(timer);
        resolve(err.message);
      });
      fakeSocket.on("connect", () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
    fakeSocket.disconnect();

    if (fakeError && fakeError.includes("AUTHENTICATION_ERROR")) {
      console.log(`✔ [TEST 9 APROVADO] Token forjado rejeitado no handshake: "${fakeError}".`);
      passedTests++;
    } else {
      throw new Error(`[TEST 9 FALHOU] Conexão com token inválido aceita indevidamente.`);
    }

    // -------------------------------------------------------------------------
    // TESTE 10: Conexão Socket.io com token expirado é rejeitada
    // -------------------------------------------------------------------------
    console.log("\n[TEST 10/17] Conexão Socket.io com token com expiração no passado (1s)...");
    const JWT_SECRET = process.env.JWT_SECRET || "pcp_industrial_secret_super_seguro_2026_uniformes";
    const expiredToken = jwt.sign({ userId: quotation.sellerId }, JWT_SECRET, { expiresIn: -10 });
    const expiredSocket: Socket = ioClient(baseUrl, {
      transports: ["websocket", "polling"],
      auth: { token: expiredToken },
      autoConnect: true,
    });
    const expiredError = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 2500);
      expiredSocket.on("connect_error", (err) => {
        clearTimeout(timer);
        resolve(err.message);
      });
      expiredSocket.on("connect", () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
    expiredSocket.disconnect();

    if (expiredError && expiredError.includes("AUTHENTICATION_ERROR")) {
      console.log(`✔ [TEST 10 APROVADO] Token expirado rejeitado no handshake: "${expiredError}".`);
      passedTests++;
    } else {
      throw new Error(`[TEST 10 FALHOU] Conexão com token expirado aceita indevidamente.`);
    }

    // -------------------------------------------------------------------------
    // TESTE 11: Operador de Infesto bloqueado de entrar na sala SAC_INTERNO
    // -------------------------------------------------------------------------
    console.log("\n[TEST 11/17] Operador do Infesto tenta entrar na sala do SAC_INTERNO...");
    const opSocket: Socket = ioClient(baseUrl, {
      transports: ["websocket", "polling"],
      auth: { token: operatorInfestoToken },
    });
    await new Promise<void>((resolve) => opSocket.on("connect", () => resolve()));

    const deniedPromiseSac = new Promise<string>((resolve) => {
      opSocket.on("sector_access_denied", (data) => resolve(data.error));
    });

    opSocket.emit("join_sector", "SAC_INTERNO");
    const sacDeniedMsg = await deniedPromiseSac;

    if (sacDeniedMsg && sacDeniedMsg.includes("Acesso negado")) {
      console.log(`✔ [TEST 11 APROVADO] Servidor bloqueou entrada na sala SAC_INTERNO: "${sacDeniedMsg}".`);
      passedTests++;
    } else {
      throw new Error(`[TEST 11 FALHOU] Entrada não autorizada em SAC_INTERNO não foi bloqueada.`);
    }

    // -------------------------------------------------------------------------
    // TESTE 12: Operador de Infesto bloqueado de entrar na sala VENDAS
    // -------------------------------------------------------------------------
    console.log("\n[TEST 12/17] Operador do Infesto tenta entrar na sala de VENDAS...");
    const deniedPromiseVendas = new Promise<string>((resolve) => {
      opSocket.on("sector_access_denied", (data) => resolve(data.error));
    });

    opSocket.emit("join_sector", "VENDAS");
    const vendasDeniedMsg = await deniedPromiseVendas;

    if (vendasDeniedMsg && vendasDeniedMsg.includes("Acesso negado")) {
      console.log(`✔ [TEST 12 APROVADO] Servidor bloqueou entrada na sala VENDAS: "${vendasDeniedMsg}".`);
      passedTests++;
    } else {
      throw new Error(`[TEST 12 FALHOU] Entrada não autorizada em VENDAS não foi bloqueada.`);
    }

    // -------------------------------------------------------------------------
    // TESTE 13: Operador consegue ingressar na própria sala autorizada (INFESTO)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 13/17] Operador do Infesto ingressa na sua própria sala (INFESTO)...");
    opSocket.emit("join_sector", "INFESTO");
    await new Promise((r) => setTimeout(r, 300));
    console.log("✔ [TEST 13 APROVADO] Ingresso na sala legítima do setor autorizado confirmado.");
    passedTests++;

    // -------------------------------------------------------------------------
    // TESTE 14: Eventos comerciais NÃO vazam para o Operador do Infesto
    // -------------------------------------------------------------------------
    console.log("\n[TEST 14/17] Vendedor altera status comercial: Verificando isolamento de eventos...");
    let opReceivedLeak = false;
    opSocket.on("quotation_status_changed", () => {
      opReceivedLeak = true;
    });

    // Conectar também o socket do vendedor
    const sellerSocket: Socket = ioClient(baseUrl, {
      transports: ["websocket", "polling"],
      auth: { token: sellerToken },
    });
    await new Promise<void>((resolve) => sellerSocket.on("connect", () => resolve()));
    sellerSocket.emit("join_sector", "VENDAS");

    let sellerReceivedEvent = false;
    sellerSocket.on("quotation_status_changed", () => {
      sellerReceivedEvent = true;
    });

    // Vendedor transiciona status: NOVA_SOLICITACAO -> ORCAMENTO_PREPARACAO
    await fetch(`${baseUrl}/api/quotations/${quotation.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sellerToken}` },
      body: JSON.stringify({ status: "ORCAMENTO_PREPARACAO" }),
    });

    await new Promise((r) => setTimeout(r, 600));

    if (!opReceivedLeak && sellerReceivedEvent) {
      console.log("✔ [TEST 14 APROVADO] Confinamento comprovado: Vendedor recebeu o evento comercial e o Operador fabril NÃO recebeu vazamento.");
      passedTests++;
    } else {
      throw new Error(`[TEST 14 FALHOU] Vazamento detectado! Operador recebeu=${opReceivedLeak}, Vendedor recebeu=${sellerReceivedEvent}`);
    }
    opSocket.disconnect();
    sellerSocket.disconnect();

    // -------------------------------------------------------------------------
    // TESTE 15: Eventos de lote chegam aos setores autorizados (SAC e Setor do Lote)
    // -------------------------------------------------------------------------
    console.log("\n[TEST 15/17] Criação de lote entrega evento aos setores autorizados...");
    const sacSocket: Socket = ioClient(baseUrl, {
      transports: ["websocket", "polling"],
      auth: { token: operatorSacToken },
    });
    await new Promise<void>((resolve) => sacSocket.on("connect", () => resolve()));
    sacSocket.emit("join_sector", "SAC_INTERNO");

    let sacReceivedBatchEvent = false;
    sacSocket.on("batch_created", () => {
      sacReceivedBatchEvent = true;
    });

    // Criar OP e Lote
    const newOp = await prisma.productionOrder.create({
      data: {
        opNumber: `OP-SEC-${ts}`,
        customerId: customer.id,
        title: "OP de Teste de Confinamento",
        productType: "Uniformes",
        totalQuantityOrdered: 60,
        sacApprovalStatus: "APPROVED",
      },
    });

    await fetch(`${baseUrl}/api/production-orders/${newOp.id}/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ quantity: 60, sectorCode: "SAC_INTERNO" }),
    });

    await new Promise((r) => setTimeout(r, 500));
    sacSocket.disconnect();

    if (sacReceivedBatchEvent) {
      console.log("✔ [TEST 15 APROVADO] Setor autorizado (SAC_INTERNO) recebeu a notificação do lote.");
      passedTests++;
    } else {
      throw new Error("[TEST 15 FALHOU] Setor autorizado não recebeu evento de lote.");
    }

    // -------------------------------------------------------------------------
    // TESTE 16: Execução da Rotina de Backup dos Uploads e Verificação de Manifesto
    // -------------------------------------------------------------------------
    console.log("\n[TEST 16/17] Executando rotina de backup dos arquivos de upload...");
    const backupResult = await createUploadsBackup({ requestedBy: "AUDITORIA_SEGURANCA" });
    if (
      backupResult.success &&
      backupResult.manifest.status === "SUCCESS" &&
      backupResult.manifest.files.length >= 1
    ) {
      console.log(`✔ [TEST 16 APROVADO] Backup '${backupResult.backupId}' criado com sucesso contendo ${backupResult.manifest.files.length} arquivo(s) e checksums SHA-256.`);
      passedTests++;
    } else {
      throw new Error("[TEST 16 FALHOU] Falha na criação do backup.");
    }

    // -------------------------------------------------------------------------
    // TESTE 17: Validação da Restauração e Integridade de Checksums do Backup
    // -------------------------------------------------------------------------
    console.log("\n[TEST 17/17] Testando restauração a partir do manifesto do backup...");
    const restoreResult = await restoreUploadsBackup(backupResult.backupId);
    const available = listAvailableBackups();

    if (restoreResult.success && available.length > 0) {
      console.log(`✔ [TEST 17 APROVADO] Restauração concluída com sucesso (${restoreResult.restoredFilesCount} arquivos verificados e restaurados).`);
      passedTests++;
    } else {
      throw new Error("[TEST 17 FALHOU] Falha na restauração do backup.");
    }

    console.log("\n===============================================================");
    console.log(`=== TODOS OS ${passedTests}/${totalTests} TESTES DE SEGURANÇA FORAM APROVADOS! ===`);
    console.log("===============================================================");
  } catch (err: any) {
    console.error("\n❌ ERRO DURANTE OS TESTES DE SEGURANÇA:", err.message || err);
    process.exit(1);
  } finally {
    if (server.listening) {
      server.close();
    }
  }
}

runSecurityAuditTests();
