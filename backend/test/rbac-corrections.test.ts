import path from "path";
import fs from "fs";
import http from "http";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { generateToken, hashPassword, hashPin } from "../src/utils/security.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

async function runRbacCorrectionTests() {
  console.log("================================================================================");
  console.log("=== SUÍTE DE TESTES ESPECÍFICOS — CORREÇÕES DE RBAC (COMANDO 06) ===");
  console.log("================================================================================");

  // 1. Fail-Safe: Comprovar que estamos executando exclusivamente em test.db
  await verifyTestDatabaseIsolation();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}`;

  let passedTests = 0;
  let totalTests = 0;

  function assertTest(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✔ [PASS] ${testName}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? " - " + detail : ""}`);
      throw new Error(`Falha no teste: ${testName}`);
    }
  }

  try {
    const pwdHash = await hashPassword("senha123");
    const pinHash = await hashPin("1234");

    const sectors = await prisma.sector.findMany();
    const secVendas = sectors.find((s) => s.code === "VENDAS")!;
    const secDesign = sectors.find((s) => s.code === "DESIGN" || s.code === "DESIGNER")!;
    const secSac = sectors.find((s) => s.code === "SAC_INTERNO")!;
    const secPreDiag = sectors.find((s) => s.code === "PRE_DIAGRAMACAO")!;
    const secDiag = sectors.find((s) => s.code === "DIAGRAMACAO")!;
    const secInfesto = sectors.find((s) => s.code === "INFESTO")!;

    // Criar usuários com seus respectivos setores para testes de RBAC
    const userAdmin = await prisma.user.upsert({
      where: { email: "rbac_admin@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Admin RBAC", email: "rbac_admin@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "ADMIN", isActive: true },
    });

    const userGestor = await prisma.user.upsert({
      where: { email: "rbac_gestor@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Gestor RBAC", email: "rbac_gestor@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "GESTOR", isActive: true },
    });

    const userSeller = await prisma.user.upsert({
      where: { email: "rbac_vendedor@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Vendedor RBAC", email: "rbac_vendedor@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "VENDEDOR", sectorId: secVendas.id, isActive: true },
    });

    const userDesigner = await prisma.user.upsert({
      where: { email: "rbac_designer@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Designer RBAC", email: "rbac_designer@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "DESIGNER", sectorId: secDesign.id, isActive: true },
    });

    const userOpSac = await prisma.user.upsert({
      where: { email: "rbac_op_sac@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Op SAC RBAC", email: "rbac_op_sac@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "OPERADOR", sectorId: secSac.id, isActive: true },
    });

    const userOpPreDiag = await prisma.user.upsert({
      where: { email: "rbac_op_prediag@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Op PreDiag RBAC", email: "rbac_op_prediag@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "OPERADOR", sectorId: secPreDiag.id, isActive: true },
    });

    const userOpInfesto = await prisma.user.upsert({
      where: { email: "rbac_op_infesto@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Op Infesto RBAC", email: "rbac_op_infesto@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "OPERADOR", sectorId: secInfesto.id, isActive: true },
    });

    const tokenAdmin = generateToken({ userId: userAdmin.id });
    const tokenGestor = generateToken({ userId: userGestor.id });
    const tokenSeller = generateToken({ userId: userSeller.id });
    const tokenDesigner = generateToken({ userId: userDesigner.id });
    const tokenOpSac = generateToken({ userId: userOpSac.id });
    const tokenOpPreDiag = generateToken({ userId: userOpPreDiag.id });
    const tokenOpInfesto = generateToken({ userId: userOpInfesto.id });

    // Cliente base para testes
    const customer = await prisma.customer.create({
      data: { companyName: "Cliente Testes RBAC", contactName: "Contato RBAC", phone: "11988887777" },
    });

    // =========================================================================
    // SEÇÃO 1: CORREÇÃO 1 — APROVAÇÃO E REPROVAÇÃO NO SAC INTERNO
    // =========================================================================
    console.log("\n--- [SEÇÃO 1] Testes de Autorização no SAC Interno (/approve e /reject) ---");

    // Criar OP 1 para teste de bloqueio de aprovação
    const quot1 = await prisma.quotation.create({
      data: {
        quotationNumber: `ORC-SAC-${Date.now()}-1`,
        teamName: "Time SAC 1",
        customerId: customer.id,
        sellerId: userSeller.id,
        status: "CONVERTIDA_VENDA",
        totalQuantity: 100,
        budgetAmount: 5000,
      },
    });

    const op1 = await prisma.productionOrder.create({
      data: {
        opNumber: `OP-SAC-${Date.now()}-1`,
        title: "Uniforme SAC 1",
        productType: "Camisas",
        quotationId: quot1.id,
        customerId: customer.id,
        totalQuantityOrdered: 100,
        totalQuantityDone: 0,
        priority: "NORMAL",
        status: "ACTIVE",
        sacApprovalStatus: "PENDING_REVIEW",
        promisedDeliveryDate: new Date(),
      },
    });

    const batchOp1 = await prisma.opBatch.create({
      data: {
        batchNumber: `${op1.opNumber}-L01`,
        productionOrderId: op1.id,
        currentSectorId: secSac.id,
        quantity: 100,
        batchStatus: "WAITING",
      },
    });

    // 1.1 Vendedor tenta aprovar no SAC -> Esperado 403
    const resVendedorSac = await fetch(`${baseUrl}/api/sac/${op1.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenSeller}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });
    assertTest(resVendedorSac.status === 403, "1.1 Vendedor recebe HTTP 403 ao tentar aprovar OP no SAC");

    // 1.2 Designer tenta aprovar no SAC -> Esperado 403
    const resDesignerSac = await fetch(`${baseUrl}/api/sac/${op1.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenDesigner}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });
    assertTest(resDesignerSac.status === 403, "1.2 Designer recebe HTTP 403 ao tentar aprovar OP no SAC");

    // 1.3 Operador de outro setor (INFESTO) tenta aprovar no SAC -> Esperado 403
    const resOpInfestoSac = await fetch(`${baseUrl}/api/sac/${op1.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOpInfesto}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });
    assertTest(resOpInfestoSac.status === 403, "1.3 Operador do setor INFESTO recebe HTTP 403 ao tentar aprovar OP no SAC");

    // 1.4 Operador de outro setor (INFESTO) tenta reprovar no SAC -> Esperado 403
    const resOpInfestoReject = await fetch(`${baseUrl}/api/sac/${op1.id}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOpInfesto}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234", reason: "Motivo de teste indevido" }),
    });
    assertTest(resOpInfestoReject.status === 403, "1.4 Operador de outro setor recebe HTTP 403 ao tentar reprovar OP no SAC");

    // 1.5 Verificar que tentativas bloqueadas não alteraram o estado da OP nem moveram o lote
    const checkOp1 = await prisma.productionOrder.findUnique({ where: { id: op1.id } });
    const checkBatchOp1 = await prisma.opBatch.findUnique({ where: { id: batchOp1.id } });
    assertTest(
      checkOp1?.sacApprovalStatus === "PENDING_REVIEW" && checkBatchOp1?.currentSectorId === secSac.id,
      "1.5 Tentativas bloqueadas no SAC preservam estado (sem mutações ou movimentações)"
    );

    // 1.6 Operador legítimo do SAC_INTERNO aprova OP com PIN -> Permitido 200
    const resOpSacApprove = await fetch(`${baseUrl}/api/sac/${op1.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOpSac}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234", notes: "Aprovado pelo SAC legítimo" }),
    });
    assertTest(resOpSacApprove.status === 200, "1.6 Operador legítimo do setor SAC_INTERNO aprova OP com sucesso (200 OK)");

    // 1.7 Criar OP 2 para testar aprovação pelo ADMIN
    const quot2 = await prisma.quotation.create({
      data: {
        quotationNumber: `ORC-SAC-${Date.now()}-2`,
        teamName: "Time SAC 2",
        customerId: customer.id,
        sellerId: userSeller.id,
        status: "CONVERTIDA_VENDA",
        totalQuantity: 50,
        budgetAmount: 2500,
      },
    });

    const op2 = await prisma.productionOrder.create({
      data: {
        opNumber: `OP-SAC-${Date.now()}-2`,
        title: "Uniforme SAC 2",
        productType: "Shorts",
        quotationId: quot2.id,
        customerId: customer.id,
        totalQuantityOrdered: 50,
        totalQuantityDone: 0,
        priority: "NORMAL",
        status: "ACTIVE",
        sacApprovalStatus: "PENDING_REVIEW",
        promisedDeliveryDate: new Date(),
      },
    });

    await prisma.opBatch.create({
      data: {
        batchNumber: `${op2.opNumber}-L01`,
        productionOrderId: op2.id,
        currentSectorId: secSac.id,
        quantity: 50,
        batchStatus: "WAITING",
      },
    });

    const resAdminSac = await fetch(`${baseUrl}/api/sac/${op2.id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenAdmin}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234", notes: "Aprovado pelo Admin" }),
    });
    assertTest(resAdminSac.status === 200, "1.7 Administrador possui permissão para aprovar OP no SAC (200 OK)");

    // =========================================================================
    // SEÇÃO 2: CORREÇÃO 2 — DIVISÃO/FRACIONAMENTO DE LOTES (/split)
    // =========================================================================
    console.log("\n--- [SEÇÃO 2] Testes de Autorização em Fracionamento de Lotes (/split) ---");

    // Criar lote posicionado em PRE_DIAGRAMACAO com 60 peças
    const quotSplit = await prisma.quotation.create({
      data: {
        quotationNumber: `ORC-SPLIT-${Date.now()}`,
        teamName: "Time Split",
        customerId: customer.id,
        sellerId: userSeller.id,
        status: "CONVERTIDA_VENDA",
        totalQuantity: 60,
        budgetAmount: 3000,
      },
    });

    const opSplit = await prisma.productionOrder.create({
      data: {
        opNumber: `OP-SPLIT-${Date.now()}`,
        title: "Uniforme Split",
        productType: "Agasalhos",
        quotationId: quotSplit.id,
        customerId: customer.id,
        totalQuantityOrdered: 60,
        totalQuantityDone: 0,
        priority: "NORMAL",
        status: "ACTIVE",
        sacApprovalStatus: "APPROVED",
        promisedDeliveryDate: new Date(),
      },
    });

    const batchToSplit = await prisma.opBatch.create({
      data: {
        batchNumber: `${opSplit.opNumber}-L01`,
        productionOrderId: opSplit.id,
        currentSectorId: secPreDiag.id,
        quantity: 60,
        batchStatus: "WAITING",
      },
    });

    // 2.1 Operador de outro setor (INFESTO) tenta fracionar lote em PRE_DIAGRAMACAO -> Esperado 403
    const resOpInfestoSplit = await fetch(`${baseUrl}/api/batches/${batchToSplit.id}/split`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOpInfesto}`, "Content-Type": "application/json" },
      body: JSON.stringify({ splitQuantity: 20 }),
    });
    assertTest(resOpInfestoSplit.status === 403, "2.1 Operador de setor divergente (Infesto) recebe HTTP 403 ao tentar dividir lote de Pré-Diag");

    // 2.2 Verificar que a tentativa bloqueada não alterou a quantidade nem gerou novo sublote
    const checkBatchSplitBlocked = await prisma.opBatch.findUnique({ where: { id: batchToSplit.id } });
    const allBatchesAfterBlocked = await prisma.opBatch.findMany({ where: { productionOrderId: opSplit.id } });
    assertTest(
      checkBatchSplitBlocked?.quantity === 60 && allBatchesAfterBlocked.length === 1,
      "2.2 Tentativa bloqueada é 100% atômica: nenhum sublote foi criado e o saldo permaneceu inalterado"
    );

    // 2.3 Operador legítimo do setor PRE_DIAGRAMACAO divide o lote -> Permitido 201
    const resOpPreDiagSplit = await fetch(`${baseUrl}/api/batches/${batchToSplit.id}/split`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOpPreDiag}`, "Content-Type": "application/json" },
      body: JSON.stringify({ splitQuantity: 20, notes: "Desmembramento legítimo pelo operador do setor" }),
    });
    assertTest(resOpPreDiagSplit.status === 201, "2.3 Operador do setor atual (Pré-Diag) divide o lote com sucesso (201 Created)");

    // 2.4 GESTOR divide sublote resultante -> Permitido 201
    const resGestorSplit = await fetch(`${baseUrl}/api/batches/${batchToSplit.id}/split`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenGestor}`, "Content-Type": "application/json" },
      body: JSON.stringify({ splitQuantity: 10, notes: "Fracionamento por Gestor" }),
    });
    assertTest(resGestorSplit.status === 201, "2.4 Gestor possui permissão conforme política existente (201 Created)");

    // 2.5 ADMIN divide lote -> Permitido 201
    const resAdminSplit = await fetch(`${baseUrl}/api/batches/${batchToSplit.id}/split`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenAdmin}`, "Content-Type": "application/json" },
      body: JSON.stringify({ splitQuantity: 10, notes: "Fracionamento por Admin" }),
    });
    assertTest(resAdminSplit.status === 201, "2.5 Administrador possui permissão para fracionamento de lote (201 Created)");

    // =========================================================================
    // SEÇÃO 3: CORREÇÃO 3 — MOVIMENTAÇÕES DE PRODUÇÃO (/start, /complete, /return)
    // =========================================================================
    console.log("\n--- [SEÇÃO 3] Testes de Autorização em Rotas de Chão de Fábrica ---");

    // Criar lote em INFESTO com dados válidos prontos para início
    const quotProd = await prisma.quotation.create({
      data: {
        quotationNumber: `ORC-PROD-${Date.now()}`,
        teamName: "Time Producao",
        customerId: customer.id,
        sellerId: userSeller.id,
        status: "CONVERTIDA_VENDA",
        totalQuantity: 40,
        budgetAmount: 2000,
      },
    });

    const opProd = await prisma.productionOrder.create({
      data: {
        opNumber: `OP-PROD-${Date.now()}`,
        title: "Uniforme Producao",
        productType: "Calças",
        quotationId: quotProd.id,
        customerId: customer.id,
        totalQuantityOrdered: 40,
        totalQuantityDone: 0,
        priority: "NORMAL",
        status: "ACTIVE",
        sacApprovalStatus: "APPROVED",
        promisedDeliveryDate: new Date(),
      },
    });

    const batchInfesto = await prisma.opBatch.create({
      data: {
        batchNumber: `${opProd.opNumber}-L01`,
        productionOrderId: opProd.id,
        currentSectorId: secInfesto.id,
        quantity: 40,
        batchStatus: "WAITING",
      },
    });

    // 3.1 Vendedor tenta iniciar lote (/start) com lote válido em WAITING -> Esperado 403 (e não 400!)
    const resVendedorStart = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenSeller}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assertTest(resVendedorStart.status === 403, "3.1 Vendedor recebe HTTP 403 ao tentar iniciar lote em /start");

    // 3.2 Designer tenta iniciar lote (/start) -> Esperado 403
    const resDesignerStart = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenDesigner}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assertTest(resDesignerStart.status === 403, "3.2 Designer recebe HTTP 403 ao tentar iniciar lote em /start");

    // 3.3 Operador de setor divergente (Pré-Diag) tenta iniciar lote do Infesto -> Esperado 403
    const resCrossOpStart = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOpPreDiag}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assertTest(resCrossOpStart.status === 403, "3.3 Operador de setor divergente recebe HTTP 403 em /start");

    // 3.4 Operador legítimo do setor INFESTO inicia o lote -> Permitido 200
    const resOpInfestoStart = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOpInfesto}`, "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Início legítimo do Infesto" }),
    });
    assertTest(resOpInfestoStart.status === 200, "3.4 Operador legítimo do Infesto inicia o lote com sucesso (200 OK)");

    // 3.5 Vendedor tenta concluir lote (/complete-and-forward) com PIN válido -> Esperado 403
    const resVendedorComplete = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/complete-and-forward`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenSeller}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });
    assertTest(resVendedorComplete.status === 403, "3.5 Vendedor recebe HTTP 403 ao tentar concluir lote em /complete-and-forward");

    // 3.6 Designer tenta concluir lote (/complete-and-forward) -> Esperado 403
    const resDesignerComplete = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/complete-and-forward`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenDesigner}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });
    assertTest(resDesignerComplete.status === 403, "3.6 Designer recebe HTTP 403 ao tentar concluir lote em /complete-and-forward");

    // 3.7 Operador de setor divergente (Pré-Diag) tenta concluir lote do Infesto -> Esperado 403
    const resCrossOpComplete = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/complete-and-forward`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOpPreDiag}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });
    assertTest(resCrossOpComplete.status === 403, "3.7 Operador de setor divergente recebe HTTP 403 em /complete-and-forward");

    // 3.8 Operador legítimo do Infesto com PIN incorreto -> Esperado 403 com mensagem de PIN
    const resBadPinComplete = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/complete-and-forward`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOpInfesto}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "9999" }),
    });
    const badPinData = await resBadPinComplete.json();
    assertTest(
      resBadPinComplete.status === 403 && badPinData.error?.includes("PIN"),
      "3.8 Operador legítimo com PIN incorreto é rejeitado com HTTP 403 e erro específico de PIN"
    );

    // 3.9 Vendedor tenta devolver lote (/return) -> Esperado 403
    const resVendedorReturn = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/return`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenSeller}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234", targetSectorCode: "IMPRESSAO", reason: "Motivo Vendedor" }),
    });
    assertTest(resVendedorReturn.status === 403, "3.9 Vendedor recebe HTTP 403 ao tentar devolver lote em /return");

    // 3.10 Operador de outro setor tenta devolver lote (/return) -> Esperado 403
    const resCrossOpReturn = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/return`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOpPreDiag}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234", targetSectorCode: "IMPRESSAO", reason: "Motivo Outro Setor" }),
    });
    assertTest(resCrossOpReturn.status === 403, "3.10 Operador de setor divergente recebe HTTP 403 em /return");

    // 3.11 Requisições sem autenticação (sem token) -> Esperado 401
    const resAnonStart = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/start`, { method: "POST" });
    const resAnonComplete = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/complete-and-forward`, { method: "POST" });
    const resAnonReturn = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/return`, { method: "POST" });
    assertTest(
      resAnonStart.status === 401 && resAnonComplete.status === 401 && resAnonReturn.status === 401,
      "3.11 Requisições sem token em /start, /complete-and-forward e /return recebem HTTP 401"
    );

    // 3.12 Operador legítimo do Infesto avança lote para Calandra -> Permitido 200
    const resOpInfestoComplete = await fetch(`${baseUrl}/api/production/batches/${batchInfesto.id}/complete-and-forward`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOpInfesto}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234", notes: "Avanço legítimo Infesto para Calandra" }),
    });
    assertTest(resOpInfestoComplete.status === 200, "3.12 Operador legítimo do Infesto avança lote com assinatura PIN (200 OK)");

    console.log("\n================================================================================");
    console.log(`=== RESULTADO FINAL RBAC: ${passedTests}/${totalTests} TESTES APROVADOS COM SUCESSO! ===`);
    console.log("================================================================================\n");
  } finally {
    if (server.listening) {
      server.close();
    }
  }
}

runRbacCorrectionTests().catch((err) => {
  console.error("Falha fatal na suíte de testes de correções RBAC:", err);
  process.exit(1);
});
