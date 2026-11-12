# Sistema de Gestão de Produção e Rastreabilidade Industrial (PCP Têxtil)

Sistema modular para controle de chão de fábrica, ordens de produção, rastreabilidade e gestão de 14 setores fabris.

---

## 🛠️ Como Executar na Rede Local (LAN)

### 1. Iniciar o Servidor Backend:
- Dê dois cliques em `iniciar-backend.cmd` ou execute:
```bash
cd backend
npm run dev
```
O servidor iniciará escutando em `http://0.0.0.0:4000` (acessível por qualquer computador, tablet ou celular na mesma rede local).

### 2. Iniciar o Painel Web Frontend:
- Dê dois cliques em `iniciar-frontend.cmd` ou execute:
```bash
cd frontend
npm run dev
```
O painel estará disponível em `http://localhost:5173` ou `http://<IP_DO_SERVIDOR>:5173`.

### 3. Executar os Testes Automatizados:
- Dê dois cliques em `executar-testes.cmd` ou execute:
```bash
cd backend
npm test
```

---

## 🔑 Credenciais Padrão do Sistema (Seed)

- **Administrador Master:**
  - E-mail: `admin@fabrica.com`
  - Senha: `admin123`
  - PIN de Assinatura Operacional: `123456`

- **Gestor de Produção:**
  - E-mail: `gestor.producao@fabrica.com`
  - Senha: `admin123`
  - PIN: `123456`

- **Operador de Setor:**
  - E-mail: `operador.calandra@fabrica.com`
  - Senha: `admin123`
  - PIN: `123456`
