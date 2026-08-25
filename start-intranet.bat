@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo Node.js is not installed or is not on PATH.
    echo Install the LTS build from https://nodejs.org/ and try again.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo Installing dependencies. This is only needed the first time...
    call npm install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
)

if "%HOST%"=="" set HOST=0.0.0.0
if "%PORT%"=="" set PORT=3000

echo.
echo Starting the Nylene Consumption Sheet intranet server.
echo Leave this window open while stations are using the app.
echo Other computers should open http://THIS-COMPUTER-IP:%PORT%
echo.

node server.cjs
echo.
echo Server stopped.
pause
