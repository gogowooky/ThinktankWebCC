@echo off
chcp 65001 >nul
REM Vite Frontend Dev Server Startup Script
REM Run this after starting start-backend.bat in a separate terminal

echo Vite Frontend Dev Server starting...
echo.

npm run dev
