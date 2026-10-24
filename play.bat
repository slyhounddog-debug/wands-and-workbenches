@echo off
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set PORT=8080
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
start "" "http://localhost:%PORT%/"
node tools\serve.mjs
pause
