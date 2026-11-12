import "./setup.js";
import http from "http";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import express from "express";
import { filesRouter } from "../src/routes/files.routes.js";
import { prisma } from "../src/prisma.js";
import { generateToken } from "../src/utils/security.js";
import {
  getUploadRoot,
  getReferencesDir,
  getArtworkDir,
  cleanTestUploads,
} from "../src/utils/storageConfig.js";
import { verifyTestDatabaseIsolation } from "./setup.js";

async function runUploadIsolationTests() {
  console.log("================================================================================");
  console.log("=== SUÍTE DE TESTES ESPECÍFICOS — ISOLAMENTO DE UPLOADS (TDD) ===");
  console.log("================================================================================");

  await verifyTestDatabaseIsolation();

  let passedTests = 0;
  const totalTests = 8;

  // Diretórios de referência
  const operationalDir = path.resolve(process.cwd(), "uploads").replace(/\\/g, "/");
  const testUploadsDir = getUploadRoot();

  console.log(`[Configuração Ativa] Diretório de Testes: ${testUploadsDir}`);
  console.log(`[Configuração Ativa] Diretório Operacional: ${operationalDir}`);

  // Limpeza inicial do diretório de testes
  cleanTestUploads();

  // Inicializar servidor de teste Express com as rotas reais
  const app = express();
  app.use(express.json());
  app.use("/api/files", filesRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Criar tokens de autenticação
  const seller = await prisma.user.findFirst({ where: { role: "VENDEDOR" } });
  const designer = await prisma.user.findFirst({ where: { role: "DESIGNER" } });
  const operator = await prisma.user.findFirst({ where: { role: "OPERADOR" } });

  if (!seller || !designer || !operator) {
    throw new Error("Usuários de teste não encontrados no test.db!");
  }

  const sellerToken = generateToken({ userId: seller.id, email: seller.email, role: seller.role });
  const designerToken = generateToken({ userId: designer.id, email: designer.email, role: designer.role });
  const operatorToken = generateToken({ userId: operator.id, email: operator.email, role: operator.role });

  // PNG válido mínimo
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  try {
    // Snapshot dos arquivos operacionais antes deste teste
    const operationalFilesBefore = fs.readdirSync(path.join(operationalDir, "references"));

    // -------------------------------------------------------------------------
    // TESTE 1: Upload em ambiente de teste grava exclusivamente no diretório de testes
    // -------------------------------------------------------------------------
    console.log("\n[TEST 1/8] Upload em ambiente de teste grava SOMENTE em test_uploads...");
    const formUpload = new FormData();
    formUpload.append("file", new Blob([validPngBuffer], { type: "image/png" }), "teste_isolamento.png");

    const t1Res = await fetch(`${baseUrl}/api/files/upload?category=references`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sellerToken}` },
      body: formUpload,
    });
    const t1Data: any = await t1Res.json();

    if (t1Res.status !== 201 || !t1Data.fileName) {
      throw new Error(`[TEST 1 FALHOU] Falha no upload: ${JSON.stringify(t1Data)}`);
    }

    const testFilePath = path.join(getReferencesDir(), t1Data.fileName);
    const operationalFilePath = path.join(operationalDir, "references", t1Data.fileName);

    const existsInTest = fs.existsSync(testFilePath);
    const existsInOperational = fs.existsSync(operationalFilePath);

    if (existsInTest && !existsInOperational) {
      console.log(`✔ [TEST 1 APROVADO] Arquivo ${t1Data.fileName} gravado exclusivamente em: ${testFilePath}`);
      console.log(`  Comprovado: Arquivo NÃO existe no diretório operacional: ${operationalFilePath}`);
      passedTests++;
    } else {
      throw new Error(
        `[TEST 1 FALHOU] Inconsistência física: testExists=${existsInTest}, operationalExists=${existsInOperational}`
      );
    }

    // -------------------------------------------------------------------------
    // TESTE 2: Download em ambiente de teste utiliza o diretório isolado
    // -------------------------------------------------------------------------
    console.log("\n[TEST 2/8] Download em ambiente de teste lê do diretório isolado...");
    const t2Res = await fetch(`${baseUrl}/api/files/references/${t1Data.fileName}`, {
      headers: { Authorization: `Bearer ${sellerToken}` },
    });

    if (t2Res.status === 200) {
      const downloadedBuffer = Buffer.from(await t2Res.arrayBuffer());
      if (downloadedBuffer.equals(validPngBuffer)) {
        console.log(`✔ [TEST 2 APROVADO] Download servido com sucesso a partir do diretório isolado.`);
        passedTests++;
      } else {
        throw new Error("[TEST 2 FALHOU] O conteúdo baixado difere do buffer original.");
      }
    } else {
      throw new Error(`[TEST 2 FALHOU] Esperado 200, recebido ${t2Res.status}`);
    }

    // -------------------------------------------------------------------------
    // TESTE 3: Exclusão / modificação em ambiente de teste não alcança arquivos operacionais
    // -------------------------------------------------------------------------
    console.log("\n[TEST 3/8] Operações de teste não afetam arquivos operacionais existentes...");
    const operationalFilesCurrent = fs.readdirSync(path.join(operationalDir, "references"));
    if (operationalFilesBefore.length === operationalFilesCurrent.length) {
      console.log(
        `✔ [TEST 3 APROVADO] Quantidade de arquivos operacionais inalterada (${operationalFilesCurrent.length} arquivos).`
      );
      passedTests++;
    } else {
      throw new Error(
        `[TEST 3 FALHOU] O diretório operacional foi modificado! Antes: ${operationalFilesBefore.length}, Agora: ${operationalFilesCurrent.length}`
      );
    }

    // -------------------------------------------------------------------------
    // TESTE 4: A configuração de teste não aceita fallback silencioso para uploads/
    // -------------------------------------------------------------------------
    console.log("\n[TEST 4/8] Validação de bloqueio contra fallback silencioso para uploads operacionais...");
    const originalEnvDir = process.env.TEST_UPLOADS_DIR;
    let fallbackBlocked = false;

    try {
      // Simular tentativa de apontar para a pasta operacional uploads
      process.env.TEST_UPLOADS_DIR = operationalDir;
      getUploadRoot();
    } catch (err: any) {
      if (err.message.includes("FATAL FAIL-SAFE DE ARMAZENAMENTO")) {
        fallbackBlocked = true;
      }
    } finally {
      process.env.TEST_UPLOADS_DIR = originalEnvDir;
    }

    if (fallbackBlocked) {
      console.log("✔ [TEST 4 APROVADO] Tentativa de fallback para pasta operacional foi barrada com exceção fatal.");
      passedTests++;
    } else {
      throw new Error("[TEST 4 FALHOU] O sistema permitiu apontar para pasta operacional em modo teste!");
    }

    // -------------------------------------------------------------------------
    // TESTE 5: O ambiente operacional continua utilizando o diretório original
    // -------------------------------------------------------------------------
    console.log("\n[TEST 5/8] Em ambiente operacional (não-teste), o caminho original é preservado...");
    const prevNodeEnv = process.env.NODE_ENV;
    let operationalDirResolved = "";

    try {
      process.env.NODE_ENV = "production";
      operationalDirResolved = getUploadRoot();
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }

    if (operationalDirResolved === operationalDir) {
      console.log(`✔ [TEST 5 APROVADO] Em modo operacional, o diretório resolvido é: ${operationalDirResolved}`);
      passedTests++;
    } else {
      throw new Error(
        `[TEST 5 FALHOU] Esperado ${operationalDir}, recebido ${operationalDirResolved}`
      );
    }

    // -------------------------------------------------------------------------
    // TESTE 6: A limpeza de testes não alcança arquivos fora da raiz exclusiva de testes
    // -------------------------------------------------------------------------
    console.log("\n[TEST 6/8] Limpeza de testes é estritamente restrita a test_uploads...");
    cleanTestUploads();

    // Comprovar que test_uploads foi limpo
    const testDirStillExists = fs.existsSync(testUploadsDir);
    // Comprovar que uploads operacionais continuam 100% preservados
    const operationalDirPreserved = fs.existsSync(operationalDir);
    const opFilesAfterClean = fs.readdirSync(path.join(operationalDir, "references"));

    if (
      !testDirStillExists &&
      operationalDirPreserved &&
      opFilesAfterClean.length === operationalFilesBefore.length
    ) {
      console.log(`✔ [TEST 6 APROVADO] cleanTestUploads removeu apenas test_uploads sem afetar pasta operacional.`);
      passedTests++;
    } else {
      throw new Error(
        `[TEST 6 FALHOU] Inconsistência na limpeza: testDirExists=${testDirStillExists}, opFilesCount=${opFilesAfterClean.length}`
      );
    }

    // -------------------------------------------------------------------------
    // TESTE 7: Erro de configuração interrompe execução em vez de gravar no operacional
    // -------------------------------------------------------------------------
    console.log("\n[TEST 7/8] Diretório de teste inválido (sem identificador 'test') falha de forma segura...");
    let invalidConfigBlocked = false;
    try {
      process.env.TEST_UPLOADS_DIR = "c:/tmp/diretorio_inseguro";
      getUploadRoot();
    } catch (err: any) {
      if (err.message.includes("não possui identificador 'test' seguro")) {
        invalidConfigBlocked = true;
      }
    } finally {
      process.env.TEST_UPLOADS_DIR = originalEnvDir;
    }

    if (invalidConfigBlocked) {
      console.log("✔ [TEST 7 APROVADO] Configuração sem 'test' no nome aborta com erro seguro.");
      passedTests++;
    } else {
      throw new Error("[TEST 7 FALHOU] Configuração insegura foi aceita sem erro.");
    }

    // -------------------------------------------------------------------------
    // TESTE 8: As rotas continuam respeitando autenticação e autorização
    // -------------------------------------------------------------------------
    console.log("\n[TEST 8/8] Validação de RBAC mantida nas rotas isoladas...");
    // Operador tentando fazer upload de arte (deve receber 403)
    const opForm = new FormData();
    opForm.append("file", new Blob([validPngBuffer], { type: "image/png" }), "arte_invasora.png");
    const t8Res = await fetch(`${baseUrl}/api/files/upload?category=artwork`, {
      method: "POST",
      headers: { Authorization: `Bearer ${operatorToken}` },
      body: opForm,
    });

    if (t8Res.status === 403) {
      console.log("✔ [TEST 8 APROVADO] Operador bloqueado de upload em 'artwork' (403 Forbidden).");
      passedTests++;
    } else {
      throw new Error(`[TEST 8 FALHOU] Esperado 403, recebido ${t8Res.status}`);
    }

    console.log("\n================================================================================");
    console.log(`=== TODOS OS ${passedTests}/${totalTests} TESTES DE ISOLAMENTO FORAM APROVADOS! ===`);
    console.log("================================================================================");
  } finally {
    if (server.listening) {
      server.close();
    }
    // Limpeza final de test_uploads
    try {
      cleanTestUploads();
    } catch (_) {}
  }
}

runUploadIsolationTests().catch((err) => {
  console.error("\n❌ ERRO NA SUÍTE DE ISOLAMENTO DE UPLOADS:", err);
  process.exit(1);
});
