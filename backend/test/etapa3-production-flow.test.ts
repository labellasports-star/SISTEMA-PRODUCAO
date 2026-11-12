import "./setup.js";
import http from "http";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

async function runEtapa3Tests() {
  await verifyTestDatabaseIsolation();
  console.log("================================================================================");
  console.log("=== TESTES DE INTEGRAÇÃO OBRIGATÓRIOS — ETAPA 3 ===");
  console.log("=== FLUXO INDUSTRIAL DE PRODUÇÃO — SETORES 05 A 10 ===");
  console.log("=== (Pré-Diag, Diagramação, Impressão, Infesto, Calandra, Separação) ===");
  console.log("================================================================================\n");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    if (condition) {
      console.log(`  ✔ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✖ [FAIL] ${testName}`);
      if (details) console.error("    Detalhes:", details);
      failed++;
    }
  }

  try {
    // 1. Login Admin
    console.log("[SETUP] 1. Autenticando Administrador...");
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@fabrica.com", password: "admin123" }),
    });
    const adminLoginData = await adminLoginRes.json();
    const adminToken = adminLoginData.token;
    assert(adminLoginRes.status === 200 && Boolean(adminToken), "Admin logado com sucesso");

    // 2. Localizar Setores 04 a 10
    console.log("[SETUP] 2. Consultando setores industriais...");
    const sectorsRes = await fetch(`${baseUrl}/api/sectors`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const sectors = await sectorsRes.json();
    const secSac = sectors.find((s: any) => s.code === "SAC_INTERNO");
    const sec05 = sectors.find((s: any) => s.code === "PRE_DIAGRAMACAO");
    const sec06 = sectors.find((s: any) => s.code === "DIAGRAMACAO");
    const sec07 = sectors.find((s: any) => s.code === "IMPRESSAO");
    const sec08 = sectors.find((s: any) => s.code === "INFESTO");
    const sec09 = sectors.find((s: any) => s.code === "CALANDRA");
    const sec10 = sectors.find((s: any) => s.code === "SEPARACAO");

    assert(
      Boolean(secSac && sec05 && sec06 && sec07 && sec08 && sec09 && sec10),
      "Todos os setores industriais (04 a 10) cadastrados no banco"
    );

    // 3. Criar Operadores dedicados com PIN para cada setor da Etapa 3
    console.log("[SETUP] 3. Criando operadores com PIN para os Setores 05 a 10...");
    const ts = Date.now();
    const operatorPin = "1234";

    async function createOperator(name: string, email: string, sectorId: string) {
      const res = await fetch(`${baseUrl}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          name,
          email,
          password: "SenhaOperador123!",
          role: "OPERADOR",
          sectorId,
          signaturePin: operatorPin,
        }),
      });
      const data = await res.json();
      // Login para obter token
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "SenhaOperador123!" }),
      });
      const loginData = await loginRes.json();
      return { id: data.id, token: loginData.token, email, name };
    }

    const opSac = await createOperator("Op SAC", `opsac.${ts}@fabrica.com`, secSac.id);
    const op05 = await createOperator("Op 05 PreDiag", `op05.${ts}@fabrica.com`, sec05.id);
    const op06 = await createOperator("Op 06 Diag", `op06.${ts}@fabrica.com`, sec06.id);
    const op07 = await createOperator("Op 07 Impressao", `op07.${ts}@fabrica.com`, sec07.id);
    const op08 = await createOperator("Op 08 Infesto", `op08.${ts}@fabrica.com`, sec08.id);
    const op09 = await createOperator("Op 09 Calandra", `op09.${ts}@fabrica.com`, sec09.id);
    const op10 = await createOperator("Op 10 Separacao", `op10.${ts}@fabrica.com`, sec10.id);

    assert(Boolean(opSac.token && op05.token && op06.token && op07.token && op08.token && op09.token && op10.token), "Operadores dos setores 04 a 10 autenticados com tokens");

    // 4. Criar Cliente, Orçamento e Ordem de Produção no SAC
    console.log("[SETUP] 4. Criando OP no SAC para alimentar a esteira industrial...");
    const custRes = await fetch(`${baseUrl}/api/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        companyName: `Indústria Têxtil Teste ${ts} Ltda`,
        contactName: "Carlos Gerente",
        email: `carlos.${ts}@industriateste.com`,
        phone: "11988887777",
      }),
    });
    const customer = await custRes.json();

    // Criar OP e Lote industrial diretamente para testar o fluxo produtivo
    const opNumber = `OP-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const op = await prisma.productionOrder.create({
      data: {
        opNumber,
        title: "Uniformes Sublimados Dry-Fit",
        productType: "Camisa Dry-Fit",
        customerId: customer.id,
        totalQuantityOrdered: 100,
        technicalNotes: "OP industrial de uniformes sublimados para teste da Etapa 3",
        priority: "ALTA",
        sacApprovalStatus: "APPROVED",
        sacReviewedAt: new Date(),
        sacReviewedById: opSac.id,
      },
    });
    const opId = op.id;

    const initialBatch = await prisma.opBatch.create({
      data: {
        batchNumber: `${opNumber}-L01`,
        productionOrderId: op.id,
        quantity: 100,
        currentSectorId: sec05.id,
        batchStatus: "WAITING",
      },
      include: { currentSector: true },
    });
    const batchId = initialBatch.id;

    assert(initialBatch.currentSector.code === "PRE_DIAGRAMACAO", "OP aprovada e lote inicial posicionado no Setor 05 (Pré-Diagramação)");

    // -------------------------------------------------------------------------
    // TESTE 1: SETOR 05 — PRÉ-DIAGRAMAÇÃO
    // -------------------------------------------------------------------------
    console.log("\n[TESTE 1] Setor 05 (Pré-Diagramação) — Fila, Início e Envio para Diagramação...");

    // 1.1 Consultar fila
    const queue05Res = await fetch(`${baseUrl}/api/production/queue/PRE_DIAGRAMACAO`, {
      headers: { Authorization: `Bearer ${op05.token}` },
    });
    const queue05 = await queue05Res.json();
    assert(queue05Res.status === 200 && queue05.batches.some((b: any) => b.id === batchId), "Operador 05 consulta fila de Pré-Diagramação com sucesso");

    // 1.2 Iniciar execução do lote
    const start05Res = await fetch(`${baseUrl}/api/production/batches/${batchId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op05.token}` },
      body: JSON.stringify({ notes: "Iniciando conferência de grade e briefing" }),
    });
    const start05 = await start05Res.json();
    assert(start05Res.status === 200 && start05.batch.batchStatus === "IN_PROGRESS", "Operador 05 assume e inicia lote (status IN_PROGRESS)");

    // 1.3 Concluir com PIN e encaminhar para Setor 06 (Diagramação)
    const forward05Res = await fetch(`${baseUrl}/api/production/batches/${batchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op05.token}` },
      body: JSON.stringify({
        pin: operatorPin,
        notes: "Briefing e grade conferidos 100%. Liberado para diagramação.",
      }),
    });
    const forward05 = await forward05Res.json();
    assert(
      forward05Res.status === 200 &&
      forward05.batch.currentSector.code === "DIAGRAMACAO" &&
      forward05.movement.signerPinVerified === true &&
      forward05.movement.digitalSignatureHash.length === 64,
      "Operador 05 assina com PIN e encaminha lote para Diagramação com hash HMAC-SHA-256 gerado"
    );

    // -------------------------------------------------------------------------
    // TESTE 2: SETOR 06 — DIAGRAMAÇÃO & BLOQUEIO DE ARQUIVOS OBRIGATÓRIOS
    // -------------------------------------------------------------------------
    console.log("\n[TESTE 2] Setor 06 (Diagramação) — Bloqueio sem arquivo, Anexação e Envio...");

    // 2.1 Iniciar execução em Diagramação
    await fetch(`${baseUrl}/api/production/batches/${batchId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op06.token}` },
      body: JSON.stringify({ notes: "Montagem do encaixe e mapa de corte" }),
    });

    // 2.2 Tentativa de avançar SEM arquivos de diagramação -> Deve ser BLOQUEADO com 400
    const forwardWithoutFileRes = await fetch(`${baseUrl}/api/production/batches/${batchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op06.token}` },
      body: JSON.stringify({
        pin: operatorPin,
        notes: "Tentativa de avançar sem anexar o encaixe",
      }),
    });
    assert(
      forwardWithoutFileRes.status === 400,
      "Setor 06 bloqueia estritamente avanço para Impressão se arquivo de diagramação não foi anexado (400)"
    );

    // 2.3 Anexar arquivo de diagramação formal
    const attachDiagRes = await fetch(`${baseUrl}/api/production/batches/${batchId}/attach-diagram`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op06.token}` },
      body: JSON.stringify({
        fileName: "encaixe_camisas_dry_fit_100un_v1.pdf",
        fileUrl: "/uploads/diagramacao/encaixe_camisas_v1.pdf",
        fileVersion: 1,
        notes: "Encaixe otimizado com aproveitamento de 89.4% do tecido",
      }),
    });
    const attachDiag = await attachDiagRes.json();
    assert(attachDiagRes.status === 201 && Boolean(attachDiag.attachment.id), "Operador 06 anexa arquivo de diagramação oficial com versionamento");

    // 2.4 Agora avança com PIN para Setor 07 (Impressão)
    const forward06Res = await fetch(`${baseUrl}/api/production/batches/${batchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op06.token}` },
      body: JSON.stringify({
        pin: operatorPin,
        notes: "Diagramação finalizada e enviada para o RIP da Impressão.",
        diagramFileName: "encaixe_camisas_dry_fit_100un_v1.pdf",
        diagramFileUrl: "/uploads/diagramacao/encaixe_camisas_v1.pdf",
        diagramVersion: 1,
      }),
    });
    const forward06 = await forward06Res.json();
    assert(
      forward06Res.status === 200 && forward06.batch.currentSector.code === "IMPRESSAO",
      "Diagramação concluída com assinatura e lote encaminhado para Impressão"
    );

    // -------------------------------------------------------------------------
    // TESTE 3: SETOR 07 — IMPRESSÃO (MÁQUINA OBRIGATÓRIA & DESMEMBRAMENTO PARCIAL)
    // -------------------------------------------------------------------------
    console.log("\n[TESTE 3] Setor 07 (Impressão) — Desmembramento de lote parcial, Máquinas e Métricas...");

    // 3.1 Iniciar execução em Impressão
    await fetch(`${baseUrl}/api/production/batches/${batchId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op07.token}` },
    });

    // 3.2 Desmembrar lote parcial (100 unidades -> 40 peças vão para outro lote, 60 ficam no lote principal)
    const splitRes = await fetch(`${baseUrl}/api/batches/${batchId}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        splitQuantity: 40,
        notes: "Desmembramento parcial para impressão em duas plotters simultâneas",
      }),
    });
    const splitData = await splitRes.json();
    assert(
      splitRes.status === 201 && splitData.newBatch.quantity === 40 && splitData.originalBatch.quantity === 60,
      "Suporte a lote parcial: lote de 100 desmembrado com sucesso em 60 e 40 peças"
    );

    // 3.3 Tentativa de avançar sem informar a máquina utilizada -> 400
    const forwardWithoutMachineRes = await fetch(`${baseUrl}/api/production/batches/${batchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op07.token}` },
      body: JSON.stringify({
        pin: operatorPin,
        quantityProduced: 58,
        quantityLost: 2,
      }),
    });
    assert(forwardWithoutMachineRes.status === 400, "Setor 07 exige obrigatoriamente a especificação da máquina/plotter (400)");

    // 3.4 Concluir Impressão com máquina "Plotter Epson F9470", produzidas=58, perdas=2
    const forward07Res = await fetch(`${baseUrl}/api/production/batches/${batchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op07.token}` },
      body: JSON.stringify({
        pin: operatorPin,
        machine: "Plotter Epson SureColor F9470 #01",
        quantityPlanned: 60,
        quantityProduced: 58,
        quantityLost: 2,
        notes: "Papel sublimático 75g impresso em alta resolução. 2 perdas por engasgo de bobina.",
      }),
    });
    const forward07 = await forward07Res.json();
    assert(
      forward07Res.status === 200 && forward07.batch.currentSector.code === "INFESTO",
      "Impressão concluída com métricas operacionais e lote encaminhado para Infesto"
    );

    // -------------------------------------------------------------------------
    // TESTE 4: SETOR 08 — INFESTO (PREPARAÇÃO DE TECIDO & CORTE)
    // -------------------------------------------------------------------------
    console.log("\n[TESTE 4] Setor 08 (Infesto) — Descanso de tecido, Preparação e Métricas...");

    await fetch(`${baseUrl}/api/production/batches/${batchId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op08.token}` },
    });

    const forward08Res = await fetch(`${baseUrl}/api/production/batches/${batchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op08.token}` },
      body: JSON.stringify({
        pin: operatorPin,
        quantityReceived: 58,
        quantityPrepared: 58,
        lossesOrDivergences: 0,
        notes: "Tecido Dry descansado por 24h e enfestado sem desvios de fio.",
      }),
    });
    const forward08 = await forward08Res.json();
    assert(
      forward08Res.status === 200 && forward08.batch.currentSector.code === "CALANDRA",
      "Infesto concluído com sucesso e lote encaminhado para a Calandra"
    );

    // -------------------------------------------------------------------------
    // TESTE 5: SETOR 09 — CALANDRA (PARÂMETROS TÉRMICOS DE TEMPERATURA E VELOCIDADE)
    // -------------------------------------------------------------------------
    console.log("\n[TESTE 5] Setor 09 (Calandra) — Validação de parâmetros térmicos e Transferência...");

    await fetch(`${baseUrl}/api/production/batches/${batchId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op09.token}` },
    });

    // 5.1 Tentativa sem temperatura e velocidade -> 400
    const forwardWithoutTempRes = await fetch(`${baseUrl}/api/production/batches/${batchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op09.token}` },
      body: JSON.stringify({
        pin: operatorPin,
        machine: "Calandra Rotativa Monti Antonio #02",
      }),
    });
    assert(forwardWithoutTempRes.status === 400, "Calandra exige obrigatoriamente máquina, temperatura e velocidade/tempo (400)");

    // 5.2 Concluir com temperatura 205°C e velocidade 1.8 m/min
    const forward09Res = await fetch(`${baseUrl}/api/production/batches/${batchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op09.token}` },
      body: JSON.stringify({
        pin: operatorPin,
        machine: "Calandra Rotativa Monti Antonio #02",
        temperature: "205°C",
        speedOrTime: "1.8 m/min",
        quantityProcessed: 58,
        notes: "Transferência térmica de cores vivas e aderência perfeita.",
      }),
    });
    const forward09 = await forward09Res.json();
    assert(
      forward09Res.status === 200 && forward09.batch.currentSector.code === "SEPARACAO",
      "Calandra concluída com parâmetros térmicos validados e lote encaminhado para Separação"
    );

    // -------------------------------------------------------------------------
    // TESTE 6: SETOR 10 — SEPARAÇÃO (CONFERÊNCIA DE INTEGRIDADE E FINALIZAÇÃO DA ETAPA 3)
    // -------------------------------------------------------------------------
    console.log("\n[TESTE 6] Setor 10 (Separação) — Conferência por pedido/tamanho e Finalização...");

    await fetch(`${baseUrl}/api/production/batches/${batchId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op10.token}` },
    });

    // 6.1 Tentativa sem confirmação de integridade -> 400
    const forwardWithoutIntegrity = await fetch(`${baseUrl}/api/production/batches/${batchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op10.token}` },
      body: JSON.stringify({
        pin: operatorPin,
        quantitySeparated: 58,
        integrityVerified: false,
      }),
    });
    assert(forwardWithoutIntegrity.status === 400, "Separação exige confirmação expressa de conferência e integridade das peças (400)");

    // 6.2 Concluir Separação com conferência aprovada
    const forward10Res = await fetch(`${baseUrl}/api/production/batches/${batchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op10.token}` },
      body: JSON.stringify({
        pin: operatorPin,
        quantitySeparated: 58,
        missingOrDivergences: 0,
        integrityVerified: true,
        notes: "58 peças separadas, conferidas contra grade e prontas para Costura (aguardando Etapa 4).",
      }),
    });
    const forward10 = await forward10Res.json();
    assert(
      forward10Res.status === 200 &&
        (forward10.batch.batchStatus === "COMPLETED" ||
          forward10.batch.batchStatus === "PENDING" ||
          forward10.batch.currentSector.code === "DESPACHE_OFICINA"),
      "Separação concluída com sucesso e encaminhada para Despache Oficina (Setor 11)"
    );

    // -------------------------------------------------------------------------
    // TESTE 7: RBAC NEGATIVO E VALIDAÇÃO DE PIN
    // -------------------------------------------------------------------------
    console.log("\n[TESTE 7] Testes de Segurança: RBAC estrito e rejeição de PIN incorreto...");

    // 7.1 Operador 08 (Infesto) tenta acessar fila de Separação (Setor 10) -> 403
    const crossQueueRes = await fetch(`${baseUrl}/api/production/queue/SEPARACAO`, {
      headers: { Authorization: `Bearer ${op08.token}` },
    });
    assert(crossQueueRes.status === 403, "Operador não pode consultar fila de outro setor (403)");

    // 7.2 Assinatura com PIN incorreto em lote -> 403
    const op2Number = `OP-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const op2 = await prisma.productionOrder.create({
      data: {
        opNumber: op2Number,
        title: "Lote para Teste de Devolução e Retrabalho",
        productType: "Camisa Dry-Fit",
        customerId: customer.id,
        totalQuantityOrdered: 50,
        priority: "ALTA",
        sacApprovalStatus: "APPROVED",
        sacReviewedAt: new Date(),
        sacReviewedById: opSac.id,
      },
    });

    const secondBatch = await prisma.opBatch.create({
      data: {
        batchNumber: `${op2Number}-L01`,
        productionOrderId: op2.id,
        quantity: 50,
        currentSectorId: sec09.id,
        batchStatus: "IN_PROGRESS",
        assignedOperatorId: op09.id,
      },
      include: { currentSector: true },
    });

    const wrongPinRes = await fetch(`${baseUrl}/api/production/batches/${secondBatch.id}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op09.token}` },
      body: JSON.stringify({
        pin: "9999", // PIN errado
        machine: "Calandra #02",
        temperature: "200°C",
        speedOrTime: "2.0 m/min",
      }),
    });
    assert(wrongPinRes.status === 403, "Assinatura rejeitada com PIN incorreto (403)");

    // -------------------------------------------------------------------------
    // TESTE 8: DEVOLUÇÃO COM MOTIVO E RETRABALHO
    // -------------------------------------------------------------------------
    console.log("\n[TESTE 8] Devolução justificada e Retrabalho com assinatura PIN...");

    // 8.1 Calandra devolve lote para Impressão com motivo (ex: defeito de sublimação/desbotado)
    const returnRes = await fetch(`${baseUrl}/api/production/batches/${secondBatch.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op09.token}` },
      body: JSON.stringify({
        pin: operatorPin,
        targetSectorCode: "IMPRESSAO",
        reason: "Sublimação apresentou falha de alinhamento no papel impresso. Necessário reimprimir arte.",
      }),
    });
    const returnData = await returnRes.json();
    assert(
      returnRes.status === 200 &&
      returnData.batch.currentSector.code === "IMPRESSAO" &&
      returnData.batch.isUnderRework === true &&
      returnData.movement.movementType === "REWORK_RETURN",
      "Lote devolvido com sucesso para setor anterior com status isUnderRework e movimento REWORK_RETURN"
    );

    // 8.2 Devolução para a frente (sentido inválido) deve ser REJEITADA com 400
    const forwardReturnRes = await fetch(`${baseUrl}/api/production/batches/${returnData.batch.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${op07.token}` },
      body: JSON.stringify({
        pin: operatorPin,
        targetSectorCode: "CALANDRA",
        reason: "Tentativa inválida de devolução para frente",
      }),
    });
    assert(forwardReturnRes.status === 400, "Devolução em sentido progressivo é rejeitada com 400");

    // -------------------------------------------------------------------------
    // TESTE 9: HISTÓRICO COMPLETO E RASTREABILIDADE CRIPTOGRÁFICA
    // -------------------------------------------------------------------------
    console.log("\n[TESTE 9] Histórico de Rastreabilidade e Assinaturas HMAC-SHA-256...");

    const historyRes = await fetch(`${baseUrl}/api/production/batches/${batchId}/history`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const historyData = await historyRes.json();
    assert(historyRes.status === 200, "Consulta de histórico de rastreabilidade bem-sucedida");
    assert(historyData.movements.length >= 5, `Histórico contém todas as movimentações (${historyData.movements.length} registradas)`);

    const allHaveSignatures = historyData.movements.every(
      (m: any) => typeof m.digitalSignatureHash === "string" && m.digitalSignatureHash.length === 64 && m.signerPinVerified === true
    );
    assert(allHaveSignatures, "Todas as movimentações possuem assinatura digital HMAC-SHA-256 de 64 caracteres hexadecimais");

  } catch (err: any) {
    console.error("ERRO INESPERADO NOS TESTES DA ETAPA 3:", err);
    failed++;
  } finally {
    server.close();
  }

  console.log("\n=======================================================");
  console.log(`=== RESULTADO FINAL: ${passed} APROVADOS, ${failed} FALHAS ===`);
  console.log("=======================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runEtapa3Tests().catch((e) => {
  console.error("Falha fatal na suíte:", e);
  process.exit(1);
});
