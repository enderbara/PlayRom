@echo off
chcp 65001 >nul
title PlayHub - Instalacao unica
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  O Node.js nao foi encontrado neste computador.
  echo  Vou abrir o site para baixar: instale a versao LTS e depois
  echo  de dois cliques neste arquivo de novo.
  echo.
  start "" "https://nodejs.org"
  pause
  exit /b 1
)

if not exist "node_modules\ws" (
  echo Instalando o necessario ^(so na primeira vez^)...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  Nao consegui instalar. Verifique a internet e tente de novo.
    pause
    exit /b 1
  )
)

echo.
echo  Ligando o servidor do PlayHub e configurando para iniciar com o Windows...
echo.
node server.js --instalar
echo.
pause