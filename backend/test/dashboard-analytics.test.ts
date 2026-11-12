import http from "http";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { generateToken, hashPassword, hashPin } from "../src/utils/security.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

export async function runDashboardAnalyticsTests() {
  console.log("================================================================================");
  console.log("=== SUÍTE DE TESTES: DASHBOARD ANALÍTICO & ACIONAMENTO DE RISCOS ===");
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
    const pwdHash = await hashPassword("senhaDash123");
    const pinHash = await hashPin("123456");

    // 2. Criar ou atualizar usuários de teste
    const userAdmin = await prisma.user.upsert({
      where: { email: "dash_admin@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Admin Dashboard", email: "dash_admin@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "ADMIN", isActive: true },
    });
    const adminToken = generateToken({ userId: userAdmin.id, role: "ADMIN" });

    const userGestor = await prisma.user.upsert({
      where: { email: "dash_gestor@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Gestor Dashboard", email: "dash_gestor@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "GESTOR", isActive: true },
    });
    const gestorToken = generateToken({ userId: userGestor.id, role: "GESTOR" });

    const userOperador = await prisma.user.upsert({
      where: { email: "dash_operador@fabrica.com" },
      update: { signaturePinHash: pinHash },
      create: { name: "Operador Dashboard", email: "dash_operador@fabrica.com", passwordHash: pwdHash, signaturePinHash: pinHash, role: "OPERADOR", isActive: true },
    });
    const operadorToken = generateToken({ userId: userOperador.id, role: "OPERADOR" });

    // 3. Criar cliente de teste
    const customer = await prisma.customer.create({
      data: {
        companyName: "Empresa Teste Dash Ltda",
        contactName: "Lucas",
        phone: "11988887777",
      },
    });

    // 4. Criar OP atrasada e lote em retrabalho para acionar riscos
    const sectorCostura = await prisma.sector.findUnique({ where: { code: "COSTURA" } });
    if (sectorCostura) {
      const pastDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // 4 dias atrás
      const lateOrder = await prisma.productionOrder.create({
        data: {
          opNumber: `OP-DASH-${Date.now().toString().slice(-5)}`,
          customerId: customer.id,
          title: "Camisas Polo Alerta Risco",
          productType: "Camisetas",
          totalQuantityOrdered: 60,
          totalQuantityDone: 0,
          priority: "URGENTE",
          status: "ACTIVE",
          promisedDeliveryDate: pastDate,
        },
      });

      await prisma.opBatch.create({
        data: {
          batchNumber: `${lateOrder.opNumber}-L01`,
          productionOrderId: lateOrder.id,
          quantity: 60,
          currentSectorId: sectorCostura.id,
          batchStatus: "IN_PROGRESS",
          isUnderRework: true,
          reworkReason: "Costura descosturada na lateral",
        },
      });
    }

    // TESTE 1: Sem token -> 401
    const resNoToken = await fetch(`${baseUrl}/api/dashboard/overview`);
    assertTest(resNoToken.status === 401, "1. Rejeita requisição sem token com 401");

    // TESTE 2: Operador -> 403
    const resOp = await fetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${operadorToken}` },
    });
    assertTest(resOp.status === 403, "2. Rejeita acesso de Operador com 403 Forbidden");

    // TESTE 3: Gestor -> 200
    const resGestor = await fetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    assertTest(resGestor.status === 200, "3. Permite acesso de Gestor com 200 OK");

    // TESTE 4: Admin -> 200 com estrutura completa
    const resAdmin = await fetch(`${baseUrl}/api/dashboard/overview?period=days`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assertTest(resAdmin.status === 200, "4.1 Permite acesso de Admin com 200 OK");
    const data = await resAdmin.json();

    assertTest(data.kpis !== undefined, "4.2 Resposta contém objeto kpis");
    assertTest(Array.isArray(data.timeline), "4.3 Resposta contém timeline em array");
    assertTest(Array.isArray(data.riskAlerts), "4.4 Resposta contém riskAlerts em array");
    assertTest(Array.isArray(data.pipelineOrders), "4.5 Resposta contém pipelineOrders em array");
    assertTest(Array.isArray(data.sectorDistribution), "4.6 Resposta contém sectorDistribution em array");
    assertTest(data.sectorDistribution.length >= 14, "4.7 Cobre todos os 14 setores fabris");

    // TESTE 5: Acionamento de Riscos (Prazo Estourado e Retrabalho)
    const expiredRisk = data.riskAlerts.find((r: any) => r.type === "DEADLINE_EXPIRED");
    assertTest(expiredRisk !== undefined, "5.1 Detectou alerta de prazo estourado (CRITICAL)");
    assertTest(expiredRisk?.severity === "CRITICAL", "5.2 Severidade do prazo estourado é CRITICAL");

    const reworkRisk = data.riskAlerts.find((r: any) => r.type === "REWORK_ACTIVE");
    assertTest(reworkRisk !== undefined, "5.3 Detectou alerta de lote sob retrabalho (HIGH)");
    assertTest(reworkRisk?.severity === "HIGH", "5.4 Severidade do lote em retrabalho é HIGH");

    // TESTE 6: Parâmetros temporais (dias, semanas, meses, anos)
    for (const p of ["days", "weeks", "months", "years"]) {
      const resP = await fetch(`${baseUrl}/api/dashboard/overview?period=${p}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const dataP = await resP.json();
      assertTest(resP.status === 200 && dataP.period === p && dataP.timeline.length > 0, `6. Suporta agrupamento por período: ${p}`);
    }

    console.log(`\n✔ Todos os ${passedTests}/${totalTests} testes de Dashboard & Riscos passaram com sucesso!`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// Execução direta
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("dashboard-analytics.test.ts") || process.argv[1].endsWith("dashboard-analytics.test.js"));

if (isDirectRun) {
  runDashboardAnalyticsTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
