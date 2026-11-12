import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SECTORS_DATA = [
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
  { sequenceOrder: 13, code: "QUALIDADE", name: "Qualidade Pós-Costura", description: "Inspeção rigorosa de costura, medidas, manchas e direcionamento de retrabalho.", allowsExternalDispatch: false, allowsReworkOrigin: true },
  { sequenceOrder: 14, code: "EXPEDICAO", name: "Embalagem / Expedição / Entrega", description: "Dobra, colocação de etiquetas/tags, embalagem plástica e expedição final ao cliente.", allowsExternalDispatch: false, allowsReworkOrigin: false },
];

async function main() {
  console.log("Iniciando seed do banco de dados...");

  // 1. Criar ou Atualizar os 14 Setores
  for (const s of SECTORS_DATA) {
    await prisma.sector.upsert({
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
  console.log("14 Setores industriais cadastrados com sucesso.");

  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  const standardPasswordHash = await bcrypt.hash("senhaSegura123", 10);
  const defaultPinHash = await bcrypt.hash("1234", 10);
  const pin123456Hash = await bcrypt.hash("123456", 10);

  // 2. Buscar setores para associação
  const designSector = await prisma.sector.findUnique({ where: { code: "DESIGNER" } });
  const vendasSector = await prisma.sector.findUnique({ where: { code: "VENDAS" } });
  const sacSector = await prisma.sector.findUnique({ where: { code: "SAC_INTERNO" } });
  const preDiagSector = await prisma.sector.findUnique({ where: { code: "PRE_DIAGRAMACAO" } });
  const diagramacaoSector = await prisma.sector.findUnique({ where: { code: "DIAGRAMACAO" } });
  const impressaoSector = await prisma.sector.findUnique({ where: { code: "IMPRESSAO" } });
  const infestoSector = await prisma.sector.findUnique({ where: { code: "INFESTO" } });
  const calandraSector = await prisma.sector.findUnique({ where: { code: "CALANDRA" } });
  const separacaoSector = await prisma.sector.findUnique({ where: { code: "SEPARACAO" } });
  const despacheSector = await prisma.sector.findUnique({ where: { code: "DESPACHE_OFICINA" } });
  const costuraSector = await prisma.sector.findUnique({ where: { code: "COSTURA" } });
  const qualidadeSector = await prisma.sector.findUnique({ where: { code: "QUALIDADE" } });
  const expedicaoSector = await prisma.sector.findUnique({ where: { code: "EXPEDICAO" } });

  // 3. Usuários Padrão do Sistema
  const USERS_TO_SEED = [
    {
      name: "Administrador Geral PCP",
      email: "admin@fabrica.com",
      role: "ADMIN" as const,
      passwordHash: adminPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: null,
    },
    {
      name: "Carlos Gestor de Produção",
      email: "gestor@fabrica.com",
      role: "GESTOR" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: null,
    },
    {
      name: "Carlos Gestor de PCP",
      email: "gestor.producao@fabrica.com",
      role: "GESTOR" as const,
      passwordHash: adminPasswordHash,
      signaturePinHash: pin123456Hash,
      sectorId: calandraSector?.id || null,
    },
    {
      name: "Marcos Vendedor",
      email: "vendedor@fabrica.com",
      role: "VENDEDOR" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: vendasSector?.id || null,
    },
    {
      name: "Ana Designer Arte-Final",
      email: "designer@fabrica.com",
      role: "DESIGNER" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: designSector?.id || null,
    },
    {
      name: "Paula SAC Interno",
      email: "sac@fabrica.com",
      role: "OPERADOR" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: sacSector?.id || null,
    },
    {
      name: "Roberto Pré-Diagramação",
      email: "prediag@fabrica.com",
      role: "OPERADOR" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: preDiagSector?.id || null,
    },
    {
      name: "Lucas Diagramador",
      email: "diagramacao@fabrica.com",
      role: "OPERADOR" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: diagramacaoSector?.id || null,
    },
    {
      name: "Mateus Operador Impressão",
      email: "impressao@fabrica.com",
      role: "OPERADOR" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: impressaoSector?.id || null,
    },
    {
      name: "Julio Operador Infesto",
      email: "infesto@fabrica.com",
      role: "OPERADOR" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: infestoSector?.id || null,
    },
    {
      name: "João da Calandra",
      email: "calandra@fabrica.com",
      role: "OPERADOR" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: calandraSector?.id || null,
    },
    {
      name: "João Operador Calandra",
      email: "operador.calandra@fabrica.com",
      role: "OPERADOR" as const,
      passwordHash: adminPasswordHash,
      signaturePinHash: pin123456Hash,
      sectorId: calandraSector?.id || null,
    },
    {
      name: "Fabio Operador Separação",
      email: "separacao@fabrica.com",
      role: "OPERADOR" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: separacaoSector?.id || null,
    },
    {
      name: "Otávio Operador Despache",
      email: "despache@fabrica.com",
      role: "OPERADOR" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: despacheSector?.id || null,
    },
    {
      name: "Clara Operadora Costura",
      email: "costura@fabrica.com",
      role: "OPERADOR" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: costuraSector?.id || null,
    },
    {
      name: "Quintino Operador Qualidade",
      email: "qualidade@fabrica.com",
      role: "OPERADOR" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: qualidadeSector?.id || null,
    },
    {
      name: "Eduardo Operador Expedição",
      email: "expedicao@fabrica.com",
      role: "OPERADOR" as const,
      passwordHash: standardPasswordHash,
      signaturePinHash: defaultPinHash,
      sectorId: expedicaoSector?.id || null,
    },
  ];

  for (const u of USERS_TO_SEED) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        passwordHash: u.passwordHash,
        signaturePinHash: u.signaturePinHash,
        sectorId: u.sectorId,
        isActive: true,
      },
      create: {
        name: u.name,
        email: u.email,
        role: u.role,
        passwordHash: u.passwordHash,
        signaturePinHash: u.signaturePinHash,
        sectorId: u.sectorId,
        isActive: true,
      },
    });
    console.log(`Usuário homologado: ${u.email} (${u.role})`);
  }

  // 5. Oficinas de Costura Iniciais (Interna e Externa)
  await prisma.sewingPartner.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {
      name: "Célula Interna de Costura",
      type: "INTERNAL",
      contactPerson: "Lúcia Encarregada",
      phone: "(11) 98888-1111",
      basePricePerPc: 0.0,
      isActive: true,
    },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Célula Interna de Costura",
      type: "INTERNAL",
      contactPerson: "Lúcia Encarregada",
      phone: "(11) 98888-1111",
      basePricePerPc: 0.0,
      isActive: true,
    },
  });

  await prisma.sewingPartner.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {
      name: "Oficina Confecções Elite Ltda",
      type: "EXTERNAL",
      documentNumber: "12.345.678/0001-90",
      contactPerson: "Roberto Silva",
      phone: "(11) 97777-2222",
      address: "Rua das Costuras, 120 - Galpão 3",
      basePricePerPc: 4.50,
      isActive: true,
    },
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Oficina Confecções Elite Ltda",
      type: "EXTERNAL",
      documentNumber: "12.345.678/0001-90",
      contactPerson: "Roberto Silva",
      phone: "(11) 97777-2222",
      address: "Rua das Costuras, 120 - Galpão 3",
      basePricePerPc: 4.50,
      isActive: true,
    },
  });

  // 6. Tipos Iniciais de Defeito (Setor 13 - Qualidade pós-costura)
  const INITIAL_DEFECT_TYPES = [
    { code: "MANCHA", name: "Mancha no Tecido / Estampa" },
    { code: "COSTURA_TORTA", name: "Costura Torta ou Desalinhada" },
    { code: "TAMANHO_ERRADO", name: "Tamanho Errado na Etiqueta" },
    { code: "ESTAMPA_DESALINHADA", name: "Estampa Desalinhada" },
    { code: "FIO_SOLTO", name: "Fio Solto / Arremate Pendente" },
    { code: "MEDIDA_FORA_TOLERANCIA", name: "Medida Fora da Tolerância" },
  ];

  for (const dt of INITIAL_DEFECT_TYPES) {
    await prisma.defectType.upsert({
      where: { code: dt.code },
      update: { name: dt.name, isActive: true },
      create: { code: dt.code, name: dt.name, isActive: true },
    });
  }
  console.log("6 Tipos de Defeito da Qualidade cadastrados com sucesso.");

  // 7. Catálogo Oficial Labella Sports (Produtos, Tecidos, Modelos e Preços de Referência)
  const OFFICIAL_CATEGORIES = [
    { code: "FUTEBOL", name: "Futebol & Futsal", description: "Uniformes para futebol de campo, futsal e society" },
    { code: "VOLEI", name: "Vôlei", description: "Uniformes para quadra e vôlei de praia" },
    { code: "BASQUETE", name: "Basquete", description: "Regatas e uniformes de basquete e streetball" },
    { code: "CORRIDA_FITNESS", name: "Corrida & Treino", description: "Vestuário para corrida, ciclismo e academias" },
    { code: "CORPORATIVO", name: "Corporativo & Eventos", description: "Camisas polo, agasalhos e uniformes empresariais" },
  ];

  for (const cat of OFFICIAL_CATEGORIES) {
    await prisma.productCategory.upsert({
      where: { code: cat.code },
      update: { name: cat.name, description: cat.description, isActive: true },
      create: { code: cat.code, name: cat.name, description: cat.description, isActive: true },
    });
  }
  console.log("5 Categorias Oficiais do Catálogo cadastradas.");

  const catFutebol = await prisma.productCategory.findUnique({ where: { code: "FUTEBOL" } });
  const catBasquete = await prisma.productCategory.findUnique({ where: { code: "BASQUETE" } });
  const catCorp = await prisma.productCategory.findUnique({ where: { code: "CORPORATIVO" } });

  const OFFICIAL_PRODUCTS = [
    {
      categoryId: catFutebol!.id,
      code: "CAMISA_CLASSIC",
      name: "Camisa Classic Dry Fit",
      description: "Camisa esportiva tradicional em tecido Dry Fit respirável, escudo sublimado, gola redonda ou V.",
      minQuantity: 10,
      basePrice: 42.90,
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
      categoryId: catFutebol!.id,
      code: "CAMISA_PRIME",
      name: "Camisa Prime Dry Fit",
      description: "Camisa esportiva linha Prime em poliéster Dry Fit de alta durabilidade e secagem ultra-rápida.",
      minQuantity: 10,
      basePrice: 49.90,
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
      categoryId: catFutebol!.id,
      code: "CAMISA_RAGLAN_V",
      name: "Camisa Raglan Gola V",
      description: "Modelagem anatômica com corte raglan nos ombros, tecido Dry Texturizado com microfuros.",
      minQuantity: 10,
      basePrice: 54.90,
      availableFabrics: JSON.stringify(["Dry Texturizado", "Poliéster c/ Elastano"]),
      availableCollars: JSON.stringify(["Gola V com detalhe em ribana"]),
      availableCustomizations: JSON.stringify([
        { code: "NOME", name: "Nome Individual", price: 5.0 },
        { code: "NUMERO", name: "Número Individual", price: 5.0 },
        { code: "TPU_3D", name: "Escudo TPU 3D", price: 15.0 },
      ]),
    },
    {
      categoryId: catFutebol!.id,
      code: "CAMISA_VARSITY",
      name: "Camisa Varsity Esportiva",
      description: "Linha Varsity com gola e punhos em colmeia ribana especial, estampa total sublimada.",
      minQuantity: 10,
      basePrice: 59.90,
      availableFabrics: JSON.stringify(["Dry Texturizado", "Dry Sport Favo"]),
      availableCollars: JSON.stringify(["Gola V Bicolor em Ribana", "Gola Redonda Ribana"]),
      availableCustomizations: JSON.stringify([
        { code: "NOME", name: "Nome Individual", price: 5.0 },
        { code: "NUMERO", name: "Número Individual", price: 5.0 },
        { code: "TPU_3D", name: "Escudo TPU 3D", price: 15.0 },
      ]),
    },
    {
      categoryId: catCorp!.id,
      code: "CAMISA_POLO_DRY",
      name: "Camisa Polo Dry Sport Favo",
      description: "Camisa estilo polo em tecido Dry Sport Favo com vista embutida, botões e gola estruturada.",
      minQuantity: 10,
      basePrice: 68.90,
      availableFabrics: JSON.stringify(["Dry Sport Favo", "Piqué Poliéster"]),
      availableCollars: JSON.stringify(["Gola Polo Estruturada"]),
      availableCustomizations: JSON.stringify([
        { code: "NOME", name: "Nome Bordado / Estampado", price: 5.0 },
        { code: "TPU_3D", name: "Escudo / Logo TPU 3D", price: 15.0 },
      ]),
    },
    {
      categoryId: catFutebol!.id,
      code: "CALCAO_JOGO",
      name: "Calção de Jogo Esportivo",
      description: "Calção esportivo anatômico em tecido Dry Fit reforçado com cordão interno e elástico largo.",
      minQuantity: 10,
      basePrice: 34.90,
      availableFabrics: JSON.stringify(["Dry Fit Tradicional", "Dry Texturizado"]),
      availableCollars: JSON.stringify([]),
      availableCustomizations: JSON.stringify([
        { code: "NUMERO", name: "Número no Calção", price: 3.0 },
        { code: "ESCUDO", name: "Escudo no Calção", price: 5.0 },
      ]),
    },
    {
      categoryId: catBasquete!.id,
      code: "REGATA_CONFORT",
      name: "Regata Confort Esportiva",
      description: "Regata ultra-leve com cavas amplas para máxima liberdade de movimento e ventilação.",
      minQuantity: 10,
      basePrice: 38.90,
      availableFabrics: JSON.stringify(["Dry Fit Tradicional", "Cacharrel Dry"]),
      availableCollars: JSON.stringify(["Gola Careca", "Gola V"]),
      availableCustomizations: JSON.stringify([
        { code: "NOME", name: "Nome Individual", price: 5.0 },
        { code: "NUMERO", name: "Número Frente e Costas", price: 8.0 },
      ]),
    },
    {
      categoryId: catFutebol!.id,
      code: "COLETE_TREINO",
      name: "Colete de Treino Ventilado",
      description: "Colete para treinamento esportivo com tecido microperfurado ultra-respirável.",
      minQuantity: 10,
      basePrice: 22.90,
      availableFabrics: JSON.stringify(["Dry Fit Perfurado"]),
      availableCollars: JSON.stringify(["Gola Redonda"]),
      availableCustomizations: JSON.stringify([
        { code: "NUMERO", name: "Número", price: 3.0 },
      ]),
    },
    {
      categoryId: catCorp!.id,
      code: "JAQUETA_AGASALHO",
      name: "Jaqueta de Agasalho Esportivo",
      description: "Jaqueta esportiva em helanca flanelada com zíper frontal tratorado, bolsos e punhos em ribana.",
      minQuantity: 10,
      basePrice: 119.90,
      availableFabrics: JSON.stringify(["Helanca Flanelada", "Poliéster Microfibra"]),
      availableCollars: JSON.stringify(["Gola Alta com Zíper"]),
      availableCustomizations: JSON.stringify([
        { code: "NOME", name: "Nome Individual", price: 6.0 },
        { code: "TPU_3D", name: "Escudo TPU 3D", price: 15.0 },
      ]),
    },
  ];

  for (const prod of OFFICIAL_PRODUCTS) {
    await prisma.catalogProduct.upsert({
      where: { code: prod.code },
      update: {
        name: prod.name,
        description: prod.description,
        minQuantity: prod.minQuantity,
        basePrice: prod.basePrice,
        availableFabrics: prod.availableFabrics,
        availableCollars: prod.availableCollars,
        availableCustomizations: prod.availableCustomizations,
        isActive: true,
      },
      create: {
        categoryId: prod.categoryId,
        code: prod.code,
        name: prod.name,
        description: prod.description,
        minQuantity: prod.minQuantity,
        basePrice: prod.basePrice,
        availableFabrics: prod.availableFabrics,
        availableCollars: prod.availableCollars,
        availableCustomizations: prod.availableCustomizations,
        isActive: true,
      },
    });
  }
  console.log("9 Produtos Oficiais do Catálogo cadastrados com sucesso.");

  // 8. Registro de Auditoria do Seed
  const adminUser = await prisma.user.findUnique({ where: { email: "admin@fabrica.com" } });
  await prisma.auditLog.create({
    data: {
      userId: adminUser!.id,
      action: "DATABASE_INITIAL_SEED",
      entityName: "System",
      entityId: "SYSTEM_INIT",
      newValues: JSON.stringify({ message: "Seed dos 14 setores, usuários padrão e oficinas de costura inicializado com sucesso" }),
      ipAddress: "127.0.0.1",
      userAgent: "PCP Seed Script",
    },
  });

  console.log("Seed finalizado com sucesso!");
}

main()
  .catch((e) => {
    console.error("Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
