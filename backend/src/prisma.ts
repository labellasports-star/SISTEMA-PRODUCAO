import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

const prodEnvPath = path.resolve(process.cwd(), ".env.production");
if (process.env.NODE_ENV === "production" && fs.existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath, override: true });
} else {
  dotenv.config();
}

const isTest =
  process.env.NODE_ENV === "test" ||
  (process.env.NODE_ENV !== "production" &&
    process.argv.some((arg) => {
      const norm = arg.replace(/\\/g, "/");
      return norm.includes("/test/") || norm.endsWith(".test.ts") || norm.endsWith(".test.js");
    }));
let databaseUrl = process.env.DATABASE_URL;

if (databaseUrl && databaseUrl.startsWith("file:")) {
  let filePath = databaseUrl.replace(/^file:/, "");
  const queryIndex = filePath.indexOf("?");
  let query = "";
  if (queryIndex !== -1) {
    query = filePath.substring(queryIndex);
    filePath = filePath.substring(0, queryIndex);
  }
  if (!path.isAbsolute(filePath)) {
    if (filePath.startsWith("./prisma/") || filePath.startsWith("prisma/")) {
      filePath = path.resolve(process.cwd(), filePath);
    } else {
      filePath = path.resolve(process.cwd(), "prisma", filePath);
    }
  }
  databaseUrl = `file:${filePath.replace(/\\/g, "/")}${query}`;
}

if (isTest) {
  const testDbPath = path.resolve(process.cwd(), "prisma", "test.db").replace(/\\/g, "/");
  databaseUrl = process.env.TEST_DATABASE_URL || `file:${testDbPath}`;

  // FAIL-SAFE CRÍTICO: Se estiver em ambiente de teste, NUNCA permitir dev.db
  if (databaseUrl.includes("dev.db")) {
    const errorMsg = "FATAL FAIL-SAFE: O ambiente de testes detectou tentativa de conexão com o banco operacional 'dev.db'! Operação abortada.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

if (process.env.NODE_ENV === "production") {
  if (!databaseUrl || databaseUrl.includes("dev.db") || databaseUrl.includes("test.db")) {
    const errorMsg =
      "FATAL: Em ambiente de produção (NODE_ENV=production), DATABASE_URL é obrigatória e não pode apontar para dev.db nem test.db!";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

export const prisma = new PrismaClient({
  datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
});
