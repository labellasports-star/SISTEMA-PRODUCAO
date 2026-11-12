import fs from "fs";
import path from "path";
import crypto from "crypto";
import http from "http";
import { spawn } from "child_process";
import { initProductionDatabase } from "../scripts/init-production-db.js";

const BACKEND_DIR = path.resolve(process.cwd());
const PRISMA_DIR = path.resolve(BACKEND_DIR, "prisma");
const DEV_DB_PATH = path.resolve(PRISMA_DIR, "dev.db").replace(/\\/g, "/");
const TEMP_SMOKE_DB = path.resolve(PRISMA_DIR, "temp_smoke_prod.db").replace(/\\/g, "/");
const TEMP_SMOKE_UPLOADS = path.resolve(BACKEND_DIR, "temp_smoke_uploads").replace(/\\/g, "/");
const DEV_DB_EXPECTED_HASH = "89b4647271aade5801d8b88de07c634e6ea90e6ac1de365bc4e14cbb351a9908";

function getFileSha256(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function cleanTempFiles() {
  for (const ext of ["", "-journal", "-wal", "-shm"]) {
    const p = `${TEMP_SMOKE_DB}${ext}`;
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (_) {}
    }
  }
  if (fs.existsSync(TEMP_SMOKE_UPLOADS)) {
    try {
      fs.rmSync(TEMP_SMOKE_UPLOADS, { recursive: true, force: true });
    } catch (_) {}
  }
}

async function waitHttpReady(port: number, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/sectors`, (res) => {
          // Se respondeu qualquer código (mesmo 401 por falta de auth), o servidor está ouvindo!
          resolve();
        });
        req.on("error", reject);
        req.setTimeout(500, () => {
          req.destroy();
          reject(new Error("Timeout"));
        });
      });
      return true;
    } catch (_) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return false;
}

async function runSmokeTest() {
  console.log("================================================================================");
  console.log("=== TESTE DE FUMAÇA: INICIALIZAÇÃO E OPERAÇÃO EM PRODUÇÃO LIMPA ===");
  console.log("================================================================================\n");

  cleanTempFiles();

  // 1. Verificar dev.db e uploads antes de iniciar
  const initialDevDbHash = getFileSha256(DEV_DB_PATH);
  if (initialDevDbHash !== DEV_DB_EXPECTED_HASH) {
    throw new Error(`FAIL-SAFE: Hash inicial de dev.db divergente! Esperado: ${DEV_DB_EXPECTED_HASH}, Encontrado: ${initialDevDbHash}`);
  }
  console.log(`[1] Hash inicial de dev.db verificado: ${initialDevDbHash} (Íntegro)`);

  // 2. Gerar segredos fortes aleatórios e credenciais únicas para o teste de fumaça
  const jwtSecret = crypto.randomBytes(32).toString("hex");
  const hmacSecret = crypto.randomBytes(32).toString("hex");
  const adminEmail = `admin.smoke.${Date.now()}@industriaproducao.com.br`;
  const adminPassword = `PcpProd_SecretPassword_${Date.now()}`;
  const adminPin = "987321";

  const tsxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

  // 3. Teste Fail-Safe: Produção recusa iniciar com segredos fracos
  console.log("\n[2] Testando Fail-Safe de inicialização em produção com segredos fracos...");
  const weakExitCode = await new Promise<number>((resolve) => {
    const weakProc = spawn(tsxCmd, ["tsx", "src/server.ts"], {
      cwd: BACKEND_DIR,
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: "4098",
        DATABASE_URL: `file:${TEMP_SMOKE_DB}`,
        UPLOADS_DIR: TEMP_SMOKE_UPLOADS,
        JWT_SECRET: "weak_dev_secret",
        HMAC_SECRET: "short",
      },
      stdio: "pipe",
    });
    weakProc.on("close", (code) => resolve(code ?? 1));
  });

  if (weakExitCode === 0) {
    throw new Error("FALHA: O servidor em produção deveria ter recusado iniciar com segredos fracos!");
  }
  console.log(`  ✔ Servidor recusou iniciar com segredos fracos (Código de saída: ${weakExitCode}).`);

  // 4. Executar o script de inicialização initProductionDatabase() no banco temporário
  console.log("\n[3] Executando initProductionDatabase() no banco temporário limpo...");
  process.env.DATABASE_URL = `file:${TEMP_SMOKE_DB}`;
  process.env.ADMIN_EMAIL = adminEmail;
  process.env.ADMIN_PASSWORD = adminPassword;
  process.env.ADMIN_PIN = adminPin;

  const initResult = await initProductionDatabase();

  console.log(`  ✔ Banco temporário inicializado: ${initResult.dbPath}`);
  console.log(`  ✔ Setores criados: ${initResult.sectorsCount} (esperado: 14)`);
  console.log(`  ✔ Tipos de defeito: ${initResult.defectTypesCount} (esperado: 6)`);
  console.log(`  ✔ Usuários criados: ${initResult.usersCount} (esperado: 1)`);
  console.log(`  ✔ PRAGMA integrity_check: ${initResult.integrityCheck}`);

  if (initResult.sectorsCount !== 14 || initResult.defectTypesCount !== 6 || initResult.usersCount !== 1) {
    throw new Error("FALHA: Contagens de referência pós-inicialização divergentes!");
  }

  // 5. Testar recusa em segundo POST do script no mesmo banco
  console.log("\n[4] Testando recusa de re-execução do script no mesmo banco (já existente com dados)...");
  let secondRunRefused = false;
  try {
    await initProductionDatabase();
  } catch (err: any) {
    if (err.message && err.message.includes("FATAL FAIL-SAFE")) {
      secondRunRefused = true;
      console.log(`  ✔ Re-execução recusada com segurança: ${err.message}`);
    } else {
      throw err;
    }
  }

  if (!secondRunRefused) {
    throw new Error("FALHA: O script deveria ter recusado rodar sobre banco que já possui dados!");
  }

  // 6. Subir o servidor Express em modo produção real apontando para o banco temporário
  console.log("\n[5] Iniciando servidor Express em modo produção (porta 4099)...");
  const PORT = 4099;
  const serverProc = spawn(tsxCmd, ["tsx", "src/server.ts"], {
    cwd: BACKEND_DIR,
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      DATABASE_URL: `file:${TEMP_SMOKE_DB}`,
      UPLOADS_DIR: TEMP_SMOKE_UPLOADS,
      JWT_SECRET: jwtSecret,
      HMAC_SECRET: hmacSecret,
    },
    stdio: "pipe",
  });

  serverProc.stdout.on("data", (d) => {
    console.log(`[Prod Server] ${d.toString().trim()}`);
  });
  serverProc.stderr.on("data", (d) => {
    console.error(`[Prod Server Error] ${d.toString().trim()}`);
  });

  try {
    const isReady = await waitHttpReady(PORT, 12000);
    if (!isReady) {
      throw new Error("Servidor de produção não respondeu na porta 4099 dentro do tempo limite.");
    }
    console.log(`  ✔ Servidor Express de produção ouvindo e respondendo na porta ${PORT}!`);

    // 7. Login do Admin
    console.log("\n[6] Testando login do Administrador...");
    const loginRes = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });

    const loginBody: any = await loginRes.json();
    if (loginRes.status !== 200 || !loginBody.token || loginBody.user.role !== "ADMIN") {
      throw new Error(`FALHA no login do Admin: status=${loginRes.status}, resp=${JSON.stringify(loginBody)}`);
    }
    const adminToken = loginBody.token;
    console.log(`  ✔ Login do Admin bem-sucedido (200 OK, token JWT emitido).`);

    // 8. GET de setores devolve 14 na ordem correta
    console.log("\n[7] Consultando GET /api/sectors...");
    const sectorsRes = await fetch(`http://127.0.0.1:${PORT}/api/sectors`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const sectors: any[] = await sectorsRes.json();
    if (sectorsRes.status !== 200 || sectors.length !== 14) {
      throw new Error(`FALHA: Esperados 14 setores, recebidos ${sectors.length}`);
    }

    const expectedCodes = [
      "PRE_VENDA", "DESIGNER", "VENDAS", "SAC_INTERNO", "PRE_DIAGRAMACAO",
      "DIAGRAMACAO", "IMPRESSAO", "INFESTO", "CALANDRA", "SEPARACAO",
      "DESPACHE_OFICINA", "COSTURA", "QUALIDADE", "EXPEDICAO",
    ];

    sectors.forEach((s, idx) => {
      if (s.code !== expectedCodes[idx] || s.sequenceOrder !== idx + 1) {
        throw new Error(`FALHA na ordenação: posição ${idx + 1} é [${s.code}], esperado [${expectedCodes[idx]}]`);
      }
    });
    console.log(`  ✔ Todos os 14 setores retornados na sequência oficial exata 1 a 14.`);

    // 9. Admin cria operador para cada setor 11 a 14 e operador faz login
    console.log("\n[8] Admin criando operadores para os Setores 11 a 14 e testando login de cada um...");
    const testOperators = [
      { seq: 11, code: "DESPACHE_OFICINA", name: "Op Despache Oficina", email: "op.despache@industria.com.br", pass: "SenhaOp11_Forte123", pin: "112233" },
      { seq: 12, code: "COSTURA", name: "Op Costura", email: "op.costura@industria.com.br", pass: "SenhaOp12_Forte123", pin: "223344" },
      { seq: 13, code: "QUALIDADE", name: "Op Qualidade", email: "op.qualidade@industria.com.br", pass: "SenhaOp13_Forte123", pin: "334455" },
      { seq: 14, code: "EXPEDICAO", name: "Op Expedição", email: "op.expedicao@industria.com.br", pass: "SenhaOp14_Forte123", pin: "445566" },
    ];

    for (const op of testOperators) {
      const sectorObj = sectors.find((s) => s.code === op.code);
      if (!sectorObj) throw new Error(`Setor ${op.code} não encontrado na lista de setores.`);

      // Criar usuário via endpoint POST /api/users
      const createRes = await fetch(`http://127.0.0.1:${PORT}/api/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: op.name,
          email: op.email,
          password: op.pass,
          role: "OPERADOR",
          sectorId: sectorObj.id,
          signaturePin: op.pin,
        }),
      });

      const createBody: any = await createRes.json();
      if (createRes.status !== 201) {
        throw new Error(`FALHA ao criar operador para ${op.code}: status=${createRes.status}, resp=${JSON.stringify(createBody)}`);
      }
      console.log(`  ✔ Operador criado com sucesso para Setor ${op.seq} [${op.code}] (201 Created).`);

      // Testar login do operador
      const opLoginRes = await fetch(`http://127.0.0.1:${PORT}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: op.email, password: op.pass }),
      });
      const opLoginBody: any = await opLoginRes.json();
      if (opLoginRes.status !== 200 || !opLoginBody.token || opLoginBody.user.sectorCode !== op.code) {
        throw new Error(`FALHA no login do operador ${op.code}: status=${opLoginRes.status}, resp=${JSON.stringify(opLoginBody)}`);
      }
      console.log(`  ✔ Login do Operador [${op.code}] bem-sucedido (200 OK, setor confirmado: ${opLoginBody.user.sectorCode}).`);
    }

  } finally {
    // Encerrar processo do servidor
    serverProc.kill("SIGINT");
    await new Promise((r) => setTimeout(r, 1000));
    try {
      serverProc.kill("SIGKILL");
    } catch (_) {}
  }

  // 10. Limpar banco temporário e uploads temporários
  console.log("\n[9] Limpando arquivos temporários do teste de fumaça...");
  cleanTempFiles();
  console.log("  ✔ Banco temporário e uploads temporários removidos com sucesso.");

  // 11. Conferência final de integridade de dev.db e uploads operacionais
  console.log("\n[10] Conferindo integridade dos arquivos operacionais pós-teste...");
  const finalDevDbHash = getFileSha256(DEV_DB_PATH);
  if (finalDevDbHash !== DEV_DB_EXPECTED_HASH) {
    throw new Error(`ERRO CRÍTICO: dev.db foi modificado durante o teste de fumaça! Esperado: ${DEV_DB_EXPECTED_HASH}, Atual: ${finalDevDbHash}`);
  }
  console.log(`  ✔ SHA-256 de dev.db permanece 100% INTACTO: ${finalDevDbHash}`);

  const uploadsFiles = [
    ...fs.readdirSync(path.resolve(BACKEND_DIR, "uploads", "references")),
    ...fs.readdirSync(path.resolve(BACKEND_DIR, "uploads", "artwork")),
  ];
  if (uploadsFiles.length !== 15) {
    throw new Error(`ERRO CRÍTICO: uploads operacionais alterados! Esperados 15 arquivos, encontrados: ${uploadsFiles.length}`);
  }
  console.log(`  ✔ uploads operacionais com exatamente 15 arquivos intactos.`);

  console.log("\n================================================================================");
  console.log("✔ TESTE DE FUMAÇA CONCLUÍDO COM 100% DE SUCESSO EM TODAS AS ETAPAS!");
  console.log("================================================================================");
}

runSmokeTest().catch((err) => {
  console.error("ERRO NO TESTE DE FUMAÇA:", err);
  cleanTempFiles();
  process.exit(1);
});
