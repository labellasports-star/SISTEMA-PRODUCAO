import path from "path";
import fs from "fs";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import {
  createFullSystemBackup,
  restoreBackupToIsolatedDirectory,
  listAvailableBackups,
  pruneOldBackups,
  calculateFileSha256,
} from "../src/utils/backup.js";

async function main() {
  console.log("================================================================================");
  console.log("=== ENSAIO RIGOROSO DE BACKUP, RETENÇÃO E RECUPERAÇÃO DE DESASTRE ===");
  console.log("================================================================================");

  const baseDir = path.resolve(process.cwd());
  const rehearsalDbPath = path.resolve(baseDir, "prisma", "rehearsal_stage.db").replace(/\\/g, "/");
  const rehearsalUploads = path.resolve(baseDir, "rehearsal_uploads").replace(/\\/g, "/");
  const rehearsalRestored = path.resolve(baseDir, "rehearsal_restored").replace(/\\/g, "/");

  // Limpeza inicial
  if (fs.existsSync(rehearsalDbPath)) fs.unlinkSync(rehearsalDbPath);
  if (fs.existsSync(rehearsalUploads)) fs.rmSync(rehearsalUploads, { recursive: true, force: true });
  if (fs.existsSync(rehearsalRestored)) fs.rmSync(rehearsalRestored, { recursive: true, force: true });

  fs.mkdirSync(path.join(rehearsalUploads, "references"), { recursive: true });
  fs.mkdirSync(path.join(rehearsalUploads, "artwork"), { recursive: true });

  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = `file:${rehearsalDbPath}`;
  process.env.UPLOADS_DIR = rehearsalUploads;

  // 1. Inicializar banco limpo e inserir registros conhecidos
  console.log("[1/7] Criando registros conhecidos no banco e uploads...");
  const { initProductionDatabase } = await import("./init-production-db.js");
  process.env.ADMIN_EMAIL = "admin.rehearsal@fabrica.com";
  process.env.ADMIN_PASSWORD = "SenhaForteRehearsal123@";
  process.env.ADMIN_PIN = "887766";
  await initProductionDatabase();

  const client = new PrismaClient({ datasources: { db: { url: `file:${rehearsalDbPath}` } } });
  
  // Criar cliente e cotação conhecidos
  const customer = await client.customer.create({
    data: {
      companyName: "Time Galácticos FC",
      contactName: "Capitão Silva",
      phone: "(11) 97777-1111",
    },
  });

  const quotation = await client.quotation.create({
    data: {
      customer: { connect: { id: customer.id } },
      seller: { connect: { email: "admin.rehearsal@fabrica.com" } },
      quotationNumber: "ORC-REHEARSAL-001",
      teamName: "Galácticos FC",
      productsSummary: "25x Camisa Classic Dry Fit",
      totalQuantity: 25,
      budgetAmount: 1250.0,
      status: "OPEN",
    },
  });

  // Criar arquivos conhecidos em uploads
  const sampleRefPath = path.join(rehearsalUploads, "references", "briefing_oficial.txt");
  fs.writeFileSync(sampleRefPath, "CONTEUDO_CONHECIDO_DE_BRIEFING_1234567890", "utf-8");
  const sampleRefSha = calculateFileSha256(sampleRefPath);

  const sampleArtPath = path.join(rehearsalUploads, "artwork", "layout_aprovado.png");
  fs.writeFileSync(sampleArtPath, Buffer.from("FAKE_PNG_BINARY_DATA_LABELLA_SPORTS_HOMOLOG"));
  const sampleArtSha = calculateFileSha256(sampleArtPath);

  // Forçar escrita no WAL
  await client.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");

  console.log(`✔ Registros criados: Cliente '${customer.companyName}', Cotação '${quotation.quotationNumber}'`);
  console.log(`✔ Uploads criados: briefing_oficial.txt (SHA: ${sampleRefSha.substring(0, 16)}...), layout_aprovado.png (SHA: ${sampleArtSha.substring(0, 16)}...)`);

  // 2. Executar Backup Completo do Sistema (VACUUM INTO + Uploads)
  console.log("\n[2/7] Executando rotina oficial de backup completo (createFullSystemBackup)...");
  const backupResult = await createFullSystemBackup({ requestedBy: "ENSAIO_RECUPERACAO", prismaClient: client });
  await client.$disconnect();

  console.log(`✔ Backup criado com sucesso! ID: ${backupResult.backupId}`);
  console.log(`✔ Total de arquivos catalogados: ${backupResult.manifest.totalFiles}`);
  console.log(`✔ Integridade SQLite no snapshot: ${backupResult.manifest.database?.integrityCheck}`);
  console.log(`✔ Registros no snapshot do banco: Clientes=${backupResult.manifest.database?.recordsCount.customers}, Cotações=${backupResult.manifest.database?.recordsCount.quotations}`);

  if (backupResult.manifest.database?.integrityCheck !== "ok") {
    throw new Error("Integridade do SQLite reportada como falha no backup!");
  }
  if (backupResult.manifest.database?.recordsCount.customers !== 1) {
    throw new Error(`Esperava 1 cliente no backup, mas encontrou ${backupResult.manifest.database?.recordsCount.customers}`);
  }
  if (backupResult.manifest.database?.recordsCount.quotations !== 1) {
    throw new Error(`Esperava 1 cotação no backup, mas encontrou ${backupResult.manifest.database?.recordsCount.quotations}`);
  }

  // 3. Restaurar Backup em Diretório Isolado
  console.log("\n[3/7] Restaurando backup em diretório isolado de homologação...");
  const restoreResult = await restoreBackupToIsolatedDirectory(
    backupResult.backupId,
    rehearsalRestored
  );
  console.log(`✔ Restauração concluída: ${restoreResult.verifiedFilesCount} arquivos verificados`);
  console.log(`✔ Integridade do banco restaurado: ${restoreResult.databaseIntegrity}`);
  console.log(`✔ Registros confirmados no banco restaurado:`);
  console.log(`   - Clientes: ${restoreResult.restoredRecords.customers}`);
  console.log(`   - Cotações: ${restoreResult.restoredRecords.quotations}`);

  // 4. Validar integridade dos arquivos restaurados
  console.log("\n[4/7] Conferindo conteúdo e hashes dos arquivos de uploads restaurados...");
  const restoredRefPath = path.join(rehearsalRestored, "uploads", "references", "briefing_oficial.txt");
  const restoredArtPath = path.join(rehearsalRestored, "uploads", "artwork", "layout_aprovado.png");

  if (!fs.existsSync(restoredRefPath) || !fs.existsSync(restoredArtPath)) {
    throw new Error("Arquivos restaurados não foram encontrados nos diretórios esperados!");
  }

  const restoredRefSha = calculateFileSha256(restoredRefPath);
  const restoredArtSha = calculateFileSha256(restoredArtPath);

  if (restoredRefSha !== sampleRefSha || restoredArtSha !== sampleArtSha) {
    throw new Error("Checksum dos arquivos restaurados diverge do original!");
  }
  console.log("✔ Conteúdo dos arquivos de uploads restaurados 100% idêntico aos originais!");

  // 5. Testar rejeição contra backup corrompido
  console.log("\n[5/7] Testando proteção contra restauração de backup corrompido...");
  const backupsRoot = path.resolve(baseDir, "backups");
  const corruptedBackupId = `corrupted_test_${Date.now()}`;
  const corruptedDir = path.join(backupsRoot, corruptedBackupId);

  // Copia o backup válido e corrompe 1 byte
  fs.cpSync(backupResult.backupPath, corruptedDir, { recursive: true });
  const corruptFile = path.join(corruptedDir, "uploads", "references", "briefing_oficial.txt");
  fs.appendFileSync(corruptFile, "_BYTE_CORRUPTO_INJETADO_");

  let caughtCorruption = false;
  try {
    const corruptRestoreTarget = path.join(baseDir, "rehearsal_corrupt_target");
    await restoreBackupToIsolatedDirectory(corruptedBackupId, corruptRestoreTarget);
  } catch (err: any) {
    caughtCorruption = true;
    console.log(`✔ [PROTEÇÃO CONFIRMADA] Tentativa de restaurar backup adulterado foi barrada com sucesso!`);
    console.log(`   Mensagem capturada: "${err.message}"`);
  } finally {
    if (fs.existsSync(corruptedDir)) fs.rmSync(corruptedDir, { recursive: true, force: true });
  }

  if (!caughtCorruption) {
    throw new Error("FALHA DE SEGURANÇA: O sistema restaurou um arquivo corrompido sem detectar alteração no SHA-256!");
  }

  // 6. Testar política de retenção (Pruning de backups antigos)
  console.log("\n[6/7] Testando política de retenção (pruneOldBackups)...");
  // Criar 3 snapshots fictícios adicionais
  for (let i = 1; i <= 3; i++) {
    const dummyId = `dummy_backup_retention_${i}_${Date.now()}`;
    const dummyDir = path.join(backupsRoot, dummyId);
    fs.mkdirSync(dummyDir, { recursive: true });
    fs.writeFileSync(
      path.join(dummyDir, "manifest.json"),
      JSON.stringify({
        version: "2.0",
        backupId: dummyId,
        createdAt: new Date(Date.now() - (i * 100000)).toISOString(),
        status: "SUCCESS",
        totalFiles: 0,
        totalSizeBytes: 0,
        categories: [],
        files: [],
      })
    );
  }

  const beforePrune = listAvailableBackups();
  console.log(`  Total de backups antes da retenção: ${beforePrune.length}`);

  // Aplicar retenção mantendo no máximo 2 backups
  const pruneResult = pruneOldBackups({ maxBackups: 2 });
  console.log(`✔ Backups mantidos: ${pruneResult.keptBackups.length}`);
  console.log(`✔ Backups purgados: ${pruneResult.deletedBackups.length}`);

  const afterPrune = listAvailableBackups();
  console.log(`  Total de backups após retenção: ${afterPrune.length} (esperado <= 2)`);

  if (afterPrune.length > 2) {
    throw new Error(`Falha na retenção: Esperava no máximo 2 backups, encontrou ${afterPrune.length}`);
  }

  // 7. Limpeza dos artefatos de ensaio
  console.log("\n[7/7] Limpando ambiente de ensaio...");
  if (fs.existsSync(rehearsalDbPath)) fs.unlinkSync(rehearsalDbPath);
  if (fs.existsSync(rehearsalUploads)) fs.rmSync(rehearsalUploads, { recursive: true, force: true });
  if (fs.existsSync(rehearsalRestored)) fs.rmSync(rehearsalRestored, { recursive: true, force: true });

  // Limpar os backups criados durante o ensaio
  for (const b of listAvailableBackups()) {
    if (b.backupId.startsWith("full_backup_") || b.backupId.startsWith("dummy_")) {
      const bDir = path.join(backupsRoot, b.backupId);
      if (fs.existsSync(bDir)) fs.rmSync(bDir, { recursive: true, force: true });
    }
  }

  console.log("✔ Todos os arquivos de ensaio temporários foram removidos com segurança.");
  console.log("\n================================================================================");
  console.log("=== ENSAIO DE BACKUP E RECUPERAÇÃO: 100% CONCLUÍDO E APROVADO! ===");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("❌ ERRO NO ENSAIO DE BACKUP:", err);
  process.exit(1);
});
