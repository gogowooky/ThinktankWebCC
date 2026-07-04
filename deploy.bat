@echo off
echo TTWebのGCP Cloud Runデプロイを開始します...

REM 1. GCPプロジェクトIDの設定
call gcloud config set project thinktankweb-483408

REM 2. Cloud Runへのデプロイ
call gcloud run deploy ttweb --source . --region asia-northeast1 --allow-unauthenticated --quiet

echo デプロイが完了しました。
pause
