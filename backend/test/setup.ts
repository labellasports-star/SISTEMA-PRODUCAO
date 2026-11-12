import path from "path";
import { prisma } from "../src/prisma.js";

// 1. Configurar expressamente o ambiente de testes
process.env.NODE_ENV = "test";

const testDbPath = path.resolve(process.cwd(), "prisma", "test.db").replace(/\\/g, "/");
process.env.DATABASE_URL = `file:${testDbPath}`;
process.env.TEST_DATABASE_URL = `file:${testDbPath}`;

// 2. Configurar expressamente o isolamento de uploads para testes
const testUploadsDir = path.resolve(process.cwd(), "test_uploads").replace(/\\/g, "/");
process.env.TEST_UPLOADS_DIR = testUploadsDir;

// FAIL-SAFE OBRIGATÓRIO: Abortar imediatamente se banco apontar para dev.db ou uploads apontar para uploads operacional
if (process.env.DATABASE_URL.includes("dev.db")) {
  console.error("FATAL FAIL-SAFE: O ambiente de testes detectou tentativa de conexão com dev.db!");
  process.exit(1);
}

if (process.env.TEST_UPLOADS_DIR.endsWith("/uploads") || !process.env.TEST_UPLOADS_DIR.includes("test")) {
  console.error("FATAL FAIL-SAFE: O ambiente de testes detectou tentativa de apontamento para uploads operacionais!");
  process.exit(1);
}

// 3. Verificação em nível de engine SQLite
export async function verifyTestDatabaseIsolation(): Promise<void> {
  const dbList = await prisma.$queryRawUnsafe<any[]>("PRAGMA database_list;");
  const mainDb = dbList.find((db: any) => db.name === "main");
  const currentDbFile = (mainDb?.file || "").replace(/\\/g, "/");

  if (currentDbFile.includes("dev.db")) {
    console.error("FATAL FAIL-SAFE NÍVEL ENGINE: O SQLite está fisicamente conectado a dev.db:", currentDbFile);
    process.exit(1);
  }

  if (!currentDbFile.includes("test.db")) {
    console.warn("AVISO: O banco de testes ativo não é test.db:", currentDbFile);
  }
}
