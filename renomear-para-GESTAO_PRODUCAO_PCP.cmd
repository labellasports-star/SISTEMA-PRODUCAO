@echo off
setlocal enabledelayedexpansion
title Renomear Projeto para GESTAO_PRODUCAO_PCP
chcp 65001 >nul

echo =======================================================
echo  PREPARAÇÃO E RENOMEAÇÃO SEGURA DO PROJETO PCP
echo =======================================================
echo.

set "ORIGEM=C:\Users\altam\OneDrive\Desktop\teste clone vectorizer"
set "DESTINO=C:\Users\altam\OneDrive\Desktop\GESTAO_PRODUCAO_PCP"

echo Origem:  %ORIGEM%
echo Destino: %DESTINO%
echo.

if not exist "%ORIGEM%" (
    echo [ERRO] A pasta de origem nao foi encontrada em:
    echo %ORIGEM%
    echo Verifique se ja foi renomeada.
    pause
    exit /b 1
)

if exist "%DESTINO%" (
    echo [AVISO] A pasta de destino "%DESTINO%" ja existe!
    echo Deseja cancelar ou sincronizar?
    pause
    exit /b 1
)

echo 1. Encerrando eventuais processos do Node.js em background...
taskkill /F /IM node.exe 2>nul

echo 2. Renomeando diretorio com preservacao integral de dados e banco...
ren "%ORIGEM%" "GESTAO_PRODUCAO_PCP"

if %ERRORLEVEL% equ 0 (
    echo.
    echo =======================================================
    echo  SUCESSO: Pasta renomeada para GESTAO_PRODUCAO_PCP!
    echo  Todos os arquivos, banco dev.db e dependencias preservados.
    echo =======================================================
) else (
    echo.
    echo [ERRO] O Windows ou OneDrive impediu a renomeacao direta.
    echo Tentando mover via comando move...
    move "%ORIGEM%" "%DESTINO%"
    if %ERRORLEVEL% equ 0 (
        echo [SUCESSO] Movimentado com sucesso para %DESTINO%
    ) else (
        echo [FALHA] Feche editores abertos e execute este arquivo como Administrador.
    )
)

echo.
pause
