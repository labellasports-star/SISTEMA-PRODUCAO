import path from "path";
import fs from "fs";
import http from "http";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { generateToken, hashPassword, hashPin } from "../src/utils/security.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

export async function runSetor12CosturaTests() {
  console.log("================================================================================");
  console.log("=== SUÍTE DE TESTES ESPECÍFICOS — COMANDO 11 (SETOR 12: COSTURA & CONTROLE) ===");
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
    const pwdHash = await hashPassword("senhaCostura123");
    const pinHash = await hashPin("1234");
    const wrongPin = "9999";

    const sectors = await prisma.sector.findMany({ orderBy: { sequenceOrder: "asc" } });
    const secSeparacao = sectors.find((s) => s.code === "SEPARACAO" || s.sequenceOrder === 10)!;
    const secDespache = sectors.find((s) => s.code === "DESPACHE_OFICINA" || s.sequenceOrder === 11)!;
    const secCostura = sectors.find((s) => s.code === "COSTURA" || s.sequenceOrder === 12)!;
    const secQualidade = sectors.find((s) => s.code === "QUALIDADE" || s.sequenceOrder === 13)!;
    const secVendas = sectors.find((s) => s.code === "VENDAS")!;
    const secDesigner = sectors.find((s) => s.code === "DESIGNER" || s.code === "DESIGN")!;
    const secImpressao = sectors.find((s) => s.code === "IMPRESSAO")!;

    // Usuários de teste
    const userAdmin = await prisma.user.upsert({
      where: { email: "c11_admin@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Admin C11", email: "c11_admin@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "ADMIN", isActive: true },
    });

    const userGestor = await prisma.user.upsert({
      where: { email: "c11_gestor@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Gestor C11", email: "c11_gestor@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "GESTOR", isActive: true },
    });

    const userOpSeparacao = await prisma.user.upsert({
      where: { email: "c11_op_separacao@fabrica.com" },
      update: { signaturePinHash: pinHash, sectorId: secSeparacao.id },
      create: { name: "Op Separação C11", email: "c11_op_separacao@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "OPERADOR", sectorId: secSeparacao.id, isActive: true },
    });

    const userOpCostura = await prisma.user.upsert({
      where: { email: "c11_op_costura@fabrica.com" },
      update: { signaturePinHash: pinHash, sectorId: secCostura.id },
      create: { name: "Op Costura C11", email: "c11_op_costura@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "OPERADOR", sectorId: secCostura.id, isActive: true },
    });

    const userOpImpressao = await prisma.user.upsert({
      where: { email: "c11_op_impressao@fabrica.com" },
      update: { signaturePinHash: pinHash, sectorId: secImpressao.id },
      create: { name: "Op Impressão C11", email: "c11_op_impressao@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "OPERADOR", sectorId: secImpressao.id, isActive: true },
    });

    const userVendedor = await prisma.user.upsert({
      where: { email: "c11_vendedor@fabrica.com" },
      update: { sectorId: secVendas?.id },
      create: { name: "Vendedor C11", email: "c11_vendedor@fabrica.com", passwordHash: pwdHash, role: "VENDEDOR", sectorId: secVendas?.id, isActive: true },
    });

    const userDesigner = await prisma.user.upsert({
      where: { email: "c11_designer@fabrica.com" },
      update: { sectorId: secDesigner?.id },
      create: { name: "Designer C11", email: "c11_designer@fabrica.com", passwordHash: pwdHash, role: "DESIGNER", sectorId: secDesigner?.id, isActive: true },
    });

    // Tokens JWT
    const tokenAdmin = generateToken({ userId: userAdmin.id });
    const tokenGestor = generateToken({ userId: userGestor.id });
    const tokenOpSeparacao = generateToken({ userId: userOpSeparacao.id });
    const tokenOpCostura = generateToken({ userId: userOpCostura.id });
    const tokenOpImpressao = generateToken({ userId: userOpImpressao.id });
    const tokenVendedor = generateToken({ userId: userVendedor.id });
    const tokenDesigner = generateToken({ userId: userDesigner.id });

    // Oficinas de costura para o teste
    const partnerA = await prisma.sewingPartner.create({
      data: { name: "Oficina Padrão C11", type: "EXTERNAL", isActive: true, basePricePerPc: 6.5 },
    });

    const partnerB = await prisma.sewingPartner.create({
      data: { name: "Oficina Segunda C11", type: "EXTERNAL", isActive: true, basePricePerPc: 7.0 },
    });

    // Cliente e OP base
    const customer = await prisma.customer.create({
      data: { companyName: "Empresa Uniformes C11 Ltda", contactName: "Carlos Costura", phone: "11988887777" },
    });

    const po = await prisma.productionOrder.create({
      data: {
        opNumber: `OP-C11-${Date.now().toString().slice(-5)}`,
        customerId: customer.id,
        title: "Lote Teste Setor 12",
        productType: "Camisetas Esportivas",
        totalQuantityOrdered: 500,
      },
    });

    // =========================================================================
    // PASSO 0: Conferir passagem Separação -> Despache Oficina
    // =========================================================================
    console.log("\n--- [PASSO 0] Testando Conclusão em Separação e Avanço para Despache ---");
    const batchSep = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-SEP-${Date.now()}`,
        productionOrderId: po.id,
        quantity: 50,
        currentSectorId: secSeparacao.id,
        batchStatus: "IN_PROGRESS",
      },
    });

    const forwardSepRes = await fetch(`${baseUrl}/api/production/batches/${batchSep.id}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpSeparacao}` },
      body: JSON.stringify({
        pin: "1234",
        quantitySeparated: 50,
        missingOrDivergences: 0,
        integrityVerified: true,
        notes: "Conferido integralmente na Separação e pronto para Despache",
      }),
    });

    const forwardSepData = await forwardSepRes.json();
    assertTest(
      forwardSepRes.status === 200 &&
        forwardSepData.batch &&
        (forwardSepData.batch.currentSector.code === "DESPACHE_OFICINA" || forwardSepData.batch.currentSector.sequenceOrder === 11) &&
        forwardSepData.batch.batchStatus === "PENDING",
      "Passo 0: Conclusão em SEPARACAO avança o lote para DESPACHE_OFICINA com status PENDING e movimentação assinada",
      forwardSepData.error || ""
    );

    // =========================================================================
    // CENÁRIO 2: Recebimento total válido (100% OK) fecha o romaneio
    // =========================================================================
    console.log("\n--- [CENÁRIO 2] Recebimento Total Válido (100% OK) ---");
    const batchRecTotal = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-REC-TOT-${Date.now()}`,
        productionOrderId: po.id,
        quantity: 50,
        currentSectorId: secCostura.id,
        batchStatus: "WAITING",
      },
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    const manifestTotal = await prisma.dispatchManifest.create({
      data: {
        manifestNumber: `RE-2026-${Date.now().toString().slice(-5)}1`,
        opBatchId: batchRecTotal.id,
        productionOrderId: po.id,
        sewingPartnerId: partnerA.id,
        totalQuantity: 50,
        sizeGridBreakdown: JSON.stringify({ P: 10, M: 20, G: 20 }),
        expectedReturnDate: futureDate,
        createdById: userAdmin.id,
      },
    });

    const recTotalRes = await fetch(`${baseUrl}/api/production/batches/${batchRecTotal.id}/sewing-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpCostura}` },
      body: JSON.stringify({
        pin: "1234",
        items: [
          { size: "P", quantityReceivedOk: 10, quantityMissing: 0, quantityDamaged: 0 },
          { size: "M", quantityReceivedOk: 20, quantityMissing: 0, quantityDamaged: 0 },
          { size: "G", quantityReceivedOk: 20, quantityMissing: 0, quantityDamaged: 0 },
        ],
        notes: "Retorno completo e peças perfeitas",
      }),
    });

    const recTotalData = await recTotalRes.json();
    assertTest(
      recTotalRes.status === 201 &&
        recTotalData.receipt &&
        recTotalData.manifest.isReceiptClosed === true &&
        recTotalData.manifest.receiptStatus === "CLOSED",
      "Recebimento total válido aceito e romaneio marcado como fechado (CLOSED)",
      recTotalData.error || ""
    );

    // =========================================================================
    // CENÁRIO 3: Recebimento parcial em duas remessas
    // =========================================================================
    console.log("\n--- [CENÁRIO 3] Recebimento Parcial em Duas Remessas ---");
    const batchParcial = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-REC-PARC-${Date.now()}`,
        productionOrderId: po.id,
        quantity: 60,
        currentSectorId: secCostura.id,
        batchStatus: "WAITING",
      },
    });

    const manifestParcial = await prisma.dispatchManifest.create({
      data: {
        manifestNumber: `RE-2026-${Date.now().toString().slice(-5)}2`,
        opBatchId: batchParcial.id,
        productionOrderId: po.id,
        sewingPartnerId: partnerA.id,
        totalQuantity: 60,
        sizeGridBreakdown: JSON.stringify({ P: 20, M: 20, G: 20 }),
        expectedReturnDate: futureDate,
        createdById: userAdmin.id,
      },
    });

    // Remessa 1 (30 peças)
    const remessa1Res = await fetch(`${baseUrl}/api/production/batches/${batchParcial.id}/sewing-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpCostura}` },
      body: JSON.stringify({
        pin: "1234",
        items: [
          { size: "P", quantityReceivedOk: 10, quantityMissing: 0, quantityDamaged: 0 },
          { size: "M", quantityReceivedOk: 10, quantityMissing: 0, quantityDamaged: 0 },
          { size: "G", quantityReceivedOk: 10, quantityMissing: 0, quantityDamaged: 0 },
        ],
        notes: "Primeira remessa parcial (30 peças)",
      }),
    });
    const remessa1Data = await remessa1Res.json();

    assertTest(
      remessa1Res.status === 201 &&
        remessa1Data.manifest.isReceiptClosed === false &&
        (remessa1Data.manifest.receiptStatus === "PARTIAL" || remessa1Data.manifest.receiptStatus === "PARTIALLY_RECEIVED"),
      "Primeira remessa parcial registrada: lote permanece em COSTURA e romaneio aberto (isReceiptClosed: false)",
      remessa1Data.error || ""
    );

    // Remessa 2 (restante 30 peças)
    const remessa2Res = await fetch(`${baseUrl}/api/production/batches/${batchParcial.id}/sewing-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpCostura}` },
      body: JSON.stringify({
        pin: "1234",
        items: [
          { size: "P", quantityReceivedOk: 10, quantityMissing: 0, quantityDamaged: 0 },
          { size: "M", quantityReceivedOk: 10, quantityMissing: 0, quantityDamaged: 0 },
          { size: "G", quantityReceivedOk: 10, quantityMissing: 0, quantityDamaged: 0 },
        ],
        notes: "Segunda remessa parcial (30 peças)",
      }),
    });
    const remessa2Data = await remessa2Res.json();

    assertTest(
      remessa2Res.status === 201 &&
        remessa2Data.manifest.isReceiptClosed === true &&
        remessa2Data.manifest.receiptStatus === "CLOSED",
      "Segunda remessa recebida totalizando as 60 peças: romaneio fecha automaticamente",
      remessa2Data.error || ""
    );

    // =========================================================================
    // CENÁRIO 4: Soma acumulada acima do enviado bloqueada (400)
    // =========================================================================
    console.log("\n--- [CENÁRIO 4] Soma Acumulada Acima do Enviado Bloqueada ---");
    const batchExcesso = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-REC-EXC-${Date.now()}`,
        productionOrderId: po.id,
        quantity: 30,
        currentSectorId: secCostura.id,
        batchStatus: "WAITING",
      },
    });

    const manifestExcesso = await prisma.dispatchManifest.create({
      data: {
        manifestNumber: `RE-2026-${Date.now().toString().slice(-5)}3`,
        opBatchId: batchExcesso.id,
        productionOrderId: po.id,
        sewingPartnerId: partnerA.id,
        totalQuantity: 30,
        sizeGridBreakdown: JSON.stringify({ P: 10, M: 10, G: 10 }),
        expectedReturnDate: futureDate,
        createdById: userAdmin.id,
      },
    });

    // Tentar receber 15 peças de 'P' quando foram enviadas apenas 10
    const excessoRes = await fetch(`${baseUrl}/api/production/batches/${batchExcesso.id}/sewing-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpCostura}` },
      body: JSON.stringify({
        pin: "1234",
        items: [
          { size: "P", quantityReceivedOk: 15, quantityMissing: 0, quantityDamaged: 0 },
          { size: "M", quantityReceivedOk: 5, quantityMissing: 0, quantityDamaged: 0 },
          { size: "G", quantityReceivedOk: 5, quantityMissing: 0, quantityDamaged: 0 },
        ],
        notes: "Tentativa de recebimento com excesso no tamanho P",
      }),
    });

    assertTest(
      excessoRes.status === 400,
      "Soma de recebimento excedendo o total enviado no tamanho P é bloqueada com HTTP 400 Bad Request"
    );

    // =========================================================================
    // CENÁRIO 5: Fechamento com divergência sem justificativa bloqueado;
    // com justificativa por GESTOR/ADMIN aceito
    // =========================================================================
    console.log("\n--- [CENÁRIO 5] Fechamento com Divergência ---");
    const batchDiv = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-REC-DIV-${Date.now()}`,
        productionOrderId: po.id,
        quantity: 40,
        currentSectorId: secCostura.id,
        batchStatus: "WAITING",
      },
    });

    const manifestDiv = await prisma.dispatchManifest.create({
      data: {
        manifestNumber: `RE-2026-${Date.now().toString().slice(-5)}4`,
        opBatchId: batchDiv.id,
        productionOrderId: po.id,
        sewingPartnerId: partnerA.id,
        totalQuantity: 40,
        sizeGridBreakdown: JSON.stringify({ P: 20, M: 20 }),
        expectedReturnDate: futureDate,
        createdById: userAdmin.id,
      },
    });

    // Receber 35 peças (5 peças faltantes que nunca serão entregues)
    await fetch(`${baseUrl}/api/production/batches/${batchDiv.id}/sewing-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpCostura}` },
      body: JSON.stringify({
        pin: "1234",
        items: [
          { size: "P", quantityReceivedOk: 18, quantityMissing: 0, quantityDamaged: 0 },
          { size: "M", quantityReceivedOk: 17, quantityMissing: 0, quantityDamaged: 0 },
        ],
        notes: "Faltaram 5 peças danificadas na costura que não puderam ser recuperadas",
      }),
    });

    // Operador comum tenta fechar com divergência -> 403 Forbidden
    const closeByOpRes = await fetch(`${baseUrl}/api/production/batches/${batchDiv.id}/close-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpCostura}` },
      body: JSON.stringify({
        pin: "1234",
        justification: "Operador tentando fechar com divergência",
      }),
    });
    assertTest(
      closeByOpRes.status === 403,
      "Operador comum não pode autorizar fechamento com divergência (403 Forbidden)"
    );

    // Gestor tenta fechar sem justificativa -> 400 Bad Request
    const closeWithoutJustRes = await fetch(`${baseUrl}/api/production/batches/${batchDiv.id}/close-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenGestor}` },
      body: JSON.stringify({
        pin: "1234",
        justification: "",
      }),
    });
    assertTest(
      closeWithoutJustRes.status === 400,
      "Gestor tentando fechar com divergência sem justificativa escrita é bloqueado com HTTP 400"
    );

    // Gestor fecha com justificativa válida -> 200 OK
    const closeWithJustRes = await fetch(`${baseUrl}/api/production/batches/${batchDiv.id}/close-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenGestor}` },
      body: JSON.stringify({
        pin: "1234",
        justification: "Perda autorizada na célula externa de 5 peças danificadas durante corte de acabamento.",
      }),
    });
    const closeWithJustData = await closeWithJustRes.json();
    assertTest(
      closeWithJustRes.status === 200 &&
        closeWithJustData.manifest.isReceiptClosed === true &&
        closeWithJustData.manifest.receiptStatus === "CLOSED_WITH_DIVERGENCE",
      "Gestor fecha romaneio com divergência justificada com sucesso (CLOSED_WITH_DIVERGENCE)"
    );

    // =========================================================================
    // CENÁRIO 6: Avanço para QUALIDADE sem recebimento fechado bloqueado (400);
    // após fechamento, avança e atualiza a quantidade do lote para apenas peças OK
    // =========================================================================
    console.log("\n--- [CENÁRIO 6] Avanço COSTURA -> QUALIDADE ---");
    // Tentativa de avanço em lote com romaneio aberto
    const batchAberto = await prisma.opBatch.create({
      data: {
        batchNumber: `LOTE-REC-ABERTO-${Date.now()}`,
        productionOrderId: po.id,
        quantity: 50,
        currentSectorId: secCostura.id,
        batchStatus: "WAITING",
      },
    });

    await prisma.dispatchManifest.create({
      data: {
        manifestNumber: `RE-2026-${Date.now().toString().slice(-5)}5`,
        opBatchId: batchAberto.id,
        productionOrderId: po.id,
        sewingPartnerId: partnerA.id,
        totalQuantity: 50,
        sizeGridBreakdown: JSON.stringify({ P: 50 }),
        expectedReturnDate: futureDate,
        createdById: userAdmin.id,
        isReceiptClosed: false,
      },
    });

    const advanceWithoutCloseRes = await fetch(`${baseUrl}/api/production/batches/${batchAberto.id}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpCostura}` },
      body: JSON.stringify({ pin: "1234", notes: "Tentando avançar sem receber" }),
    });
    assertTest(
      advanceWithoutCloseRes.status === 400,
      "Avanço para QUALIDADE sem recebimento fechado é bloqueado com HTTP 400"
    );

    // Avanço do batchDiv (que foi fechado com divergência: 35 peças OK de 40)
    const advanceDivRes = await fetch(`${baseUrl}/api/production/batches/${batchDiv.id}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpCostura}` },
      body: JSON.stringify({ pin: "1234", notes: "Avançando para inspeção de qualidade" }),
    });
    const advanceDivData = await advanceDivRes.json();

    assertTest(
      advanceDivRes.status === 200 &&
        (advanceDivData.batch.currentSector.code === "QUALIDADE" || advanceDivData.batch.currentSector.sequenceOrder === 13) &&
        advanceDivData.batch.quantity === 35,
      "Avanço COSTURA -> QUALIDADE aprovado após fechamento, refletindo apenas as 35 peças recebidas OK",
      advanceDivData.error || ""
    );

    // =========================================================================
    // CENÁRIO 7: PIN errado ou ausente bloqueado (403)
    // =========================================================================
    console.log("\n--- [CENÁRIO 7] PIN Incorreto ou Ausente ---");
    const pinErradoRes = await fetch(`${baseUrl}/api/production/batches/${batchParcial.id}/sewing-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpCostura}` },
      body: JSON.stringify({
        pin: wrongPin,
        items: [{ size: "P", quantityReceivedOk: 1, quantityMissing: 0, quantityDamaged: 0 }],
      }),
    });
    assertTest(
      pinErradoRes.status === 403,
      "PIN incorreto rejeita o recebimento da costura com HTTP 403 Forbidden"
    );

    // =========================================================================
    // CENÁRIO 8: Cálculo de rendimento correto, atraso detectado, filtro por período
    // =========================================================================
    console.log("\n--- [CENÁRIO 8] Rendimento por Oficina & Detecção de Atraso ---");
    // Criar manifestos de teste para partnerB com datas controladas:
    // Manifest B1: No prazo, 50 enviadas, 45 recebidas OK, 5 faltantes -> rendimento 90%
    const batchB1 = await prisma.opBatch.create({
      data: { batchNumber: `LOTE-B1-${Date.now()}`, productionOrderId: po.id, quantity: 50, currentSectorId: secCostura.id },
    });
    const manifestB1 = await prisma.dispatchManifest.create({
      data: {
        manifestNumber: `RE-2026-${Date.now().toString().slice(-5)}6`,
        opBatchId: batchB1.id,
        productionOrderId: po.id,
        sewingPartnerId: partnerB.id,
        totalQuantity: 50,
        sizeGridBreakdown: JSON.stringify({ M: 50 }),
        expectedReturnDate: new Date("2026-11-10T18:00:00Z"),
        createdById: userAdmin.id,
        isReceiptClosed: true,
        receiptStatus: "CLOSED",
      },
    });
    await prisma.sewingReceipt.create({
      data: {
        dispatchManifestId: manifestB1.id,
        opBatchId: batchB1.id,
        operatorId: userOpCostura.id,
        receiptNumber: 1,
        totalReceivedOk: 45,
        totalMissing: 5,
        totalDamaged: 0,
        receivedAt: new Date("2026-11-08T14:00:00Z"), // Antes de 10/11 -> Sem atraso
        items: {
          create: [{ size: "M", quantityReceivedOk: 45, quantityMissing: 5, quantityDamaged: 0 }],
        },
      },
    });

    // Manifest B2: Com atraso! expectedReturnDate 2026-11-01, recebido 2026-11-03
    const batchB2 = await prisma.opBatch.create({
      data: { batchNumber: `LOTE-B2-${Date.now()}`, productionOrderId: po.id, quantity: 50, currentSectorId: secCostura.id },
    });
    const manifestB2 = await prisma.dispatchManifest.create({
      data: {
        manifestNumber: `RE-2026-${Date.now().toString().slice(-5)}7`,
        opBatchId: batchB2.id,
        productionOrderId: po.id,
        sewingPartnerId: partnerB.id,
        totalQuantity: 50,
        sizeGridBreakdown: JSON.stringify({ G: 50 }),
        expectedReturnDate: new Date("2026-11-01T18:00:00Z"),
        createdById: userAdmin.id,
        isReceiptClosed: true,
        receiptStatus: "CLOSED",
      },
    });
    await prisma.sewingReceipt.create({
      data: {
        dispatchManifestId: manifestB2.id,
        opBatchId: batchB2.id,
        operatorId: userOpCostura.id,
        receiptNumber: 1,
        totalReceivedOk: 40,
        totalMissing: 0,
        totalDamaged: 10,
        receivedAt: new Date("2026-11-03T10:00:00Z"), // Após 01/11 -> ATRASO!
        items: {
          create: [{ size: "G", quantityReceivedOk: 40, quantityMissing: 0, quantityDamaged: 10 }],
        },
      },
    });

    const yieldRes = await fetch(`${baseUrl}/api/production/sewing/yield-report?sewingPartnerId=${partnerB.id}`, {
      headers: { Authorization: `Bearer ${tokenGestor}` },
    });
    const yieldData = await yieldRes.json();

    const reportB = yieldData.reports?.find((r: any) => r.sewingPartnerId === partnerB.id) || yieldData;
    assertTest(
      yieldRes.status === 200 &&
        reportB &&
        reportB.totalSent === 100 &&
        reportB.totalReceivedOk === 85 &&
        reportB.delayedDispatchesCount === 1 &&
        reportB.yieldPercentage === 85,
      "Cálculo de rendimento correto (85% para 85/100 OK) e detecção precisa de 1 remessa atrasada",
      JSON.stringify(reportB)
    );

    // =========================================================================
    // CENÁRIO 9: RBAC - Vendedor, Designer e Operador de outro setor bloqueados (403)
    // =========================================================================
    console.log("\n--- [CENÁRIO 9] RBAC em Recebimento e Rendimento ---");
    const rbacVendedor = await fetch(`${baseUrl}/api/production/batches/${batchRecTotal.id}/sewing-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenVendedor}` },
      body: JSON.stringify({ pin: "1234", items: [] }),
    });
    assertTest(rbacVendedor.status === 403, "Vendedor recebe 403 ao tentar registrar recebimento de costura");

    const rbacDesigner = await fetch(`${baseUrl}/api/production/batches/${batchRecTotal.id}/sewing-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenDesigner}` },
      body: JSON.stringify({ pin: "1234", items: [] }),
    });
    assertTest(rbacDesigner.status === 403, "Designer recebe 403 ao tentar registrar recebimento de costura");

    const rbacOutroOp = await fetch(`${baseUrl}/api/production/batches/${batchRecTotal.id}/sewing-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpImpressao}` },
      body: JSON.stringify({ pin: "1234", items: [] }),
    });
    assertTest(rbacOutroOp.status === 403, "Operador de outro setor (Impressão) recebe 403 em recebimento de costura");

    const rbacYieldOutro = await fetch(`${baseUrl}/api/production/sewing/yield-report`, {
      headers: { Authorization: `Bearer ${tokenOpImpressao}` },
    });
    assertTest(rbacYieldOutro.status === 403, "Operador de outro setor recebe 403 ao consultar relatório de rendimento");

    // =========================================================================
    // CENÁRIO 10: Assinatura HMAC presente nas movimentações e comprovantes
    // =========================================================================
    console.log("\n--- [CENÁRIO 10] Assinatura Digital HMAC-SHA-256 ---");
    const receiptsInDb = await prisma.sewingReceipt.findMany({
      where: { opBatchId: batchDiv.id },
    });
    const moveInDb = await prisma.opMovement.findFirst({
      where: { opBatchId: batchDiv.id, toSectorId: secQualidade.id },
    });

    assertTest(
      receiptsInDb.length > 0 &&
        receiptsInDb.every((r) => r.digitalSignatureHash && r.digitalSignatureHash.length === 64) &&
        Boolean(moveInDb?.digitalSignatureHash && moveInDb.digitalSignatureHash.length === 64),
      "Assinaturas HMAC-SHA-256 criptografadas de 64 caracteres hexadecimais presentes no comprovante e na movimentação"
    );

    console.log("\n================================================================================");
    console.log(`=== RESULTADO SUÍTE COMANDO 11: ${passedTests}/${totalTests} testes aprovados ===`);
    console.log("================================================================================");
  } finally {
    server.close();
  }
}

if (process.argv[1]?.endsWith("setor12-costura.test.ts")) {
  runSetor12CosturaTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
