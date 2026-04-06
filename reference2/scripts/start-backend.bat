@echo off
chcp 65001 >nul
REM BigQuery Backend Server Startup Script
REM Run this server in a separate terminal before running npm run dev

set GOOGLE_SERVICE_ACCOUNT_KEY_FILE=thinktankweb-483408-9548b5a08345.json

echo BigQuery Backend Server starting...
echo.

node -e "process.env.GOOGLE_SERVICE_ACCOUNT_KEY = require('fs').readFileSync('%GOOGLE_SERVICE_ACCOUNT_KEY_FILE%', 'utf8'); require('./dist-server/index.js');"
