@echo off
chcp 65001 >nul
title PlayHub - Gerar HTML unico
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo  O Node.js nao foi encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)

echo.
echo  Isto cria o arquivo playhub-unico.html: um arquivo so, com tudo dentro,
echo  que voce pode mandar por WhatsApp e abre em qualquer aparelho.
echo.
echo  Se voce ja publicou o PlayHub na internet, digite o endereco dele
echo  (ex.: https://meu-playhub.onrender.com) para o multiplayer funcionar.
echo  Se nao, so aperte Enter.
echo.
set /p SITE="  Endereco do site: "
node build-unico.js %SITE%
echo.
pause
