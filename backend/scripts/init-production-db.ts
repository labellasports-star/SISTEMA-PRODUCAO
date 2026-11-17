import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

// Tenta carregar .env.production se existir com override
const envProductionPath = path.resolve(process.cwd(), ".env.production");
if (fs.existsSync(envProductionPath)) {
  dotenv.config({ path: envProductionPath, override: true });
} else {
  dotenv.config();
}

const SECTORS_REFERENCE = [
  { sequenceOrder: 1, code: "PRE_VENDA", name: "Pré-Venda", description: "Atendimento inicial, cadastro de cliente e solicitação de orçamento.", allowsExternalDispatch: false, allowsReworkOrigin: false },
  { sequenceOrder: 2, code: "DESIGNER", name: "Designer / Arte-Final", description: "Desenvolvimento de layout, mockups, vetores e aprovação com cliente.", allowsExternalDispatch: false, allowsReworkOrigin: false },
  { sequenceOrder: 3, code: "VENDAS", name: "Vendas", description: "Fechamento comercial, validação de pagamento e conversão em OP oficial.", allowsExternalDispatch: false, allowsReworkOrigin: false },
  { sequenceOrder: 4, code: "SAC_INTERNO", name: "SAC Interno", description: "Conferência técnica detalhada, validação de grade e liberação para chão de fábrica.", allowsExternalDispatch: false, allowsReworkOrigin: false },
  { sequenceOrder: 5, code: "PRE_DIAGRAMACAO", name: "Pré-Diagramação", description: "Verificação de tecidos, calibração de perfis de cor e conferência de moldes.", allowsExternalDispatch: false, allowsReworkOrigin: true },
  { sequenceOrder: 6, code: "DIAGRAMACAO", name: "Diagramação", description: "Encaixe no rolo/papel de impressão, sangria e preparação de arquivos RIP.", allowsExternalDispatch: false, allowsReworkOrigin: true },
  { sequenceOrder: 7, code: "IMPRESSAO", name: "Impressão", description: "Impressão em papel sublimático ou filme com controle de tinta e metros lineares.", allowsExternalDispatch: false, allowsReworkOrigin: true },
  { sequenceOrder: 8, code: "INFESTO", name: "Infesto", description: "Abertura, descanso e corte dos tecidos conforme a grade da OP.", allowsExternalDispatch: false, allowsReworkOrigin: true },
  { sequenceOrder: 9, code: "CALANDRA", name: "Calandra", description: "Termotransferência da estampa impressa para o tecido por calor e pressão.", allowsExternalDispatch: false, allowsReworkOrigin: true },
  { sequenceOrder: 10, code: "SEPARACAO", name: "Separação", description: "Separação das partes calandradas por modelo, tamanho e pacote para costura.", allowsExternalDispatch: false, allowsReworkOrigin: true },
  { sequenceOrder: 11, code: "DESPACHE_OFICINA", name: "Despache para Oficina", description: "Envio e controle de remessas para oficinas externas terceirizadas ou células internas.", allowsExternalDispatch: true, allowsReworkOrigin: true },
  { sequenceOrder: 12, code: "COSTURA", name: "Costura", description: "Montagem, fechamento e costura das peças por oficina ou célula interna.", allowsExternalDispatch: false, allowsReworkOrigin: true },
  { sequenceOrder: 13, code: "QUALIDADE", name: "Qualidade pós-costura", description: "Inspeção rigorosa de costura, medidas, manchas e direcionamento de retrabalho.", allowsExternalDispatch: false, allowsReworkOrigin: true },
  { sequenceOrder: 14, code: "EXPEDICAO", name: "Embalagem / Expedição / Entrega", description: "Dobra, colocação de etiquetas/tags, embalagem plástica e expedição final ao cliente.", allowsExternalDispatch: false, allowsReworkOrigin: false },
];

const DEFECT_TYPES_REFERENCE = [
  { code: "MANCHA", name: "Mancha no tecido / estampa" },
  { code: "COSTURA_TORTA", name: "Costura torta / desalinhada" },
  { code: "TAMANHO_ERRADO", name: "Tamanho / Etiqueta incorreta" },
  { code: "ESTAMPA_DESALINHADA", name: "Estampa descentralizada ou torta" },
  { code: "FIO_SOLTO", name: "Fio solto / sobra de linha excessiva" },
  { code: "MEDIDA_FORA_TOLERANCIA", name: "Medida fora da tabela de medidas" },
];

const OFFICIAL_CATEGORIES_REFERENCE = [
  { code: "FUTEBOL", name: "Futebol & Futsal", description: "Uniformes para futebol de campo, futsal e society" },
  { code: "VOLEI", name: "Vôlei", description: "Uniformes para quadra e vôlei de praia" },
  { code: "BASQUETE", name: "Basquete", description: "Regatas e uniformes de basquete e streetball" },
  { code: "CORRIDA_FITNESS", name: "Corrida & Treino", description: "Vestuário para corrida, ciclismo e academias" },
  { code: "CORPORATIVO", name: "Corporativo & Eventos", description: "Camisas polo, agasalhos e uniformes empresariais" },
];

const OFFICIAL_PRODUCTS_REFERENCE = [
  {
    categoryCode: "FUTEBOL",
    code: "CAMISA_CLASSIC",
    name: "Camisa Classic Dry Fit",
    description: "Camisa esportiva tradicional em tecido Dry Fit respirável, escudo sublimado, gola redonda ou V.",
    minQuantity: 10,
    basePrice: 42.9,
    availableFabrics: JSON.stringify(["Dry Fit Tradicional", "Cacharrel Dry"]),
    availableCollars: JSON.stringify(["Gola Redonda", "Gola V"]),
    availableCustomizations: JSON.stringify([
      { code: "NOME", name: "Nome Individual", price: 5.0 },
      { code: "NUMERO", name: "Número Individual", price: 5.0 },
      { code: "TPU_3D", name: "Escudo TPU 3D", price: 15.0 },
      { code: "MANGA_LONGA", name: "Manga Longa", price: 12.0 },
    ]),
  },
  {
    categoryCode: "FUTEBOL",
    code: "CAMISA_PRIME",
    name: "Camisa Prime Dry Fit",
    description: "Camisa esportiva linha Prime em poliéster Dry Fit de alta durabilidade e secagem ultra-rápida.",
    minQuantity: 10,
    basePrice: 49.9,
    availableFabrics: JSON.stringify(["Dry Fit Tradicional", "Dry Texturizado"]),
    availableCollars: JSON.stringify(["Gola V", "Gola Redonda"]),
    availableCustomizations: JSON.stringify([
      { code: "NOME", name: "Nome Individual", price: 5.0 },
      { code: "NUMERO", name: "Número Individual", price: 5.0 },
      { code: "TPU_3D", name: "Escudo TPU 3D", price: 15.0 },
      { code: "MANGA_LONGA", name: "Manga Longa", price: 12.0 },
    ]),
  },
  {
    categoryCode: "FUTEBOL",
    code: "CAMISA_RAGLAN_V",
    name: "Camisa Raglan Gola V",
    description: "Modelagem anatômica com corte raglan nos ombros, tecido Dry Texturizado com microfuros.",
    minQuantity: 10,
    basePrice: 54.9,
    availableFabrics: JSON.stringify(["Dry Texturizado", "Poliéster c/ Elastano"]),
    availableCollars: JSON.stringify(["Gola V com detalhe em ribana"]),
    availableCustomizations: JSON.stringify([
      { code: "NOME", name: "Nome Individual", price: 5.0 },
      { code: "NUMERO", name: "Número Individual", price: 5.0 },
      { code: "TPU_3D", name: "Escudo TPU 3D", price: 15.0 },
    ]),
  },
  {
    categoryCode: "FUTEBOL",
    code: "CAMISA_VARSITY",
    name: "Camisa Varsity Esportiva",
    description: "Linha Varsity com gola e punhos em colmeia ribana especial, estampa total sublimada.",
    minQuantity: 10,
    basePrice: 59.9,
    availableFabrics: JSON.stringify(["Dry Texturizado", "Dry Sport Favo"]),
    availableCollars: JSON.stringify(["Gola V Bicolor em Ribana", "Gola Redonda Ribana"]),
    availableCustomizations: JSON.stringify([
      { code: "NOME", name: "Nome Individual", price: 5.0 },
      { code: "NUMERO", name: "Número Individual", price: 5.0 },
      { code: "TPU_3D", name: "Escudo TPU 3D", price: 15.0 },
    ]),
  },
  {
    categoryCode: "CORPORATIVO",
    code: "CAMISA_POLO_DRY",
    name: "Camisa Polo Dry Sport Favo",
    description: "Camisa estilo polo em tecido Dry Sport Favo com vista embutida, botões e gola estruturada.",
    minQuantity: 10,
    basePrice: 68.9,
    availableFabrics: JSON.stringify(["Dry Sport Favo", "Piqué Poliéster"]),
    availableCollars: JSON.stringify(["Gola Polo Estruturada"]),
    availableCustomizations: JSON.stringify([
      { code: "NOME", name: "Nome Bordado / Estampado", price: 5.0 },
      { code: "TPU_3D", name: "Escudo / Logo TPU 3D", price: 15.0 },
    ]),
  },
  {
    categoryCode: "FUTEBOL",
    code: "CALCAO_JOGO",
    name: "Calção de Jogo Esportivo",
    description: "Calção esportivo anatômico em tecido Dry Fit reforçado com cordão interno e elástico largo.",
    minQuantity: 10,
    basePrice: 34.9,
    availableFabrics: JSON.stringify(["Dry Fit Tradicional", "Dry Texturizado"]),
    availableCollars: JSON.stringify([]),
    availableCustomizations: JSON.stringify([
      { code: "NUMERO", name: "Número no Calção", price: 3.0 },
      { code: "ESCUDO", name: "Escudo no Calção", price: 5.0 },
    ]),
  },
  {
    categoryCode: "BASQUETE",
    code: "REGATA_CONFORT",
    name: "Regata Confort Esportiva",
    description: "Regata ultra-leve com cavas amplas para máxima liberdade de movimento e ventilação.",
    minQuantity: 10,
    basePrice: 38.9,
    availableFabrics: JSON.stringify(["Dry Fit Tradicional", "Cacharrel Dry"]),
    availableCollars: JSON.stringify(["Gola Careca", "Gola V"]),
    availableCustomizations: JSON.stringify([
      { code: "NOME", name: "Nome Individual", price: 5.0 },
      { code: "NUMERO", name: "Número Frente e Costas", price: 8.0 },
    ]),
  },
  {
    categoryCode: "FUTEBOL",
    code: "COLETE_TREINO",
    name: "Colete de Treino Ventilado",
    description: "Colete para treinamento esportivo com tecido microperfurado ultra-respirável.",
    minQuantity: 10,
    basePrice: 22.9,
    availableFabrics: JSON.stringify(["Dry Fit Perfurado"]),
    availableCollars: JSON.stringify(["Gola Redonda"]),
    availableCustomizations: JSON.stringify([
      { code: "NUMERO", name: "Número", price: 3.0 },
    ]),
  },
  {
    categoryCode: "CORPORATIVO",
    code: "JAQUETA_AGASALHO",
    name: "Jaqueta de Agasalho Esportivo",
    description: "Jaqueta esportiva em helanca flanelada com zíper frontal tratorado, bolsos e punhos em ribana.",
    minQuantity: 10,
    basePrice: 119.9,
    availableFabrics: JSON.stringify(["Helanca Flanelada", "Poliéster Microfibra"]),
    availableCollars: JSON.stringify(["Gola Alta com Zíper"]),
    availableCustomizations: JSON.stringify([
      { code: "NOME", name: "Nome Individual", price: 6.0 },
      { code: "TPU_3D", name: "Escudo TPU 3D", price: 15.0 },
    ]),
  },
];

const INITIAL_SEWING_PARTNERS_REFERENCE = [
  {
    type: "INTERNAL",
    name: "Célula Interna de Costura (Fábrica Principal)",
    contactPerson: "Encarregada de Costura",
    phone: "(11) 98888-1234",
    basePricePerPc: 0.0,
    notes: "Linha de montagem interna para pedidos prioritários e pilotos.",
  },
  {
    type: "EXTERNAL",
    name: "Oficina Parceira Alpha Confecções",
    contactPerson: "Dona Maria",
    phone: "(11) 97777-5678",
    documentNumber: "12.345.678/0001-90",
    basePricePerPc: 7.5,
    notes: "Oficina externa homologada para fechamento e acabamento.",
  },
];

const SEED_TEST_DEFAULT_CREDENTIALS = [
  "admin@fabrica.com",
  "gestor@fabrica.com",
  "admin123",
  "senhaSegura123",
  "1234",
  "123456",
  "000000",
  "111111",
  "654321",
  "password12345",
  "admin@example.com",
  "test@example.com",
];

function resolveDbFilePath(dbUrl: string): string {
  let cleaned = dbUrl.trim();
  if (cleaned.startsWith("file:")) {
    cleaned = cleaned.replace(/^file:/, "");
  }
  const queryIndex = cleaned.indexOf("?");
  if (queryIndex !== -1) {
    cleaned = cleaned.substring(0, queryIndex);
  }
  if (!path.isAbsolute(cleaned)) {
    if (cleaned.startsWith("./prisma/") || cleaned.startsWith("prisma/")) {
      return path.resolve(process.cwd(), cleaned).replace(/\\/g, "/");
    }
    return path.resolve(process.cwd(), "prisma", cleaned).replace(/\\/g, "/");
  }
  return path.resolve(process.cwd(), cleaned).replace(/\\/g, "/");
}

export async function initProductionDatabase(): Promise<{
  dbPath: string;
  sectorsCount: number;
  defectTypesCount: number;
  categoriesCount: number;
  productsCount: number;
  partnersCount: number;
  usersCount: number;
  sha256: string;
  integrityCheck: string;
}> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === "") {
    throw new Error("FATAL: Variável de ambiente 'DATABASE_URL' é obrigatória.");
  }

  const normalizedDbPath = resolveDbFilePath(databaseUrl);

  // FAIL-SAFE 1: Recusa expressamente dev.db ou test.db
  if (
    normalizedDbPath.toLowerCase().endsWith("/dev.db") ||
    normalizedDbPath.toLowerCase().endsWith("/test.db") ||
    normalizedDbPath.toLowerCase().includes("dev.db") ||
    normalizedDbPath.toLowerCase().includes("test.db")
  ) {
    throw new Error(
      `FATAL FAIL-SAFE: O script de inicialização de produção recusa categoricamente operar sobre '${normalizedDbPath}' (dev.db ou test.db)!`
    );
  }

  // FAIL-SAFE 2: Se o arquivo já existir com dados, recusa a execução
  if (fs.existsSync(normalizedDbPath)) {
    const stat = fs.statSync(normalizedDbPath);
    if (stat.size > 0) {
      // Verificar se já possui tabelas ou usuários
      const checkClient = new PrismaClient({
        datasources: { db: { url: `file:${normalizedDbPath}?mode=ro` } },
      });
      try {
        const tables: any[] = await checkClient.$queryRawUnsafe(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='User';"
        );
        if (tables.length > 0) {
          const userCount = await checkClient.user.count();
          if (userCount > 0) {
            throw new Error(
              `FATAL FAIL-SAFE: O banco de dados de produção em '${normalizedDbPath}' já existe e contém ${userCount} usuário(s) registrado(s). Execução recusada para evitar sobrescrita de dados de produção.`
            );
          }
        }
      } catch (err: any) {
        if (err.message && err.message.includes("FATAL FAIL-SAFE")) {
          throw err;
        }
      } finally {
        await checkClient.$disconnect();
      }
    }
  }

  // 2. Validação estrita das variáveis de ambiente do ADMIN
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminPin = process.env.ADMIN_PIN?.trim();

  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error("FATAL: ADMIN_EMAIL inválido ou ausente. Forneça um e-mail válido.");
  }

  if (SEED_TEST_DEFAULT_CREDENTIALS.includes(adminEmail)) {
    throw new Error("FATAL: ADMIN_EMAIL não pode utilizar e-mails padrão de testes/desenvolvimento.");
  }

  if (!adminPassword || adminPassword.length < 8) {
    throw new Error("FATAL: ADMIN_PASSWORD deve possuir no mínimo 8 caracteres.");
  }

  if (SEED_TEST_DEFAULT_CREDENTIALS.includes(adminPassword)) {
    throw new Error("FATAL: ADMIN_PASSWORD não pode utilizar senhas padrão de testes/desenvolvimento.");
  }

  if (!adminPin || !/^\d{4,8}$/.test(adminPin)) {
    throw new Error("FATAL: ADMIN_PIN deve conter entre 4 e 8 dígitos numéricos.");
  }

  if (SEED_TEST_DEFAULT_CREDENTIALS.includes(adminPin)) {
    throw new Error("FATAL: ADMIN_PIN não pode utilizar PINs sequenciais ou padrão de testes.");
  }

  // 3. Aplicação das Migrations via prisma migrate deploy
  const dbDir = path.dirname(normalizedDbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const projectRoot = fs.existsSync(path.resolve(process.cwd(), "prisma"))
    ? process.cwd()
    : path.resolve(process.cwd(), "backend");

  const normalizedUrl = `file:${normalizedDbPath}`;

  try {
    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    execSync(`${npxCmd} prisma migrate deploy`, {
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_URL: normalizedUrl,
      },
      stdio: "pipe", // Não vazar dados sensíveis
    });
  } catch (migErr: any) {
    throw new Error(`Falha ao executar 'prisma migrate deploy': ${migErr.message}`);
  }

  // 4. Conectar Prisma Client ao novo banco de produção
  const prisma = new PrismaClient({
    datasources: { db: { url: normalizedUrl } },
  });

  let sectorsCount = 0;
  let defectTypesCount = 0;
  let categoriesCount = 0;
  let productsCount = 0;
  let partnersCount = 0;
  let usersCount = 0;
  let integrityCheck = "UNKNOWN";

  try {
    // Transação atômica para semear dados de referência e usuário admin único
    await prisma.$transaction(async (tx) => {
      // Semeia os 14 setores oficiais
      for (const s of SECTORS_REFERENCE) {
        await tx.sector.upsert({
          where: { sequenceOrder: s.sequenceOrder },
          update: {
            code: s.code,
            name: s.name,
            description: s.description,
            allowsExternalDispatch: s.allowsExternalDispatch,
            allowsReworkOrigin: s.allowsReworkOrigin,
            isActive: true,
          },
          create: {
            sequenceOrder: s.sequenceOrder,
            code: s.code,
            name: s.name,
            description: s.description,
            allowsExternalDispatch: s.allowsExternalDispatch,
            allowsReworkOrigin: s.allowsReworkOrigin,
            isActive: true,
          },
        });
      }

      // Semeia os 6 tipos de defeito oficiais
      for (const d of DEFECT_TYPES_REFERENCE) {
        await tx.defectType.upsert({
          where: { code: d.code },
          update: { name: d.name, isActive: true },
          create: { code: d.code, name: d.name, isActive: true },
        });
      }

      // Semeia as 5 Categorias Oficiais do Catálogo Labella Sports
      for (const cat of OFFICIAL_CATEGORIES_REFERENCE) {
        await tx.productCategory.upsert({
          where: { code: cat.code },
          update: { name: cat.name, description: cat.description, isActive: true },
          create: { code: cat.code, name: cat.name, description: cat.description, isActive: true },
        });
      }

      // Semeia os 9 Produtos Oficiais do Catálogo com Preços e Opcionais
      for (const p of OFFICIAL_PRODUCTS_REFERENCE) {
        const catRecord = await tx.productCategory.findUnique({
          where: { code: p.categoryCode },
        });
        if (catRecord) {
          await tx.catalogProduct.upsert({
            where: { code: p.code },
            update: {
              name: p.name,
              description: p.description,
              categoryId: catRecord.id,
              minQuantity: p.minQuantity,
              basePrice: p.basePrice,
              availableFabrics: p.availableFabrics,
              availableCollars: p.availableCollars,
              availableCustomizations: p.availableCustomizations,
              isActive: true,
            },
            create: {
              code: p.code,
              name: p.name,
              description: p.description,
              categoryId: catRecord.id,
              minQuantity: p.minQuantity,
              basePrice: p.basePrice,
              availableFabrics: p.availableFabrics,
              availableCollars: p.availableCollars,
              availableCustomizations: p.availableCustomizations,
              isActive: true,
            },
          });
        }
      }

      // Semeia Oficinas Iniciais de Costura
      for (const sp of INITIAL_SEWING_PARTNERS_REFERENCE) {
        const existing = await tx.sewingPartner.findFirst({
          where: { name: sp.name },
        });
        if (!existing) {
          await tx.sewingPartner.create({
            data: {
              type: sp.type,
              name: sp.name,
              contactPerson: sp.contactPerson,
              phone: sp.phone,
              documentNumber: sp.documentNumber,
              basePricePerPc: sp.basePricePerPc,
              notes: sp.notes,
              isActive: true,
            },
          });
        }
      }

      // Cria UM único usuário ADMIN com Bcrypt 10 rounds
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      const signaturePinHash = await bcrypt.hash(adminPin, 10);

      await tx.user.upsert({
        where: { email: adminEmail },
        update: {
          passwordHash,
          signaturePinHash,
          role: "ADMIN",
          sectorId: null,
          isActive: true,
        },
        create: {
          name: "Administrador Geral",
          email: adminEmail,
          passwordHash,
          signaturePinHash,
          role: "ADMIN",
          sectorId: null,
          isActive: true,
        },
      });
    });

    sectorsCount = await prisma.sector.count();
    defectTypesCount = await prisma.defectType.count();
    categoriesCount = await prisma.productCategory.count();
    productsCount = await prisma.catalogProduct.count();
    partnersCount = await prisma.sewingPartner.count();
    usersCount = await prisma.user.count();

    const integrityRaw: any[] = await prisma.$queryRawUnsafe("PRAGMA integrity_check;");
    integrityCheck = integrityRaw?.[0]?.integrity_check || "ok";

    // Forçar checkpoint WAL
    await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    await prisma.$disconnect();
  }

  // Calcular SHA-256 final do arquivo de banco criado
  const fileBuffer = fs.readFileSync(normalizedDbPath);
  const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  return {
    dbPath: normalizedDbPath,
    sectorsCount,
    defectTypesCount,
    categoriesCount,
    productsCount,
    partnersCount,
    usersCount,
    sha256,
    integrityCheck,
  };
}

// Execução direta via CLI
if (
  process.argv[1] &&
  (process.argv[1].endsWith("init-production-db.ts") || process.argv[1].endsWith("init-production-db.js"))
) {
  initProductionDatabase()
    .then((result) => {
      console.log("================================================================================");
      console.log("=== INICIALIZAÇÃO DE BANCO DE PRODUÇÃO CONCLUÍDA COM SUCESSO ===");
      console.log("================================================================================");
      console.log(`Caminho do Banco:        ${result.dbPath}`);
      console.log(`Setores Cadastrados:     ${result.sectorsCount} (14 oficiais)`);
      console.log(`Tipos de Defeito:        ${result.defectTypesCount} (6 oficiais)`);
      console.log(`Categorias de Catálogo:  ${result.categoriesCount} (5 oficiais)`);
      console.log(`Produtos do Catálogo:    ${result.productsCount} (9 oficiais)`);
      console.log(`Oficinas Homologadas:    ${result.partnersCount}`);
      console.log(`Usuários Cadastrados:    ${result.usersCount} (1 ADMIN único)`);
      console.log(`SHA-256 do Banco:        ${result.sha256}`);
      console.log(`Integridade SQLite:      ${result.integrityCheck}`);
      console.log("================================================================================");
    })
    .catch((err) => {
      console.error("ERRO NA INICIALIZAÇÃO DO BANCO DE PRODUÇÃO:", err.message);
      process.exit(1);
    });
}
