@echo off
title PCP Industrial - Servidor Integrado de Producao (Porta 4000)
cd /d "%~dp0"

echo ===============================================================================
echo  PCP INDUSTRIAL LABELLA SPORTS - SERVIDOR DE PRODUCAO
echo ===============================================================================

REM 1. Verifica se o build do frontend existe
if not exist "frontend\dist\index.html" (
    echo [Aviso] Build do frontend nao encontrado. Compilando aplicacao React...
    cd frontend
    call npm.cmd run build
    if errorlevel 1 (
        echo [Erro] Falha ao compilar frontend. Verifique os erros acima.
        pause
        exit /b 1
    )
    cd ..
)

REM 2. Inicia o backend em modo producao (que serve a API e o Frontend estatico)
cd backend
echo [Status] Inicializando backend em modo de producao...
call npm.cmd start

pause
