@echo off
node -e "process.env.GOOGLE_SERVICE_ACCOUNT_KEY = require('fs').readFileSync('thinktankweb-483408-9548b5a08345.json', 'utf8'); require('./scripts/update-memo-fileids.js');"
