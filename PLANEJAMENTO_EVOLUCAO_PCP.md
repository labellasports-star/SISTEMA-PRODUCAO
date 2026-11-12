# PLANO DIRETOR DE EVOLUÇÃO E ARQUITETURA TÉCNICA — PCP INDUSTRIAL LABELLA SPORTS

**Data:** 11 de Novembro de 2026  
**Autor:** Engenheiro de Software Sênior & Arquiteto ERP/PCP Industrial  
**Projeto:** Sistema Integrado de Gestão de Produção — Labella Sports  
**Status:** PLANEJAMENTO E LEVANTAMENTO TÉCNICO (FASE 2) — NENHUMA ALTERAÇÃO EXECUTADA

---

## 1. INVENTÁRIO COMPLETO DAS SKILLS DISPONÍVEIS

Foi realizada uma varredura abrangente no ambiente Antigravity (escopos Global, Built-in e Workspace local em `.agents/skills`). Todas as 14 Skills identificadas foram inspecionadas quanto a seu manifesto (`SKILL.md`), agentes especializados e ferramentas associadas:

| Nome da Skill | Função Principal | Localização no Sistema | Disponibilidade | Aplicação Prática no Projeto | Prioridade |
|---|---|---|---|---|---|
| **domain-modeling** | Modelagem profunda de entidades de domínio, arquitetura DDD, termos do glossário e registros de decisões de arquitetura (ADRs). | `.agents/skills/domain-modeling/SKILL.md` (Workspace) | **Confirmada** | Modelar as novas entidades do Catálogo Oficial de Produtos, a sequência atômica de OPs (`OP - 2001`), as subdivisões fracionadas (`OP - 2001 - 1/5`) e os metadados da Ficha Universal. | **MÁXIMA (P0)** |
| **codebase-design** | Design de interfaces profundas, definição de fronteiras (seams) e modularidade resiliente. | `.agents/skills/codebase-design/SKILL.md` (Workspace) | **Confirmada** | Projetar os contratos de interface da Ficha Universal do Pedido e o serviço centralizado de orçamento e numeração, garantindo baixo acoplamento e alta coesão. | **ALTA (P1)** |
| **tdd** | Desenvolvimento Orientado a Testes (TDD), ciclos Red-Green-Refactor e testes de integração de ponta a ponta. | `.agents/skills/tdd/SKILL.md` (Workspace) | **Confirmada** | Criar testes automatizados para todas as novas regras de negócio (cálculo de orçamento, validação de PIN obrigatório, concorrência de numeração e integridade de desmembramento). | **MÁXIMA (P0)** |
| **code-review** | Revisão automatizada e rigorosa de código em dois eixos: conformidade com padrões e aderência à especificação. | `.agents/skills/code-review/SKILL.md` (Workspace) | **Confirmada** | Auditar todas as alterações de segurança (RBAC, assinaturas HMAC e validação de PIN em 100% das rotas) antes de qualquer liberação. | **ALTA (P1)** |
| **generative_ui** | Construção de componentes visuais avançados, drawers, modais interativos e visualizações de dados. | `C:\Users\altam\.gemini\antigravity\builtin\skills\generative_ui\SKILL.md` (Global) | **Confirmada** | Desenvolver a interface da **Ficha Universal do Pedido**, o **Configurador de Orçamento Inteligente** e os seletores visuais do Designer. | **ALTA (P1)** |
| **research** | Investigação aprofundada de requisitos, APIs e coleta de fatos estruturados de fontes primárias. | `.agents/skills/research/SKILL.md` (Workspace) | **Confirmada** | Extrair e validar com precisão matemática todas as especificações, preços, acabamentos e regras de pedido do site oficial da Labella Sports. | **MÉDIA (P2)** |
| **grill-with-docs** | Entrevistas de alinhamento com base na documentação para resolução de ambiguidades de design. | `.agents/skills/grill-with-docs/SKILL.md` (Workspace) | **Confirmada** | Conduzir alinhamentos de dúvidas de negócio (ex: desmembramento de etapas irreversíveis e regras de arredondamento de frete). | **MÉDIA (P2)** |
| **diagnosing-bugs** | Diagnóstico metódico e investigação de bugs complexos, concorrência e regressões de desempenho. | `.agents/skills/diagnosing-bugs/SKILL.md` (Workspace) | **Confirmada** | Monitorar eventuais bloqueios de concorrência ou contenção de locks no SQLite durante conversões simultâneas de OPs. | **MÉDIA (P2)** |
| **automation** | Criação de rotinas agendadas e automações em background. | `builtin/skills/automation/SKILL.md` (Global) | **Confirmada** | Planejar rotinas futuras de backups agendados e monitoramento automático de alertas de SLA. | **BAIXA (P3)** |
| **antigravity-guide** | Referência e sitemap de funcionalidades da plataforma Antigravity. | `builtin/skills/antigravity_guide/SKILL.md` (Global) | **Confirmada** | Apoio conceitual sobre a operação do ambiente e CLI. | **BAIXA (P3)** |
| **agy-customizations** | Guia de personalização de plugins, hooks e rules. | `builtin/skills/agy-customizations/SKILL.md` (Global) | **Confirmada** | Configuração de regras e customizações adicionais do assistente. | **BAIXA (P3)** |
| **plugin** | Gerenciamento de pacotes de plugins integrados. | `builtin/skills/plugin/SKILL.md` (Global) | **Confirmada** | Uso futuro se houver empacotamento modular externo. | **BAIXA (P3)** |
| **migrate-workflows** | Migração de workflows legados para skills modernas. | `builtin/skills/migrate-workflows/SKILL.md` (Global) | **Confirmada** | Não aplicável (projeto já utiliza arquitetura moderna de skills). | **BAIXA (P3)** |
| **ui-plugin-navigation** | Descoberta e atalhos para painéis laterais de UI plugins. | `builtin/skills/ui-plugin-navigation/SKILL.md` (Global) | **Confirmada** | Navegação rápida em ferramentas auxiliares de chat. | **BAIXA (P3)** |

---

## 2. SKILLS RECOMENDADAS E JUSTIFICATIVAS TÉCNICAS

Para esta nova fase de desenvolvimento, **recomenda-se a adoção combinada das seguintes 5 Skills fundamentais**:

1. **`domain-modeling` (Modelagem de Domínio & Arquitetura):**  
   *Justificativa:* O projeto exige extensão do schema relacional (Catálogo Oficial, sequenciador de OP imutável `OP - 2001`, controle de subdivisões fracionadas `1/5` e rastreamento de anexos comerciais/técnicos). A modelagem rigorosa de DDD impedirá inconsistências entre o banco relacional e os 14 setores fabris.
2. **`codebase-design` (Design de Módulos Profundos):**  
   *Justificativa:* A "Ficha Universal do Pedido" e a "Calculadora de Orçamento Oficial" devem ser módulos profundos, com interfaces simples que encapsulam lógicas complexas (como cálculos de adicionais de escudos, matriz de permissões RBAC de dados financeiros e renderização contextual).
3. **`tdd` (Engenharia de Testes de Regressão):**  
   *Justificativa:* O sistema já conta com **15 suítes de testes e 100% de aprovação**. O uso de TDD é indispensável para criar os novos testes unitários e de integração (novas rotas de catálogo, numeração atômica, desmembramento e validação de PIN) garantindo que nenhum comportamento pré-existente seja quebrado.
4. **`generative_ui` (Engenharia de Interfaces e UX Industrial):**  
   *Justificativa:* O chão de fábrica demanda telas limpas, com contrastes adequados, botões de toque rápido e modais fluidos. A Ficha Universal precisa apresentar uma densidade de informação rica sem sobrecarregar operadores dos setores 01 a 14.
5. **`code-review` (Auditoria e Garantia de Qualidade):**  
   *Justificativa:* Toda a esteira de segurança (Bcrypt, HMAC-SHA-256 e RBAC horizontal e vertical) passará por verificação automatizada de conformidade antes de qualquer homologação.

---

## 3. DIAGNÓSTICO DA ARQUITETURA ATUAL

### Backend
- **Tecnologias:** Node.js, Express, TypeScript, Prisma ORM, Socket.io, Zod, Bcryptjs, Crypto.
- **Isolamento de Ambientes:**
  - `dev.db`: Ambiente de desenvolvimento (SHA-256 verificado e protegido).
  - `production.db`: Ambiente de produção ativo na porta 4000, contendo 14 setores, 6 defeitos e 1 administrador inicial.
  - `test.db`: Ambiente efêmero para bateria de testes automatizados (`npm test`).
- **Segurança Existente:**
  - Hashes de senha e PIN com Bcrypt (10 rounds).
  - Assinaturas digitais HMAC-SHA-256 geradas no servidor com segredo dedicado (`HMAC_SECRET`).
  - RBAC com papéis definidos (`ADMIN`, `GESTOR`, `OPERADOR`, `VENDEDOR`, `DESIGNER`).
  - Isolamento estrito de uploads com validação de magic bytes (`files.routes.ts`).

### Frontend
- **Tecnologias:** React 18, TypeScript, Vite, TailwindCSS, Lucide Icons, Socket.io-client.
- **Componentização:** 10 componentes setoriais especializados (`PreVendaKanban`, `DesignerPanel`, `VendasPanel`, `SacInternoPanel`, `ProductionSectorPanel` para setores 05 a 10, `Sector11DispatchPanel`, `Sector12CosturaPanel`, `Sector13QualidadePanel`, `Sector14ExpedicaoPanel` e `AdminDashboard`).

---

## 4. FUNCIONALIDADES JÁ EXISTENTES QUE SERÃO APROVEITADAS

1. **Mecanismo de Assinatura HMAC e Hash de PIN (`backend/src/utils/security.ts`):**  
   - A função `verifyPin(pin, hash)` e a infraestrutura de `signaturePinHash` já operam com robustez e serão reutilizadas para estender a obrigatoriedade do PIN em todas as transições setoriais.
2. **Motor de Armazenamento e Validação de Uploads (`backend/src/routes/files.routes.ts`):**  
   - Já possui suporte validado com magic bytes para imagens (`png`, `jpg`, `jpeg`) e vetores (`pdf`, `psd`, `cdr`, `ai`). Será aproveitado para receber as imagens de referência da Pré-Venda e as novas versões de arte do Designer.
3. **Pipeline Operacional dos 14 Setores (`production.routes.ts`):**  
   - O avanço sequencial com controle de lotes, retrabalho e telemetria de calandra/impressão/infesto continuará sendo o núcleo fabril.
4. **Sistema de Auditoria Imutável (`AuditLog`):**  
   - Todas as novas ações (criação de cotação com catálogo oficial, geração da OP sequencial, abertura de ficha e desmembramentos) serão registradas no log append-only.
5. **Comunicação em Tempo Real (Socket.io):**  
   - Os eventos de atualização de fila, aprovação de arte e movimentação de lotes continuarão notificando os setores em tempo real.

---

## 5. FUNCIONALIDADES NOVAS NECESSÁRIAS

1. **Ficha Universal do Pedido (Job Sheet Multi-Setorial):**
   - Modal/Drawer global acionável a partir de qualquer setor (01 a 14) e do Dashboard, permitindo visualização completa e leitura das especificações técnicas, briefing, imagens de referência, arte aprovada, grade de tamanhos e histórico de movimentações, sem necessidade de assumir a OP previamente.
   - Camada RBAC: Mascaramento de dados comerciais/financeiros (preço unitário, valor total, margem) e dados pessoais sensíveis do cliente para operadores de chão de fábrica.
2. **Módulo Ampliado do Designer:**
   - Acesso à Ficha Universal antes do aceite (`claim`).
   - Visualização das referências enviadas pelo cliente.
   - Envio de versões da arte diretamente pela ficha com controle visual de status: *Submetida/Pendente*, *Aprovada*, *Rejeitada/Em Alteração*.
   - Download de mockups e vetores acessível pelo vendedor responsável com carimbo de data, hora e designer.
   - Travamento visual para que apenas a arte com status `APPROVED` seja marcada como "Arte Oficial para Produção".
3. **PIN Obrigatório em 100% das Transições e Movimentações:**
   - Garantir que toda e qualquer ação de transferência entre setores (incluindo início de lote, devolução para retrabalho, despacho externo para oficina, recebimento de costura, inspeção de qualidade, geração de romaneio e baixa de entrega) exija validação do PIN do usuário autenticado no backend.
   - O PIN validado é incorporado ao payload do hash HMAC-SHA-256 e gravado em `OpMovement.digitalSignatureHash` e `AuditLog`.
4. **Pré-Venda com Upload de Imagens de Referência:**
   - No modal de "Nova Oportunidade Comercial", permitir ao vendedor anexar fotos/layouts trazidos pelo cliente (uniformes de inspiração, escudos, estampas).
   - Armazenamento seguro via `filesRouter` com classificação `REFERENCE`, persistência após a conversão em OP e exibição imediata na Ficha Universal.
5. **Orçamento Inteligente com o Catálogo Oficial Labella Sports:**
   - Implementação de um catálogo estruturado contendo os 17 produtos e acabamentos oficiais publicados em `https://labellasports.com.br/`.
   - Seleção de modelo, tecido, gênero, grade de tamanhos, acabamento de escudo (Sublimado, Bordado, TPU 3D), adicionais e observações.
   - Cálculo automático do valor unitário, subtotal e total, com validação no backend e verificação da regra de pedido mínimo (10 uniformes).
   - Congelamento dos valores unitários na cotação para garantir imutabilidade histórica.
6. **Numeração Automática Sequencial de OPs (`OP - 2001`):**
   - Substituição do padrão `OP-YYYY-XXXXX` pelo sequencial industrial `OP - 2001`, `OP - 2002`...
   - Geração atômica com trava de concorrência no banco de dados para evitar duplicidade em conversões simultâneas.
7. **Desmembramento de OPs com Múltiplos Lançamentos (`OP - 2001 - 1/5`):**
   - Suporte a subdivisões estruturadas vinculadas à OP principal, com identificação no formato `OP - 2001 - X/N`.
   - Acompanhamento setorial independente por subdivisão, sem perda de rastreabilidade ou duplicidade de peças.

---

## 6. ARQUIVOS QUE PRECISARÃO SER MODIFICADOS E CRIADOS

### Backend
| Arquivo | Ação | Finalidade |
|---|---|---|
| `backend/prisma/schema.prisma` | Modificar | Adicionar modelo `ProductCatalog`, tabela `OpSequenceCounter`, campos de imagens de referência e campos de subdivisão (`subdivisionIndex`, `subdivisionTotal`) em `OpBatch`. |
| `backend/src/routes/conversion.routes.ts` | Modificar | Atualizar gerador atômico de numeração para o padrão `OP - 2001` e gerar os lançamentos/sublotes desmembrados. |
| `backend/src/routes/quotations.routes.ts` | Modificar | Integrar upload de referências na criação da cotação e cálculo de orçamento com o catálogo oficial. |
| `backend/src/routes/catalog.routes.ts` | **Criar** | Nova rota REST para consulta dos produtos, modelos, escudos e preços oficiais da Labella Sports. |
| `backend/src/routes/universalSheet.routes.ts` | **Criar** | Nova rota REST para fornecimento unificado dos dados da Ficha Universal do Pedido com filtros RBAC. |
| `backend/src/routes/batches.routes.ts` | Modificar | Implementar o desmembramento estruturado `OP - 2001 - 1/5` com validação de PIN obrigatório e conservação de totais. |
| `backend/src/routes/production.routes.ts` | Modificar | Garantir PIN obrigatório em `startBatch`, `completeAndForward` e devoluções. |
| `backend/src/routes/dispatch.routes.ts` | Modificar | Garantir PIN obrigatório no despacho de romaneios RE-. |
| `backend/src/routes/costura.routes.ts` | Modificar | Garantir PIN obrigatório em recebimentos e encerramentos. |
| `backend/src/routes/quality.routes.ts` | Modificar | Garantir PIN obrigatório na inspeção e retorno de retrabalho. |
| `backend/src/routes/expedicao.routes.ts` | Modificar | Adicionar PIN obrigatório na geração de romaneios RD- e conferência de volumes. |
| `backend/src/server.ts` | Modificar | Registrar novas rotas (`/api/catalog`, `/api/universal-sheet`). |

### Frontend
| Arquivo | Ação | Finalidade |
|---|---|---|
| `frontend/src/components/UniversalOrderSheetModal.tsx` | **Criar** | Componente visual completo da Ficha Universal do Pedido com abas (Geral, Produtos/Grade, Referências/Artes, Histórico/Rastreabilidade). |
| `frontend/src/components/ProductCatalogSelector.tsx` | **Criar** | Componente de seleção e cálculo dinâmico de orçamento com base no catálogo oficial Labella Sports. |
| `frontend/src/components/PreVendaKanban.tsx` | Modificar | Integrar o `ProductCatalogSelector`, upload de referências e botão de abertura da Ficha Universal. |
| `frontend/src/components/DesignerPanel.tsx` | Modificar | Permitir abertura da Ficha Universal antes de assumir, exibir referências do cliente e anexar artes diretamente na ficha. |
| `frontend/src/components/ProductionSectorPanel.tsx` | Modificar | Adicionar botão "Ficha do Pedido" em cada lote e exigir modal de PIN em todas as ações de movimentação. |
| `frontend/src/components/Sector11DispatchPanel.tsx` | Modificar | Adicionar acesso à Ficha Universal e validação de PIN. |
| `frontend/src/components/Sector12CosturaPanel.tsx` | Modificar | Adicionar acesso à Ficha Universal e validação de PIN. |
| `frontend/src/components/Sector13QualidadePanel.tsx` | Modificar | Adicionar acesso à Ficha Universal e validação de PIN. |
| `frontend/src/components/Sector14ExpedicaoPanel.tsx` | Modificar | Adicionar acesso à Ficha Universal e validação de PIN. |
| `frontend/src/components/AdminDashboard.tsx` | Modificar | Adicionar visualização e filtro por subdivisões (`1/5`) e acesso à Ficha Universal. |
| `frontend/src/services/api.ts` | Modificar | Adicionar chamadas de API para catálogo oficial, ficha universal e rotas atualizadas. |

---

## 7. PROPOSTA DE MUDANÇAS NO BANCO DE DADOS (PRISMA SCHEMA)

As alterações propostas são **estritamente aditivas e retrocompatíveis**, sem destruição de tabelas ou perda de dados históricos:

```prisma
// 1. Tabela de Catálogo Oficial de Produtos (Preços e Modelos Vigentes)
model ProductCatalog {
  id              String   @id @default(uuid())
  slug            String   @unique // ex: classic, prime, raglan-gola-v, polo, calcao-jogo
  name            String   // ex: Classic, Raglan Gola V
  category        String   // camisas, calcoes, regatas, acessorios, feminino
  family          String   // camisa, calcao, meiao, acessorio
  basePrice       Float    // Preço unitário base em reais
  priceDisplay    String   // "R$ 42,90 cada"
  sizesAvailable  String   // "P ao X4"
  specifications  String?  // JSON com array de especificações técnicas
  shieldOptions   String?  // JSON com opções permitidas
  imageUrl        String?
  minQuantity     Int      @default(10)
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// 2. Tabela de Controle Sequencial Atômico de Numeração de OPs
model OpSequenceCounter {
  id              Int      @id @default(1)
  currentSequence Int      @default(2000) // Próxima OP gerada será 2001
  updatedAt       DateTime @updatedAt
}

// 3. Extensões no Modelo QuotationItem (Congelamento de Preço e Catálogo)
// Adicionar em QuotationItem:
// catalogProductId String?
// unitPrice        Float    @default(0.0)
// shieldType       String?  // SUBLIMADO, BORDADO, TPU_3D
// shieldPrice      Float    @default(0.0)
// subtotal         Float    @default(0.0)

// 4. Extensões no Modelo OpBatch (Suporte a Subdivisões e Lançamentos)
// Adicionar em OpBatch:
// subdivisionIndex Int?     // Ex: 1 (para 1/5)
// subdivisionTotal Int?     // Ex: 5 (para 1/5)
// parentBatchId    String?  // Caso derive de um desmembramento
```

---

## 8. ESTRUTURA PROPOSTA PARA O ORÇAMENTO INTELIGENTE (CATÁLOGO OFICIAL)

Com base na inspeção ao vivo do catálogo da **Labella Sports** (`https://labellasports.com.br/`), foram extraídos os 17 produtos e valores oficiais:

### Tabela Oficial de Produtos e Preços Unitários
1. **Classic (Camisas):** R$ 42,90 cada (Dry fit, gola redonda, tamanhos P ao X4).
2. **Prime (Camisas):** R$ 42,90 cada (Dry fit, gola em V, tamanhos P ao X4).
3. **Raglan Gola V (Camisas):** R$ 52,90 cada (Dry texturizado, gola V, gola e punho em ribana).
4. **Polo (Camisas):** R$ 57,90 cada (Dry sport favo, abertura com vista embutida e botões).
5. **Polo Feminina (Feminino):** R$ 57,90 cada (Dry sport favo, abertura com botões).
6. **Regata Confort (Regatas):** R$ 47,90 cada (Dry fit, viés na cava e gola).
7. **Varsity (Regatas):** R$ 56,90 cada (Dry texturizado, colmeia ribana na cava e gola).
8. **Raglan Manga Longa (Manga longa):** R$ 82,90 cada (Dry UV com proteção solar).
9. **Regata Confort Feminina (Feminino):** R$ 47,90 cada (Dry fit, viés na cava e gola).
10. **Baby Look (Feminino):** R$ 47,90 cada (Dry fit, gola em dry).
11. **Camisa de Algodão (Camisas):** R$ 49,90 cada (P ao XG; X1 ao X3: R$ 57,90 cada; algodão penteado DTF).
12. **Vintage (Camisas):** R$ 93,90 cada (Dry texturizado, ribana; **Patch TPU 3D incluso no valor base**).
13. **Calção de Jogo (Calções):** R$ 37,90 cada (Dry ultra leve, elástico e cordão interno).
14. **Calção de Jogo Feminino (Feminino):** R$ 31,90 cada.
15. **Meião (Acessórios):** R$ 26,90 cada (Par de meiões).
16. **Meia (Acessórios):** R$ 9,99 cada (Par de meias).
17. **Bonés (Acessórios):** R$ 44,00 cada (Até 3 bordados, **pedido mínimo 12 unidades, múltiplos de 6**).

### Tabela Oficial de Adicionais de Escudo
- **Escudo Sublimado:** + R$ 0,00 por peça.
- **Escudo Bordado:** + R$ 10,00 por peça.
- **Escudo TPU 3D:** + R$ 15,00 por peça (gratuito/incluso no modelo Vintage).

### Regras Comerciais e Fórmulas de Cálculo
- **Pedido Mínimo Padrão:** 10 uniformes completos ou camisas.
- **Regra de Bonés:** Mínimo de 12 unidades, escalonado em múltiplos de 6 unidades (12, 18, 24, 30...).
- **Prazo Padrão:** 15 dias úteis a contar da aprovação da arte e fechamento do pedido.
- **Exceções Autorizadas:** Gestor/Admin podem marcar a cotação como "Reposição de Uniforme Antigo" ou "Amostra Comercial", autorizando quantidades inferiores a 10 unidades mediante justificativa.
- **Imutabilidade Histórica:** Ao salvar a cotação, os preços unitários são gravados em `QuotationItem.unitPrice`. Se o catálogo for reajustado no futuro, os orçamentos e OPs já existentes **não sofrem nenhuma alteração**.

---

## 9. ESTRUTURA PROPOSTA PARA A NUMERAÇÃO AUTOMÁTICA DAS OPs

### Requisitos e Padrão Visual
- **Padrão Exigido:** `OP - 2001`, `OP - 2002`, `OP - 2003`...
- **Garantia de Sequência Atômica:** Utilização de transação serializada no Prisma com incremento atômico na tabela `OpSequenceCounter`:
  ```typescript
  const nextOpNumber = await prisma.$transaction(async (tx) => {
    let counter = await tx.opSequenceCounter.findUnique({ where: { id: 1 } });
    if (!counter) {
      counter = await tx.opSequenceCounter.create({ data: { id: 1, currentSequence: 2000 } });
    }
    const nextSeq = counter.currentSequence + 1;
    await tx.opSequenceCounter.update({
      where: { id: 1 },
      data: { currentSequence: nextSeq },
    });
    return `OP - ${nextSeq}`;
  });
  ```
- **Convivência com Dados Históricos (Sem Colisões):**
  - O banco de produção possui 1 registro anterior (`OP-2026-00001`). O banco dev possui registros no padrão `OP-2026-XXXXX`.
  - Como a nova sequência adota a máscara `OP - 2001` (com espaçamento e hífen), **não há risco de colisão de strings ou chaves únicas**.
  - O identificador é gravado no campo `opNumber` e torna-se estritamente imutável.

---

## 10. ESTRUTURA PROPOSTA PARA O DESMEMBRAMENTO DE OPs

### Regra dos Lançamentos Fracionados (`OP - 2001 - 1/5`)
Quando uma Ordem de Produção possuir múltiplos lançamentos (ex: 50 camisas Classic masculinas, 30 camisas baby look femininas e 20 calções de jogo) ou for fracionada em etapas fabris distintas:

1. **Numeração das Subdivisões:**
   - Subdivisão 1: `OP - 2001 - 1/5` (50 pcs)
   - Subdivisão 2: `OP - 2001 - 2/5` (30 pcs)
   - Subdivisão 3: `OP - 2001 - 3/5` (20 pcs)
   - Subdivisão 4: `OP - 2001 - 4/5` (...)
   - Subdivisão 5: `OP - 2001 - 5/5` (...)
2. **Conservação de Quantidades (Invariante Matemática):**
   $$\sum_{i=1}^{N} \text{Quantidade}(\text{Subdivisão}_i) = \text{Total da OP Principal}$$
   O backend rejeita qualquer criação ou desmembramento cuja soma divirja do total contratado da OP.
3. **Independência Setorial dos Lançamentos:**
   - Cada subdivisão é modelada como um `OpBatch` com seu próprio ciclo de vida.
   - Isso permite que `OP - 2001 - 1/5` esteja na Costura enquanto `OP - 2001 - 2/5` ainda está na Calandra, sem bloquear a fábrica.
4. **Visão Consolidada vs Individual:**
   - Na Ficha Universal e no Dashboard Administrativo, é possível visualizar o "Pai" (`OP - 2001`) com a barra de progresso consolidada de todas as peças e expandir a árvore de subdivisões com um clique.

---

## 11. ESTRATÉGIA DE IMPLEMENTAÇÃO POR ETAPAS

Para garantir risco zero de quebra do sistema operacional, a execução será dividida em 5 fases sequenciais:

```
[FASE 1: Fundações & Domínio]
  ├── Criação do Catálogo Oficial Labella Sports (Seed + API)
  ├── Criação do Sequenciador Atômico de OPs (OP - 2001)
  └── Ajustes aditivos no schema Prisma (sem migrations destrutivas)

[FASE 2: Ficha Universal do Pedido & Pré-Venda]
  ├── Rota e serviço backend da Ficha Universal (com filtros RBAC)
  ├── Componente frontend UniversalOrderSheetModal
  ├── Upload de imagens de referência na Pré-Venda
  └── Configurador de Orçamento Inteligente (Catálogo labellasports.com.br)

[FASE 3: Melhorias do Designer]
  ├── Visualização da Ficha Universal antes do claim
  ├── Exibição de referências do cliente
  ├── Upload direto de versões da arte pela ficha
  └── Download liberado para o vendedor com controle de aprovação

[FASE 4: PIN Obrigatório & Desmembramento]
  ├── Verificação de PIN backend em 100% das transições setoriais
  ├── Motor de desmembramento padronizado (OP - 2001 - 1/5)
  └── Validação de assinaturas digitais HMAC

[FASE 5: Homologação e Testes de Regressão]
  ├── Execução da suíte completa de testes automatizados
  ├── Validação de integridade dos bancos dev.db e production.db
  └── Geração do relatório de homologação
```

---

## 12. MATRIZ DE RISCOS E MEDIDAS PREVENTIVAS

| Risco Identificado | Severidade | Medida Preventiva Implementada |
|---|---|---|
| Colisão de numeração de OPs em conversões concorrentes simultâneas | Alta | Uso de transação Prisma com lock atômico serializado na tabela `OpSequenceCounter`. |
| Quebra de compatibilidade com as 15 suítes de testes existentes | Alta | Não alterar assinaturas de endpoints legados; fornecer compatibilidade aditiva para as novas rotas. |
| Exposição de margem de lucro e preços para operadores de máquina | Média | Sanitização estrita no endpoint da Ficha Universal: se `role === 'OPERADOR'`, remove chaves financeiras do JSON. |
| Inconsistência de totais de peças no desmembramento de lotes | Alta | Trava transacional no backend exigindo que a soma dos lançamentos seja idêntica ao total da OP. |
| Modificação acidental no banco `production.db` ou `dev.db` durante testes | Crítica | Failsafe mantido no `prisma.ts`: testes executam única e exclusivamente em `test.db`. |

---

## 13. PLANO DE TESTES AUTOMATIZADOS

Serão implementadas novas suítes de teste para cobrir 100% dos novos requisitos:
1. `test/catalog-pricing.test.ts`: Validação dos 17 produtos, acréscimos de escudos (Sublimado R$0, Bordado R$10, TPU R$15), trava de pedido mínimo de 10 unidades e exceções autorizadas.
2. `test/op-numbering-concurrency.test.ts`: Teste de concorrência com 10 conversões paralelas garantindo geração estritamente sequencial (`OP - 2001`, `OP - 2002`...) sem lacunas ou duplicatas.
3. `test/universal-sheet-rbac.test.ts`: Verificação de que operadores dos 14 setores conseguem ler a ficha, mas não recebem dados financeiros restritos.
4. `test/pin-transition-enforcement.test.ts`: Verificação de que toda e qualquer movimentação recusa requisições sem PIN ou com PIN incorreto.
5. `test/batch-subdivision.test.ts`: Teste de desmembramento `OP - 2001 - 1/5` com verificação de histórico independente e consistência da soma de peças.

---

## 14. QUESTÕES DE NEGÓCIO PARA CONFIRMAÇÃO DO CLIENTE

Antes de iniciarmos a implementação do código, solicitamos a confirmação dos seguintes detalhes de negócio:

1. **Formato Visual Exato da OP:**  
   O formato desejado é rigorosamente `OP - 2001` (com espaços e hífen) ou `OP-2001`?
2. **Subdivisões de Produtos Diferentes no Orçamento:**  
   Quando uma cotação contiver mais de um item cadastrado (ex: Camisas e Calções), o sistema deve gerar automaticamente os lançamentos desmembrados (ex: `OP - 2001 - 1/2` e `OP - 2001 - 2/2`) no momento da conversão, ou a OP deve nascer consolidada e ser desmembrada sob demanda pelo Gestor/Admin?
3. **Política de Descontos no Catálogo:**  
   Existe uma faixa máxima de desconto que o vendedor pode aplicar diretamente no orçamento (ex: até 5% ou 10%), exigindo aprovação do Gestor para percentuais maiores?

---
*Documento elaborado e registrado na raiz do projeto como [PLANEJAMENTO_EVOLUCAO_PCP.md](file:///c:/Users/altam/OneDrive/Desktop/teste%20clone%20vectorizer/PLANEJAMENTO_EVOLUCAO_PCP.md). Nenhuma alteração no código ou banco foi realizada.*
