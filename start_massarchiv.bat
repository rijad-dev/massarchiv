@echo off
title Massarchiv Launcher
cd /d "%~dp0"

:: Port zentral definieren — server.js liest ihn aus der Umgebung (process.env.PORT)
set PORT=4215

:: Laeuft der Server schon?
netstat -ano | findstr "LISTENING" | findstr ":%PORT% " >nul
if %errorlevel% equ 0 goto openwindow

:: Express-Server im Hintergrund starten
start "" /b node server.js >nul 2>&1

:: Warten, bis der Server wirklich antwortet (Healthcheck statt blindem TCP-Connect)
set /a __tries=0
:waitloop
powershell -NoProfile -Command "try{Invoke-WebRequest -Uri 'http://127.0.0.1:%PORT%/api/health' -UseBasicParsing -TimeoutSec 2 | Out-Null;exit 0}catch{exit 1}" >nul 2>&1
if %errorlevel% equ 0 goto openwindow
set /a __tries+=1
if %__tries% geq 15 goto openwindow
timeout /t 1 /nobreak >nul
goto waitloop

:openwindow
:: Rahmenloses App-Fenster ohne Adressleiste; InPrivate = taucht nicht im
:: Browser-/Suchverlauf auf; localhost muss nie manuell eingegeben werden.
start "" msedge --app="http://localhost:%PORT%" --inprivate --no-first-run
exit
