import path from "path";
import fs from "fs";
import http from "http";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { generateToken, hashPassword, hashPin } from "../src/utils/security.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

export async function runSetor14ExpedicaoTests() {
  console.log("================================================================================");
  console.log("=== SUÍTE DE TESTES ESPECÍFICOS — FASE 1 (SETOR 14: EXPEDIÇÃO & ENTREGA) ===");
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
    const pwdHash = await hashPassword("senhaExpedicao123");
    const pinHash = await hashPin("1234");
    const wrongPin = "9999";

    const sectors = await prisma.sector.findMany({ orderBy: { sequenceOrder: "asc" } });
    const secQualidade = sectors.find((s) => s.code === "QUALIDADE" || s.sequenceOrder === 13)!;
    const secExpedicao = sectors.find((s) => s.code === "EXPEDICAO" || s.sequenceOrder === 14)!;
    const secCostura = sectors.find((s) => s.code === "COSTURA" || s.sequenceOrder === 12)!;
    const secVendas = sectors.find((s) => s.code === "VENDAS")!;
    const secDesigner = sectors.find((s) => s.code === "DESIGNER" || s.code === "DESIGN")!;

    // 2. Usuários de Teste
    const userAdmin = await prisma.user.upsert({
      where: { email: "c14_admin@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Admin C14", email: "c14_admin@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "ADMIN", isActive: true },
    });

    const userGestor = await prisma.user.upsert({
      where: { email: "c14_gestor@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Gestor C14", email: "c14_gestor@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "GESTOR", isActive: true },
    });

    const userOpExpedicao = await prisma.user.upsert({
      where: { email: "c14_expedicao@fabrica.com" },
      update: { signaturePinHash: pinHash, sectorId: secExpedicao.id },
      create: { name: "Operador Expedição C14", email: "c14_expedicao@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "OPERADOR", sectorId: secExpedicao.id, isActive: true },
    });

    const userOpCostura = await prisma.user.upsert({
      where: { email: "c14_costura@fabrica.com" },
      update: { signaturePinHash: pinHash, sectorId: secCostura.id },
      create: { name: "Operador Costura C14", email: "c14_costura@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "OPERADOR", sectorId: secCostura.id, isActive: true },
    });

    const userVendedor = await prisma.user.upsert({
      where: { email: "c14_vendedor@fabrica.com" },
      update: { signaturePinHash: pinHash, sectorId: secVendas.id },
      create: { name: "Vendedor C14", email: "c14_vendedor@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "VENDEDOR", sectorId: secVendas.id, isActive: true },
    });

    const userDesigner = await prisma.user.upsert({
      where: { email: "c14_designer@fabrica.com" },
      update: { signaturePinHash: pinHash, sectorId: secDesigner.id },
      create: { name: "Designer C14", email: "c14_designer@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "DESIGNER", sectorId: secDesigner.id, isActive: true },
    });

    const tokenAdmin = generateToken({ userId: userAdmin.id });
    const tokenGestor = generateToken({ userId: userGestor.id });
    const tokenOpExpedicao = generateToken({ userId: userOpExpedicao.id });
    const tokenOpCostura = generateToken({ userId: userOpCostura.id });
    const tokenVendedor = generateToken({ userId: userVendedor.id });
    const tokenDesigner = generateToken({ userId: userDesigner.id });

    // Cliente
    const customer = await prisma.customer.upsert({
      where: { id: "00000000-0000-0000-0000-000000000014" },
      update: {},
      create: {
        id: "00000000-0000-0000-0000-000000000014",
        companyName: "Atlética Universitária C14",
        contactName: "Mateus Presidente",
        email: "mateus@atletica14.com",
        phone: "(11) 93333-1414",
      },
    });

    let opCounter = 1;
    async function createTestOP(totalOrdered: number, batchQtys: number[]) {
      const opNum = `OP-2026-E${Date.now().toString().slice(-4)}${opCounter++}`;
      const op = await prisma.productionOrder.create({
        data: {
          opNumber: opNum,
          customerId: customer.id,
          title: `Uniforme Completo ${opNum}`,
          productType: "Camisa Dry-Fit",
          totalQuantityOrdered: totalOrdered,
          totalQuantityDone: 0,
        },
      });

      const batches = [];
      for (let i = 0; i < batchQtys.length; i++) {
        const b = await prisma.opBatch.create({
          data: {
            batchNumber: `${opNum}-L${String(i + 1).padStart(2, "0")}`,
            productionOrderId: op.id,
            quantity: batchQtys[i],
            currentSectorId: secExpedicao.id,
            batchStatus: "PENDING",
          },
        });
        batches.push(b);
      }

      return { op, batches };
    }

    // =========================================================================
    // CENÁRIO 1: Registro de volumes coerentes (soma bate exatamente com batch.quantity)
    // =========================================================================
    console.log("\n[Cenário 1] Registro de volumes de embalagem com soma coerente");
    const { op: op1, batches: [batch1] } = await createTestOP(50, [50]);

    const resVolumesOk = await fetch(`${baseUrl}/api/production/batches/${batch1.id}/volumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpExpedicao}` },
      body: JSON.stringify({
        volumes: [
          { volumeNumber: 1, sizeBreakdown: { P: 10, M: 15 }, weightKg: 3.2 },
          { volumeNumber: 2, sizeBreakdown: { G: 15, GG: 10 }, weightKg: 3.5 },
        ],
      }),
    });

    assertTest(resVolumesOk.status === 201, "Volumes registrados com sucesso (201)");
    const dataVolumes = await resVolumesOk.json();
    assertTest(Array.isArray(dataVolumes.volumes) && dataVolumes.volumes.length === 2, "2 volumes criados");
    assertTest(
      dataVolumes.volumes[0].labelQrCode.startsWith(`VOL-${batch1.batchNumber}-V01`),
      "Código/QR da etiqueta de volume gerado com padrão correto"
    );

    // =========================================================================
    // CENÁRIO 2: Registro de volumes incoerentes (soma difere do lote -> bloqueio 400)
    // =========================================================================
    console.log("\n[Cenário 2] Bloqueio de volumes quando a soma de peças diverge do lote");
    const resVolumesWrong = await fetch(`${baseUrl}/api/production/batches/${batch1.id}/volumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpExpedicao}` },
      body: JSON.stringify({
        volumes: [
          { volumeNumber: 1, sizeBreakdown: { P: 10, M: 10 } }, // Total 20 != 50
        ],
      }),
    });

    assertTest(resVolumesWrong.status === 400, "Tentativa com soma divergente bloqueada com HTTP 400");

    // =========================================================================
    // CENÁRIO 3: Geração de romaneio de entrega com numeração sequencial RD-YYYY-XXXXX
    // =========================================================================
    console.log("\n[Cenário 3] Emissão de Romaneio de Entrega com numeração RD-YYYY-XXXXX e HMAC");
    const resManifestOk = await fetch(`${baseUrl}/api/production/batches/${batch1.id}/delivery-manifest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpExpedicao}` },
      body: JSON.stringify({
        carrierName: "Transportadora Rápido Uniformes",
        carrierDocument: "99.888.777/0001-99",
        carrierPhone: "(11) 98888-7777",
        notes: "Entregar aos cuidados do Mateus na portaria principal",
      }),
    });

    assertTest(resManifestOk.status === 201, "Romaneio de entrega gerado com sucesso (201)");
    const manifestData = await resManifestOk.json();
    const manifestId = manifestData.manifest.id;
    const manifestNumber = manifestData.manifest.manifestNumber;

    assertTest(
      /^RD-\d{4}-\d{5}$/.test(manifestNumber),
      `Numeração segue padrão oficial RD-YYYY-XXXXX: ${manifestNumber}`
    );
    assertTest(
      typeof manifestData.manifest.digitalSignatureHash === "string" &&
      manifestData.manifest.digitalSignatureHash.length === 64,
      "Assinatura digital HMAC-SHA-256 de 64 caracteres hexadecimais gerada no servidor"
    );

    // =========================================================================
    // CENÁRIO 4: Geração de romaneio sem volumes registrados bloqueada (400)
    // =========================================================================
    console.log("\n[Cenário 4] Bloqueio de romaneio para lote sem volumes");
    const { batches: [batchSemVol] } = await createTestOP(20, [20]);
    const resManifestSemVol = await fetch(`${baseUrl}/api/production/batches/${batchSemVol.id}/delivery-manifest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpExpedicao}` },
      body: JSON.stringify({ carrierName: "Entregador Local" }),
    });
    assertTest(resManifestSemVol.status === 400, "Geração de romaneio bloqueada sem volumes prévios (400)");

    // =========================================================================
    // CENÁRIO 5: Reimpressão auditada mantendo número sequencial
    // =========================================================================
    console.log("\n[Cenário 5] Reimpressão auditada de romaneio");
    const resReprint = await fetch(`${baseUrl}/api/production/delivery-manifests/${manifestId}/reprint`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOpExpedicao}` },
    });
    assertTest(resReprint.status === 200, "Reimpressão realizada com sucesso (200)");
    const reprintData = await resReprint.json();
    assertTest(reprintData.manifest.manifestNumber === manifestNumber, "Número do romaneio preservado idêntico");
    assertTest(reprintData.manifest.reprintCount === 1, "Contador de reimpressões incrementado para 1");

    // =========================================================================
    // CENÁRIO 6: Baixa de entrega com PIN incorreto e ausente (bloqueio 403)
    // =========================================================================
    console.log("\n[Cenário 6] Bloqueio de baixa de entrega com PIN inválido");
    const resDeliverWrongPin = await fetch(`${baseUrl}/api/production/delivery-manifests/${manifestId}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpExpedicao}` },
      body: JSON.stringify({
        pin: wrongPin,
        deliveredRecipient: "Carlos Porteiro",
      }),
    });
    assertTest(resDeliverWrongPin.status === 403, "Baixa de entrega com PIN incorreto rejeitada com 403");

    // =========================================================================
    // CENÁRIO 7: Baixa de entrega com PIN correto fecha lote e fecha OP (quando lote único)
    // =========================================================================
    console.log("\n[Cenário 7] Baixa de entrega com PIN correto conclui lote e encerra OP única");
    const resDeliverOk = await fetch(`${baseUrl}/api/production/delivery-manifests/${manifestId}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpExpedicao}` },
      body: JSON.stringify({
        pin: "1234",
        deliveredRecipient: "Mateus Presidente",
        notes: "Canhoto assinado e carimbado",
      }),
    });

    assertTest(resDeliverOk.status === 200, "Baixa de entrega confirmada com sucesso (200)");
    const deliverData = await resDeliverOk.json();
    assertTest(deliverData.orderClosed === true, "OP foi automaticamente CONCLUÍDA porque todos os lotes foram entregues");

    const batch1After = await prisma.opBatch.findUnique({ where: { id: batch1.id } });
    assertTest(batch1After?.batchStatus === "DELIVERED", "Lote marcado como DELIVERED");

    const op1After = await prisma.productionOrder.findUnique({ where: { id: op1.id } });
    assertTest(op1After?.status === "COMPLETED", "Status da ProductionOrder atualizado para COMPLETED");

    // =========================================================================
    // CENÁRIO 8: OP NÃO fecha se houver outro lote pendente ou em retrabalho
    // =========================================================================
    console.log("\n[Cenário 8] Fechamento da OP bloqueado se houver outro lote em setor anterior ou retrabalho");
    const { op: opMulti, batches: [bEntregar, bPendente] } = await createTestOP(60, [30, 30]);

    // Deixa o segundo lote posicionado na Costura em retrabalho
    await prisma.opBatch.update({
      where: { id: bPendente.id },
      data: {
        currentSectorId: secCostura.id,
        batchStatus: "WAITING",
        isUnderRework: true,
        reworkReason: "Defeito de costura na manga",
      },
    });

    // Registra volumes e romaneio para o primeiro lote na Expedição
    await fetch(`${baseUrl}/api/production/batches/${bEntregar.id}/volumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpExpedicao}` },
      body: JSON.stringify({
        volumes: [{ volumeNumber: 1, sizeBreakdown: { M: 30 } }],
      }),
    });

    const resManifestMulti = await fetch(`${baseUrl}/api/production/batches/${bEntregar.id}/delivery-manifest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpExpedicao}` },
      body: JSON.stringify({ carrierName: "Entregador Parceiro" }),
    });
    const { manifest: manifestMulti } = await resManifestMulti.json();

    // Baixa do primeiro lote
    const resDeliverMulti = await fetch(`${baseUrl}/api/production/delivery-manifests/${manifestMulti.id}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenOpExpedicao}` },
      body: JSON.stringify({
        pin: "1234",
        deliveredRecipient: "Recepção Cliente",
      }),
    });

    const deliverMultiData = await resDeliverMulti.json();
    assertTest(
      deliverMultiData.orderClosed === false,
      "OP NÃO foi fechada porque o lote 2 ainda está em retrabalho na Costura"
    );

    const opMultiAfter = await prisma.productionOrder.findUnique({ where: { id: opMulti.id } });
    assertTest(opMultiAfter?.status === "ACTIVE", "OP permanece ACTIVE enquanto houver lote não entregue");

    // =========================================================================
    // CENÁRIO 9: Reabertura de OP concluída restrita a ADMIN
    // =========================================================================
    console.log("\n[Cenário 9] Reabertura de OP restrita estritamente a ADMIN");
    // Tentativa por Gestor -> 403
    const resReopenGestor = await fetch(`${baseUrl}/api/production/orders/${op1.id}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenGestor}` },
      body: JSON.stringify({ justification: "Tentativa de reabertura por gestor" }),
    });
    assertTest(resReopenGestor.status === 403, "Gestor bloqueado de reabrir OP com HTTP 403");

    // Sucesso por Admin
    const resReopenAdmin = await fetch(`${baseUrl}/api/production/orders/${op1.id}/reopen`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` },
      body: JSON.stringify({ justification: "Cliente solicitou peças complementares autorizadas" }),
    });
    assertTest(resReopenAdmin.status === 200, "Admin reabre OP com sucesso (200)");
    const op1Reopened = await prisma.productionOrder.findUnique({ where: { id: op1.id } });
    assertTest(op1Reopened?.status === "ACTIVE", "Status da OP reaberta voltou para ACTIVE");

    // =========================================================================
    // CENÁRIO 10: RBAC estrito nos endpoints de expedição (bloqueio 403)
    // =========================================================================
    console.log("\n[Cenário 10] Bloqueio RBAC 403 para vendedores, designers e outros setores");
    const resRbacVendedor = await fetch(`${baseUrl}/api/production/batches/${batch1.id}/volumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenVendedor}` },
      body: JSON.stringify({ volumes: [] }),
    });
    assertTest(resRbacVendedor.status === 403, "Vendedor bloqueado no Setor 14 (403)");

    const resRbacDesigner = await fetch(`${baseUrl}/api/production/batches/${batch1.id}/delivery-manifest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenDesigner}` },
      body: JSON.stringify({ carrierName: "X" }),
    });
    assertTest(resRbacDesigner.status === 403, "Designer bloqueado no Setor 14 (403)");

    const resRbacCostura = await fetch(`${baseUrl}/api/production/delivery-manifests/${manifestId}/reprint`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOpCostura}` },
    });
    assertTest(resRbacCostura.status === 403, "Operador de Costura bloqueado de reimprimir romaneio de expedição (403)");

    console.log(`\n✔ Todos os ${passedTests}/${totalTests} testes da Fase 1 (Setor 14: Expedição) passaram com sucesso!\n`);
  } finally {
    server.close();
  }
}

if (process.argv[1]?.includes("setor14-expedicao.test")) {
  runSetor14ExpedicaoTests().catch((err) => {
    console.error("FATAL na suíte do Setor 14:", err);
    process.exit(1);
  });
}
