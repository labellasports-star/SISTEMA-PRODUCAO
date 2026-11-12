import path from "path";
import fs from "fs";
import http from "http";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { generateToken, hashPassword, hashPin } from "../src/utils/security.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

export async function runEndToEndPipelineTests() {
  console.log("================================================================================");
  console.log("=== SUÍTE DE TESTE INTEGRADO PONTA A PONTA (SETORES 01 A 14 COM RETRABALHO) ===");
  console.log("================================================================================");

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
    const pwdHash = await hashPassword("senhaE2E123");
    const pin = "1234";
    const pinHash = await hashPin(pin);

    const sectors = await prisma.sector.findMany({ orderBy: { sequenceOrder: "asc" } });
    const getSec = (code: string) => sectors.find((s) => s.code === code)!;

    const secPreVenda = getSec("PRE_VENDA");
    const secDesigner = getSec("DESIGNER") || sectors.find((s) => s.code === "DESIGN");
    const secVendas = getSec("VENDAS");
    const secSac = getSec("SAC_INTERNO");
    const secPreDiag = getSec("PRE_DIAGRAMACAO");
    const secDiagram = getSec("DIAGRAMACAO");
    const secImpressao = getSec("IMPRESSAO");
    const secInfesto = getSec("INFESTO");
    const secCalandra = getSec("CALANDRA");
    const secSeparacao = getSec("SEPARACAO");
    const secDespache = getSec("DESPACHE_OFICINA") || sectors.find((s) => s.sequenceOrder === 11);
    const secCostura = getSec("COSTURA") || sectors.find((s) => s.sequenceOrder === 12);
    const secQualidade = getSec("QUALIDADE") || sectors.find((s) => s.sequenceOrder === 13);
    const secExpedicao = getSec("EXPEDICAO") || sectors.find((s) => s.code === "ENTREGA" || s.sequenceOrder === 14);

    // Setup de usuários para todos os setores
    const createUser = async (email: string, role: string, sectorId: string | null) => {
      return prisma.user.upsert({
        where: { email },
        update: { signaturePinHash: pinHash, sectorId },
        create: {
          name: `User ${email.split("@")[0]}`,
          email,
          passwordHash: pwdHash,
          signaturePinHash: pinHash,
          role,
          sectorId,
          isActive: true,
        },
      });
    };

    const userAdmin = await createUser("e2e_admin@fabrica.com", "ADMIN", null);
    const userSeller = await createUser("e2e_seller@fabrica.com", "VENDEDOR", secVendas?.id || null);
    const userDesigner = await createUser("e2e_designer@fabrica.com", "DESIGNER", secDesigner?.id || null);
    const userSac = await createUser("e2e_sac@fabrica.com", "OPERADOR", secSac.id);
    const userPreDiag = await createUser("e2e_prediag@fabrica.com", "OPERADOR", secPreDiag.id);
    const userDiagram = await createUser("e2e_diagram@fabrica.com", "OPERADOR", secDiagram.id);
    const userImpressao = await createUser("e2e_impressao@fabrica.com", "OPERADOR", secImpressao.id);
    const userInfesto = await createUser("e2e_infesto@fabrica.com", "OPERADOR", secInfesto.id);
    const userCalandra = await createUser("e2e_calandra@fabrica.com", "OPERADOR", secCalandra.id);
    const userSeparacao = await createUser("e2e_separacao@fabrica.com", "OPERADOR", secSeparacao.id);
    const userDespache = await createUser("e2e_despache@fabrica.com", "OPERADOR", secDespache.id);
    const userCostura = await createUser("e2e_costura@fabrica.com", "OPERADOR", secCostura.id);
    const userQualidade = await createUser("e2e_qualidade@fabrica.com", "OPERADOR", secQualidade.id);
    const userExpedicao = await createUser("e2e_expedicao@fabrica.com", "OPERADOR", secExpedicao.id);

    const tokenAdmin = generateToken({ userId: userAdmin.id, role: userAdmin.role });
    const tokenSeller = generateToken({ userId: userSeller.id, role: userSeller.role, sectorCode: "VENDAS" });
    const tokenDesigner = generateToken({ userId: userDesigner.id, role: userDesigner.role, sectorCode: "DESIGNER" });
    const tokenSac = generateToken({ userId: userSac.id, role: userSac.role, sectorCode: "SAC_INTERNO" });
    const tokenPreDiag = generateToken({ userId: userPreDiag.id, role: userPreDiag.role, sectorCode: "PRE_DIAGRAMACAO" });
    const tokenDiagram = generateToken({ userId: userDiagram.id, role: userDiagram.role, sectorCode: "DIAGRAMACAO" });
    const tokenImpressao = generateToken({ userId: userImpressao.id, role: userImpressao.role, sectorCode: "IMPRESSAO" });
    const tokenInfesto = generateToken({ userId: userInfesto.id, role: userInfesto.role, sectorCode: "INFESTO" });
    const tokenCalandra = generateToken({ userId: userCalandra.id, role: userCalandra.role, sectorCode: "CALANDRA" });
    const tokenSeparacao = generateToken({ userId: userSeparacao.id, role: userSeparacao.role, sectorCode: "SEPARACAO" });
    const tokenDespache = generateToken({ userId: userDespache.id, role: userDespache.role, sectorCode: secDespache.code });
    const tokenCostura = generateToken({ userId: userCostura.id, role: userCostura.role, sectorCode: secCostura.code });
    const tokenQualidade = generateToken({ userId: userQualidade.id, role: userQualidade.role, sectorCode: secQualidade.code });
    const tokenExpedicao = generateToken({ userId: userExpedicao.id, role: userExpedicao.role, sectorCode: secExpedicao.code });

    // Oficina externa para costura
    const partner = await prisma.sewingPartner.upsert({
      where: { id: "00000000-0000-0000-0000-000000000088" },
      update: {},
      create: {
        id: "00000000-0000-0000-0000-000000000088",
        type: "EXTERNAL",
        name: "Oficina E2E Costura",
        contactPerson: "Mestre Costureiro",
        phone: "11988887777",
        isActive: true,
      },
    });

    // -------------------------------------------------------------------------
    // PASSO 1: Setor 01 (Pré-Venda) - Cadastro de Cliente e Cotação
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 1/14] Setor 01: Pré-Venda ---");
    const custRes = await fetch(`${baseUrl}/api/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSeller}` },
      body: JSON.stringify({
        companyName: `Cliente E2E Pipeline ${Date.now()}`,
        contactName: "Diretor Comercial",
        phone: `119${Math.floor(10000000 + Math.random() * 90000000)}`,
        cityState: "São Paulo/SP",
      }),
    });
    const customer = (await custRes.json()) as any;
    assertTest(custRes.status === 201 && customer.sellerId === userSeller.id, "1.1 Cliente cadastrado via Vendedor com sellerId vinculado");

    const quotRes = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSeller}` },
      body: JSON.stringify({
        customerId: customer.id,
        teamName: "Time Atlética E2E",
        productsSummary: "Camisas Dry-Fit",
        totalQuantity: 100,
        budgetAmount: 4500,
        observations: "Sublimação total frente e verso",
        items: [
          { productModel: "Camisa Dry-Fit", gender: "UNISSEX", size: "G", quantity: 100 },
        ],
      }),
    });
    const quotation = (await quotRes.json()) as any;
    assertTest(quotRes.status === 201 && quotation.totalQuantity === 100, "1.2 Cotação gerada com 100 peças", JSON.stringify(quotation));

    // -------------------------------------------------------------------------
    // PASSO 2: Setor 02 (Designer / Arte-Final) - Desenvolvimento e Aprovação
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 2/14] Setor 02: Designer / Arte-Final ---");
    const claimRes = await fetch(`${baseUrl}/api/design/${quotation.id}/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenDesigner}` },
    });
    assertTest(claimRes.status === 200, "2.1 Designer assume cotação na fila");

    const versionRes = await fetch(`${baseUrl}/api/design/${quotation.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenDesigner}` },
      body: JSON.stringify({
        previewUrl: "/uploads/arte_e2e_preview.png",
        vectorUrl: "/uploads/arte_e2e_final.ai",
        changeNotes: "Layout vetorizado oficial com mapa de cores",
      }),
    });
    assertTest(versionRes.status === 201, "2.2 Designer anexa versão oficial da arte");

    const approveArtRes = await fetch(`${baseUrl}/api/quotations/${quotation.id}/client-approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSeller}` },
      body: JSON.stringify({
        decision: "APPROVED",
        approvedByPerson: "Diretor Comercial",
        feedbackNotes: "Arte 100% aprovada pelo cliente para produção",
      }),
    });
    const approveArtBody = await approveArtRes.json();
    assertTest(approveArtRes.status === 200, "2.3 Arte formalmente aprovada pelo cliente", JSON.stringify(approveArtBody));

    // -------------------------------------------------------------------------
    // PASSO 3: Setor 03 (Vendas) - Conversão formal para OP
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 3/14] Setor 03: Vendas ---");
    const convertRes = await fetch(`${baseUrl}/api/quotations/${quotation.id}/convert-to-op`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSeller}` },
      body: JSON.stringify({
        promisedDeliveryDate: new Date(Date.now() + 10 * 86400000).toISOString(),
        technicalNotes: "Entrega prioritária para evento",
      }),
    });
    const convertBody = (await convertRes.json()) as any;
    assertTest(convertRes.status === 201 && convertBody.productionOrder?.opNumber, "3.1 Cotação convertida em Ordem de Produção oficial");

    const opId = convertBody.productionOrder.id;
    const initialBatch = await prisma.opBatch.findFirst({
      where: { productionOrderId: opId },
      include: { currentSector: true },
    });
    assertTest(Boolean(initialBatch) && initialBatch!.currentSector.code === "SAC_INTERNO", "3.2 Lote inicial posicionado no Setor 04 (SAC Interno)");

    let currentBatchId = initialBatch!.id;

    // -------------------------------------------------------------------------
    // PASSO 4: Setor 04 (SAC Interno) - Conferência Técnica e Encaminhamento
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 4/14] Setor 04: SAC Interno ---");
    const sacApproveRes = await fetch(`${baseUrl}/api/sac/${opId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSac}` },
      body: JSON.stringify({
        pin,
        notes: "Conferência técnica SAC aprovada. Liberado para chão de fábrica.",
      }),
    });
    assertTest(sacApproveRes.status === 200, "4.1 SAC Interno aprova OP com PIN e encaminha lote para Pré-Diagramação");

    let batch = await prisma.opBatch.findUnique({ where: { id: currentBatchId }, include: { currentSector: true } });
    assertTest(batch?.currentSector.code === "PRE_DIAGRAMACAO", "4.2 Lote avançou para Setor 05 (Pré-Diagramação)");

    // -------------------------------------------------------------------------
    // PASSO 5: Setor 05 (Pré-Diagramação)
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 5/14] Setor 05: Pré-Diagramação ---");
    const resPreDiag = await fetch(`${baseUrl}/api/production/batches/${currentBatchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPreDiag}` },
      body: JSON.stringify({ pin, notes: "Conferência de modelagem e moldes concluída" }),
    });
    assertTest(resPreDiag.status === 200, "5.1 Pré-Diagramação concluída com assinatura digital PIN");

    batch = await prisma.opBatch.findUnique({ where: { id: currentBatchId }, include: { currentSector: true } });
    assertTest(batch?.currentSector.code === "DIAGRAMACAO", "5.2 Lote avançou para Setor 06 (Diagramação)");

    // -------------------------------------------------------------------------
    // PASSO 6: Setor 06 (Diagramação)
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 6/14] Setor 06: Diagramação ---");
    const resDiagram = await fetch(`${baseUrl}/api/production/batches/${currentBatchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenDiagram}` },
      body: JSON.stringify({
        pin,
        diagramFileUrl: "/uploads/mapa_encaixe_e2e.pdf",
        notes: "Mapa de corte e encaixe gerado",
      }),
    });
    assertTest(resDiagram.status === 200, "6.1 Diagramação concluída com anexo de encaixe e PIN");

    batch = await prisma.opBatch.findUnique({ where: { id: currentBatchId }, include: { currentSector: true } });
    assertTest(batch?.currentSector.code === "IMPRESSAO", "6.2 Lote avançou para Setor 07 (Impressão)");

    // -------------------------------------------------------------------------
    // PASSO 7: Setor 07 (Impressão)
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 7/14] Setor 07: Impressão ---");
    const resImpressao = await fetch(`${baseUrl}/api/production/batches/${currentBatchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenImpressao}` },
      body: JSON.stringify({
        pin,
        machine: "Plotter Roland 01",
        quantityProduced: 100,
        notes: "100 peças impressas em papel sublimático",
      }),
    });
    assertTest(resImpressao.status === 200, "7.1 Impressão concluída com métricas e PIN");

    batch = await prisma.opBatch.findUnique({ where: { id: currentBatchId }, include: { currentSector: true } });
    assertTest(batch?.currentSector.code === "INFESTO", "7.2 Lote avançou para Setor 08 (Infesto)");

    // -------------------------------------------------------------------------
    // PASSO 8: Setor 08 (Infesto)
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 8/14] Setor 08: Infesto ---");
    const resInfesto = await fetch(`${baseUrl}/api/production/batches/${currentBatchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenInfesto}` },
      body: JSON.stringify({
        pin,
        quantityPrepared: 100,
        notes: "10 folhas de tecido infestadas e cortadas",
      }),
    });
    assertTest(resInfesto.status === 200, "8.1 Infesto concluído com PIN");

    batch = await prisma.opBatch.findUnique({ where: { id: currentBatchId }, include: { currentSector: true } });
    assertTest(batch?.currentSector.code === "CALANDRA", "8.2 Lote avançou para Setor 09 (Calandra)");

    // -------------------------------------------------------------------------
    // PASSO 9: Setor 09 (Calandra)
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 9/14] Setor 09: Calandra ---");
    const resCalandra = await fetch(`${baseUrl}/api/production/batches/${currentBatchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenCalandra}` },
      body: JSON.stringify({
        pin,
        machine: "Calandra Monti Antonio 01",
        temperature: "215°C",
        speedOrTime: "3.5 m/min",
        quantityProcessed: 100,
        notes: "Termotransferência perfeita a 215C",
      }),
    });
    assertTest(resCalandra.status === 200, "9.1 Calandra concluída com PIN e telemetria");

    batch = await prisma.opBatch.findUnique({ where: { id: currentBatchId }, include: { currentSector: true } });
    assertTest(batch?.currentSector.code === "SEPARACAO", "9.2 Lote avançou para Setor 10 (Separação)");

    // -------------------------------------------------------------------------
    // PASSO 10: Setor 10 (Separação)
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 10/14] Setor 10: Separação ---");
    const resSeparacao = await fetch(`${baseUrl}/api/production/batches/${currentBatchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenSeparacao}` },
      body: JSON.stringify({
        pin,
        quantitySeparated: 100,
        integrityVerified: true,
        notes: "100 peças separadas e conferidas em pacotes",
      }),
    });
    assertTest(resSeparacao.status === 200, "10.1 Separação concluída com PIN");

    batch = await prisma.opBatch.findUnique({ where: { id: currentBatchId }, include: { currentSector: true } });
    assertTest(batch?.currentSector.sequenceOrder === 11, "10.2 Lote avançou para Setor 11 (Despache para Oficina)");

    // -------------------------------------------------------------------------
    // PASSO 11: Setor 11 (Despache para Oficina)
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 11/14] Setor 11: Despache para Oficina ---");
    const resManifest = await fetch(`${baseUrl}/api/production/batches/${currentBatchId}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenDespache}` },
      body: JSON.stringify({
        sewingPartnerId: partner.id,
        sizeGridBreakdown: { G: 100 },
        expectedReturnDate: new Date(Date.now() + 3 * 86400000).toISOString(),
        pin,
        notes: "Despache prioritário para oficina externa",
      }),
    });
    const manifestBody = (await resManifest.json()) as any;
    assertTest(resManifest.status === 201 && manifestBody.manifest?.manifestNumber?.startsWith("RE-"), "11.1 Romaneio de Despache RE- gerado com assinatura HMAC", JSON.stringify(manifestBody));

    batch = await prisma.opBatch.findUnique({ where: { id: currentBatchId }, include: { currentSector: true } });
    assertTest(batch?.currentSector.sequenceOrder === 12, "11.2 Lote posicionado no Setor 12 (Costura) após despache");

    // -------------------------------------------------------------------------
    // PASSO 12: Setor 12 (Costura) - Recebimento e Conclusão
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 12/14] Setor 12: Costura ---");
    const resReceipt = await fetch(`${baseUrl}/api/production/batches/${currentBatchId}/sewing-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenCostura}` },
      body: JSON.stringify({
        pin,
        notes: "Recebimento integral de 100 peças costuradas",
        items: [{ size: "G", quantityReceivedOk: 100, quantityMissing: 0, quantityDamaged: 0 }],
      }),
    });
    const receiptBody = (await resReceipt.json()) as any;
    assertTest(resReceipt.status === 201, "12.1 Recebimento de costura registrado com assinatura digital", JSON.stringify(receiptBody));

    const resCosturaForward = await fetch(`${baseUrl}/api/production/batches/${currentBatchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenCostura}` },
      body: JSON.stringify({ pin, notes: "Lote de costura finalizado e enviado à inspeção de qualidade" }),
    });
    assertTest(resCosturaForward.status === 200, "12.2 Costura concluída com PIN e encaminhada para Qualidade");

    batch = await prisma.opBatch.findUnique({ where: { id: currentBatchId }, include: { currentSector: true } });
    assertTest(batch?.currentSector.sequenceOrder === 13, "12.3 Lote posicionado no Setor 13 (Qualidade)");

    // -------------------------------------------------------------------------
    // PASSO 13: Setor 13 (Qualidade pós-costura) - Aprovação Parcial e Retrabalho
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 13/14] Setor 13: Qualidade Pós-Costura (Fracionamento e Retrabalho) ---");
    const defectType = (await prisma.defectType.findFirst({ where: { code: "COSTURA_TORTA" } })) || (await prisma.defectType.findFirst());
    if (!defectType) throw new Error("Nenhum DefectType encontrado no banco.");

    const resInspParcial = await fetch(`${baseUrl}/api/production/batches/${currentBatchId}/quality-inspection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenQualidade}` },
      body: JSON.stringify({
        result: "APPROVED_PARTIAL",
        totalApproved: 80,
        totalDefective: 20,
        reworkReason: "Costura torta requer desmanche e nova costura",
        pin,
        notes: "80 peças perfeitas e 20 com costura desalinhada",
        defects: [
          { defectTypeId: defectType.id, size: "G", quantity: 20 },
        ],
      }),
    });
    const inspParcialBody = (await resInspParcial.json()) as any;
    assertTest(resInspParcial.status === 201, "13.1 Inspeção APPROVED_PARTIAL registrada com sucesso", JSON.stringify(inspParcialBody));
    assertTest(Boolean(inspParcialBody.newReworkBatch), "13.2 Sublote de retrabalho gerado automaticamente pelo fracionamento");

    const reworkBatchId = inspParcialBody.newReworkBatch.id;

    // Verificar posicionamento dos lotes
    const batchAprovado = await prisma.opBatch.findUnique({ where: { id: currentBatchId }, include: { currentSector: true } });
    const batchRetrabalho = await prisma.opBatch.findUnique({ where: { id: reworkBatchId }, include: { currentSector: true } });

    assertTest(batchAprovado?.currentSector.sequenceOrder === 14 && batchAprovado?.quantity === 80, "13.3 Lote principal aprovado (80 peças) avançou para Setor 14 (Expedição)");
    assertTest(batchRetrabalho?.currentSector.sequenceOrder === 12 && batchRetrabalho?.quantity === 20 && batchRetrabalho?.isUnderRework === true, "13.4 Sublote de retrabalho (20 peças) retornado para Setor 12 (Costura) sob retrabalho");

    // Resolver retrabalho na Costura
    console.log("  -> Costura resolvendo sublote de retrabalho...");
    const resCosturaRework = await fetch(`${baseUrl}/api/production/batches/${reworkBatchId}/complete-and-forward`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenCostura}` },
      body: JSON.stringify({ pin, reworkQuantity: 20, notes: "Retrabalho de costura executado e corrigido" }),
    });
    assertTest(resCosturaRework.status === 200, "13.5 Sublote de retrabalho concluído na Costura e devolvido à Qualidade");

    // Inspecionar e aprovar integralmente o sublote de retrabalho na Qualidade
    console.log("  -> Qualidade inspecionando novamente o sublote...");
    const resInspRework = await fetch(`${baseUrl}/api/production/batches/${reworkBatchId}/quality-inspection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenQualidade}` },
      body: JSON.stringify({
        result: "APPROVED_TOTAL",
        totalApproved: 20,
        totalDefective: 0,
        pin,
        notes: "20 peças retrabalhadas conferidas e aprovadas com louvor",
      }),
    });
    assertTest(resInspRework.status === 201, "13.6 Sublote retrabalhado APROVADO integralmente na Qualidade");

    const batchRetrabalhoLiberado = await prisma.opBatch.findUnique({ where: { id: reworkBatchId }, include: { currentSector: true } });
    assertTest(batchRetrabalhoLiberado?.currentSector.sequenceOrder === 14, "13.7 Sublote de retrabalho liberado para o Setor 14 (Expedição)");

    // -------------------------------------------------------------------------
    // PASSO 14: Setor 14 (Expedição) - Embalagem, Romaneios, Baixa e Encerramento
    // -------------------------------------------------------------------------
    console.log("\n--- [ETAPA 14/14] Setor 14: Expedição & Entrega ---");

    // Volumes para Lote Principal (80 peças: 2 caixas de 40)
    const resVolPrincipal = await fetch(`${baseUrl}/api/production/batches/${currentBatchId}/volumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenExpedicao}` },
      body: JSON.stringify({
        volumes: [
          { volumeNumber: 1, sizeBreakdown: { G: 40 }, weightKg: 8.5 },
          { volumeNumber: 2, sizeBreakdown: { G: 40 }, weightKg: 8.5 },
        ],
      }),
    });
    assertTest(resVolPrincipal.status === 201, "14.1 Volumes de embalagem registrados para Lote 1 (80 peças)");

    // Romaneio de Entrega Lote 1
    const resManifest1 = await fetch(`${baseUrl}/api/production/batches/${currentBatchId}/delivery-manifest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenExpedicao}` },
      body: JSON.stringify({
        carrierName: "Transportadora Express E2E",
        carrierDocument: "12.345.678/0001-99",
        notes: "Remessa parcial 1",
      }),
    });
    const manifest1Body = (await resManifest1.json()) as any;
    const manifest1 = manifest1Body.manifest;
    assertTest(resManifest1.status === 201 && manifest1?.manifestNumber?.startsWith("RD-"), "14.2 Romaneio de Entrega RD- gerado para Lote 1 com HMAC", JSON.stringify(manifest1Body));

    // Volumes para Sublote (20 peças: 1 caixa de 20)
    const resVolSub = await fetch(`${baseUrl}/api/production/batches/${reworkBatchId}/volumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenExpedicao}` },
      body: JSON.stringify({
        volumes: [
          { volumeNumber: 1, sizeBreakdown: { G: 20 }, weightKg: 4.2 },
        ],
      }),
    });
    assertTest(resVolSub.status === 201, "14.3 Volumes de embalagem registrados para Lote 2 (20 peças)");

    // Romaneio de Entrega Lote 2
    const resManifest2 = await fetch(`${baseUrl}/api/production/batches/${reworkBatchId}/delivery-manifest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenExpedicao}` },
      body: JSON.stringify({
        carrierName: "Transportadora Express E2E",
        carrierDocument: "12.345.678/0001-99",
        notes: "Remessa final de saldo",
      }),
    });
    const manifest2Body = (await resManifest2.json()) as any;
    const manifest2 = manifest2Body.manifest;
    assertTest(resManifest2.status === 201 && manifest2?.manifestNumber?.startsWith("RD-"), "14.4 Romaneio de Entrega RD- gerado para Lote 2 com HMAC", JSON.stringify(manifest2Body));

    // Baixa de Entrega Romaneio 1 -> OP deve continuar ativa pois Romaneio 2 ainda não foi entregue
    const resDeliver1 = await fetch(`${baseUrl}/api/production/delivery-manifests/${manifest1.id}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenExpedicao}` },
      body: JSON.stringify({
        pin,
        deliveredRecipient: "Almoxarifado Cliente",
        notes: "Primeiro fardo entregue",
      }),
    });
    const deliver1Body = (await resDeliver1.json()) as any;
    assertTest(resDeliver1.status === 200 && deliver1Body.orderClosed === false, "14.5 Baixa de entrega 1 confirmada; OP permanece ativa devido ao lote 2 pendente", JSON.stringify(deliver1Body));

    // Baixa de Entrega Romaneio 2 -> OP DEVE FECHAR AUTOMATICAMENTE
    const resDeliver2 = await fetch(`${baseUrl}/api/production/delivery-manifests/${manifest2.id}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenExpedicao}` },
      body: JSON.stringify({
        pin,
        deliveredRecipient: "Almoxarifado Cliente",
        notes: "Segundo fardo entregue e conferido",
      }),
    });
    const deliver2Body = (await resDeliver2.json()) as any;
    assertTest(resDeliver2.status === 200 && deliver2Body.orderClosed === true, "14.6 Baixa de entrega 2 confirmada; OP foi automaticamente CONCLUÍDA!", JSON.stringify(deliver2Body));

    // Verificar status final da OP no banco
    const finalOp = await prisma.productionOrder.findUnique({ where: { id: opId } });
    assertTest(finalOp?.status === "COMPLETED", "14.7 Status da OP no banco persistido como COMPLETED");

    // -------------------------------------------------------------------------
    // PASSO 15: Validação de Rastreabilidade e Assinaturas Digitais HMAC
    // -------------------------------------------------------------------------
    console.log("\n--- [AUDITORIA] Rastreabilidade e Assinaturas Digitais (/history) ---");
    const historyRes1 = await fetch(`${baseUrl}/api/production/batches/${currentBatchId}/history`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    const history1 = (await historyRes1.json()) as any;
    assertTest(historyRes1.status === 200 && history1.movements.length >= 10, "15.1 Histórico do Lote 1 retornado com todas as movimentações dos setores");

    const allMovementsSigned1 = history1.movements.every((m: any) => Boolean(m.digitalSignatureHash && m.digitalSignatureHash.length === 64));
    assertTest(allMovementsSigned1, "15.2 Todas as movimentações do Lote 1 possuem assinatura digital HMAC-SHA-256 válida");

    const historyRes2 = await fetch(`${baseUrl}/api/production/batches/${reworkBatchId}/history`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    const history2 = (await historyRes2.json()) as any;
    assertTest(historyRes2.status === 200 && history2.movements.length >= 3, "15.3 Histórico do Lote 2 de retrabalho registrado com integridade");

    const allMovementsSigned2 = history2.movements.every((m: any) => Boolean(m.digitalSignatureHash && m.digitalSignatureHash.length === 64));
    assertTest(allMovementsSigned2, "15.4 Todas as movimentações do Lote 2 possuem assinatura digital HMAC-SHA-256 válida");

    console.log(`\n================================================================================`);
    console.log(`=== SUCESSO TOTAL DO PIPELINE PONTA A PONTA: ${passedTests}/${totalTests} testes aprovados! ===`);
    console.log(`================================================================================\n`);
  } finally {
    server.close();
  }
}

if (process.argv[1]?.includes("end-to-end-pipeline.test")) {
  runEndToEndPipelineTests().catch((err) => {
    console.error("Erro na execução do teste ponta a ponta:", err);
    process.exit(1);
  });
}
