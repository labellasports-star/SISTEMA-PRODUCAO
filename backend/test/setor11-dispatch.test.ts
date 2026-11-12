import path from "path";
import fs from "fs";
import http from "http";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { generateToken, hashPassword, hashPin } from "../src/utils/security.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

export async function runSetor11DispatchTests() {
  console.log("================================================================================");
  console.log("=== SUÍTE DE TESTES ESPECÍFICOS — COMANDO 10 (SETOR 11: DESPACHE OFICINA) ===");
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
    const pwdHash = await hashPassword("senhaSegura123");
    const pinHash = await hashPin("1234");

    const sectors = await prisma.sector.findMany({ orderBy: { sequenceOrder: "asc" } });
    const secDespache = sectors.find((s) => s.code === "DESPACHE_OFICINA" || s.sequenceOrder === 11)!;
    const secCostura = sectors.find((s) => s.code === "COSTURA" || s.sequenceOrder === 12)!;
    const secImpressao = sectors.find((s) => s.code === "IMPRESSAO")!;
    const secVendas = sectors.find((s) => s.code === "VENDAS")!;
    const secDesign = sectors.find((s) => s.code === "DESIGNER" || s.code === "DESIGN")!;

    // Criar usuários específicos do teste
    const userAdmin = await prisma.user.upsert({
      where: { email: "c10_admin@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Admin C10", email: "c10_admin@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "ADMIN", isActive: true },
    });

    const userGestor = await prisma.user.upsert({
      where: { email: "c10_gestor@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Gestor C10", email: "c10_gestor@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "GESTOR", isActive: true },
    });

    const userOpDespache = await prisma.user.upsert({
      where: { email: "c10_op_despache@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Op Despache C10", email: "c10_op_despache@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "OPERADOR", sectorId: secDespache.id, isActive: true },
    });

    const userOpImpressao = await prisma.user.upsert({
      where: { email: "c10_op_impressao@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Op Impressão C10", email: "c10_op_impressao@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "OPERADOR", sectorId: secImpressao.id, isActive: true },
    });

    const userSeller = await prisma.user.upsert({
      where: { email: "c10_vendedor@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Vendedor C10", email: "c10_vendedor@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "VENDEDOR", sectorId: secVendas.id, isActive: true },
    });

    const userDesigner = await prisma.user.upsert({
      where: { email: "c10_designer@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Designer C10", email: "c10_designer@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "DESIGNER", sectorId: secDesign.id, isActive: true },
    });

    const tokenAdmin = generateToken({ userId: userAdmin.id });
    const tokenGestor = generateToken({ userId: userGestor.id });
    const tokenOpDespache = generateToken({ userId: userOpDespache.id });
    const tokenOpImpressao = generateToken({ userId: userOpImpressao.id });
    const tokenSeller = generateToken({ userId: userSeller.id });
    const tokenDesigner = generateToken({ userId: userDesigner.id });

    // Criar oficinas de costura para o teste
    const partnerAtiva = await prisma.sewingPartner.create({
      data: {
        name: "Oficina Confecções Primavera Ltda",
        type: "EXTERNAL",
        contactPerson: "Dona Maria",
        phone: "11999991111",
        basePricePerPc: 5.0,
        isActive: true,
      },
    });

    const partnerInativa = await prisma.sewingPartner.create({
      data: {
        name: "Oficina Desativada Ltda",
        type: "EXTERNAL",
        contactPerson: "Seu José",
        phone: "11999992222",
        basePricePerPc: 4.0,
        isActive: false,
      },
    });

    // Criar Cliente e OP
    const customer = await prisma.customer.create({
      data: { companyName: "Cliente Despache C10", contactName: "Contato C10", phone: "11988880010" },
    });

    const op = await prisma.productionOrder.create({
      data: {
        opNumber: `OP-C10-${Date.now()}`,
        title: "Uniformes para Oficina C10",
        productType: "Camisas Polo",
        customerId: customer.id,
        totalQuantityOrdered: 100,
        totalQuantityDone: 0,
        status: "IN_PRODUCTION",
      },
    });

    // Lote 1 no setor 11 (DESPACHE_OFICINA), quantidade 50
    const batch1 = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-C10-01-${Date.now()}`,
        productionOrderId: op.id,
        currentSectorId: secDespache.id,
        quantity: 50,
        batchStatus: "WAITING",
      },
    });

    // Lote 2 no setor 11 (DESPACHE_OFICINA), quantidade 30
    const batch2 = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-C10-02-${Date.now()}`,
        productionOrderId: op.id,
        currentSectorId: secDespache.id,
        quantity: 30,
        batchStatus: "WAITING",
      },
    });

    const dataFutura = new Date();
    dataFutura.setDate(dataFutura.getDate() + 7);
    const dataFuturaIso = dataFutura.toISOString();

    const dataPassada = new Date();
    dataPassada.setDate(dataPassada.getDate() - 2);
    const dataPassadaIso = dataPassada.toISOString();

    console.log("\n--- Executando Testes de Despache para Oficina ---");

    // =========================================================================
    // TESTE 1: Despache válido gera romaneio e avança o lote para COSTURA
    // =========================================================================
    const resDespache1 = await fetch(`${baseUrl}/api/production/batches/${batch1.id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpDespache}` },
      body: JSON.stringify({
        sewingPartnerId: partnerAtiva.id,
        expectedReturnDate: dataFuturaIso,
        sizeGridBreakdown: { P: 10, M: 20, G: 20 }, // soma = 50
        pin: "1234",
        notes: "Remessa prioritária de camisas polo",
      }),
    });
    const bodyDespache1 = (await resDespache1.json()) as any;
    assertTest(
      resDespache1.status === 201 &&
        bodyDespache1.manifest &&
        bodyDespache1.manifest.manifestNumber.startsWith("RE-") &&
        bodyDespache1.batch.currentSectorId === secCostura.id,
      "1. Despache válido gera romaneio RE-YYYY-XXXXX e avança o lote para COSTURA (201 Created)"
    );

    const manifest1 = bodyDespache1.manifest;

    // =========================================================================
    // TESTE 2: Oficina inexistente ou inativa bloqueada (400)
    // =========================================================================
    const resOficinaInativa = await fetch(`${baseUrl}/api/production/batches/${batch2.id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpDespache}` },
      body: JSON.stringify({
        sewingPartnerId: partnerInativa.id,
        expectedReturnDate: dataFuturaIso,
        sizeGridBreakdown: { P: 10, M: 20 },
        pin: "1234",
      }),
    });
    assertTest(resOficinaInativa.status === 400, "2. Oficina inativa é rejeitada com 400 Bad Request");

    // =========================================================================
    // TESTE 3: Prazo no passado bloqueado (400)
    // =========================================================================
    const resPrazoPassado = await fetch(`${baseUrl}/api/production/batches/${batch2.id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpDespache}` },
      body: JSON.stringify({
        sewingPartnerId: partnerAtiva.id,
        expectedReturnDate: dataPassadaIso,
        sizeGridBreakdown: { P: 10, M: 20 },
        pin: "1234",
      }),
    });
    assertTest(resPrazoPassado.status === 400, "3. Prazo de retorno no passado é bloqueado com 400 Bad Request");

    // =========================================================================
    // TESTE 4: Quantidade incoerente com a grade bloqueada (400)
    // =========================================================================
    // batch2 tem quantidade 30, enviamos grade somando 25
    const resGradeIncoerente = await fetch(`${baseUrl}/api/production/batches/${batch2.id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpDespache}` },
      body: JSON.stringify({
        sewingPartnerId: partnerAtiva.id,
        expectedReturnDate: dataFuturaIso,
        sizeGridBreakdown: { P: 10, M: 15 }, // soma 25 != 30
        pin: "1234",
      }),
    });
    assertTest(resGradeIncoerente.status === 400, "4. Quantidade da grade divergente da quantidade do lote é bloqueada com 400");

    // =========================================================================
    // TESTE 5: Despache sem PIN ou com PIN errado bloqueado (403)
    // =========================================================================
    const resPinErrado = await fetch(`${baseUrl}/api/production/batches/${batch2.id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpDespache}` },
      body: JSON.stringify({
        sewingPartnerId: partnerAtiva.id,
        expectedReturnDate: dataFuturaIso,
        sizeGridBreakdown: { P: 10, M: 20 },
        pin: "9999",
      }),
    });
    assertTest(resPinErrado.status === 403, "5. Despache com PIN de assinatura incorreto é bloqueado com 403 Forbidden");

    // =========================================================================
    // TESTE 6: Operador de outro setor, VENDEDOR e DESIGNER bloqueados (403)
    // =========================================================================
    const resVendedor = await fetch(`${baseUrl}/api/production/batches/${batch2.id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSeller}` },
      body: JSON.stringify({ sewingPartnerId: partnerAtiva.id, expectedReturnDate: dataFuturaIso, sizeGridBreakdown: { P: 10, M: 20 }, pin: "1234" }),
    });
    const resDesigner = await fetch(`${baseUrl}/api/production/batches/${batch2.id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenDesigner}` },
      body: JSON.stringify({ sewingPartnerId: partnerAtiva.id, expectedReturnDate: dataFuturaIso, sizeGridBreakdown: { P: 10, M: 20 }, pin: "1234" }),
    });
    const resOpImpressao = await fetch(`${baseUrl}/api/production/batches/${batch2.id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpImpressao}` },
      body: JSON.stringify({ sewingPartnerId: partnerAtiva.id, expectedReturnDate: dataFuturaIso, sizeGridBreakdown: { P: 10, M: 20 }, pin: "1234" }),
    });

    assertTest(
      resVendedor.status === 403 && resDesigner.status === 403 && resOpImpressao.status === 403,
      "6. Vendedor, Designer e Operador de outro setor são bloqueados com 403 Forbidden"
    );

    // =========================================================================
    // TESTE 7: Reimpressão mantém o número do romaneio e gera entrada no AuditLog
    // =========================================================================
    const resReimpressao = await fetch(`${baseUrl}/api/production/dispatch/manifests/${manifest1.id}/reprint`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpDespache}` },
      body: JSON.stringify({ reason: "Segunda via para o motorista da transportadora" }),
    });
    const bodyReimpressao = (await resReimpressao.json()) as any;

    const auditReimpressao = await prisma.auditLog.findFirst({
      where: {
        entityName: "DispatchManifest",
        entityId: manifest1.id,
        action: "MANIFEST_REPRINTED",
      },
    });

    assertTest(
      resReimpressao.status === 200 &&
        bodyReimpressao.manifest.manifestNumber === manifest1.manifestNumber &&
        bodyReimpressao.manifest.reprintCount === 1 &&
        Boolean(auditReimpressao),
      "7. Reimpressão mantém o mesmo manifestNumber, incrementa reprintCount e gera AuditLog"
    );

    // =========================================================================
    // TESTE 8: Numeração sequencial sem duplicidade (RE-YYYY-XXXXX)
    // =========================================================================
    const resDespache2 = await fetch(`${baseUrl}/api/production/batches/${batch2.id}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpDespache}` },
      body: JSON.stringify({
        sewingPartnerId: partnerAtiva.id,
        expectedReturnDate: dataFuturaIso,
        sizeGridBreakdown: { P: 10, M: 20 }, // soma = 30
        pin: "1234",
      }),
    });
    const bodyDespache2 = (await resDespache2.json()) as any;
    const manifest2 = bodyDespache2.manifest;

    const num1 = parseInt(manifest1.manifestNumber.split("-")[2], 10);
    const num2 = parseInt(manifest2.manifestNumber.split("-")[2], 10);

    assertTest(
      resDespache2.status === 201 &&
        manifest1.manifestNumber !== manifest2.manifestNumber &&
        num2 === num1 + 1,
      `8. Numeração sequencial atômica sem duplicidade comprovada (${manifest1.manifestNumber} -> ${manifest2.manifestNumber})`
    );

    console.log(`\n================================================================================`);
    console.log(`=== RESULTADO SUÍTE COMANDO 10: ${passedTests}/${totalTests} testes aprovados ===`);
    console.log(`================================================================================\n`);
  } finally {
    server.close();
  }
}

if (process.argv[1]?.includes("setor11-dispatch.test")) {
  runSetor11DispatchTests().catch((err) => {
    console.error("Erro na execução:", err);
    process.exit(1);
  });
}
