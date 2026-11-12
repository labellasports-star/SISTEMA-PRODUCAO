import path from "path";
import fs from "fs";
import http from "http";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { generateToken, hashPassword, hashPin } from "../src/utils/security.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

export async function runSetor13QualidadeTests() {
  console.log("================================================================================");
  console.log("=== SUÍTE DE TESTES ESPECÍFICOS — COMANDO 12 (SETOR 13: QUALIDADE PÓS-COSTURA) ===");
  console.log("================================================================================");

  // 1. Fail-Safe: Comprovar execução isolada no test.db
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
    const pwdHash = await hashPassword("senhaQualidade123");
    const pinHash = await hashPin("1234");
    const wrongPin = "9999";

    const sectors = await prisma.sector.findMany({ orderBy: { sequenceOrder: "asc" } });
    const secCostura = sectors.find((s) => s.code === "COSTURA" || s.sequenceOrder === 12)!;
    const secQualidade = sectors.find((s) => s.code === "QUALIDADE" || s.sequenceOrder === 13)!;
    const secExpedicao = sectors.find((s) => s.code === "EXPEDICAO" || s.sequenceOrder === 14)!;
    const secDespache = sectors.find((s) => s.code === "DESPACHE_OFICINA" || s.sequenceOrder === 11)!;
    const secSeparacao = sectors.find((s) => s.code === "SEPARACAO" || s.sequenceOrder === 10)!;
    const secVendas = sectors.find((s) => s.code === "VENDAS")!;

    // 2. Criação dos Usuários de Teste
    const userAdmin = await prisma.user.upsert({
      where: { email: "c12_admin@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Admin C12", email: "c12_admin@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "ADMIN", isActive: true },
    });

    const userGestor = await prisma.user.upsert({
      where: { email: "c12_gestor@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Gestor C12", email: "c12_gestor@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "GESTOR", isActive: true },
    });

    const userOpQualidade = await prisma.user.upsert({
      where: { email: "c12_qualidade@fabrica.com" },
      update: { signaturePinHash: pinHash, sectorId: secQualidade.id },
      create: { name: "Operador Qualidade C12", email: "c12_qualidade@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "OPERADOR", sectorId: secQualidade.id, isActive: true },
    });

    const userOpCostura = await prisma.user.upsert({
      where: { email: "c12_costura@fabrica.com" },
      update: { signaturePinHash: pinHash, sectorId: secCostura.id },
      create: { name: "Operador Costura C12", email: "c12_costura@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "OPERADOR", sectorId: secCostura.id, isActive: true },
    });

    const userOpVendas = await prisma.user.upsert({
      where: { email: "c12_vendas@fabrica.com" },
      update: { signaturePinHash: pinHash, sectorId: secVendas.id },
      create: { name: "Vendedor C12", email: "c12_vendas@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "VENDEDOR", sectorId: secVendas.id, isActive: true },
    });

    const tokenAdmin = generateToken({ userId: userAdmin.id });
    const tokenGestor = generateToken({ userId: userGestor.id });
    const tokenOpQualidade = generateToken({ userId: userOpQualidade.id });
    const tokenOpCostura = generateToken({ userId: userOpCostura.id });
    const tokenOpVendas = generateToken({ userId: userOpVendas.id });

    // Cliente e Parceiros de Oficina
    const customer = await prisma.customer.upsert({
      where: { id: "00000000-0000-0000-0000-000000000099" },
      update: {},
      create: {
        id: "00000000-0000-0000-0000-000000000099",
        companyName: "Cliente Teste Setor 13",
        contactName: "Lucas Qualidade",
        email: "lucas@cliente13.com",
        phone: "(11) 95555-4444",
      },
    });

    const partnerExternal = await prisma.sewingPartner.upsert({
      where: { id: "00000000-0000-0000-0000-000000000013" },
      update: {},
      create: {
        id: "00000000-0000-0000-0000-000000000013",
        name: "Oficina Perfeita de Costura Ltda",
        type: "EXTERNAL",
        documentNumber: "33.444.555/0001-33",
        contactPerson: "Dona Maria",
        phone: "(11) 94444-3333",
        basePricePerPc: 5.0,
        isActive: true,
      },
    });

    // Helper para criar OP e lote
    let opCounter = 1;
    async function createTestBatch(qty: number, currentSectorId: string, batchStatus: string = "WAITING") {
      const opNum = `OP-2026-Q${Date.now().toString().slice(-4)}${opCounter++}`;
      const op = await prisma.productionOrder.create({
        data: {
          opNumber: opNum,
          customerId: customer.id,
          title: `Lote Teste Qualidade ${opNum}`,
          productType: "Camisa",
          totalQuantityOrdered: qty,
          totalQuantityDone: 0,
        },
      });

      const batch = await prisma.opBatch.create({
        data: {
          batchNumber: `${opNum}-L01`,
          productionOrderId: op.id,
          quantity: qty,
          currentSectorId,
          batchStatus,
        },
      });

      return { op, batch };
    }

    // Buscar tipo de defeito MANCHA
    const defectMancha = await prisma.defectType.findUnique({ where: { code: "MANCHA" } });
    const defectCosturaTorta = await prisma.defectType.findUnique({ where: { code: "COSTURA_TORTA" } });

    // =========================================================================
    // CENÁRIO 1: COSTURA -> QUALIDADE deixa lote em QUALIDADE com status PENDING e quantidade igual às recebidas OK
    // =========================================================================
    console.log("\n[Cenário 1] Transição COSTURA -> QUALIDADE deixa lote com status PENDING e quantidade recebida OK");
    const { batch: batch1 } = await createTestBatch(50, secCostura.id, "IN_PROGRESS");
    const manifest1 = await prisma.dispatchManifest.create({
      data: {
        manifestNumber: `RE-2026-Q${Date.now().toString().slice(-5)}1`,
        opBatchId: batch1.id,
        productionOrderId: batch1.productionOrderId,
        sewingPartnerId: partnerExternal.id,
        totalQuantity: 50,
        sizeGridBreakdown: JSON.stringify({ G: 50 }),
        expectedReturnDate: new Date(Date.now() + 86400000),
        createdById: userAdmin.id,
        receiptStatus: "CLOSED",
        isReceiptClosed: true,
      },
    });

    // Criar recebimento com 45 peças OK e 5 avariadas
    await prisma.sewingReceipt.create({
      data: {
        dispatchManifestId: manifest1.id,
        opBatchId: batch1.id,
        receiptNumber: 1,
        operatorId: userOpCostura.id,
        totalReceivedOk: 45,
        totalDamaged: 5,
        totalMissing: 0,
      },
    });

    const resFwdCostura = await fetch(`${baseUrl}/api/production/batches/${batch1.id}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpCostura}` },
      body: JSON.stringify({
        pin: "1234",
        notes: "Costura finalizada, recebidas 45 OK",
      }),
    });

    assertTest(resFwdCostura.status === 200, "Avanço de Costura para Qualidade aceito com sucesso (200)");
    const updatedBatch1 = await prisma.opBatch.findUnique({ where: { id: batch1.id } });
    assertTest(
      updatedBatch1?.currentSectorId === secQualidade.id &&
      updatedBatch1?.batchStatus === "PENDING" &&
      updatedBatch1?.quantity === 45,
      "Lote avançou para QUALIDADE com batchStatus PENDING e quantidade ajustada para 45"
    );

    // =========================================================================
    // CENÁRIO 2: Lote em retrabalho COSTURA -> QUALIDADE avança sem exigir novo romaneio/recebimento
    // =========================================================================
    console.log("\n[Cenário 2] Lote em retrabalho COSTURA -> QUALIDADE avança sem novo romaneio de oficina");
    const { batch: batchRework } = await createTestBatch(10, secCostura.id, "WAITING");
    await prisma.opBatch.update({
      where: { id: batchRework.id },
      data: {
        isUnderRework: true,
        reworkOriginSectorId: secQualidade.id,
        reworkReason: "Costura torta a consertar",
      },
    });

    // Avançar da Costura sem nenhum DispatchManifest cadastrado para este sublote
    const resReworkForward = await fetch(`${baseUrl}/api/production/batches/${batchRework.id}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpCostura}` },
      body: JSON.stringify({
        pin: "1234",
        reworkQuantity: 10,
        notes: "Peças retrabalhadas e consertadas com sucesso",
      }),
    });

    assertTest(resReworkForward.status === 200, "Avanço de lote de retrabalho na Costura permitido sem romaneio de oficina (200)");
    const updatedBatchRework = await prisma.opBatch.findUnique({ where: { id: batchRework.id } });
    assertTest(
      updatedBatchRework?.currentSectorId === secQualidade.id &&
      updatedBatchRework?.batchStatus === "PENDING" &&
      updatedBatchRework?.isUnderRework === false,
      "Lote de retrabalho retornou a QUALIDADE com status PENDING e flag de retrabalho resetada"
    );

    // =========================================================================
    // CENÁRIO 3: Listagem de tipos de defeito liberada para QUALIDADE, GESTOR e ADMIN
    // =========================================================================
    console.log("\n[Cenário 3] Listagem de tipos de defeito liberada para QUALIDADE, GESTOR e ADMIN");
    const resTypesQual = await fetch(`${baseUrl}/api/production/quality/defect-types`, {
      headers: { Authorization: `Bearer ${tokenOpQualidade}` },
    });
    const resTypesGestor = await fetch(`${baseUrl}/api/production/quality/defect-types`, {
      headers: { Authorization: `Bearer ${tokenGestor}` },
    });
    const resTypesAdmin = await fetch(`${baseUrl}/api/production/quality/defect-types`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });

    assertTest(resTypesQual.status === 200, "Operador de Qualidade lista tipos de defeito com sucesso (200)");
    assertTest(resTypesGestor.status === 200, "Gestor lista tipos de defeito com sucesso (200)");
    assertTest(resTypesAdmin.status === 200, "Admin lista tipos de defeito com sucesso (200)");

    const dataTypes = await resTypesQual.json();
    assertTest(Array.isArray(dataTypes.defectTypes) && dataTypes.defectTypes.length >= 6, "Tipos de defeito padrão (mínimo 6) retornados");

    // =========================================================================
    // CENÁRIO 4: Operador de outro setor bloqueado de listar tipos de defeito (403)
    // =========================================================================
    console.log("\n[Cenário 4] Bloqueio de operador de outro setor ao listar tipos de defeito");
    const resTypesBlocked = await fetch(`${baseUrl}/api/production/quality/defect-types`, {
      headers: { Authorization: `Bearer ${tokenOpCostura}` },
    });
    assertTest(resTypesBlocked.status === 403, "Operador de Costura bloqueado de acessar tipos de defeito (403)");

    // =========================================================================
    // CENÁRIO 5: Criação/ativação/desativação de tipos de defeito permitida para GESTOR e ADMIN
    // =========================================================================
    console.log("\n[Cenário 5] Criação e alteração de tipos de defeito por GESTOR e ADMIN");
    const newCode = `NOVO_DEFEITO_${Date.now().toString().slice(-4)}`;
    const resCreateType = await fetch(`${baseUrl}/api/production/quality/defect-types`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenGestor}` },
      body: JSON.stringify({
        code: newCode,
        name: "Falta de Botão ou Zíper Quebrado",
      }),
    });

    assertTest(resCreateType.status === 201, "Gestor cadastrou novo tipo de defeito com sucesso (201)");
    const createdTypeData = await resCreateType.json();
    const createdTypeId = createdTypeData.defectType.id;

    // Toggle de ativação pelo Admin
    const resToggle = await fetch(`${baseUrl}/api/production/quality/defect-types/${createdTypeId}/toggle`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assertTest(resToggle.status === 200, "Admin alterou status (desativou) do tipo de defeito (200)");
    const toggledData = await resToggle.json();
    assertTest(toggledData.defectType.isActive === false, "Tipo de defeito agora está inativo (isActive = false)");

    // =========================================================================
    // CENÁRIO 6: Operador de QUALIDADE bloqueado de criar tipo de defeito (403)
    // =========================================================================
    console.log("\n[Cenário 6] Operador de QUALIDADE bloqueado de criar tipo de defeito");
    const resCreateBlocked = await fetch(`${baseUrl}/api/production/quality/defect-types`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpQualidade}` },
      body: JSON.stringify({
        code: "DEFEITO_OPERADOR",
        name: "Tentativa de cadastro por operador",
      }),
    });
    assertTest(resCreateBlocked.status === 403, "Operador de Qualidade bloqueado com 403 ao tentar criar tipo de defeito");

    // =========================================================================
    // CENÁRIO 7: APPROVED_TOTAL avança lote para EXPEDICAO com status PENDING e assinatura HMAC
    // =========================================================================
    console.log("\n[Cenário 7] APPROVED_TOTAL avança lote para EXPEDICAO com status PENDING e HMAC");
    const { batch: batchTotal } = await createTestBatch(30, secQualidade.id, "PENDING");

    const resApproveTotal = await fetch(`${baseUrl}/api/production/batches/${batchTotal.id}/quality-inspection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpQualidade}` },
      body: JSON.stringify({
        pin: "1234",
        result: "APPROVED_TOTAL",
        totalApproved: 30,
        totalDefective: 0,
        notes: "Lote 100% em conformidade com as fichas técnicas",
      }),
    });

    assertTest(resApproveTotal.status === 201, "Inspeção APPROVED_TOTAL concluída com sucesso (201)");
    const batchTotalAfter = await prisma.opBatch.findUnique({ where: { id: batchTotal.id } });
    assertTest(
      batchTotalAfter?.currentSectorId === secExpedicao.id &&
      batchTotalAfter?.batchStatus === "PENDING" &&
      batchTotalAfter?.quantity === 30,
      "Lote avançou integralmente para EXPEDICAO com status PENDING"
    );

    const fwdMovement = await prisma.opMovement.findFirst({
      where: { opBatchId: batchTotal.id, movementType: "FORWARD" },
      orderBy: { createdAt: "desc" },
    });
    assertTest(
      !!fwdMovement && fwdMovement.toSectorId === secExpedicao.id && !!fwdMovement.digitalSignatureHash,
      "Movimentação FORWARD para Expedição gerada com assinatura digital HMAC"
    );

    // =========================================================================
    // CENÁRIO 8: APPROVED_PARTIAL divide lote: aprovadas -> EXPEDICAO, defeituosas -> COSTURA
    // =========================================================================
    console.log("\n[Cenário 8] APPROVED_PARTIAL fraciona lote entre Expedição e Retrabalho na Costura");
    const { batch: batchPartial } = await createTestBatch(40, secQualidade.id, "PENDING");

    // Associar um romaneio para rastreabilidade de oficina
    const manifestPartial = await prisma.dispatchManifest.create({
      data: {
        manifestNumber: `RE-2026-Q${Date.now().toString().slice(-5)}8`,
        opBatchId: batchPartial.id,
        productionOrderId: batchPartial.productionOrderId,
        sewingPartnerId: partnerExternal.id,
        totalQuantity: 40,
        sizeGridBreakdown: JSON.stringify({ M: 40 }),
        expectedReturnDate: new Date(Date.now() + 86400000),
        createdById: userAdmin.id,
      },
    });

    const resApprovePartial = await fetch(`${baseUrl}/api/production/batches/${batchPartial.id}/quality-inspection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpQualidade}` },
      body: JSON.stringify({
        pin: "1234",
        result: "APPROVED_PARTIAL",
        totalApproved: 35,
        totalDefective: 5,
        reworkTargetSectorCode: "COSTURA",
        reworkReason: "5 peças com costura torta na barra",
        defects: [
          { defectTypeId: defectCosturaTorta!.id, size: "M", quantity: 5 },
        ],
      }),
    });

    assertTest(resApprovePartial.status === 201, "Inspeção APPROVED_PARTIAL registrada com sucesso (201)");
    const partialData = await resApprovePartial.json();

    const mainBatchAfter = await prisma.opBatch.findUnique({ where: { id: batchPartial.id } });
    assertTest(
      mainBatchAfter?.currentSectorId === secExpedicao.id &&
      mainBatchAfter?.batchStatus === "PENDING" &&
      mainBatchAfter?.quantity === 35,
      "Lote principal aprovado (35 peças) avançou para EXPEDICAO com status PENDING"
    );

    const reworkBatchId = partialData.newReworkBatch?.id;
    const reworkBatch = await prisma.opBatch.findUnique({ where: { id: reworkBatchId } });
    assertTest(
      reworkBatch?.currentSectorId === secCostura.id &&
      reworkBatch?.quantity === 5 &&
      reworkBatch?.isUnderRework === true &&
      reworkBatch?.reworkReason === "5 peças com costura torta na barra",
      "Novo sublote gerado (5 peças) posicionado em COSTURA com isUnderRework = true"
    );

    const reworkMov = await prisma.opMovement.findFirst({
      where: { opBatchId: reworkBatchId, movementType: "REWORK_RETURN" },
    });
    assertTest(
      !!reworkMov && reworkMov.toSectorId === secCostura.id && !!reworkMov.digitalSignatureHash,
      "Movimentação REWORK_RETURN do sublote criada com sucesso e assinada com HMAC"
    );

    // =========================================================================
    // CENÁRIO 9: REJECTED_TOTAL devolve lote inteiro para setor escolhido com REWORK_RETURN
    // =========================================================================
    console.log("\n[Cenário 9] REJECTED_TOTAL retorna lote integral para setor anterior");
    const { batch: batchReject } = await createTestBatch(25, secQualidade.id, "PENDING");

    const resRejectTotal = await fetch(`${baseUrl}/api/production/batches/${batchReject.id}/quality-inspection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpQualidade}` },
      body: JSON.stringify({
        pin: "1234",
        result: "REJECTED_TOTAL",
        totalApproved: 0,
        totalDefective: 25,
        reworkTargetSectorCode: "COSTURA",
        reworkReason: "Lote inteiro fora da tolerância de tamanho",
        defects: [
          { defectTypeId: defectCosturaTorta!.id, size: "P", quantity: 25 },
        ],
      }),
    });

    assertTest(resRejectTotal.status === 201, "Inspeção REJECTED_TOTAL registrada com sucesso (201)");
    const batchRejectAfter = await prisma.opBatch.findUnique({ where: { id: batchReject.id } });
    assertTest(
      batchRejectAfter?.currentSectorId === secCostura.id &&
      batchRejectAfter?.quantity === 25 &&
      batchRejectAfter?.isUnderRework === true &&
      batchRejectAfter?.reworkReason === "Lote inteiro fora da tolerância de tamanho",
      "Lote integral retornou para COSTURA com isUnderRework = true"
    );

    // =========================================================================
    // CENÁRIO 10: Bloqueio se soma aprovadas + defeituosas != batch.quantity (400)
    // =========================================================================
    console.log("\n[Cenário 10] Bloqueio se soma de aprovadas e defeituosas diverge do lote");
    const { batch: batchIncoherent } = await createTestBatch(30, secQualidade.id, "PENDING");

    const resIncoherent = await fetch(`${baseUrl}/api/production/batches/${batchIncoherent.id}/quality-inspection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpQualidade}` },
      body: JSON.stringify({
        pin: "1234",
        result: "APPROVED_PARTIAL",
        totalApproved: 20,
        totalDefective: 5, // Soma 25 != 30
        reworkTargetSectorCode: "COSTURA",
        reworkReason: "Incoerência matemática",
        defects: [{ defectTypeId: defectCosturaTorta!.id, size: "G", quantity: 5 }],
      }),
    });

    assertTest(resIncoherent.status === 400, "Inspeção com divergência na soma total das peças bloqueada (400)");

    // =========================================================================
    // CENÁRIO 11: Bloqueio de inspeção sem PIN válido do inspetor (403)
    // =========================================================================
    console.log("\n[Cenário 11] Bloqueio de inspeção com PIN incorreto");
    const { batch: batchWrongPin } = await createTestBatch(20, secQualidade.id, "PENDING");

    const resWrongPin = await fetch(`${baseUrl}/api/production/batches/${batchWrongPin.id}/quality-inspection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpQualidade}` },
      body: JSON.stringify({
        pin: wrongPin,
        result: "APPROVED_TOTAL",
        totalApproved: 20,
        totalDefective: 0,
      }),
    });

    assertTest(resWrongPin.status === 403, "Inspeção com PIN inválido recusada com 403");

    // =========================================================================
    // CENÁRIO 12: Bloqueio de inspeção duplicada em lote já inspecionado (409)
    // =========================================================================
    console.log("\n[Cenário 12] Bloqueio de inspeção duplicada no mesmo lote");
    // batchTotal já foi inspecionado no Cenário 7
    const resDuplicate = await fetch(`${baseUrl}/api/production/batches/${batchTotal.id}/quality-inspection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpQualidade}` },
      body: JSON.stringify({
        pin: "1234",
        result: "APPROVED_TOTAL",
        totalApproved: 30,
        totalDefective: 0,
      }),
    });

    assertTest(resDuplicate.status === 409 || resDuplicate.status === 400, "Inspeção duplicada bloqueada com sucesso (409 ou 400)");

    // =========================================================================
    // CENÁRIO 13: Relatório de defeitos retorna métricas agrupadas por oficina com taxa de defeito correta
    // =========================================================================
    console.log("\n[Cenário 13] Relatório de defeitos agrupado por oficina com taxa de defeito");
    const resReport = await fetch(`${baseUrl}/api/production/quality/defect-report`, {
      headers: { Authorization: `Bearer ${tokenOpQualidade}` },
    });

    assertTest(resReport.status === 200, "Relatório de defeitos obtido com sucesso (200)");
    const reportData = await resReport.json();
    assertTest(reportData.summary && typeof reportData.summary.defectRate === "number", "Resumo global com taxa de defeito retornado");
    assertTest(Array.isArray(reportData.workshops), "Lista de oficinas retornada no relatório");

    const workshopTarget = reportData.workshops.find((w: any) => w.partnerId === partnerExternal.id);
    assertTest(
      !!workshopTarget && workshopTarget.totalInspected >= 40 && typeof workshopTarget.defectRate === "number",
      "Métricas da oficina externa computadas com taxa de defeito e top defeitos presentes"
    );

    // =========================================================================
    // CENÁRIO 14: Bloqueio de operador de outro setor no relatório de defeitos (403)
    // =========================================================================
    console.log("\n[Cenário 14] Bloqueio de operador de outro setor ao consultar relatório de defeitos");
    const resReportBlocked = await fetch(`${baseUrl}/api/production/quality/defect-report`, {
      headers: { Authorization: `Bearer ${tokenOpVendas}` },
    });
    assertTest(resReportBlocked.status === 403, "Vendedor bloqueado de acessar relatório de defeitos da Qualidade (403)");

    console.log(`\n✔ Todos os ${passedTests}/${totalTests} testes do Setor 13 (Qualidade) passaram com sucesso!\n`);
  } finally {
    server.close();
  }
}

if (process.argv[1]?.includes("setor13-qualidade.test")) {
  runSetor13QualidadeTests().catch((err) => {
    console.error("FATAL na suíte do Setor 13:", err);
    process.exit(1);
  });
}
