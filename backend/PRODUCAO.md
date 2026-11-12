# Guia de Implantação e Operação em Produção — PCP Industrial

Este documento detalha o procedimento seguro e padronizado para inicializar e operar o backend do PCP Industrial em ambiente de produção com um banco de dados limpo, isolado e em conformidade estrita com o controle de acesso baseado em função (RBAC), controle por PIN e assinaturas criptográficas HMAC-SHA-256.

---

## 1. Pré-requisitos de Ambiente

- **Node.js**: v18+ LTS (ou v20+ LTS)
- **NPM**: v9+
- Sistema Operacional: Linux / Windows Server
- Diretório de uploads dedicado, fora da árvore de desenvolvimento (`backend/uploads/`).

---

## 2. Passo a Passo de Inicialização

### Passo 1: Configurar as Variáveis de Ambiente
Copie o modelo de produção para o arquivo `.env.production` (que nunca deve ser versionado no Git):

```bash
cp backend/.env.production.example backend/.env.production
```

> **Atenção**: O arquivo `.env.production` já está protegido no `.gitignore`. Nunca envie credenciais reais para repositórios.

---

### Passo 2: Gerar Segredos Criptográficos Fortes
Gere segredos aleatórios de 256 bits (mínimo de 32 caracteres hexadecimais) para os tokens JWT e assinaturas HMAC:

```bash
# Gerar segredo para JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Gerar segredo para HMAC_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### Passo 3: Configurar o Arquivo `.env.production`
Preencha os campos com valores seguros:

- `DATABASE_URL`: Caminho absoluto ou relativo para o banco SQLite de produção (ex.: `"file:./prisma/production.db"` ou `/var/data/pcp/prod.db`). **É proibido apontar para `dev.db` ou `test.db`**.
- `UPLOADS_DIR`: Caminho do diretório de armazenamento de anexos (ex.: `/var/data/pcp/uploads` ou `C:/pcp_storage/uploads`). **É proibido apontar para `backend/uploads`**.
- `JWT_SECRET`: Segredo de 32+ caracteres gerado no Passo 2.
- `HMAC_SECRET`: Segredo de 32+ caracteres gerado no Passo 2.
- `ADMIN_EMAIL`: E-mail corporativo do Administrador inicial.
- `ADMIN_PASSWORD`: Senha forte do Administrador (mínimo 12 caracteres, não podendo ser senhas padrão de teste/desenvolvimento).
- `ADMIN_PIN`: PIN numérico de exatamente 6 dígitos para o Administrador (não podendo ser sequências triviais como 123456 ou 000000).
- `NODE_ENV`: Obrigatório ser `production`.

---

### Passo 4: Executar o Script de Inicialização Limpa
Execute o script de provisionamento de produção:

```bash
cd backend
npx tsx scripts/init-production-db.ts
```
*(ou `npm run db:init:prod` se configurado no `package.json`)*

**O que o script realiza automaticamente:**
1. Valida todos os parâmetros de segurança e integridade das variáveis de ambiente.
2. Aplica todas as migrações oficiais do Prisma via `prisma migrate deploy` (nunca usa `db push`).
3. Cadastra os **14 setores industriais oficiais** na sequência do fluxo produtivo.
4. Cadastra os **6 tipos oficiais de defeito** para controle de qualidade.
5. Cadastra o **único usuário Administrador (`ADMIN`)** com hash seguro Bcrypt (10 rounds).
6. Executa `PRAGMA integrity_check` e exibe o resumo completo com hash SHA-256 do banco gerado.
7. Trava re-execuções acidentais caso o banco já possua dados.

---

### Passo 5: Iniciar o Servidor em Modo Produção

Inicie a aplicação com a variável `NODE_ENV=production`:

```bash
cd backend
NODE_ENV=production npm start
```
*(Em ambiente Windows PowerShell: `$env:NODE_ENV="production"; npm start`)*

---

### Passo 6: Cadastrar os Operadores Iniciais (Setores 11 a 14)
Após subir a aplicação:
1. Acesse o sistema e faça login com as credenciais do Administrador inicial criado no Passo 4.
2. Navegue até o módulo de **Gerenciamento de Usuários**.
3. Crie os operadores vinculados aos seus respectivos setores oficiais:
   - **Setor 11 (DESPACHE_OFICINA)**: Operador de Despache para Facções Externas.
   - **Setor 12 (COSTURA)**: Operador de Recebimento de Costura.
   - **Setor 13 (QUALIDADE)**: Inspetor de Qualidade.
   - **Setor 14 (EXPEDICAO)**: Operador de Embalagem e Expedição Final.
4. Cada operador deve ter e-mail corporativo válido e PIN numérico individual de 4 a 6 dígitos para assinatura das movimentações de lote.

---

## 3. Política e Procedimento de Backup

### Backup sob demanda ou automatizado (Cron)
O sistema conta com o script nativo de backup e integridade `backend/scripts/backup.ts`.

Para executar um backup seguro do banco de produção e uploads:
```bash
cd backend
npx tsx scripts/backup.ts
```

### Recomendações Operacionais
1. **Periodicidade**: Agende a execução do `backup.ts` a cada 12 horas ou ao final de cada turno fabril via Cron/Task Scheduler.
2. **Cópia Off-site**: Configure rsync, rclone ou agente de nuvem (ex.: AWS S3, Azure Blob, Google Cloud Storage) para replicar os arquivos gerados em `backend/backups/` para armazenamento geograficamente distribuído.
3. **Retenção**: Mantenha no mínimo 30 dias de backups diários e os últimos 4 backups semanais.
4. **Verificação Periódica**: Mensalmente, teste a restauração do último backup em uma máquina de homologação usando `PRAGMA integrity_check`.
