import path from "path";
import fs from "fs";
import dotenv from "dotenv";

const prodEnvPath = path.resolve(process.cwd(), ".env.production");
if (process.env.NODE_ENV === "production" && fs.existsSync(prodEnvPath)) {
  dotenv.config({ path: prodEnvPath, override: true });
} else {
  dotenv.config();
}

/**
 * Retorna o diretório raiz para armazenamento de uploads com isolamento estrito entre
 * ambiente operacional (produção/desenvolvimento) e ambiente de testes automatizados.
 */
export function getUploadRoot(): string {
  const isTest =
    process.env.NODE_ENV === "test" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.NODE_ENV !== "development" &&
      process.argv.some((arg) => arg.includes("test")));
  const projectBase = fs.existsSync(path.resolve(process.cwd(), "prisma"))
    ? process.cwd()
    : path.resolve(process.cwd(), "backend");

  const operationalUploads = path.resolve(projectBase, "uploads").replace(/\\/g, "/");

  if (isTest) {
    const configuredTestDir = process.env.TEST_UPLOADS_DIR;
    const testUploadsDir = configuredTestDir
      ? path.resolve(configuredTestDir).replace(/\\/g, "/")
      : path.resolve(projectBase, "test_uploads").replace(/\\/g, "/");

    // FAIL-SAFE CRÍTICO 1: Em ambiente de testes, NUNCA apontar para o diretório operacional
    if (testUploadsDir === operationalUploads) {
      const errorMsg =
        "FATAL FAIL-SAFE DE ARMAZENAMENTO: O ambiente de testes tentou apontar para o diretório de uploads operacional ('uploads')!";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // FAIL-SAFE CRÍTICO 2: O diretório de teste deve conter expressamente identificador de teste
    if (!testUploadsDir.toLowerCase().includes("test")) {
      const errorMsg =
        "FATAL FAIL-SAFE DE ARMAZENAMENTO: O diretório configurado para uploads de teste não possui identificador 'test' seguro: " +
        testUploadsDir;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    return testUploadsDir;
  }

  // Ambiente operacional: permite UPLOADS_DIR ou UPLOAD_DIR explícito
  const customDir = process.env.UPLOADS_DIR || process.env.UPLOAD_DIR;
  if (customDir) {
    const resolvedCustom = path.resolve(customDir).replace(/\\/g, "/");
    if (process.env.NODE_ENV === "production" && resolvedCustom === operationalUploads) {
      const errorMsg =
        "FATAL: Em ambiente de produção (NODE_ENV=production), UPLOADS_DIR deve ser configurado para uma pasta separada de backend/uploads/.";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    return resolvedCustom;
  }

  const isTestRunner = process.argv.some((arg) => arg.includes("test"));
  // Em produção real (não em teste), a pasta de uploads deve ser obrigatoriamente separada de backend/uploads/
  if (process.env.NODE_ENV === "production" && !isTestRunner) {
    const errorMsg =
      "FATAL: Em ambiente de produção (NODE_ENV=production), a variável UPLOADS_DIR é obrigatória e deve apontar para uma pasta separada de backend/uploads/.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return operationalUploads;
}

export function getReferencesDir(): string {
  return path.join(getUploadRoot(), "references").replace(/\\/g, "/");
}

export function getArtworkDir(): string {
  return path.join(getUploadRoot(), "artwork").replace(/\\/g, "/");
}

/**
 * Garante a criação estruturada das pastas de upload necessárias
 */
export function ensureUploadDirectoriesExist(): {
  root: string;
  references: string;
  artwork: string;
} {
  const root = getUploadRoot();
  const references = getReferencesDir();
  const artwork = getArtworkDir();

  if (!fs.existsSync(references)) {
    fs.mkdirSync(references, { recursive: true });
  }
  if (!fs.existsSync(artwork)) {
    fs.mkdirSync(artwork, { recursive: true });
  }

  return { root, references, artwork };
}

/**
 * Limpa o diretório de uploads de teste com fail-safe estrito.
 * NUNCA remove ou acessa arquivos fora de 'test_uploads'.
 */
export function cleanTestUploads(): void {
  const isTest = process.env.NODE_ENV === "test";
  if (!isTest) {
    throw new Error("Operação negada: cleanTestUploads só pode ser invocado com NODE_ENV === 'test'.");
  }

  const root = getUploadRoot();
  if (!root.toLowerCase().includes("test") || root.endsWith("/uploads")) {
    throw new Error(
      "FATAL FAIL-SAFE: Tentativa de limpeza em diretório não seguro de testes: " + root
    );
  }

  if (fs.existsSync(root)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
