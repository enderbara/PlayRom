@echo off
chcp 65001 >nul
title PlayRom.io - Iniciar junto com o Windows
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo  O Node.js nao foi encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)

echo.
echo  [1] Ligar o servidor do PlayRom.io sozinho sempre que o Windows iniciar
echo  [2] Desligar isso
echo.
choice /c 12 /n /m "  Escolha 1 ou 2: "
if errorlevel 2 (
  node server.js --desinstalar
) else (
  node server.js --instalar
)
echo.
pause
