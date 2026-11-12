import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/prisma.js";
import { hashPassword, hashPin, generateToken } from "../src/utils/security.js";
import { app } from "../src/server.js";
import http from "node:http";

let server: http.Server;
let baseUrl: string;

test.before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("PIN Enforcement: Transições de Chão de Fábrica e Movimentações", async (t) => {
  // 1. Criar dados de teste isolados
  const timestamp = Date.now();
  const passwordHash = await hashPassword("SenhaForte123@");
  const validPin = "741852";
  const pinHash = await hashPin(validPin);

  const sectorImpressao = await prisma.sector.findUnique({ where: { code: "IMPRESSAO" } });
  const sectorCalandra = await prisma.sector.findUnique({ where: { code: "CALANDRA" } });

  assert.ok(sectorImpressao, "Setor IMPRESSAO deve existir no banco de teste");
  assert.ok(sectorCalandra, "Setor CALANDRA deve existir no banco de teste");

  // Operador com PIN cadastrado
  const operador = await prisma.user.create({
    data: {
      name: `Op PIN Test ${timestamp}`,
      email: `op.pin.${timestamp}@teste.com`,
      passwordHash,
      signaturePinHash: pinHash,
      role: "OPERADOR",
      sectorId: sectorImpressao.id,
      isActive: true,
    },
  });

  // Operador SEM PIN cadastrado
  const operadorSemPin = await prisma.user.create({
    data: {
      name: `Op Sem PIN ${timestamp}`,
      email: `op.nopin.${timestamp}@teste.com`,
      passwordHash,
      role: "OPERADOR",
      sectorId: sectorImpressao.id,
      isActive: true,
    },
  });

  const tokenOperador = generateToken({
    userId: operador.id,
    id: operador.id,
    name: operador.name,
    email: operador.email,
    role: operador.role,
    sectorId: operador.sectorId,
    sectorCode: "IMPRESSAO",
  });

  const tokenOperadorSemPin = generateToken({
    userId: operadorSemPin.id,
    id: operadorSemPin.id,
    name: operadorSemPin.name,
    email: operadorSemPin.email,
    role: operadorSemPin.role,
    sectorId: operadorSemPin.sectorId,
    sectorCode: "IMPRESSAO",
  });

  // Criar cliente, cotação e OP de teste
  const cliente = await prisma.customer.create({
    data: {
      companyName: `Cliente PIN Test ${timestamp}`,
      contactName: "Contato Test",
      phone: "11988887777",
    },
  });

  const op = await prisma.productionOrder.create({
    data: {
      opNumber: `OP-TEST-PIN-${timestamp}`,
      customerId: cliente.id,
      title: "OP de Teste de PIN",
      productType: "Camisas",
      totalQuantityOrdered: 50,
      status: "ACTIVE",
    },
  });

  const batch = await prisma.opBatch.create({
    data: {
      batchNumber: `OP-TEST-PIN-${timestamp}-L01`,
      productionOrderId: op.id,
      quantity: 50,
      currentSectorId: sectorImpressao.id,
      batchStatus: "WAITING",
    },
  });

  await t.test("1. Rejeita avanço com PIN incorreto", async () => {
    const res = await fetch(`${baseUrl}/api/production/batches/${batch.id}/complete-and-forward`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenOperador}`,
      },
      body: JSON.stringify({
        pin: "000000", // PIN errado
        machine: "Roland Texart RT-640",
      }),
    });

    assert.equal(res.status, 403, "Deve responder 403 Forbidden para PIN incorreto");
    const json = await res.json();
    assert.match(json.error, /PIN.*incorreto/i);
  });

  await t.test("2. Rejeita avanço quando operador não possui PIN cadastrado", async () => {
    const res = await fetch(`${baseUrl}/api/production/batches/${batch.id}/complete-and-forward`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenOperadorSemPin}`,
      },
      body: JSON.stringify({
        pin: "123456",
        machine: "Roland Texart RT-640",
      }),
    });

    assert.equal(res.status, 403, "Deve responder 403 Forbidden se o usuário não tem PIN cadastrado");
    const json = await res.json();
    assert.match(json.error, /não possui PIN/i);
  });

  await t.test("3. startBatch valida PIN e recusa PIN inválido", async () => {
    const res = await fetch(`${baseUrl}/api/production/batches/${batch.id}/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenOperador}`,
      },
      body: JSON.stringify({
        pin: "999999", // PIN errado
      }),
    });

    assert.equal(res.status, 403, "Deve recusar startBatch com PIN errado");
  });

  await t.test("4. startBatch aceita PIN correto e inicia lote", async () => {
    const res = await fetch(`${baseUrl}/api/production/batches/${batch.id}/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenOperador}`,
      },
      body: JSON.stringify({
        pin: validPin,
        notes: "Iniciando com PIN de segurança",
      }),
    });

    assert.equal(res.status, 200, "Deve aceitar startBatch com PIN correto");
    const json = await res.json();
    assert.equal(json.batch.batchStatus, "IN_PROGRESS");
    assert.equal(json.batch.assignedOperatorId, operador.id);
  });

  await t.test("5. splitBatch valida PIN e recusa PIN incorreto", async () => {
    const res = await fetch(`${baseUrl}/api/batches/${batch.id}/split`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenOperador}`,
      },
      body: JSON.stringify({
        splitQuantity: 10,
        pin: "000000",
      }),
    });

    assert.equal(res.status, 403, "Deve recusar splitBatch com PIN incorreto");
  });

  await t.test("6. complete-and-forward com PIN correto avança para próximo setor com assinatura digital HMAC", async () => {
    const res = await fetch(`${baseUrl}/api/production/batches/${batch.id}/complete-and-forward`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenOperador}`,
      },
      body: JSON.stringify({
        pin: validPin,
        machine: "Roland Texart RT-640",
        notes: "Lote impresso com sucesso",
      }),
    });

    assert.equal(res.status, 200, "Deve aprovar e avançar o lote com PIN válido");
    const json = await res.json();
    assert.ok(json.movement.digitalSignatureHash, "Deve possuir assinatura digital gerada no servidor");
    assert.equal(json.batch.currentSector.code, "INFESTO", "Deve avançar para o setor seguinte (Infesto)");
  });
});
