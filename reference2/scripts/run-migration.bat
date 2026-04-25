@echo off
setlocal

echo ステップ1: BigQueryテーブル作成
node -e "process.env.GOOGLE_SERVICE_ACCOUNT_KEY = require('fs').readFileSync('thinktankweb-483408-9548b5a08345.json', 'utf8'); require('./scripts/create-bigquery-table.js');"

echo.
echo ステップ2: データ移行
node -e "process.env.GOOGLE_SERVICE_ACCOUNT_KEY = require('fs').readFileSync('thinktankweb-483408-9548b5a08345.json', 'utf8'); require('./scripts/migrate-memos-to-bigquery.js');"

endlocal
