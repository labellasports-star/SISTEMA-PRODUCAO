import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "../prisma.js";
import { PrismaClient } from "@prisma/client";
import { getUploadRoot } from "./storageConfig.js";

const BASE_DIR = fs.existsSync(path.resolve(process.cwd(), "prisma"))
  ? process.cwd()
  : path.resolve(process.cwd(), "backend");

const BACKUP_ROOT = path.resolve(BASE_DIR, "backups");
const LOG_FILE = path.join(BACKUP_ROOT, "backup-history.log");

export interface BackupFileInfo {
  category: "references" | "artwork" | "database";
  fileName: string;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

export interface BackupManifest {
  version: "1.0" | "2.0";
  backupId: string;
  createdAt: string;
  status: "SUCCESS" | "FAILED" | "IN_PROGRESS";
  totalFiles: number;
  totalSizeBytes: number;
  categories: string[];
  files: BackupFileInfo[];
  system: string;
  requestedBy: string;
  database?: {
    fileName: string;
    relativePath: string;
    sizeBytes: number;
    sha256: string;
    integrityCheck: string;
    recordsCount: {
      users: number;
      customers: number;
      quotations: number;
      orders: number;
      batches: number;
      movements: number;
      auditLogs: number;
    };
  };
}

export function calculateFileSha256(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function ensureDirectoryExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Executa uma rotina segura de backup local dos uploads com integridade transacional
 */
export async function createUploadsBackup(params?: {
  requestedBy?: string;
}): Promise<{
  success: boolean;
  backupId: string;
  backupPath: string;
  manifest: BackupManifest;
}> {
  ensureDirectoryExists(BACKUP_ROOT);

  const timestamp = new Date()
    .toISOString()
    .replace(/T/, "_")
    .replace(/:/g, "")
    .replace(/\..+/, "");
  const backupId = `backup_${timestamp}`;
  const stagingPath = path.join(BACKUP_ROOT, `.staging_${backupId}`);
  const finalPath = path.join(BACKUP_ROOT, backupId);

  ensureDirectoryExists(stagingPath);

  const categories: ("references" | "artwork")[] = ["references", "artwork"];
  const manifestFiles: BackupFileInfo[] = [];
  let totalSizeBytes = 0;

  try {
    for (const cat of categories) {
      const sourceCatDir = path.join(getUploadRoot(), cat);
      const targetCatDir = path.join(stagingPath, cat);
      ensureDirectoryExists(targetCatDir);

      if (fs.existsSync(sourceCatDir)) {
        const fileNames = fs.readdirSync(sourceCatDir);
        for (const fileName of fileNames) {
          const sourceFilePath = path.join(sourceCatDir, fileName);
          const stat = fs.statSync(sourceFilePath);

          if (stat.isFile()) {
            const targetFilePath = path.join(targetCatDir, fileName);
            fs.copyFileSync(sourceFilePath, targetFilePath);

            const sha256 = calculateFileSha256(targetFilePath);
            totalSizeBytes += stat.size;

            manifestFiles.push({
              category: cat,
              fileName,
              relativePath: path.join(cat, fileName).replace(/\\/g, "/"),
              sizeBytes: stat.size,
              sha256,
            });
          }
        }
      }
    }

    const manifest: BackupManifest = {
      version: "1.0",
      backupId,
      createdAt: new Date().toISOString(),
      status: "SUCCESS",
      totalFiles: manifestFiles.length,
      totalSizeBytes,
      categories,
      files: manifestFiles,
      system: "PCP Industrial - Uploads Storage Manager",
      requestedBy: params?.requestedBy || "SYSTEM_AUTOMATION",
    };

    fs.writeFileSync(
      path.join(stagingPath, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );

    fs.renameSync(stagingPath, finalPath);

    const logEntry = JSON.stringify({
      timestamp: manifest.createdAt,
      backupId,
      type: "UPLOADS_ONLY",
      status: "SUCCESS",
      totalFiles: manifest.totalFiles,
      totalSizeBytes: manifest.totalSizeBytes,
      requestedBy: manifest.requestedBy,
    }) + "\n";
    fs.appendFileSync(LOG_FILE, logEntry, "utf-8");

    console.log(`[Backup Service] Backup '${backupId}' criado com sucesso (${manifest.totalFiles} arquivos, ${totalSizeBytes} bytes).`);

    return {
      success: true,
      backupId,
      backupPath: finalPath,
      manifest,
    };
  } catch (err: any) {
    if (fs.existsSync(stagingPath)) {
      try {
        fs.rmSync(stagingPath, { recursive: true, force: true });
      } catch (_) {}
    }

    const failEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      backupId,
      type: "UPLOADS_ONLY",
      status: "FAILED",
      error: err.message,
    }) + "\n";
    fs.appendFileSync(LOG_FILE, failEntry, "utf-8");

    throw new Error(`Falha durante a execução do backup: ${err.message}`);
  }
}

/**
 * Executa uma rotina completa de backup do sistema:
 * 1. Cópia consistente do SQLite via VACUUM INTO
 * 2. Cópia integral de uploads (references e artwork)
 * 3. Geração de manifesto unificado com SHA-256 e integridade SQLite
 * 4. Registro no histórico do sistema
 */
export async function createFullSystemBackup(params?: {
  requestedBy?: string;
  prismaClient?: PrismaClient;
}): Promise<{
  success: boolean;
  backupId: string;
  backupPath: string;
  manifest: BackupManifest;
}> {
  ensureDirectoryExists(BACKUP_ROOT);

  const activePrisma = params?.prismaClient || prisma;

  const timestamp = new Date()
    .toISOString()
    .replace(/T/, "_")
    .replace(/:/g, "")
    .replace(/\..+/, "");
  const backupId = `full_backup_${timestamp}`;
  const stagingPath = path.join(BACKUP_ROOT, `.staging_${backupId}`);
  const finalPath = path.join(BACKUP_ROOT, backupId);

  ensureDirectoryExists(stagingPath);

  try {
    // 1. Snapshot transacionalmente consistente do SQLite via VACUUM INTO
    const stagingDbPath = path.join(stagingPath, "database.db").replace(/\\/g, "/");
    await activePrisma.$executeRawUnsafe(`VACUUM INTO '${stagingDbPath}';`);

    const dbStat = fs.statSync(stagingDbPath);
    const dbSha256 = calculateFileSha256(stagingDbPath);

    // 2. PRAGMA integrity_check na cópia do banco
    const isolatedClient = new PrismaClient({
      datasources: {
        db: {
          url: `file:${stagingDbPath}`,
        },
      },
    });

    let integrityResult = "UNKNOWN";
    let recordsCount = {
      users: 0,
      customers: 0,
      quotations: 0,
      orders: 0,
      batches: 0,
      movements: 0,
      auditLogs: 0,
    };

    try {
      const integrityRaw: any[] = await isolatedClient.$queryRawUnsafe("PRAGMA integrity_check;");
      integrityResult = integrityRaw?.[0]?.integrity_check || "ok";

      recordsCount = {
        users: await isolatedClient.user.count(),
        customers: await isolatedClient.customer.count(),
        quotations: await isolatedClient.quotation.count(),
        orders: await isolatedClient.productionOrder.count(),
        batches: await isolatedClient.opBatch.count(),
        movements: await isolatedClient.opMovement.count(),
        auditLogs: await isolatedClient.auditLog.count(),
      };
    } finally {
      await isolatedClient.$disconnect();
    }

    // 3. Backup de arquivos de uploads
    const manifestFiles: BackupFileInfo[] = [
      {
        category: "database",
        fileName: "database.db",
        relativePath: "database.db",
        sizeBytes: dbStat.size,
        sha256: dbSha256,
      },
    ];
    let totalSizeBytes = dbStat.size;

    const categories: ("references" | "artwork")[] = ["references", "artwork"];
    for (const cat of categories) {
      const sourceCatDir = path.join(getUploadRoot(), cat);
      const targetCatDir = path.join(stagingPath, "uploads", cat);
      ensureDirectoryExists(targetCatDir);

      if (fs.existsSync(sourceCatDir)) {
        const fileNames = fs.readdirSync(sourceCatDir);
        for (const fileName of fileNames) {
          const sourceFilePath = path.join(sourceCatDir, fileName);
          const stat = fs.statSync(sourceFilePath);

          if (stat.isFile()) {
            const targetFilePath = path.join(targetCatDir, fileName);
            fs.copyFileSync(sourceFilePath, targetFilePath);

            const sha256 = calculateFileSha256(targetFilePath);
            totalSizeBytes += stat.size;

            manifestFiles.push({
              category: cat,
              fileName,
              relativePath: path.join("uploads", cat, fileName).replace(/\\/g, "/"),
              sizeBytes: stat.size,
              sha256,
            });
          }
        }
      }
    }

    const manifest: BackupManifest = {
      version: "2.0",
      backupId,
      createdAt: new Date().toISOString(),
      status: "SUCCESS",
      totalFiles: manifestFiles.length,
      totalSizeBytes,
      categories: ["database", "references", "artwork"],
      files: manifestFiles,
      database: {
        fileName: "database.db",
        relativePath: "database.db",
        sizeBytes: dbStat.size,
        sha256: dbSha256,
        integrityCheck: integrityResult,
        recordsCount,
      },
      system: "PCP Industrial - Complete System Backup Manager (SQLite + Uploads)",
      requestedBy: params?.requestedBy || "SYSTEM_BACKUP_SERVICE",
    };

    // Gravar manifesto
    fs.writeFileSync(
      path.join(stagingPath, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );

    // Mover atomicamente do staging para o diretório final
    fs.renameSync(stagingPath, finalPath);

    // Registrar no histórico de logs
    const logEntry = JSON.stringify({
      timestamp: manifest.createdAt,
      backupId,
      type: "FULL_SYSTEM",
      status: "SUCCESS",
      totalFiles: manifest.totalFiles,
      totalSizeBytes: manifest.totalSizeBytes,
      databaseSize: dbStat.size,
      databaseSha256: dbSha256,
      integrityCheck: integrityResult,
      records: recordsCount,
      requestedBy: manifest.requestedBy,
    }) + "\n";
    fs.appendFileSync(LOG_FILE, logEntry, "utf-8");

    console.log(`[Backup Service] Backup completo '${backupId}' criado com sucesso (${manifest.totalFiles} arquivos, ${totalSizeBytes} bytes, integridade: ${integrityResult}).`);

    // Aplicação automática de retenção configurada via BACKUP_RETENTION_COUNT (padrão: 7 backups mantidos)
    const retentionLimit = Number(process.env.BACKUP_RETENTION_COUNT) || 7;
    const pruneResult = pruneOldBackups({ maxBackups: retentionLimit });
    if (pruneResult.deletedBackups.length > 0) {
      console.log(`[Backup Retention] ${pruneResult.deletedBackups.length} backup(s) antigo(s) removido(s) conforme limite de retenção (${retentionLimit}).`);
    }

    return {
      success: true,
      backupId,
      backupPath: finalPath,
      manifest,
    };
  } catch (err: any) {
    if (fs.existsSync(stagingPath)) {
      try {
        fs.rmSync(stagingPath, { recursive: true, force: true });
      } catch (_) {}
    }

    const failEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      backupId,
      type: "FULL_SYSTEM",
      status: "FAILED",
      error: err.message,
    }) + "\n";
    fs.appendFileSync(LOG_FILE, failEntry, "utf-8");

    throw new Error(`Falha durante a execução do backup completo: ${err.message}`);
  }
}

/**
 * Restaura e valida um backup completo dentro de um diretório isolado de homologação.
 * NUNCA restaura sobre o banco dev.db operacional.
 */
export async function restoreBackupToIsolatedDirectory(
  backupId: string,
  targetIsolatedDir: string
): Promise<{
  success: boolean;
  isolatedDir: string;
  verifiedFilesCount: number;
  databaseIntegrity: string;
  restoredRecords: {
    users: number;
    customers: number;
    quotations: number;
    orders: number;
    batches: number;
    movements: number;
    auditLogs: number;
  };
}> {
  const sourceBackupDir = path.join(BACKUP_ROOT, backupId);
  const manifestPath = path.join(sourceBackupDir, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Backup '${backupId}' não encontrado ou corrompido (manifest.json ausente).`);
  }

  const manifest: BackupManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  ensureDirectoryExists(targetIsolatedDir);

  let verifiedCount = 0;

  // 1. Restaurar e validar cada arquivo constante no manifesto
  for (const item of manifest.files) {
    const backupFilePath = path.join(sourceBackupDir, item.relativePath);
    if (!fs.existsSync(backupFilePath)) {
      throw new Error(`Arquivo não encontrado no backup de origem: ${item.relativePath}`);
    }

    const checkSha = calculateFileSha256(backupFilePath);
    if (checkSha !== item.sha256) {
      throw new Error(`Checksum SHA-256 não confere para ${item.relativePath}`);
    }

    const destPath = path.join(targetIsolatedDir, item.relativePath);
    ensureDirectoryExists(path.dirname(destPath));
    fs.copyFileSync(backupFilePath, destPath);
    verifiedCount++;
  }

  // 2. Validar o banco de dados restaurado no diretório isolado
  const restoredDbPath = path.join(targetIsolatedDir, "database.db").replace(/\\/g, "/");
  if (!fs.existsSync(restoredDbPath)) {
    throw new Error("Banco de dados 'database.db' não foi encontrado na restauração.");
  }

  const isolatedClient = new PrismaClient({
    datasources: {
      db: {
        url: `file:${restoredDbPath}`,
      },
    },
  });

  try {
    const integrityRaw: any[] = await isolatedClient.$queryRawUnsafe("PRAGMA integrity_check;");
    const databaseIntegrity = integrityRaw?.[0]?.integrity_check || "ok";

    const restoredRecords = {
      users: await isolatedClient.user.count(),
      customers: await isolatedClient.customer.count(),
      quotations: await isolatedClient.quotation.count(),
      orders: await isolatedClient.productionOrder.count(),
      batches: await isolatedClient.opBatch.count(),
      movements: await isolatedClient.opMovement.count(),
      auditLogs: await isolatedClient.auditLog.count(),
    };

    return {
      success: true,
      isolatedDir: targetIsolatedDir,
      verifiedFilesCount: verifiedCount,
      databaseIntegrity,
      restoredRecords,
    };
  } finally {
    await isolatedClient.$disconnect();
  }
}

/**
 * Restaura arquivos de um backup validando checksums sha256
 */
export async function restoreUploadsBackup(backupId: string): Promise<{
  success: boolean;
  restoredFilesCount: number;
}> {
  const targetBackupDir = path.join(BACKUP_ROOT, backupId);
  const manifestPath = path.join(targetBackupDir, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Backup '${backupId}' não encontrado ou corrompido (manifest.json ausente).`);
  }

  const manifest: BackupManifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  let restoredCount = 0;

  for (const item of manifest.files) {
    const backupFilePath = path.join(targetBackupDir, item.relativePath);
    if (!fs.existsSync(backupFilePath)) {
      throw new Error(`Arquivo corrompido no backup: ${item.relativePath}`);
    }

    const checkSha = calculateFileSha256(backupFilePath);
    if (checkSha !== item.sha256) {
      throw new Error(`Integridade comprometida no arquivo ${item.relativePath}: Checksum não confere.`);
    }

    const destinationDir = path.join(getUploadRoot(), item.category);
    ensureDirectoryExists(destinationDir);

    const destinationFile = path.join(destinationDir, item.fileName);
    fs.copyFileSync(backupFilePath, destinationFile);
    restoredCount++;
  }

  console.log(`[Backup Service] Backup '${backupId}' restaurado com sucesso (${restoredCount} arquivos).`);
  return { success: true, restoredFilesCount: restoredCount };
}

export interface BackupRetentionOptions {
  maxBackups?: number;
  maxAgeDays?: number;
}

/**
 * Aplica política de retenção de backups, removendo snapshots antigos e preservando os mais recentes.
 */
export function pruneOldBackups(options: BackupRetentionOptions = {}): {
  deletedBackups: string[];
  keptBackups: string[];
} {
  ensureDirectoryExists(BACKUP_ROOT);
  const maxBackups = options.maxBackups ?? 7;
  const maxAgeDays = options.maxAgeDays ?? 30;
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const backups = listAvailableBackups(); // Já ordenados decrescente por createdAt
  const keptBackups: string[] = [];
  const deletedBackups: string[] = [];

  backups.forEach((b, index) => {
    const ageMs = now - new Date(b.createdAt).getTime();
    // Sempre preserva ao menos o mais recente; respeita o limite de quantidade e idade
    const shouldKeep = index < maxBackups && (index === 0 || ageMs <= maxAgeMs);

    if (shouldKeep) {
      keptBackups.push(b.backupId);
    } else {
      const backupDir = path.join(BACKUP_ROOT, b.backupId);
      try {
        if (fs.existsSync(backupDir)) {
          fs.rmSync(backupDir, { recursive: true, force: true });
          deletedBackups.push(b.backupId);
        }
      } catch (err: any) {
        console.error(`[Backup Retention] Falha ao remover backup antigo ${b.backupId}:`, err.message);
      }
    }
  });

  if (deletedBackups.length > 0) {
    const pruneLogEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      type: "RETENTION_PRUNE",
      deletedCount: deletedBackups.length,
      deletedBackups,
      keptCount: keptBackups.length,
    }) + "\n";
    fs.appendFileSync(LOG_FILE, pruneLogEntry, "utf-8");
  }

  return { deletedBackups, keptBackups };
}

/**
 * Lista todos os backups válidos disponíveis
 */
export function listAvailableBackups(): BackupManifest[] {
  ensureDirectoryExists(BACKUP_ROOT);
  const entries = fs.readdirSync(BACKUP_ROOT);
  const results: BackupManifest[] = [];

  for (const entry of entries) {
    const candidateManifest = path.join(BACKUP_ROOT, entry, "manifest.json");
    if (fs.existsSync(candidateManifest)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(candidateManifest, "utf-8"));
        results.push(manifest);
      } catch (_) {}
    }
  }

  return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
