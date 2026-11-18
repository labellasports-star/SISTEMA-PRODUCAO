import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import fs from "fs";
import { app } from "../src/server.js";
import { prisma } from "../src/prisma.js";
import { hashPassword, generateToken } from "../src/utils/security.js";
import { getReferencesDir } from "../src/utils/storageConfig.js";

let server: http.Server;
let baseUrl: string;

test.before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("Fluxo Completo de Pré-Venda: Isolamento de Vendedores, 'Outros', Anexos Múltiplos, Opcionais sem Custo e Conversão em OP", async (t) => {
  const timestamp = Date.now();
  const passwordHash = await hashPassword("SenhaForte123@");

  // Setores
  const sectorDesign = await prisma.sector.findUnique({ where: { code: "DESIGNER" } });
  const sectorVendas = await prisma.sector.findUnique({ where: { code: "VENDAS" } });
  const sectorSac = await prisma.sector.findUnique({ where: { code: "SAC_INTERNO" } });
  const sectorCostura = await prisma.sector.findUnique({ where: { code: "COSTURA" } });

  assert.ok(sectorDesign && sectorVendas && sectorSac && sectorCostura, "Setores obrigatórios devem existir");

  // 1. Criar Contas: Vendedor A, Vendedor B, Designer 1, Operador 1
  const sellerA = await prisma.user.create({
    data: {
      name: `Vendedor Alpha ${timestamp}`,
      email: `vendedor.a.${timestamp}@labella.com`,
      passwordHash,
      role: "VENDEDOR",
      sectorId: sectorVendas.id,
      isActive: true,
    },
  });

  const sellerB = await prisma.user.create({
    data: {
      name: `Vendedor Beta ${timestamp}`,
      email: `vendedor.b.${timestamp}@labella.com`,
      passwordHash,
      role: "VENDEDOR",
      sectorId: sectorVendas.id,
      isActive: true,
    },
  });

  const designer1 = await prisma.user.create({
    data: {
      name: `Designer Silva ${timestamp}`,
      email: `designer.${timestamp}@labella.com`,
      passwordHash,
      role: "DESIGNER",
      sectorId: sectorDesign.id,
      isActive: true,
    },
  });

  const operador1 = await prisma.user.create({
    data: {
      name: `Operador SAC ${timestamp}`,
      email: `operador.${timestamp}@labella.com`,
      passwordHash,
      role: "OPERADOR",
      sectorId: sectorSac.id,
      isActive: true,
    },
  });

  const tokenSellerA = generateToken({ userId: sellerA.id, email: sellerA.email, role: sellerA.role });
  const tokenSellerB = generateToken({ userId: sellerB.id, email: sellerB.email, role: sellerB.role });
  const tokenDesigner = generateToken({ userId: designer1.id, email: designer1.email, role: designer1.role });
  const tokenOperador = generateToken({ userId: operador1.id, email: operador1.email, role: operador1.role });

  // Criar arquivos físicos de teste no diretório de referências isolado
  const refDir = getReferencesDir();
  if (!fs.existsSync(refDir)) {
    fs.mkdirSync(refDir, { recursive: true });
  }

  const testCdrFile = `arte_vetor_${timestamp}.cdr`;
  const testPsdFile = `mockup_${timestamp}.psd`;
  const testPdfFile = `especificacao_${timestamp}.pdf`;
  fs.writeFileSync(path.join(refDir, testCdrFile), Buffer.from("VETOR_CDR_CONTENT_12345"));
  fs.writeFileSync(path.join(refDir, testPsdFile), Buffer.from("PSD_MOCKUP_CONTENT_12345"));
  fs.writeFileSync(path.join(refDir, testPdfFile), Buffer.from("%PDF-1.4 TEST SPEC"));

  let createdQuotationId: string = "";

  // ---------------------------------------------------------------------------
  // 1. Criação da Pré-Venda pelo Vendedor A com Todos os Campos da Imagem
  //    - Campos "Outros" em Modelo, Tecido e Gola
  //    - Opcionais: Nome e Número (R$ 0) + TPU 3D (R$ 15)
  //    - Múltiplos anexos (.cdr, .psd, .pdf)
  // ---------------------------------------------------------------------------
  await t.test("Vendedor A cria oportunidade de pré-venda completa com campos Outros e múltiplos anexos", async () => {
    const payload = {
      customer: {
        companyName: "Atlética Medicina Unifesp",
        contactName: "Roberto Firmino",
        phone: "(11) 98888-7777",
      },
      teamName: "Time Canarinhos da Medicina",
      productsSummary: "Regata Personalizada Outros Modelos",
      totalQuantity: 20,
      budgetAmount: 1100.0,
      desiredDeadline: new Date(Date.now() + 15 * 86400000).toISOString(),
      briefingText: "Camisa com gola especial fora do catálogo e escudo em TPU 3D no peito esquerdo.",
      observations: "Cliente precisa receber antes dos jogos universitários.",
      items: [
        {
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
          customizations: JSON.stringify(["Escudo TPU 3D", "Nome", "Número"]),
        },
      ],
      attachments: [
        {
          fileName: testCdrFile,
          originalName: "Arte_Vetor_Oficial.cdr",
          fileUrl: `/uploads/references/${testCdrFile}`,
          fileType: "REFERENCE",
          fileSize: 1024,
        },
        {
          fileName: testPsdFile,
          originalName: "Mockup_Uniforme_Frente_Verso.psd",
          fileUrl: `/uploads/references/${testPsdFile}`,
          fileType: "REFERENCE",
          fileSize: 2048,
        },
      ],
    };

    const res = await fetch(`${baseUrl}/api/quotations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSellerA}`,
      },
      body: JSON.stringify(payload),
    });

    assert.strictEqual(res.status, 201, "Deveria criar a pré-venda com sucesso");
    const data = await res.json();
    assert.ok(data.id, "Deve retornar o ID da ficha criada");
    createdQuotationId = data.id;

    // Verificar se o vendedor foi vinculado automaticamente pela sessão autenticada
    assert.strictEqual(data.sellerId, sellerA.id, "A ficha deve ser vinculada estritamente ao ID do vendedor da sessão");
    assert.strictEqual(data.teamName, "Time Canarinhos da Medicina");
    assert.strictEqual(data.customer?.phone, "(11) 98888-7777");
    assert.strictEqual(data.customer?.contactName, "Roberto Firmino");
    assert.strictEqual(data.customer?.companyName, "Atlética Medicina Unifesp");

    // Verificar itens e campos 'Outros'
    assert.strictEqual(data.items.length, 1);
    const item = data.items[0];
    assert.strictEqual(item.isCustomModel, true);
    assert.strictEqual(item.customModelName, "Regata Edição Especial Jogos");
    assert.strictEqual(item.isCustomFabric, true);
    assert.strictEqual(item.customFabricName, "Dry Fit Colmeia Tecnológico");
    assert.strictEqual(item.isCustomCollar, true);
    assert.strictEqual(item.customCollarName, "Gola V Transpassada Dupla");

    // Verificar anexos vinculados e nomes originais preservados
    assert.strictEqual(data.attachments.length, 2);
    assert.strictEqual(data.attachments[0].originalName, "Arte_Vetor_Oficial.cdr");
    assert.strictEqual(data.attachments[1].originalName, "Mockup_Uniforme_Frente_Verso.psd");

    // Adicionar terceiro anexo via POST /attachments para validar anexo avulso na edição
    const attRes = await fetch(`${baseUrl}/api/quotations/${createdQuotationId}/attachments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSellerA}`,
      },
      body: JSON.stringify({
        fileName: testPdfFile,
        originalName: "Tabela_Medidas_Especiais.pdf",
        fileUrl: `/uploads/references/${testPdfFile}`,
        fileType: "REFERENCE",
        fileSize: 4096,
      }),
    });
    assert.strictEqual(attRes.status, 201, "Deve permitir anexar arquivo adicional na edição");
  });

  // ---------------------------------------------------------------------------
  // 2. Isolamento Rigoroso entre Vendedores (Horizontal Access Control)
  //    - Vendedor B NÃO lista a cotação do Vendedor A
  //    - Vendedor B NÃO acessa detalhes por ID (403)
  //    - Vendedor B NÃO edita a cotação do Vendedor A (403)
  //    - Vendedor B NÃO anexa arquivos na cotação do Vendedor A (403)
  //    - Vendedor B NÃO faz download dos anexos por URL direta (403)
  // ---------------------------------------------------------------------------
  await t.test("Vendedor B é estritamente bloqueado de acessar a cotação e anexos do Vendedor A", async () => {
    // 2.1 Listagem
    const listRes = await fetch(`${baseUrl}/api/quotations`, {
      headers: { Authorization: `Bearer ${tokenSellerB}` },
    });
    assert.strictEqual(listRes.status, 200);
    const listData = await listRes.json();
    const foundInList = listData.some((q: any) => q.id === createdQuotationId);
    assert.strictEqual(foundInList, false, "Vendedor B não deve ver cotações do Vendedor A na listagem");

    // 2.2 Detalhes por ID
    const getRes = await fetch(`${baseUrl}/api/quotations/${createdQuotationId}`, {
      headers: { Authorization: `Bearer ${tokenSellerB}` },
    });
    assert.strictEqual(getRes.status, 403, "Vendedor B deve receber 403 Forbidden ao tentar ver detalhes");

    // 2.3 Edição por ID
    const putRes = await fetch(`${baseUrl}/api/quotations/${createdQuotationId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSellerB}`,
      },
      body: JSON.stringify({ teamName: "Ataque Hacker Vendedor B" }),
    });
    assert.strictEqual(putRes.status, 403, "Vendedor B deve receber 403 Forbidden ao tentar editar");

    // 2.4 Inserção de anexo por ID
    const postAttRes = await fetch(`${baseUrl}/api/quotations/${createdQuotationId}/attachments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSellerB}`,
      },
      body: JSON.stringify({
        fileName: "malicious.pdf",
        originalName: "malicious.pdf",
        fileUrl: "/uploads/references/malicious.pdf",
        fileType: "REFERENCE",
      }),
    });
    assert.strictEqual(postAttRes.status, 403, "Vendedor B deve receber 403 ao tentar anexar arquivos");

    // 2.5 Download direto do anexo por URL
    const dlRes = await fetch(`${baseUrl}/api/files/references/${testCdrFile}`, {
      headers: { Authorization: `Bearer ${tokenSellerB}` },
    });
    assert.strictEqual(dlRes.status, 403, "Vendedor B deve receber 403 ao tentar baixar arquivo do Vendedor A por URL direta");
  });

  // ---------------------------------------------------------------------------
  // 3. Validação dos Opcionais Sem Custo (Nome R$ 0, Número R$ 0, TPU R$ 15)
  // ---------------------------------------------------------------------------
  await t.test("Motor de Orçamento: Nome e Número são R$ 0.00 e TPU 3D cobra R$ 15.00", async () => {
    // Buscar produto de teste no catálogo
    const prod = await prisma.catalogProduct.findFirst();
    assert.ok(prod, "Produto do catálogo deve existir");

    // Teste A: Item com Nome e Número selecionados
    const resFree = await fetch(`${baseUrl}/api/catalog/calculate-budget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            catalogProductId: prod.id,
            quantity: 10,
            customizations: ["Nome Individual", "Número Individual"],
          },
        ],
      }),
    });
    assert.strictEqual(resFree.status, 200);
    const dataFree = await resFree.json();
    // Como Nome e Número são 0.00, o unitPrice deve ser exatamente prod.basePrice
    assert.strictEqual(dataFree.items[0].customizationTotalPerUnit, 0);
    assert.strictEqual(dataFree.finalTotal, Number((prod.basePrice * 10).toFixed(2)));

    // Teste B: Item com TPU 3D (+R$ 15) + Nome e Número (+R$ 0)
    const resTpu = await fetch(`${baseUrl}/api/catalog/calculate-budget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            catalogProductId: prod.id,
            quantity: 10,
            customizations: ["Escudo TPU 3D", "Nome Individual", "Número Individual"],
          },
        ],
      }),
    });
    assert.strictEqual(resTpu.status, 200);
    const dataTpu = await resTpu.json();
    assert.strictEqual(dataTpu.items[0].customizationTotalPerUnit, 15.0);
    const expectedTpuTotal = Number(((prod.basePrice + 15.0) * 10).toFixed(2));
    assert.strictEqual(dataTpu.finalTotal, expectedTpuTotal);
  });

  // ---------------------------------------------------------------------------
  // 4. Encaminhamento para o Próximo Setor (Designer) e Download Seguro de Anexos
  // ---------------------------------------------------------------------------
  await t.test("Vendedor A encaminha ficha para Designer; Designer acessa ficha e baixa anexos (.cdr, .psd, .pdf)", async () => {
    // 4.1 Designer tenta acessar antes do encaminhamento (Status inicial: NOVO) -> 403
    const preDesignRes = await fetch(`${baseUrl}/api/quotations/${createdQuotationId}`, {
      headers: { Authorization: `Bearer ${tokenDesigner}` },
    });
    assert.strictEqual(preDesignRes.status, 403, "Designer não deve acessar cotação antes do encaminhamento");

    // 4.2 Vendedor A encaminha para SOLICITACAO_ARTE
    const forwardRes = await fetch(`${baseUrl}/api/quotations/${createdQuotationId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSellerA}`,
      },
      body: JSON.stringify({
        status: "SOLICITACAO_ARTE",
        notes: "Encaminhado para criação de layout vetorial.",
      }),
    });
    assert.strictEqual(forwardRes.status, 200, "Encaminhamento para SOLICITACAO_ARTE deve ter sucesso");

    // 4.3 Designer acessa os dados da ficha após encaminhamento
    const postDesignRes = await fetch(`${baseUrl}/api/quotations/${createdQuotationId}`, {
      headers: { Authorization: `Bearer ${tokenDesigner}` },
    });
    assert.strictEqual(postDesignRes.status, 200, "Designer deve conseguir acessar a ficha após encaminhada");
    const sheet = await postDesignRes.json();
    assert.strictEqual(sheet.status, "SOLICITACAO_ARTE");
    assert.strictEqual(sheet.items[0].customModelName, "Regata Edição Especial Jogos");
    assert.strictEqual(sheet.items[0].customFabricName, "Dry Fit Colmeia Tecnológico");
    assert.strictEqual(sheet.items[0].customCollarName, "Gola V Transpassada Dupla");

    // 4.4 Designer baixa os múltiplos anexos (.cdr, .psd, .pdf) com cabeçalhos seguros
    const dlCdrRes = await fetch(`${baseUrl}/api/files/references/${testCdrFile}`, {
      headers: { Authorization: `Bearer ${tokenDesigner}` },
    });
    assert.strictEqual(dlCdrRes.status, 200, "Designer deve baixar arquivo .cdr com sucesso");
    const contentDisposition = dlCdrRes.headers.get("content-disposition");
    assert.ok(contentDisposition && contentDisposition.includes("attachment"), "Deve ter Content-Disposition: attachment");
    assert.ok(contentDisposition.includes("Arte_Vetor_Oficial.cdr"), "Nome original deve ser restaurado no download");
    assert.strictEqual(dlCdrRes.headers.get("x-content-type-options"), "nosniff");
    const cdrBody = await dlCdrRes.text();
    assert.strictEqual(cdrBody, "VETOR_CDR_CONTENT_12345");

    const dlPdfRes = await fetch(`${baseUrl}/api/files/references/${testPdfFile}`, {
      headers: { Authorization: `Bearer ${tokenDesigner}` },
    });
    assert.strictEqual(dlPdfRes.status, 200, "Designer deve baixar arquivo .pdf com sucesso");
    const pdfDisposition = dlPdfRes.headers.get("content-disposition");
    assert.ok(pdfDisposition && pdfDisposition.includes("attachment"));
  });

  // ---------------------------------------------------------------------------
  // 5. Persistência dos Campos 'Outros' na Edição
  // ---------------------------------------------------------------------------
  await t.test("Vendedor A edita os 3 campos 'Outros' e verifica a persistência", async () => {
    const editPayload = {
      teamName: "Time Canarinhos da Medicina 2026",
      productsSummary: "Regata Premium Custom",
      items: [
        {
          productModel: "Outros",
          isCustomModel: true,
          customModelName: "Regata Ultra Slim Campeã",
          fabricType: "Outros",
          isCustomFabric: true,
          customFabricName: "Dry Fit Microfibra Prata",
          collarType: "Outros",
          isCustomCollar: true,
          customCollarName: "Gola Redonda Ribana Canelada",
          gender: "UNISSEX",
          size: "GG",
          quantity: 25,
          unitPrice: 60.0,
        },
      ],
    };

    const putRes = await fetch(`${baseUrl}/api/quotations/${createdQuotationId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSellerA}`,
      },
      body: JSON.stringify(editPayload),
    });
    assert.strictEqual(putRes.status, 200);
    const updated = await putRes.json();
    assert.strictEqual(updated.teamName, "Time Canarinhos da Medicina 2026");
    assert.strictEqual(updated.items[0].customModelName, "Regata Ultra Slim Campeã");
    assert.strictEqual(updated.items[0].customFabricName, "Dry Fit Microfibra Prata");
    assert.strictEqual(updated.items[0].customCollarName, "Gola Redonda Ribana Canelada");
  });

  // ---------------------------------------------------------------------------
  // 6. Abertura e Compatibilidade com Fichas Antigas (sem campos customizados)
  // ---------------------------------------------------------------------------
  await t.test("Fichas legadas sem campos customizados abrem e funcionam normalmente", async () => {
    const legacyCustomer = await prisma.customer.create({
      data: {
        companyName: "Empresa Legada Ltda",
        contactName: "Cliente Antigo",
        phone: "(11) 90000-0000",
      },
    });

    // Criar cotação legada diretamente no banco com campos nulos/padrão
    const legacy = await prisma.quotation.create({
      data: {
        quotationNumber: `ORC-LEGACY-${timestamp}`,
        customerId: legacyCustomer.id,
        sellerId: sellerA.id,
        teamName: "Ficha Antiga Legada 2024",
        status: "NOVO",
        totalQuantity: 10,
        budgetAmount: 400.0,
        items: {
          create: {
            productModel: "Camisa Tradicional",
            fabricType: "Dry Fit",
            collarType: "Redonda",
            size: "M",
            quantity: 10,
            unitPrice: 40.0,
            isCustomModel: false,
            isCustomFabric: false,
            isCustomCollar: false,
          },
        },
      },
      include: { items: true },
    });

    const res = await fetch(`${baseUrl}/api/quotations/${legacy.id}`, {
      headers: { Authorization: `Bearer ${tokenSellerA}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.id, legacy.id);
    assert.strictEqual(data.items[0].isCustomModel, false);
    assert.strictEqual(data.items[0].customModelName, null);
    assert.strictEqual(data.items[0].productModel, "Camisa Tradicional");
  });

  // ---------------------------------------------------------------------------
  // 7. Conversão em Pedido (OP) e Preservação de Vínculos na Ficha Universal
  // ---------------------------------------------------------------------------
  await t.test("Conversão em OP preserva anexos, dados completos e libera acesso operacional", async () => {
    // 7.1 Simular aprovação da arte para permitir conversão
    await prisma.quotation.update({
      where: { id: createdQuotationId },
      data: { isArtworkApproved: true },
    });

    // 7.2 Vendedor converte em OP
    const convertRes = await fetch(`${baseUrl}/api/quotations/${createdQuotationId}/convert-to-op`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenSellerA}`,
      },
      body: JSON.stringify({
        promisedDeliveryDate: new Date(Date.now() + 20 * 86400000).toISOString(),
        technicalNotes: "Atenção especial à gola canelada e escudo TPU 3D.",
      }),
    });

    assert.strictEqual(convertRes.status, 201, "Deveria converter o pedido em OP com sucesso");
    const convertData = await convertRes.json();
    assert.ok(convertData.productionOrder?.opNumber, "Deve retornar o número da OP gerada");
    assert.strictEqual(convertData.productionOrder?.id ? true : false, true);

    // 7.3 Verificar status da cotação
    const qCheck = await prisma.quotation.findUnique({
      where: { id: createdQuotationId },
      include: { productionOrder: true },
    });
    assert.strictEqual(qCheck?.status, "CONVERTIDA_VENDA");
    assert.ok(qCheck?.productionOrder, "Ordem de Produção deve estar associada");

    // 7.4 Verificar Ficha Universal do Pedido
    const sheetRes = await fetch(`${baseUrl}/api/universal-sheet/quotation/${createdQuotationId}`, {
      headers: { Authorization: `Bearer ${tokenSellerA}` },
    });
    assert.strictEqual(sheetRes.status, 200, "Ficha Universal deve responder com 200");
    const sheetData = await sheetRes.json();
    assert.strictEqual(sheetData.customer?.phone, "(11) 98888-7777");
    assert.strictEqual(sheetData.teamName, "Time Canarinhos da Medicina 2026");
    assert.strictEqual(sheetData.attachments.length, 3, "Todos os 3 anexos originais devem permanecer disponíveis");
    assert.strictEqual(sheetData.items[0].customModelName, "Regata Ultra Slim Campeã");

    // 7.5 Operador da fábrica consegue baixar arquivos após conversão em OP
    const opDlRes = await fetch(`${baseUrl}/api/files/references/${testCdrFile}`, {
      headers: { Authorization: `Bearer ${tokenOperador}` },
    });
    assert.strictEqual(opDlRes.status, 200, "Operador do chão de fábrica tem acesso aos anexos técnicos da OP");
  });
});
