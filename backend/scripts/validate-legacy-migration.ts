import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { PrismaClient } from "@prisma/client";

async function run() {
  console.log("================================================================================");
  console.log("=== VALIDAÇÃO DE MIGRAÇÃO PRISMA EM CÓPIA ISOLADA DE BANCO COM FICHAS ANTIGAS ===");
  console.log("================================================================================");

  const backendDir = path.resolve(process.cwd());
  const scratchDir = path.resolve(backendDir, "prisma", "legacy_validation");
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  const legacyDbFile = path.resolve(scratchDir, "legacy_test.db");
  for (const ext of ["", "-journal", "-wal", "-shm"]) {
    const f = `${legacyDbFile}${ext}`;
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch (_) {}
    }
  }

  const normalizedDbUrl = `file:${legacyDbFile.replace(/\\/g, "/")}`;
  const migrationsDir = path.resolve(backendDir, "prisma", "migrations");
  const newMigrationDirName = "20261118000000_add_custom_quotation_fields_and_attachments";
  const newMigrationSrc = path.join(migrationsDir, newMigrationDirName);
  const newMigrationBackup = path.join(scratchDir, newMigrationDirName);

  // 1. Mover temporariamente a nova migração para fora da pasta migrations
  console.log("\n[1/5] Preparando ambiente legado (migrações 0 a 5)...");
  if (fs.existsSync(newMigrationSrc)) {
    fs.cpSync(newMigrationSrc, newMigrationBackup, { recursive: true });
    fs.rmSync(newMigrationSrc, { recursive: true, force: true });
  }

  try {
    // 2. Aplicar migrações antigas no legacy_test.db usando prisma migrate deploy
    console.log("Executando 'prisma migrate deploy' para montar banco antigo...");
    execSync("npx.cmd prisma migrate deploy", {
      cwd: backendDir,
      env: {
        ...process.env,
        DATABASE_URL: normalizedDbUrl,
      },
      stdio: "pipe",
    });
    console.log("✔ Banco antigo inicializado exclusivamente com as migrações anteriores.");

    // 3. Conectar e inserir registros históricos
    console.log("\n[2/5] Inserindo fichas e orçamentos históricos no banco legado...");
    const prisma = new PrismaClient({
      datasources: { db: { url: normalizedDbUrl } },
    });

    const sellerId = "seller-legacy-001";
    const customerId = "cust-legacy-001";
    const quotationHistId = "quot-legacy-001";
    const itemId = "item-legacy-001";
    const attachmentId = "att-legacy-001";

    await prisma.$executeRawUnsafe(`
      INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "isActive", "createdAt", "updatedAt")
      VALUES ('${sellerId}', 'Vendedor Antigo', 'vendedor.antigo@teste.com', 'hash123', 'VENDEDOR', 1, datetime('now'), datetime('now'));
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO "Customer" ("id", "companyName", "contactName", "phone", "createdAt", "updatedAt")
      VALUES ('${customerId}', 'Empresa Antiga 2024 LTDA', 'Carlos Eduardo', '(11) 97777-6666', datetime('now'), datetime('now'));
    `);

    // Orçamento histórico antigo: 10 peças a R$ 47.90 (Base: 42.90 + Nome: 5.00) = R$ 479.00
    const historicalBudgetAmount = 479.00;
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Quotation" (
        "id", "quotationNumber", "customerId", "sellerId", "teamName",
        "status", "totalQuantity", "budgetAmount", "createdAt", "updatedAt"
      ) VALUES (
        '${quotationHistId}', 'ORC-2024-99999', '${customerId}', '${sellerId}', 'Time Antigo Historico',
        'ORCAMENTO_APROVADO', 10, ${historicalBudgetAmount}, datetime('now', '-30 days'), datetime('now', '-30 days')
      );
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO "QuotationItem" (
        "id", "quotationId", "productModel", "gender", "size",
        "quantity", "unitPrice", "subtotal", "customName", "customNumber",
        "fabricType", "collarType", "createdAt"
      ) VALUES (
        '${itemId}', '${quotationHistId}', 'Camiseta Dry Fit Tradicional', 'MASCULINO', 'G',
        10, 47.90, 479.00, 'Carlos 10', '10', 'Dry Fit', 'Gola Careca', datetime('now', '-30 days')
      );
    `);

    await prisma.$executeRawUnsafe(`
      INSERT INTO "QuotationAttachment" (
        "id", "quotationId", "fileName", "fileType", "fileExtension",
        "fileUrl", "uploadedById", "createdAt"
      ) VALUES (
        '${attachmentId}', '${quotationHistId}', 'arte_antiga_2024.png', 'REFERENCE', 'PNG',
        '/uploads/references/arte_antiga_2024.png', '${sellerId}', datetime('now', '-30 days')
      );
    `);

    console.log(`✔ Orçamento histórico ${quotationHistId} persistido com total R$ ${historicalBudgetAmount.toFixed(2)}.`);
    await prisma.$disconnect();

    // 4. Restaurar a nova migração na pasta prisma/migrations
    console.log("\n[3/5] Restaurando migração 20261118000000_add_custom_quotation_fields_and_attachments...");
    fs.cpSync(newMigrationBackup, newMigrationSrc, { recursive: true });

    // 5. Executar prisma migrate deploy no banco com dados históricos
    console.log("Executando 'prisma migrate deploy' para aplicar novos campos no banco com histórico...");
    const deployOutput = execSync("npx.cmd prisma migrate deploy", {
      cwd: backendDir,
      env: {
        ...process.env,
        DATABASE_URL: normalizedDbUrl,
      },
    }).toString();
    console.log(deployOutput.trim());
    console.log("✔ Migração Prisma aplicada com sucesso via Prisma Migrate!");

    // 6. Validar integridade dos dados históricos após deploy
    console.log("\n[4/5] Verificando integridade das fichas históricas pós-migração...");
    const prismaMigrated = new PrismaClient({
      datasources: { db: { url: normalizedDbUrl } },
    });

    const quotation = await prismaMigrated.quotation.findUnique({
      where: { id: quotationHistId },
      include: { items: true, attachments: true },
    });

    if (!quotation) {
      throw new Error("FATAL: Orçamento histórico desapareceu pós-migração!");
    }
    if (quotation.budgetAmount !== historicalBudgetAmount) {
      throw new Error(`FATAL: budgetAmount histórico foi alterado! Esperado: ${historicalBudgetAmount}, Obtido: ${quotation.budgetAmount}`);
    }
    console.log(`✔ [INTEGRIDADE CONFIRMADA] Quotation.budgetAmount histórico intacto: R$ ${quotation.budgetAmount.toFixed(2)}`);

    const item = quotation.items[0];
    if (!item) {
      throw new Error("FATAL: Item do orçamento histórico desapareceu!");
    }
    if (item.unitPrice !== 47.90 || item.subtotal !== 479.00) {
      throw new Error(`FATAL: Preços do item histórico alterados! unitPrice: ${item.unitPrice}, subtotal: ${item.subtotal}`);
    }
    if (item.isCustomModel !== false || item.customModelName !== null) {
      throw new Error("FATAL: Valores default das novas colunas inconsistentes!");
    }
    console.log(`✔ [INTEGRIDADE CONFIRMADA] Item histórico intacto: unitPrice=R$ ${item.unitPrice.toFixed(2)}, subtotal=R$ ${item.subtotal.toFixed(2)}`);
    console.log(`✔ [INTEGRIDADE CONFIRMADA] Novos campos inicializados com segurança: isCustomModel=${item.isCustomModel}, customModelName=${item.customModelName}`);

    const att = quotation.attachments[0];
    if (!att || att.fileName !== "arte_antiga_2024.png" || att.originalName !== null) {
      throw new Error("FATAL: Anexo histórico corrompido pós-migração!");
    }
    console.log(`✔ [INTEGRIDADE CONFIRMADA] Anexo histórico intacto com originalName=null seguro.`);

    // 7. Testar criação de nova ficha com campos "Outros" no banco migrado
    console.log("\n[5/5] Testando persistência de novos campos 'Outros' no banco migrado...");
    const newQuotation = await prismaMigrated.quotation.create({
      data: {
        quotationNumber: "ORC-2026-NEW-001",
        customerId,
        sellerId,
        teamName: "Time Novo 2026",
        status: "NOVO",
        totalQuantity: 20,
        budgetAmount: 1100.0,
        items: {
          create: {
            productModel: "Outros",
            isCustomModel: true,
            customModelName: "Regata Edição Especial Jogos",
            fabricType: "Outros",
            isCustomFabric: true,
            customFabricName: "Dry Fit Colmeia Tecnológico",
            collarType: "Outros",
            isCustomCollar: true,
            customCollarName: "Gola V Transpassada Dupla",
            gender: "UNISSEX",
            size: "G",
            quantity: 20,
            unitPrice: 55.0,
            subtotal: 1100.0,
          },
        },
        attachments: {
          create: {
            fileName: "mockup_vetor_123.cdr",
            originalName: "Mockup_Arte_Oficial.cdr",
            fileType: "REFERENCE",
            fileExtension: "CDR",
            fileUrl: "/uploads/references/mockup_vetor_123.cdr",
            uploadedById: sellerId,
          },
        },
      },
      include: { items: true, attachments: true },
    });

    const newItem = newQuotation.items[0];
    if (
      !newItem.isCustomModel ||
      newItem.customModelName !== "Regata Edição Especial Jogos" ||
      !newItem.isCustomFabric ||
      newItem.customFabricName !== "Dry Fit Colmeia Tecnológico" ||
      !newItem.isCustomCollar ||
      newItem.customCollarName !== "Gola V Transpassada Dupla"
    ) {
      throw new Error("FATAL: Campos 'Outros' não persistiram corretamente!");
    }

    const newAtt = newQuotation.attachments[0];
    if (newAtt.originalName !== "Mockup_Arte_Oficial.cdr") {
      throw new Error("FATAL: originalName não foi persistido!");
    }

    console.log("✔ [NOVA ESTRUTURA CONFIRMADA] Ficha com campos 'Outros' e anexo com nome original persistidos perfeitamente!");

    await prismaMigrated.$disconnect();

    // Limpar arquivo de teste isolado
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }

    console.log("\n================================================================================");
    console.log("✔ SUCESSO TOTAL: Migração Prisma formalmente validada em cópia isolada de banco legado!");
    console.log("================================================================================");
  } finally {
    // Garantir que a migração sempre seja restaurada em caso de falha
    if (!fs.existsSync(newMigrationSrc) && fs.existsSync(newMigrationBackup)) {
      fs.cpSync(newMigrationBackup, newMigrationSrc, { recursive: true });
      fs.rmSync(newMigrationBackup, { recursive: true, force: true });
    }
  }
}

run().catch((err) => {
  console.error("Falha:", err);
  process.exit(1);
});
