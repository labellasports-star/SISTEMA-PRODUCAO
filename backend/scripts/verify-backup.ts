import path from "path";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import {
  listAvailableBackups,
  calculateFileSha256,
  BackupManifest,
} from "../src/utils/backup.js";

async function main() {
  console.log("==================================================");
  console.log("=== VERIFICAÇÃO DE INTEGRIDADE DE BACKUPS ===");
  console.log("==================================================");

  const backups = listAvailableBackups();
  if (backups.length === 0) {
    console.warn("⚠️ Nenhum backup encontrado no repositório de backups.");
    process.exit(0);
  }

  const requestedId = process.argv[2];
  const targetBackup = requestedId
    ? backups.find((b) => b.backupId === requestedId)
    : backups[0];

  if (!targetBackup) {
    console.error(`❌ Backup ID '${requestedId}' não foi encontrado.`);
    process.exit(1);
  }

  console.log(`Inspecionando backup: ${targetBackup.backupId}`);
  console.log(`Data de Criação:    ${targetBackup.createdAt}`);
  console.log(`Total de Arquivos:  ${targetBackup.totalFiles}`);
  console.log(`Tamanho Total:      ${(targetBackup.totalSizeBytes / 1024).toFixed(2)} KB`);

  const baseDir = fs.existsSync(path.resolve(process.cwd(), "prisma"))
    ? process.cwd()
    : path.resolve(process.cwd(), "backend");
  const backupDir = path.resolve(baseDir, "backups", targetBackup.backupId);

  let verifiedCount = 0;
  let errorCount = 0;

  for (const f of targetBackup.files) {
    const filePath = path.join(backupDir, f.relativePath);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Arquivo ausente: ${f.relativePath}`);
      errorCount++;
      continue;
    }

    const calculatedSha = calculateFileSha256(filePath);
    if (calculatedSha !== f.sha256) {
      console.error(`❌ Checksum SHA-256 divergente em: ${f.relativePath}`);
      errorCount++;
    } else {
      verifiedCount++;
    }
  }

  // Verificação de integridade SQLite se o backup possuir banco
  let dbIntegrity = "N/A";
  const dbFile = targetBackup.files.find((f) => f.category === "database");
  if (dbFile) {
    const dbPath = path.join(backupDir, dbFile.relativePath).replace(/\\/g, "/");
    const isolatedPrisma = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?mode=ro` } },
    });
    try {
      const integrityRaw: any[] = await isolatedPrisma.$queryRawUnsafe("PRAGMA integrity_check;");
      dbIntegrity = integrityRaw?.[0]?.integrity_check || "ok";
      console.log(`✔ Integridade SQLite: ${dbIntegrity}`);
    } catch (err: any) {
      console.error(`❌ Erro no PRAGMA integrity_check: ${err.message}`);
      errorCount++;
    } finally {
      await isolatedPrisma.$disconnect();
    }
  }

  if (errorCount === 0) {
    console.log("==================================================");
    console.log(`✔ SUCESSO: Todos os ${verifiedCount} arquivos foram verificados com 100% de integridade.`);
    console.log("==================================================");
  } else {
    console.error("==================================================");
    console.error(`❌ FALHA: ${errorCount} erro(s) de integridade detectado(s) neste backup!`);
    console.error("==================================================");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro fatal durante a verificação:", err);
  process.exit(1);
});
