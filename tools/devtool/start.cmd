@echo off
rem Starts the Wands & Workbenches dev tool and opens it in the browser. Close this window to stop it.
cd /d "%~dp0..\.."
start "" http://localhost:8090/
node tools\devtool\server.mjs
pause
