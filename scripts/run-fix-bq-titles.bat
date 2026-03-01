@echo off
rem Use PowerShell to set the environment variable and run the script
rem This avoids issues with multiline JSON and batch file limitations
powershell -Command "$env:GOOGLE_SERVICE_ACCOUNT_KEY = Get-Content -Raw thinktankweb-483408-9548b5a08345.json; node scripts/fix-bq-titles.js $args" -args %*
