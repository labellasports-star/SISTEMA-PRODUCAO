@echo off
title PCP Industrial - Testes de Integracao
cd /d "%~dp0backend"
echo Executando testes automatizados de integracao...
npm.cmd test
pause
