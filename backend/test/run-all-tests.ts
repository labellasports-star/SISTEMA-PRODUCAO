import path from "path";
import fs from "fs";
import crypto from "crypto";
import { execSync } from "child_process";

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function cleanDirectorySafely(dir: string): void {
  const norm = dir.replace(/\\/g, "/");
  if (!norm.includes("test_uploads")) {
    throw new Error("FAIL-SAFE: Tentativa de limpeza fora de test_uploads!");
  }
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function run() {
  const backendDir = path.resolve(process.cwd());
  const devDbPath = path.resolve(backendDir, "prisma", "dev.db");
  const testDbPath = path.resolve(backendDir, "prisma", "test.db").replace(/\\/g, "/");
  const testUploadsDir = path.resolve(backendDir, "test_uploads").replace(/\\/g, "/");

  // Limpeza inicial de test_uploads
  cleanDirectorySafely(testUploadsDir);

  const hashBefore = sha256(devDbPath);
  console.log(`\n===============================================================`);
  console.log(`=== EXECUTOR CENTRAL DE TESTES ISOLADOS (test.db + test_uploads) ===`);
  console.log(`===============================================================`);
  console.log(`[Segurança] Hash SHA-256 de dev.db antes dos testes:\n  ${hashBefore}`);
  console.log(`[Segurança] Diretório de uploads de teste isolado:\n  ${testUploadsDir}`);

  const suites = [
    "test/init-test-db.ts",
    "test/upload-isolation.test.ts",
    "test/integration.test.ts",
    "test/etapa2-commercial-flow.test.ts",
    "test/etapa2-corrections.test.ts",
    "test/etapa2-security-audit.test.ts",
    "test/etapa3-production-flow.test.ts",
    "test/rbac-corrections.test.ts",
    "test/audit-corrections.test.ts",
    "test/setor11-dispatch.test.ts",
    "test/setor12-costura.test.ts",
    "test/setor13-qualidade.test.ts",
    "test/setor14-expedicao.test.ts",
    "test/dashboard-analytics.test.ts",
    "test/pin-transition-enforcement.test.ts",
    "test/universal-sheet.test.ts",
    "test/designer-workflow.test.ts",
    "test/catalog-and-op-numbering.test.ts",
    "test/end-to-end-pipeline.test.ts",
  ];

  for (const suite of suites) {
    console.log(`\n>>> Executando: ${suite}`);
    execSync(`npx tsx ${suite}`, {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: `file:${testDbPath}`,
        TEST_DATABASE_URL: `file:${testDbPath}`,
        TEST_UPLOADS_DIR: testUploadsDir,
        JWT_SECRET: "pcp_industrial_secret_super_seguro_2026_uniformes",
        HMAC_SIGNATURE_SECRET: "pcp_master_hmac_sha256_secret_key_server_env_2026_producao_confidencial",
      },
    });
  }

  // Limpeza final de test_uploads
  cleanDirectorySafely(testUploadsDir);

  const hashAfter = sha256(devDbPath);
  console.log(`\n===============================================================`);
  console.log(`[Segurança] Hash SHA-256 de dev.db após todos os testes:\n  ${hashAfter}`);
  console.log(`===============================================================`);

  if (hashBefore !== hashAfter) {
    console.error("❌ ERRO CRÍTICO: dev.db foi modificado durante a execução dos testes!");
    process.exit(1);
  } else {
    console.log("✔ SUCESSO TOTAL: 100% dos testes executados exclusivamente em test.db e test_uploads.");
    console.log("✔ COMPROVAÇÃO: O banco operacional dev.db permaneceu 100% INTACTO!");
  }
}

run().catch((err) => {
  console.error("Falha na execução dos testes:", err);
  process.exit(1);
});
