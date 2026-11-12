import path from "path";
import fs from "fs";
import http from "http";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { generateToken, hashPassword, hashPin } from "../src/utils/security.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

export async function runAuditCorrectionsTests() {
  console.log("================================================================================");
  console.log("=== SUÍTE DE TESTES ESPECÍFICOS — COMANDO 09 (RESSALVAS AUDITORIA RBAC & PCP) ===");
  console.log("================================================================================");

  // 1. Fail-Safe: Comprovar isolamento do banco
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
    const pwdHash = await hashPassword("senhaSegura123");
    const pinHash = await hashPin("1234");

    const sectors = await prisma.sector.findMany({ orderBy: { sequenceOrder: "asc" } });
    const secVendas = sectors.find((s) => s.code === "VENDAS")!;
    const secCalandra = sectors.find((s) => s.code === "CALANDRA")!;
    const secSeparacao = sectors.find((s) => s.code === "SEPARACAO")!;
    const sec11 = sectors.find((s) => s.sequenceOrder === 11)!;
    const sec12 = sectors.find((s) => s.sequenceOrder === 12)!;
    const sec13 = sectors.find((s) => s.sequenceOrder === 13)!;
    const sec14 = sectors.find((s) => s.sequenceOrder === 14)!;

    // Criar usuários: Admin, Gestor, Vendedor A, Vendedor B
    const userAdmin = await prisma.user.upsert({
      where: { email: "cmd09_admin@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Admin Cmd09", email: "cmd09_admin@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "ADMIN", isActive: true },
    });

    const userGestor = await prisma.user.upsert({
      where: { email: "cmd09_gestor@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Gestor Cmd09", email: "cmd09_gestor@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "GESTOR", isActive: true },
    });

    const userSellerA = await prisma.user.upsert({
      where: { email: "cmd09_vendedor_a@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Vendedor A Cmd09", email: "cmd09_vendedor_a@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "VENDEDOR", sectorId: secVendas.id, isActive: true },
    });

    const userSellerB = await prisma.user.upsert({
      where: { email: "cmd09_vendedor_b@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Vendedor B Cmd09", email: "cmd09_vendedor_b@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "VENDEDOR", sectorId: secVendas.id, isActive: true },
    });

    const tokenAdmin = generateToken({ userId: userAdmin.id });
    const tokenGestor = generateToken({ userId: userGestor.id });
    const tokenSellerA = generateToken({ userId: userSellerA.id });
    const tokenSellerB = generateToken({ userId: userSellerB.id });

    // =========================================================================
    // SEÇÃO 1: CORREÇÃO 1 — SECTOR_SEQUENCE E DEVOLUÇÕES (/return)
    // =========================================================================
    console.log("\n--- [SEÇÃO 1] Testes da Sequência Completa e Devolução de Lotes (/return) ---");

    // Setup de OP e lotes para os testes de produção
    const customerProd = await prisma.customer.create({
      data: { companyName: "Cliente Prod Cmd09", contactName: "Contato Prod", phone: "11988880001" },
    });

    const opProd = await prisma.productionOrder.create({
      data: {
        opNumber: `OP-C09-${Date.now()}`,
        title: "Uniforme Cmd09 Test",
        productType: "Uniformes",
        customerId: customerProd.id,
        totalQuantityOrdered: 100,
        totalQuantityDone: 0,
        status: "IN_PRODUCTION",
      },
    });

    // Lote em SEPARACAO (setor 10)
    const batchSeparacao = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-C09-SEP-${Date.now()}`,
        productionOrderId: opProd.id,
        currentSectorId: secSeparacao.id,
        quantity: 50,
        batchStatus: "WAITING",
      },
    });

    // Lote em CALANDRA (setor 09)
    const batchCalandra = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-C09-CAL-${Date.now()}`,
        productionOrderId: opProd.id,
        currentSectorId: secCalandra.id,
        quantity: 50,
        batchStatus: "WAITING",
      },
    });

    // Teste 1: Devolução válida (de SEPARACAO para CALANDRA)
    const resDevValida = await fetch(`${baseUrl}/api/production/batches/${batchSeparacao.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ pin: "1234", targetSectorCode: "CALANDRA", reason: "Defeito de termotransferência identificado na separação" }),
    });
    const bodyDevValida = (await resDevValida.json()) as any;
    assertTest(resDevValida.status === 200 && bodyDevValida.batch.isUnderRework === true, "1. Devolução válida para setor anterior (Separação -> Calandra) aceita com 200 OK");

    // Teste 2: Devolução para setor posterior (bloqueada com 400) - Calandra tentando devolver para Separação
    const resDevPosterior = await fetch(`${baseUrl}/api/production/batches/${batchCalandra.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ pin: "1234", targetSectorCode: "SEPARACAO", reason: "Tentativa indevida de retorno para frente" }),
    });
    assertTest(resDevPosterior.status === 400, "2. Devolução para setor posterior (Calandra -> Separação) bloqueada com 400");

    // Teste 3: Setor inexistente na sequência (bloqueado com 400)
    const resDevInexistente = await fetch(`${baseUrl}/api/production/batches/${batchCalandra.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ pin: "1234", targetSectorCode: "SETOR_FANTASMA", reason: "Tentativa com setor inexistente" }),
    });
    assertTest(resDevInexistente.status === 400, "3. Devolução com setor de destino inexistente na sequência bloqueada com 400");

    // Teste 4: Devolução partindo do Setor 11
    const batch11 = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-C09-S11-${Date.now()}`,
        productionOrderId: opProd.id,
        currentSectorId: sec11.id,
        quantity: 20,
        batchStatus: "WAITING",
      },
    });
    const resDev11 = await fetch(`${baseUrl}/api/production/batches/${batch11.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ pin: "1234", targetSectorCode: "SEPARACAO", reason: "Retorno da oficina/costura para separação conferir" }),
    });
    assertTest(resDev11.status === 200, "4. Devolução válida partindo do Setor 11 aceita com 200 OK");

    // Teste 5: Devolução partindo do Setor 12
    const batch12 = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-C09-S12-${Date.now()}`,
        productionOrderId: opProd.id,
        currentSectorId: sec12.id,
        quantity: 20,
        batchStatus: "WAITING",
      },
    });
    const resDev12 = await fetch(`${baseUrl}/api/production/batches/${batch12.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ pin: "1234", targetSectorCode: "SEPARACAO", reason: "Retorno da qualidade para separação" }),
    });
    assertTest(resDev12.status === 200, "5. Devolução válida partindo do Setor 12 aceita com 200 OK");

    // Teste 6: Devolução partindo do Setor 13
    const batch13 = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-C09-S13-${Date.now()}`,
        productionOrderId: opProd.id,
        currentSectorId: sec13.id,
        quantity: 20,
        batchStatus: "WAITING",
      },
    });
    const resDev13 = await fetch(`${baseUrl}/api/production/batches/${batch13.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ pin: "1234", targetSectorCode: "SEPARACAO", reason: "Retorno da embalagem para separação" }),
    });
    assertTest(resDev13.status === 200, "6. Devolução válida partindo do Setor 13 aceita com 200 OK");

    // Teste 7: Devolução partindo do Setor 14
    const batch14 = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-C09-S14-${Date.now()}`,
        productionOrderId: opProd.id,
        currentSectorId: sec14.id,
        quantity: 20,
        batchStatus: "WAITING",
      },
    });
    const resDev14 = await fetch(`${baseUrl}/api/production/batches/${batch14.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ pin: "1234", targetSectorCode: "SEPARACAO", reason: "Retorno da entrega/expedição para separação" }),
    });
    assertTest(resDev14.status === 200, "7. Devolução válida partindo do Setor 14 aceita com 200 OK");

    // =========================================================================
    // SEÇÃO 2: CORREÇÃO 2 — PROPRIEDADE HORIZONTAL EM VENDAS
    // =========================================================================
    console.log("\n--- [SEÇÃO 2] Testes de Propriedade Horizontal em Vendas (Cotações e Clientes) ---");

    // Criar Cliente e Cotação do Vendedor B
    const customerB = await prisma.customer.create({
      data: { companyName: "Cliente Vendedor B", contactName: "Contato B", phone: "11988880002", sellerId: userSellerB.id },
    });

    const quotB = await prisma.quotation.create({
      data: {
        quotationNumber: `ORC-C09-B-${Date.now()}`,
        teamName: "Time Vendedor B",
        customerId: customerB.id,
        sellerId: userSellerB.id,
        status: "NOVA_SOLICITACAO",
        totalQuantity: 25,
        budgetAmount: 1500,
      },
    });

    // Criar Cliente e Cotação do Vendedor A
    const customerA = await prisma.customer.create({
      data: { companyName: "Cliente Vendedor A", contactName: "Contato A", phone: "11988880003", sellerId: userSellerA.id },
    });

    const quotA = await prisma.quotation.create({
      data: {
        quotationNumber: `ORC-C09-A-${Date.now()}`,
        teamName: "Time Vendedor A",
        customerId: customerA.id,
        sellerId: userSellerA.id,
        status: "NOVA_SOLICITACAO",
        totalQuantity: 30,
        budgetAmount: 2000,
      },
    });

    // Teste 8: Vendedor A tenta alterar status da cotação do Vendedor B (bloqueado com 403)
    const resVendedorAAlteraStatusB = await fetch(`${baseUrl}/api/quotations/${quotB.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({ status: "ORCAMENTO_PREPARACAO" }),
    });
    assertTest(resVendedorAAlteraStatusB.status === 403, "8. Vendedor A alterando status da cotação do Vendedor B é bloqueado com 403");

    // Teste 9: Vendedor A tenta alterar dados da cotação do Vendedor B (bloqueado com 403)
    const resVendedorAAlteraDadosB = await fetch(`${baseUrl}/api/quotations/${quotB.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({ teamName: "Nome Invasor" }),
    });
    assertTest(resVendedorAAlteraDadosB.status === 403, "9. Vendedor A alterando dados da cotação do Vendedor B é bloqueado com 403");

    // Teste 10: Vendedor A tenta anexar arquivo na cotação do Vendedor B (bloqueado com 403)
    const resVendedorAAnexaB = await fetch(`${baseUrl}/api/quotations/${quotB.id}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({ fileName: "anexo.png", fileType: "REFERENCE", fileUrl: "/uploads/teste.png" }),
    });
    assertTest(resVendedorAAnexaB.status === 403, "10. Vendedor A anexando arquivo na cotação do Vendedor B é bloqueado com 403");

    // Teste 11: Vendedor A tenta alterar cliente do Vendedor B (bloqueado com 403)
    const resVendedorAAlteraClienteB = await fetch(`${baseUrl}/api/customers/${customerB.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({ companyName: "Nome Alterado por Vendedor A" }),
    });
    assertTest(resVendedorAAlteraClienteB.status === 403, "11. Vendedor A alterando cliente do Vendedor B é bloqueado com 403");

    // Teste 12: Vendedor A altera status de sua própria cotação (200 OK)
    const resVendedorAAlteraStatusProprio = await fetch(`${baseUrl}/api/quotations/${quotA.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({ status: "ORCAMENTO_PREPARACAO" }),
    });
    assertTest(resVendedorAAlteraStatusProprio.status === 200, "12. Vendedor A alterando status de sua própria cotação tem sucesso (200 OK)");

    // Teste 13: Vendedor A altera dados de sua própria cotação (200 OK)
    const resVendedorAAlteraDadosProprio = await fetch(`${baseUrl}/api/quotations/${quotA.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({ teamName: "Time Vendedor A Atualizado" }),
    });
    assertTest(resVendedorAAlteraDadosProprio.status === 200, "13. Vendedor A alterando dados de sua própria cotação tem sucesso (200 OK)");

    // Teste 14: Vendedor A altera dados de seu próprio cliente (200 OK)
    const resVendedorAAlteraClienteProprio = await fetch(`${baseUrl}/api/customers/${customerA.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({ contactName: "Contato A Atualizado" }),
    });
    assertTest(resVendedorAAlteraClienteProprio.status === 200, "14. Vendedor A alterando seu próprio cliente tem sucesso (200 OK)");

    // Teste 15: ADMIN altera status de qualquer cotação (200 OK)
    const resAdminAlteraStatus = await fetch(`${baseUrl}/api/quotations/${quotB.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ status: "ORCAMENTO_PREPARACAO" }),
    });
    assertTest(resAdminAlteraStatus.status === 200, "15. ADMIN alterando status de cotação do Vendedor B tem sucesso (200 OK)");

    // Teste 16: ADMIN altera dados de qualquer cotação (200 OK)
    const resAdminAlteraDados = await fetch(`${baseUrl}/api/quotations/${quotB.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ teamName: "Time B Atualizado por Admin" }),
    });
    assertTest(resAdminAlteraDados.status === 200, "16. ADMIN alterando dados de cotação do Vendedor B tem sucesso (200 OK)");

    // Teste 17: GESTOR altera status de qualquer cotação (200 OK)
    const resGestorAlteraStatus = await fetch(`${baseUrl}/api/quotations/${quotA.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenGestor}` },
      body: JSON.stringify({ status: "ORCAMENTO_ENVIADO" }),
    });
    assertTest(resGestorAlteraStatus.status === 200, "17. GESTOR alterando status de cotação do Vendedor A tem sucesso (200 OK)");

    // Teste 18: GESTOR altera dados de qualquer cotação (200 OK)
    const resGestorAlteraDados = await fetch(`${baseUrl}/api/quotations/${quotA.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenGestor}` },
      body: JSON.stringify({ teamName: "Time A Atualizado por Gestor" }),
    });
    assertTest(resGestorAlteraDados.status === 200, "18. GESTOR alterando dados de cotação do Vendedor A tem sucesso (200 OK)");

    // Teste 19: ADMIN altera cliente de qualquer vendedor (200 OK)
    const resAdminAlteraCliente = await fetch(`${baseUrl}/api/customers/${customerB.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ contactName: "Contato B Atualizado por Admin" }),
    });
    assertTest(resAdminAlteraCliente.status === 200, "19. ADMIN alterando cliente de qualquer vendedor tem sucesso (200 OK)");

    // Teste 20: GESTOR altera cliente de qualquer vendedor (200 OK)
    const resGestorAlteraCliente = await fetch(`${baseUrl}/api/customers/${customerA.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenGestor}` },
      body: JSON.stringify({ contactName: "Contato A Atualizado por Gestor" }),
    });
    assertTest(resGestorAlteraCliente.status === 200, "20. GESTOR alterando cliente de qualquer vendedor tem sucesso (200 OK)");

    // Teste 21: Cliente sem sellerId -> Vendedor A tentando alterar é bloqueado com 403
    const customerNoSeller = await prisma.customer.create({
      data: { companyName: "Cliente Sem Vendedor", contactName: "Orfao", phone: "11988880099", sellerId: null },
    });
    const resVendedorAlteraOrfao = await fetch(`${baseUrl}/api/customers/${customerNoSeller.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({ contactName: "Tentativa Vendedor" }),
    });
    assertTest(resVendedorAlteraOrfao.status === 403, "21. Vendedor tentando alterar cliente sem sellerId é bloqueado com 403");

    // Teste 22: Cliente sem sellerId -> GESTOR consegue alterar com 200 OK
    const resGestorAlteraOrfao = await fetch(`${baseUrl}/api/customers/${customerNoSeller.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenGestor}` },
      body: JSON.stringify({ contactName: "Contato Atualizado Gestor" }),
    });
    assertTest(resGestorAlteraOrfao.status === 200, "22. GESTOR alterando cliente sem sellerId tem sucesso (200 OK)");

    // Teste 23: Vendedor A criando cliente via POST /api/customers define sellerId automaticamente
    const resCriarCliente = await fetch(`${baseUrl}/api/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSellerA}` },
      body: JSON.stringify({
        companyName: `Empresa Nova Vendedor A ${Date.now()}`,
        contactName: "Novo Contato",
        phone: `119${Math.floor(10000000 + Math.random() * 90000000)}`,
      }),
    });
    const bodyCriarCliente = (await resCriarCliente.json()) as any;
    assertTest(resCriarCliente.status === 201 && bodyCriarCliente.sellerId === userSellerA.id, "23. Vendedor criando cliente via POST /api/customers vincula sellerId automaticamente");

    // Teste 24: Vendedor B tentando excluir cliente do Vendedor A é bloqueado com 403
    const resVendedorBDeletaA = await fetch(`${baseUrl}/api/customers/${customerA.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenSellerB}` },
    });
    assertTest(resVendedorBDeletaA.status === 403, "24. Vendedor B tentando excluir cliente do Vendedor A é bloqueado com 403");

    console.log(`\n================================================================================`);
    console.log(`=== RESULTADO SUÍTE COMANDO 09: ${passedTests}/${totalTests} testes aprovados ===`);
    console.log(`================================================================================\n`);
  } finally {
    server.close();
  }
}

if (process.argv[1]?.includes("audit-corrections.test")) {
  runAuditCorrectionsTests().catch((err) => {
    console.error("Erro na execução:", err);
    process.exit(1);
  });
}
