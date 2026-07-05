# TTWeb Cloud Run デプロイ用スクリプト

# 1. デプロイ先のプロジェクトIDを設定します
gcloud config set project thinktankweb-483408

# 2. Cloud Runにデプロイを実行します（東京リージョン、未認証アクセス許可）
gcloud run deploy ttweb --source . --region asia-northeast1 --allow-unauthenticated --quiet

Write-Host "Deployment completed successfully!" -ForegroundColor Green
