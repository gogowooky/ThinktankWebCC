@echo off
chcp 65001 > nul

cd /d C:\Users\shinichiro.egashira\Documents\Claude\ThinktankWebCC

echo [1/3] Killing port 8080...
call npx kill-port 8080 2>nul

echo [2/3] Building server...
call npm run build:server
if %ERRORLEVEL% neq 0 (
    echo Build failed.
    pause
    exit /b 1
)

echo [3/3] Starting server...
npm run server:dev
pause
