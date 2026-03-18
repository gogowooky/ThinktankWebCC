@echo off
cd /d C:\Users\gogow\Documents\ThinktankWebCC

echo ポート 8080 を使用中のプロセスを終了しています...
call npx kill-port 8080

echo サーバーを起動しています...
npm run server:dev
pause
