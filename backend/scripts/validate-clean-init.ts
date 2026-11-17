import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { initProductionDatabase } from "./init-production-db.js";

async function runCleanInitValidation() {
  console.log("================================================================================");
  console.log("=== VALIDAÇÃO DE INICIALIZAÇÃO LIMPA E PROTEÇÕES DE BANCO DE PRODUÇÃO ===");
  console.log("================================================================================");

  const baseDir = process.cwd();
  const testDir = path.resolve(baseDir, "test_clean_init_env");
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const cleanDbPath = path.join(testDir, "clean_prod_stage.db").replace(/\\/g, "/");

  try {
    // 1. Teste de Proteção contra dev.db
    console.log("\n[1/4] Testando Fail-Safe 1: Bloqueio de execução sobre dev.db...");
    process.env.DATABASE_URL = "file:./prisma/dev.db";
    let blockedDev = false;
    try {
      await initProductionDatabase();
    } catch (err: any) {
      if (err.message && err.message.includes("recusa categoricamente operar sobre")) {
        blockedDev = true;
        console.log(`✔ [PROTEÇÃO 1 CONFIRMADA] Tentativa bloqueada com sucesso: "${err.message}"`);
      } else {
        throw err;
      }
    }
    if (!blockedDev) throw new Error("Falha de segurança: o script permitiu tentar operar sobre dev.db!");

    // 2. Teste de Bloqueio de Credenciais Padrão Inseguras
    console.log("\n[2/4] Testando rejeição de credenciais padrão/fracas...");
    process.env.DATABASE_URL = `file:${cleanDbPath}`;
    process.env.ADMIN_EMAIL = "admin@fabrica.com"; // Inseguro
    process.env.ADMIN_PASSWORD = "admin"; // < 8 chars
    process.env.ADMIN_PIN = "123456"; // Fraco

    let blockedWeak = false;
    try {
      await initProductionDatabase();
    } catch (err: any) {
      if (err.message && (err.message.includes("padrão") || err.message.includes("mínimo 8 caracteres"))) {
        blockedWeak = true;
        console.log(`✔ [PROTEÇÃO 2 CONFIRMADA] Credenciais inseguras barradas: "${err.message}"`);
      } else {
        throw err;
      }
    }
    if (!blockedWeak) throw new Error("Falha de segurança: credenciais fracas não foram rejeitadas!");

    // 3. Execução Limpa com credenciais válidas em banco temporário
    console.log("\n[3/4] Executando inicialização limpa com credenciais fortes e seguras...");
    if (fs.existsSync(cleanDbPath)) fs.unlinkSync(cleanDbPath);

    process.env.ADMIN_EMAIL = "diretoria.industrial@labellasports.com.br";
    process.env.ADMIN_PASSWORD = "StrongP@ssw0rd!2026";
    process.env.ADMIN_PIN = "948215";

    const result = await initProductionDatabase();
    console.log(`✔ Inicialização concluída com sucesso!`);
    console.log(`   - Setores cadastrados: ${result.sectorsCount} (esperado 14)`);
    console.log(`   - Tipos de Defeito: ${result.defectTypesCount} (esperado 6)`);
    console.log(`   - Categorias Oficiais: ${result.categoriesCount} (esperado 5)`);
    console.log(`   - Produtos do Catálogo: ${result.productsCount} (esperado 9)`);
    console.log(`   - Oficinas de Costura: ${result.partnersCount} (esperado 2)`);
    console.log(`   - Usuários Administradores: ${result.usersCount} (esperado 1)`);
    console.log(`   - PRAGMA integrity_check: ${result.integrityCheck}`);

    if (result.sectorsCount !== 14 || result.defectTypesCount !== 6 || result.categoriesCount !== 5 || result.productsCount !== 9 || result.partnersCount !== 2 || result.usersCount !== 1) {
      throw new Error("Cadastros iniciais divergem do pacote oficial de homologação!");
    }
    if (result.integrityCheck !== "ok") {
      throw new Error("Integridade do banco de produção recém-criado falhou!");
    }

    // 4. Teste de Fail-Safe 2: Proteção contra sobrescrita acidental em banco com dados
    console.log("\n[4/4] Testando Fail-Safe 2: Rejeição de inicialização sobre banco de produção existente...");
    let blockedExisting = false;
    try {
      await initProductionDatabase();
    } catch (err: any) {
      if (err.message && err.message.includes("já existe e contém")) {
        blockedExisting = true;
        console.log(`✔ [PROTEÇÃO 3 CONFIRMADA] Tentativa de sobrescrita bloqueada: "${err.message}"`);
      } else {
        throw err;
      }
    }
    if (!blockedExisting) throw new Error("Falha de segurança: o script permitiu rodar sobre banco já inicializado!");

    console.log("\n================================================================================");
    console.log("=== TODAS AS 4 VALIDAÇÕES DE INICIALIZAÇÃO E PROTEÇÃO FORAM APROVADAS! ===");
    console.log("================================================================================");
  } finally {
    // Limpeza de arquivos de teste
    try {
      if (fs.existsSync(cleanDbPath)) fs.unlinkSync(cleanDbPath);
      const walPath = `${cleanDbPath}-wal`;
      const shmPath = `${cleanDbPath}-shm`;
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir, { recursive: true });
    } catch (_) {}
  }
}

runCleanInitValidation().catch((err) => {
  console.error("❌ ERRO NA VALIDAÇÃO DE INICIALIZAÇÃO:", err);
  process.exit(1);
});
