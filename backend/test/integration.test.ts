import "./setup.js";
import http from "http";
import { app } from "../src/server.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

async function runTests() {
  console.log("=== INICIANDO TESTES DE INTEGRAÇÃO DA ETAPA 1 ===");
  await verifyTestDatabaseIsolation();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4001, "127.0.0.1", resolve));
  const baseUrl = "http://127.0.0.1:4001";

  let adminToken = "";
  let operatorToken = "";
  let createdUserId = "";

  try {
    // 1. Healthcheck
    console.log("\n[TESTE 1] Verificando Health Check (/api/health)...");
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    if (healthRes.status !== 200 || healthData.status !== "ok") {
      throw new Error(`Falha no Health Check: ${JSON.stringify(healthData)}`);
    }
    console.log("✔ Health Check respondeu com status 200 OK.");

    // 2. Login com Admin
    console.log("\n[TESTE 2] Autenticação de Administrador (/api/auth/login)...");
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@fabrica.com", password: "admin123" }),
    });
    const loginData = await loginRes.json();
    if (loginRes.status !== 200 || !loginData.token) {
      throw new Error(`Falha no login do Admin: ${JSON.stringify(loginData)}`);
    }
    adminToken = loginData.token;
    console.log("✔ Login do Administrador bem-sucedido com emissão de JWT.");

    // 3. Teste de Senha Incorreta
    console.log("\n[TESTE 3] Tentativa de Login com Senha Incorreta...");
    const badLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@fabrica.com", password: "senha_errada" }),
    });
    if (badLoginRes.status !== 401) {
      throw new Error(`Deveria ter retornado 401, retornou ${badLoginRes.status}`);
    }
    console.log("✔ Bloqueio de credenciais incorretas validado (401).");

    // 4. Listar os 14 Setores
    console.log("\n[TESTE 4] Verificação da listagem dos 14 Setores (/api/sectors)...");
    const sectorsRes = await fetch(`${baseUrl}/api/sectors`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const sectors = await sectorsRes.json();
    if (sectorsRes.status !== 200 || !Array.isArray(sectors) || sectors.length !== 14) {
      throw new Error(`Esperado 14 setores, obtido: ${sectors.length}`);
    }
    const sequenceOk = sectors.every((s, idx) => s.sequenceOrder === idx + 1);
    if (!sequenceOk) {
      throw new Error("A ordenação sequencial dos 14 setores falhou!");
    }
    console.log(`✔ Exatamente 14 setores industriais verificados e ordenados de 1 a 14.`);

    // 5. Criar Novo Operador de Impressão com PIN de Assinatura
    console.log("\n[TESTE 5] Cadastro de Novo Operador com PIN de Assinatura (/api/users)...");
    const impressaoSector = sectors.find((s: any) => s.code === "IMPRESSAO");
    const testEmail = `operador.teste.${Date.now()}@fabrica.com`;

    const createUserRes = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: "Marcos Operador Impressão",
        email: testEmail,
        password: "senhaSegura123",
        role: "OPERADOR",
        sectorId: impressaoSector.id,
        signaturePin: "987654", // PIN de 6 dígitos
        phone: "(11) 99999-8888",
      }),
    });
    const createdUser = await createUserRes.json();
    if (createUserRes.status !== 201 || !createdUser.id || !createdUser.hasPin) {
      throw new Error(`Falha ao cadastrar operador: ${JSON.stringify(createdUser)}`);
    }
    createdUserId = createdUser.id;
    console.log(`✔ Operador cadastrado com sucesso. ID: ${createdUserId}, hasPin: true`);

    // 6. Login do Operador criado e Teste do PIN de Assinatura
    console.log("\n[TESTE 6] Autenticação do Operador e Verificação de PIN (/api/auth/verify-pin)...");
    const opLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "senhaSegura123" }),
    });
    const opLoginData = await opLoginRes.json();
    operatorToken = opLoginData.token;

    // PIN Correto
    const pinCheckCorrect = await fetch(`${baseUrl}/api/auth/verify-pin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${operatorToken}`,
      },
      body: JSON.stringify({ pin: "987654" }),
    });
    const pinCorrectData = await pinCheckCorrect.json();
    if (pinCheckCorrect.status !== 200 || !pinCorrectData.success) {
      throw new Error(`Falha ao validar PIN correto: ${JSON.stringify(pinCorrectData)}`);
    }
    console.log("✔ Assinatura com PIN correto autorizada com sucesso (200 OK).");

    // PIN Incorreto (deve falhar)
    const pinCheckWrong = await fetch(`${baseUrl}/api/auth/verify-pin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${operatorToken}`,
      },
      body: JSON.stringify({ pin: "000000" }),
    });
    if (pinCheckWrong.status !== 403) {
      throw new Error(`PIN incorreto deveria ter retornado 403, retornou ${pinCheckWrong.status}`);
    }
    console.log("✔ Assinatura com PIN incorreto bloqueada com sucesso (403 Forbidden).");

    // 7. Cadastro de Oficina de Costura Terceirizada
    console.log("\n[TESTE 7] Cadastro de Oficina de Costura (/api/sewing-partners)...");
    const partnerRes = await fetch(`${baseUrl}/api/sewing-partners`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: "Oficina Estrela do Sul",
        type: "EXTERNAL",
        documentNumber: "98.765.432/0001-11",
        contactPerson: "Dona Maria",
        phone: "(11) 91234-5678",
        basePricePerPc: 5.20,
      }),
    });
    const partnerData = await partnerRes.json();
    if (partnerRes.status !== 201 || !partnerData.id) {
      throw new Error(`Falha ao criar oficina de costura: ${JSON.stringify(partnerData)}`);
    }
    console.log(`✔ Oficina terceirizada cadastrada: ${partnerData.name} (R$ ${partnerData.basePricePerPc}/peça).`);

    // 8. Consulta da Trilha de Auditoria Imutável
    console.log("\n[TESTE 8] Verificação da Trilha de Auditoria (/api/audit-logs)...");
    const auditRes = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const auditLogs = await auditRes.json();
    if (auditRes.status !== 200 || !Array.isArray(auditLogs) || auditLogs.length === 0) {
      throw new Error(`Audit logs vazios ou com erro: ${JSON.stringify(auditLogs)}`);
    }
    console.log(`✔ Trilha de auditoria verificada: ${auditLogs.length} eventos gravados.`);

    // 9. Validação Criptográfica da Assinatura Digital (HMAC-SHA-256)
    console.log("\n[TESTE 9] Verificação da Assinatura Digital HMAC-SHA-256...");
    const { generateDigitalSignature, verifyDigitalSignature } = await import("../src/utils/security.js");
    const testParams = {
      batchId: "OP-2026-00001-L01",
      operatorId: createdUserId,
      fromSectorId: impressaoSector.id,
      toSectorId: sectors.find((s: any) => s.code === "INFESTO").id,
      timestamp: "2026-11-02T01:45:00.000Z",
    };

    const signature = generateDigitalSignature(testParams);
    if (!signature || signature.length !== 64) {
      throw new Error(`Assinatura HMAC-SHA-256 inválida gerada: ${signature}`);
    }

    const isValid = verifyDigitalSignature(signature, testParams);
    if (!isValid) {
      throw new Error("A validação da assinatura HMAC-SHA-256 falhou!");
    }

    // Tentar adulterar parâmetros (deve rejeitar)
    const tampered = verifyDigitalSignature(signature, {
      ...testParams,
      batchId: "OP-2026-00001-L02", // lote adulterado
    });
    if (tampered) {
      throw new Error("Assinatura adulterada foi aceita indevidamente!");
    }
    console.log("✔ Assinatura HMAC-SHA-256 com segredo do servidor e proteção contra adulteração validada com sucesso.");

    console.log("\n=======================================================");
    console.log("✔ TODOS OS 9 TESTES DA ETAPA 1 PASSARAM COM SUCESSO!");
    console.log("=======================================================\n");
  } catch (error) {
    console.error("❌ ERRO NO TESTE DE INTEGRAÇÃO:", error);
    process.exit(1);
  } finally {
    server.close();
    const { prisma } = await import("../src/prisma.js");
    await prisma.$disconnect();
    process.exit(0);
  }
}

runTests();
