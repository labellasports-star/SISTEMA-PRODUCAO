import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Se NODE_ENV=production e existir .env.production, carrega o arquivo de produção
const prodEnvPath = path.resolve(process.cwd(), ".env.production");
if (fs.existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath, override: true });
} else {
  dotenv.config();
}

import { createFullSystemBackup } from "../src/utils/backup.js";

async function main() {
  console.log("==================================================");
  console.log("=== EXECUTANDO BACKUP DO PCP INDUSTRIAL ===");
  console.log("==================================================");
  try {
    const result = await createFullSystemBackup({ requestedBy: "CLI_BACKUP_SCRIPT" });
    const manifest = result.manifest;
    console.log(`✔ Backup concluído com sucesso! ID: ${manifest.backupId}`);
    console.log(`  Total de arquivos: ${manifest.totalFiles}`);
    console.log(`  Tamanho total: ${(manifest.totalSizeBytes / 1024).toFixed(2)} KB`);
    console.log(`  Diretório: ${result.backupPath}`);
    if (manifest.database) {
      console.log(`  Integridade do Banco: ${manifest.database.integrityCheck}`);
      console.log(`  SHA-256 do Banco: ${manifest.database.sha256}`);
    }
  } catch (err: any) {
    console.error("❌ Erro durante a realização do backup:", err.message);
    process.exit(1);
  }
}

main();
