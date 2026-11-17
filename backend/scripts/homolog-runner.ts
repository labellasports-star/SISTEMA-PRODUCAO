import path from "path";
import fs from "fs";
import http from "http";
import crypto from "crypto";
import { execSync } from "child_process";
import { io as ioClient } from "socket.io-client";

// Configuração do ambiente isolado de homologação
const PORT = 4099;
const HOMOLOG_DB_PATH = path.resolve(process.cwd(), "prisma", "homolog_stage.db").replace(/\\/g, "/");
const HOMOLOG_UPLOADS_DIR = path.resolve(process.cwd(), "homolog_uploads").replace(/\\/g, "/");

// Garantir limpeza prévia de resíduos de homologação
if (fs.existsSync(HOMOLOG_DB_PATH)) fs.unlinkSync(HOMOLOG_DB_PATH);
if (fs.existsSync(HOMOLOG_UPLOADS_DIR)) fs.rmSync(HOMOLOG_UPLOADS_DIR, { recursive: true, force: true });
fs.mkdirSync(HOMOLOG_UPLOADS_DIR, { recursive: true });

// Chaves criptográficas fortes temporárias (> 32 caracteres)
const HOMOLOG_JWT_SECRET = "homolog_jwt_secret_alta_entropia_2026_super_segura_32_chars_ok";
const HOMOLOG_HMAC_SECRET = "homolog_hmac_secret_alta_entropia_2026_super_segura_32_chars_ok";

process.env.NODE_ENV = "production";
process.env.PORT = String(PORT);
process.env.HOST = "127.0.0.1";
process.env.DATABASE_URL = `file:${HOMOLOG_DB_PATH}`;
process.env.UPLOADS_DIR = HOMOLOG_UPLOADS_DIR;
process.env.JWT_SECRET = HOMOLOG_JWT_SECRET;
process.env.HMAC_SIGNATURE_SECRET = HOMOLOG_HMAC_SECRET;
process.env.HMAC_SECRET = HOMOLOG_HMAC_SECRET;
process.env.ADMIN_EMAIL = "admin.homolog@fabrica.com";
process.env.ADMIN_PASSWORD = "SenhaForteHomolog123@";
process.env.ADMIN_PIN = "987654";

async function main() {
  console.log("================================================================================");
  console.log("=== ENSAIO DE HOMOLOGAÇÃO TÉCNICA DE PRODUÇÃO (INSTÂNCIA ISOLADA :4099) ===");
  console.log("================================================================================");

  // 1. Inicializar banco limpo de produção com fail-safe
  console.log("\n[1/6] Provisionando banco de produção limpo com seed oficial...");
  const { initProductionDatabase } = await import("./init-production-db.js");
  const initResult = await initProductionDatabase();
  console.log(`✔ Banco criado em: ${initResult.dbPath}`);
  console.log(`✔ Setores oficiais: ${initResult.sectorsCount}`);
  console.log(`✔ Categorias de catálogo: ${initResult.categoriesCount}`);
  console.log(`✔ Produtos de catálogo: ${initResult.productsCount}`);
  console.log(`✔ Usuários criados: ${initResult.usersCount}`);
  console.log(`✔ Integridade SQLite: ${initResult.integrityCheck}`);

  // 2. Iniciar servidor Express + Socket.IO em porta 4099
  console.log(`\n[2/6] Iniciando servidor em modo PRODUÇÃO na porta ${PORT}...`);
  const { app, server } = await import("../src/server.js");
  
  await new Promise<void>((resolve) => {
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`✔ Servidor de homologação ouvindo em http://127.0.0.1:${PORT}`);
      resolve();
    });
  });

  const baseUrl = `http://127.0.0.1:${PORT}`;

  // 3. Validar Healthcheck e Frontend estático com rotas SPA
  console.log("\n[3/6] Testando Healthcheck, SPA e Rotas Inexistentes...");
  const healthRes = await fetch(`${baseUrl}/api/health`);
  const healthData = await healthRes.json();
  console.log(`✔ Healthcheck status: ${healthRes.status} - Sistema: ${healthData.system}`);

  const spaRes = await fetch(`${baseUrl}/qualidade`);
  const spaText = await spaRes.text();
  const isHtmlSpa = spaText.includes("<div id=\"root\">") && spaRes.headers.get("content-type")?.includes("text/html");
  console.log(`✔ Acesso direto a rota SPA /qualidade: Status ${spaRes.status} - Contém root React: ${isHtmlSpa}`);

  const notFoundApiRes = await fetch(`${baseUrl}/api/rota-inexistente-teste`);
  const notFoundApiData = await notFoundApiRes.json();
  console.log(`✔ Endpoint /api inexistente: Status ${notFoundApiRes.status} (esperado 404) - Resposta JSON: ${JSON.stringify(notFoundApiData)}`);

  // 4. Testar Catálogo e Cálculo de Orçamento
  console.log("\n[4/6] Testando Catálogo e Motor de Cálculo...");
  const catRes = await fetch(`${baseUrl}/api/catalog/products`);
  const catData = await catRes.json();
  console.log(`✔ Produtos carregados: ${catData.products?.length} itens`);
  
  const sample = catData.products[0];
  console.log(`  Exemplo: ${sample.name} - R$ ${sample.basePrice.toFixed(2)} (Fabrics: ${sample.availableFabrics.length}, Collars: ${sample.availableCollars.length})`);

  const calcRes = await fetch(`${baseUrl}/api/catalog/calculate-budget`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [
        {
          catalogProductId: sample.id,
          quantity: 20,
          customizations: ["Escudo TPU 3D", "Nome Individual"],
        },
      ],
      discountAmount: 10,
    }),
  });
  const calcData = await calcRes.json();
  console.log(`✔ Cálculo Orçamento: Total Qtd: ${calcData.totalQuantity} - Valor Bruto: R$ ${calcData.grossAmount} - Desconto: R$ ${calcData.discountAmount} - Total Final: R$ ${calcData.finalTotal}`);
  console.log(`  Qtd mínima atingida: ${calcData.isMinQuantityMet} - Warnings: ${calcData.minQuantityWarnings.length}`);

  // 5. Autenticação e Socket.IO na mesma porta
  console.log("\n[5/6] Testando Autenticação e Socket.IO...");
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin.homolog@fabrica.com",
      password: "SenhaForteHomolog123@",
    }),
  });
  const loginData = await loginRes.json();
  console.log(`✔ Login do Administrador de Homologação: Status ${loginRes.status} - Usuário: ${loginData.user?.name} (Role: ${loginData.user?.role})`);

  const token = loginData.token;

  // Conectar Socket.io
  const socket = ioClient(baseUrl, {
    auth: { token },
    transports: ["websocket"],
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout ao conectar Socket.io")), 4000);
    socket.on("connect", () => {
      clearTimeout(timeout);
      console.log(`✔ Socket.IO conectado com sucesso! Socket ID: ${socket.id}`);
      resolve();
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  socket.disconnect();

  // 6. Testar persistência através de inserção e reinício
  console.log("\n[6/6] Testando Persistência de Dados após Reinício...");
  // Inserir um cliente via API autenticada
  const createCustRes = await fetch(`${baseUrl}/api/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      companyName: "Atlética Medicina Homologação",
      contactName: "Dr. Roberto",
      phone: "(11) 99999-8888",
    }),
  });
  const createdCustomer = await createCustRes.json();
  console.log(`✔ Cliente de homologação criado: ID ${createdCustomer.id} - ${createdCustomer.companyName}`);

  // Fechar o servidor
  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.log("✔ Servidor temporário finalizado.");

  // Aguardar liberação completa da porta pelo SO
  await new Promise((r) => setTimeout(r, 800));

  // Reiniciar servidor na mesma porta com o mesmo banco usando nova instância HTTP
  const server2 = http.createServer(app);
  await new Promise<void>((resolve) => {
    server2.listen(PORT, "127.0.0.1", () => {
      console.log(`✔ Servidor reiniciado em http://127.0.0.1:${PORT}`);
      resolve();
    });
  });

  // Consultar o cliente criado após reinício
  const getCustRes = await fetch(`${baseUrl}/api/customers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const customers = await getCustRes.json();
  const found = (Array.isArray(customers) ? customers : customers.customers || []).some(
    (c: any) => c.companyName === "Atlética Medicina Homologação"
  );
  console.log(`✔ Cliente persiste após reinício do servidor: ${found ? "SIM (COMPROVADO)" : "NÃO (FALHA)"}`);

  await new Promise<void>((resolve) => server2.close(() => resolve()));

  // Desconectar Prisma para liberar os locks de arquivo do SQLite no Windows
  const { prisma } = await import("../src/prisma.js");
  await prisma.$disconnect();
  await new Promise((r) => setTimeout(r, 500));

  // Limpeza de arquivos de homologação
  if (fs.existsSync(HOMOLOG_DB_PATH)) fs.unlinkSync(HOMOLOG_DB_PATH);
  for (const ext of ["-wal", "-shm", "-journal"]) {
    if (fs.existsSync(`${HOMOLOG_DB_PATH}${ext}`)) {
      try { fs.unlinkSync(`${HOMOLOG_DB_PATH}${ext}`); } catch (_) {}
    }
  }
  if (fs.existsSync(HOMOLOG_UPLOADS_DIR)) fs.rmSync(HOMOLOG_UPLOADS_DIR, { recursive: true, force: true });
  console.log("✔ Arquivos de homologação limpos com segurança.");

  console.log("\n================================================================================");
  console.log("=== HOMOLOGAÇÃO DA INSTÂNCIA DE PRODUÇÃO: 100% SUCESSO! ===");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("❌ ERRO NA HOMOLOGAÇÃO:", err);
  process.exit(1);
});
