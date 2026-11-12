@echo off
title PCP Industrial - Frontend Client (Port 5173)
cd /d "%~dp0frontend"
echo Iniciando Painel Web PCP Industrial...
npm.cmd run dev
pause
