# Guia de Inicialização Automática e Execução em Produção no Windows
## Sistema PCP Industrial — Fábrica de Uniformes Labella Sports

Este guia descreve como configurar o sistema para inicialização automática no boot do Windows (sem necessidade de logon de usuário), garantindo disponibilidade ininterrupta do servidor de produção no chão de fábrica.

---

### 1. Arquitetura Operacional em Produção

O sistema em produção opera no modelo **Servidor Integrado Unificado**:
- **Porta do Servidor:** `4000` (HTTP + WebSockets)
- **Frontend SPA:** Os arquivos compilados (`frontend/dist`) são servidos estaticamente pelo backend Express. Não é necessário rodar o servidor de desenvolvimento do Vite (`5173`) em produção.
- **Acesso na Rede Local (LAN):** Qualquer computador, tablet ou leitor conectado ao Wi-Fi/cabo da fábrica acessa diretamente via `http://<IP_DO_SERVIDOR>:4000`.

---

### 2. Opção 1: Agendador de Tarefas do Windows (Nativo — Sem softwares extras)

Esta é a opção nativa recomendada que roda com o próprio Windows, mesmo após reinicialização por queda de energia ou atualização.

#### Passo a passo via PowerShell (Executar como Administrador):

```powershell
# 1. Defina o caminho raiz do projeto
$ProjetoDir = "C:\Users\label\Desktop\SISTEMA-PRODUCAO-main"
$ScriptBat = "$ProjetoDir\iniciar-sistema-producao.bat"

# 2. Registra a tarefa agendada para rodar no Boot do Windows
$Acao = New-ScheduledTaskAction -Execute $ScriptBat -WorkingDirectory "$ProjetoDir\backend"
$Gatilho = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName "PCP_Industrial_Server" -Action $Acao -Trigger $Gatilho -Principal $Principal -Settings $Config -Description "Servidor de Producao do PCP Industrial Labella Sports"
```

#### Para testar ou gerenciar a tarefa:
- **Iniciar manualmente:** `Start-ScheduledTask -TaskName "PCP_Industrial_Server"`
- **Verificar status:** `Get-ScheduledTask -TaskName "PCP_Industrial_Server"`
- **Remover tarefa:** `Unregister-ScheduledTask -TaskName "PCP_Industrial_Server" -Confirm:$false`

---

### 3. Opção 2: Serviço do Windows via NSSM (Recomendado para Alta Disponibilidade)

O NSSM (*Non-Sucking Service Manager*) transforma o processo Node.js em um Serviço nativo do Windows com monitoramento de crash e reinício automático instantâneo.

1. Baixe o executável `nssm.exe` (de https://nssm.cc/) e coloque em `C:\Windows\System32` ou na pasta do projeto.
2. Abra o terminal como Administrador e execute:

```cmd
nssm install PCP_Industrial "C:\Program Files\nodejs\node.exe"
nssm set PCP_Industrial AppParameters "C:\Users\label\Desktop\SISTEMA-PRODUCAO-main\backend\node_modules\tsx\dist\cli.mjs scripts/start-prod.ts"
nssm set PCP_Industrial AppDirectory "C:\Users\label\Desktop\SISTEMA-PRODUCAO-main\backend"
nssm set PCP_Industrial AppStdout "C:\Users\label\Desktop\SISTEMA-PRODUCAO-main\backend\backups\service-stdout.log"
nssm set PCP_Industrial AppStderr "C:\Users\label\Desktop\SISTEMA-PRODUCAO-main\backend\backups\service-stderr.log"
nssm set PCP_Industrial Start SERVICE_AUTO_START
nssm start PCP_Industrial
```

#### Gerenciamento do Serviço:
- **Status:** `sc query PCP_Industrial`
- **Parar:** `net stop PCP_Industrial`
- **Iniciar:** `net start PCP_Industrial`

---

### 4. Opção 3: PM2 no Windows

Caso a equipe prefira o gerenciador `pm2`:

```cmd
cd C:\Users\label\Desktop\SISTEMA-PRODUCAO-main\backend
npm install -g pm2 pm2-windows-service

pm2 start scripts/start-prod.ts --name pcp-industrial --interpreter tsx
pm2 save
pm2-service-install -n "PCP_Industrial"
```

---

### 5. Verificação de Saúde Pós-Inicialização

Para confirmar se o serviço está operando corretamente, execute:

```powershell
# Consulta de integridade da API
curl http://localhost:4000/api/health

# Resposta esperada:
# {"status":"ok","system":"PCP Industrial - Fábrica de Uniformes","uptimeSeconds":...}
```
