@echo off
title Massarchiv Launcher
cd /d "%~dp0"

:: Laeuft der Server schon? (Port 4215)
netstat -ano | findstr "LISTENING" | findstr ":4215 " >nul
if %errorlevel% equ 0 goto openwindow

:: Express-Server im Hintergrund starten
start "" /b node server.js >nul 2>&1

:: Warten, bis der Server antwortet (max. ~15 Sekunden statt blindem timeout)
set /a __tries=0
:waitloop
powershell -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient;try{$c.Connect('127.0.0.1',4215);exit 0}catch{exit 1}finally{$c.Dispose()}" >nul 2>&1
if %errorlevel% equ 0 goto openwindow
set /a __tries+=1
if %__tries% geq 15 goto openwindow
timeout /t 1 /nobreak >nul
goto waitloop

:openwindow
:: Rahmenloses App-Fenster ohne Adressleiste; InPrivate = taucht nicht im
:: Browser-/Suchverlauf auf; localhost muss nie manuell eingegeben werden.
start "" msedge --app="http://localhost:4215" --inprivate --no-first-run
exit
