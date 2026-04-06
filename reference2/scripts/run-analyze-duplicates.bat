@echo off
powershell -Command "$env:GOOGLE_SERVICE_ACCOUNT_KEY = Get-Content -Raw thinktankweb-483408-9548b5a08345.json; node scripts/analyze-duplicates.js"
