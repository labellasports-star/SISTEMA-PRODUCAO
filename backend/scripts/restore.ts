import path from "path";
import fs from "fs";
import {
  listAvailableBackups,
  restoreBackupToIsolatedDirectory,
} from "../src/utils/backup.js";

async function main() {
  console.log("==================================================");
  console.log("=== PROCEDIMENTO DE RESTAURAÇÃO DE BACKUP ===");
  console.log("==================================================");

  const backups = listAvailableBackups();
  if (backups.length === 0) {
    console.error("❌ Nenhum backup disponível para restauração.");
    process.exit(1);
  }

  const requestedBackupId = process.argv[2];
  const targetBackup = requestedBackupId
    ? backups.find((b) => b.backupId === requestedBackupId)
    : backups[0];

  if (!targetBackup) {
    console.error(`❌ Backup ID '${requestedBackupId}' não encontrado.`);
    console.log("Backups disponíveis:");
    backups.forEach((b) => console.log(` - ${b.backupId} (${b.createdAt})`));
    process.exit(1);
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/T/, "_")
    .replace(/:/g, "")
    .replace(/\..+/, "");
  
  const baseDir = fs.existsSync(path.resolve(process.cwd(), "prisma"))
    ? process.cwd()
    : path.resolve(process.cwd(), "backend");

  const isolatedTargetDir = path.resolve(
    baseDir,
    "backups",
    `restored_${targetBackup.backupId}_${timestamp}`
  );

  console.log(`[Segurança] Restauração segura para diretório isolado:`);
  console.log(`  Origem:    ${targetBackup.backupId} (${targetBackup.createdAt})`);
  console.log(`  Destino:   ${isolatedTargetDir}`);
  console.log(`[Aviso] O banco de dados operacional NUNCA é sobrescrito automaticamente.`);

  try {
    const result = await restoreBackupToIsolatedDirectory(
      targetBackup.backupId,
      isolatedTargetDir
    );

    console.log("\n==================================================");
    console.log("✔ RESTAURAÇÃO E VALIDAÇÃO CONCLUÍDAS COM SUCESSO!");
    console.log("==================================================");
    console.log(`Arquivos verificados: ${result.verifiedFilesCount}`);
    console.log(`Integridade SQLite:   ${result.databaseIntegrity}`);
    console.log(`Registros restaurados no snapshot:`);
    console.log(`  - Usuários:        ${result.restoredRecords.users}`);
    console.log(`  - Clientes:        ${result.restoredRecords.customers}`);
    console.log(`  - Orçamentos:      ${result.restoredRecords.quotations}`);
    console.log(`  - OPs:             ${result.restoredRecords.orders}`);
    console.log(`  - Lotes (Batches): ${result.restoredRecords.batches}`);
    console.log(`  - Movimentações:   ${result.restoredRecords.movements}`);
    console.log(`  - Auditoria:       ${result.restoredRecords.auditLogs}`);
    console.log("--------------------------------------------------");
    console.log("INSTRUÇÕES PARA APLICAÇÃO EM PRODUÇÃO (RECUPERAÇÃO DE DESASTRE):");
    console.log("1. Pare o serviço do servidor (PM2 / Windows Service).");
    console.log("2. Faça uma cópia de segurança do arquivo de produção atual antes de substituir.");
    console.log(`3. Copie o banco restaurado '${isolatedTargetDir}/database.db' para o caminho de DATABASE_URL.`);
    console.log(`4. Copie os uploads restaurados '${isolatedTargetDir}/uploads/' para o diretório de UPLOADS_DIR.`);
    console.log("5. Reinicie o serviço do servidor e execute a verificação de saúde (/api/health).");
    console.log("==================================================");
  } catch (err: any) {
    console.error("❌ Erro durante a restauração isolada:", err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Erro fatal na restauração:", err);
  process.exit(1);
});
