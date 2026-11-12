# Plano de Migração: SQLite para PostgreSQL 16+
## Sistema de Gestão de Produção e Rastreabilidade Industrial (PCP Têxtil)

---

## 1. Diagnóstico do Banco Atual (SQLite) vs. PostgreSQL

| Critério | SQLite Atual (Etapa 1) | PostgreSQL 16+ (Produção) |
| :--- | :--- | :--- |
| **Escopo de Uso** | Servidor local físico / Chão de fábrica imediato sem dependência externa. | Servidor dedicado da fábrica ou nuvem corporativa com alta concorrência. |
| **Concorrência** | Escritas serializadas (com trava no arquivo `dev.db`), leituras paralelas. | MVCC (Multi-Version Concurrency Control) com bloqueios a nível de linha (`SELECT FOR UPDATE`). |
| **Tipos Avançados** | JSON stringificado em `TEXT`. | `JSONB` nativo com índices GIN para busca instantânea em fotos e parâmetros. |
| **Particionamento** | Não suportado nativamente. | Particionamento de tabelas para `OP_MOVEMENTS` e `AUDIT_LOGS` por ano/mês. |
| **Segurança em Linha** | Nível de aplicação. | `Row-Level Security (RLS)` para reforço de isolamento por setor fabril. |

---

## 2. Passo a Passo Técnico para Migração Sem Perda de Dados

### Passo 1: Instalação do PostgreSQL no Servidor Central da Fábrica
1. Instalar PostgreSQL 16+ na máquina servidora:
   - Porta padrão: `5432`
   - Criar banco de dados: `CREATE DATABASE pcp_industrial_db ENCODING 'UTF8';`
   - Criar usuário com permissões de schema:
     ```sql
     CREATE USER pcp_admin WITH PASSWORD 'sua_senha_segura';
     GRANT ALL PRIVILEGES ON DATABASE pcp_industrial_db TO pcp_admin;
     ```

### Passo 2: Exportação Fiel dos Dados Existentes do SQLite
Criar script de exportação JSON (`scripts/export-sqlite.ts`) para ler as entidades em ordem estrita de integridade referencial:
1. `Sector` (14 setores)
2. `User` (Administradores, gestores, operadores com hash de senha e PIN HMAC)
3. `SewingPartner` (Oficinas e células de costura)
4. `Customer` (Clientes cadastrados)
5. `ProductionOrder` (Ordens de produção criadas)
6. `OpBatch` (Lotes parciais)
7. `OpMovement` (Movimentações e assinaturas digitais)
8. `SewingDispatch` (Remessas de costura)
9. `AuditLog` (Trilha de auditoria imutável)

### Passo 3: Ajuste do Prisma Schema
No arquivo `backend/prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```
Atualizar `.env`:
```env
DATABASE_URL="postgresql://pcp_admin:sua_senha_segura@127.0.0.1:5432/pcp_industrial_db?schema=public"
```

### Passo 4: Geração do Schema no PostgreSQL
Executar no terminal do backend:
```bash
npx prisma generate
npx prisma db push
```
Isso criará todas as tabelas, índices e constraints nativas no PostgreSQL com 100% de paridade com o modelo anterior.

### Passo 5: Carga dos Dados Exportados (Import Script)
Executar script de importação (`scripts/import-postgres.ts`) que:
1. Insere cada registro mantendo exatamente os mesmos UUIDs como Primary Keys;
2. Preserva os carimbos de data/hora originais (`createdAt`, `receivedAt`, etc.);
3. Preserva todos os hashes de PIN e as assinaturas digitais HMAC-SHA-256;
4. Valida se a quantidade de registros em cada tabela do Postgres confere 1:1 com o SQLite original.

### Passo 6: Validação Pós-Migração
Executar a suíte de testes de integração:
```bash
npm test
```
Verificando login, permissões, setores, PINs e consistência das OPs.
