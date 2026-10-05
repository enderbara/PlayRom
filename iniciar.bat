@echo off
chcp 65001 >nul
title PlayHub - Servidor multiplayer
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

echo.
echo  Se o Windows perguntar sobre o Firewall, clique em "Permitir acesso".
echo.
node server.js
if errorlevel 1 (
  echo.
  echo  O servidor parou por causa de um erro.
  pause
)
