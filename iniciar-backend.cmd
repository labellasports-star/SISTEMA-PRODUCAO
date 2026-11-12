@echo off
title PCP Industrial - Backend Server (Port 4000)
cd /d "%~dp0backend"
echo Iniciando Servidor Backend PCP Industrial...
npm.cmd run dev
pause
