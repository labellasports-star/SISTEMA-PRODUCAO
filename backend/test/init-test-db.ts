import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

function getFileSha256(filePath: string): string {
  if (!fs.existsSync(filePath)) return "FILE_NOT_FOUND";
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function main() {
  console.log("===============================================================");
  console.log("=== INICIALIZANDO AMBIENTE DE TESTES ISOLADO (test.db) ===");
  console.log("===============================================================");

  const projectRoot = path.resolve(process.cwd());
  const prismaDir = path.resolve(projectRoot, "prisma");
  const testDbFile = path.resolve(prismaDir, "test.db");
  const devDbFile = path.resolve(prismaDir, "dev.db");

  const devDbShaBefore = getFileSha256(devDbFile);
  console.log(`[Segurança] dev.db operacional antes do setup: ${devDbShaBefore} (${fs.statSync(devDbFile).size} bytes)`);

  // 1. Remover arquivos antigos do banco de testes
  for (const ext of ["", "-journal", "-wal", "-shm"]) {
    const p = `${testDbFile}${ext}`;
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (_) {}
    }
  }

  // 2. Empurrar o schema diretamente para o test.db via child_process isolado
  const normalizedTestDbUrl = `file:${testDbFile.replace(/\\/g, "/")}`;
  console.log(`[1/3] Sincronizando schema com: ${normalizedTestDbUrl}`);

  execSync("npx.cmd prisma db push --skip-generate", {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: normalizedTestDbUrl,
      TEST_DATABASE_URL: normalizedTestDbUrl,
    },
    stdio: "inherit",
  });

  // 3. Executar o seed inicial no test.db
  console.log("[2/3] Executando seed de setores e usuários no banco de teste...");
  execSync("npx.cmd tsx prisma/seed.ts", {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: normalizedTestDbUrl,
      TEST_DATABASE_URL: normalizedTestDbUrl,
    },
    stdio: "inherit",
  });

  // 4. Conectar e validar via engine SQLite
  const testPrisma = new PrismaClient({
    datasources: { db: { url: normalizedTestDbUrl } },
  });

  const dbList = await testPrisma.$queryRawUnsafe<any[]>("PRAGMA database_list;");
  const mainDb = dbList.find((db: any) => db.name === "main");
  const activeFile = (mainDb?.file || "").replace(/\\/g, "/");

  if (activeFile.includes("dev.db")) {
    throw new Error(`FATAL: Falha crítica de isolamento! O banco ativo é ${activeFile}`);
  }

  const sectorsCount = await testPrisma.sector.count();
  const usersCount = await testPrisma.user.count();

  console.log(`[3/3] Validação: test.db pronto com ${sectorsCount} setores e ${usersCount} usuários homologados.`);
  console.log(`Arquivo do SQLite ativo confirmado: ${activeFile}`);

  await testPrisma.$disconnect();

  const devDbShaAfter = getFileSha256(devDbFile);
  if (devDbShaBefore !== devDbShaAfter) {
    throw new Error("ALERTA CRÍTICO: O arquivo dev.db foi modificado durante a inicialização do banco de teste!");
  }

  console.log("✔ SUCESSO: Ambiente de testes isolado preparado. dev.db permanece 100% INTACTO.\n");
}

main().catch((err) => {
  console.error("FATAL ao preparar banco de testes:", err);
  process.exit(1);
});
