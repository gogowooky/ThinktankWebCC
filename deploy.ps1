# TTWeb Cloud Run デプロイ用スクリプト
#
# 【重要】このスクリプトは -AccessModel の明示を必須にしている。
# 以前は `--allow-unauthenticated` かつ API_SHARED_SECRET 未設定でデプロイしており、
# /api/bq（Vault全件の読み書き削除）・/api/chat（AI APIキー）・/api/system/open
# （任意パス起動）がインターネットに無認証公開される状態だった。
# 「うっかり公開」を構造的に不可能にするため、既定値は設けない。
#
# 使い方:
#   .\deploy.ps1 -AccessModel IAP            # 推奨: IAP認証。ブラウザからGoogleログインで利用可
#   .\deploy.ps1 -AccessModel Private        # IAM認証必須。ブラウザから直接開けない
#   .\deploy.ps1 -AccessModel SharedSecret   # 公開のまま共有シークレット認証
#
# ※ SharedSecret は curl/bot は防げるが、ブラウザ版SPAは認証ヘッダーを送らないため
#    401 になる（ヘッダー付与は vite dev proxy とパッケージ版Electron専用の仕組み）。
# ※ IAP はロードバランサ不要の Cloud Run 直接統合を使う。--iap フラグには新しい
#    gcloud が必要なため、未対応と言われたら `gcloud components update` を実行すること。
#    事前準備（IAP有効化・IAMバインディング）は docs/CloudRun_Deploy.md を参照。

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('IAP', 'Private', 'SharedSecret')]
  [string]$AccessModel
)

$ErrorActionPreference = 'Stop'

$ProjectId   = 'thinktankweb-483408'
$ServiceName = 'ttweb'
$Region      = 'asia-northeast1'

# ローカルの鍵JSONと同一のサービスアカウント。これをランタイムSAに指定することで
# BigQuery は ADC（鍵ファイル不要）で動作し、Drive のフォルダ所有者も変わらない。
$RuntimeSa   = '699735546730-compute@developer.gserviceaccount.com'

# ── 共有シークレットの取得（環境変数 → server/.env の順）────────────────────

function Get-SharedSecret {
  if ($env:API_SHARED_SECRET) { return $env:API_SHARED_SECRET }

  $envFile = Join-Path $PSScriptRoot 'server\.env'
  if (Test-Path $envFile) {
    foreach ($line in (Get-Content $envFile -Encoding UTF8)) {
      if ($line -match '^\s*API_SHARED_SECRET\s*=\s*(.+?)\s*$') {
        return $Matches[1].Trim('"').Trim("'")
      }
    }
  }
  return $null
}

# IAP はエッジで認可するため共有シークレットを配らない運用になる。
# それ以外の方式ではシークレットが唯一の防御なので必須にする。
$secret = $null
if ($AccessModel -ne 'IAP') {
  $secret = Get-SharedSecret

  if (-not $secret) {
    Write-Host ''
    Write-Host 'API_SHARED_SECRET が未設定です。' -ForegroundColor Red
    Write-Host 'サーバーは公開環境で未設定を検出すると起動を中止します（apiAuth のフェイルクローズ）。'
    Write-Host ''
    Write-Host '生成してから再実行してください:' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  $bytes = New-Object byte[] 32'
    Write-Host '  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)'
    Write-Host '  $hex = -join ($bytes | ForEach-Object { $_.ToString("x2") })'
    Write-Host '  Add-Content server\.env "API_SHARED_SECRET=$hex"'
    Write-Host ''
    exit 1
  }

  # gcloud の --update-env-vars はカンマ区切りで値を解釈するため、
  # 区切り文字を含むシークレットは黙って壊れる。事前に弾く。
  if ($secret -notmatch '^[A-Za-z0-9_\-]+$') {
    Write-Host 'API_SHARED_SECRET に使用できない文字が含まれています。' -ForegroundColor Red
    Write-Host '英数字・ハイフン・アンダースコアのみにしてください（gcloud の値パースが壊れるため）。'
    exit 1
  }

  if ($secret.Length -lt 16) {
    Write-Host "API_SHARED_SECRET が短すぎます（$($secret.Length)文字 / 最低16文字）。" -ForegroundColor Red
    exit 1
  }
}

# ── デプロイ ────────────────────────────────────────────────────────────────

Write-Host "プロジェクトを設定します: $ProjectId" -ForegroundColor Cyan
gcloud config set project $ProjectId
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# --set-env-vars ではなく --update-env-vars を使う。
# --set-env-vars は既存の環境変数をすべて置き換えるため、Cloud Run 側に設定済みの
# ANTHROPIC_API_KEY / GOOGLE_SERVICE_ACCOUNT_KEY 等を消し飛ばしてしまう。
# --update-secrets も同じ理由で --set-secrets を使わない。
$deployArgs = @(
  'run', 'deploy', $ServiceName,
  '--source', '.',
  '--region', $Region,
  '--service-account', $RuntimeSa,
  '--update-secrets', 'ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,GOOGLE_SERVICE_ACCOUNT_KEY=GOOGLE_SERVICE_ACCOUNT_KEY:latest',
  '--quiet'
)

switch ($AccessModel) {
  'IAP' {
    Write-Host 'アクセス方式: IAP（Googleアカウント認証。ロードバランサ不要）' -ForegroundColor Green
    $deployArgs += @('--update-env-vars', 'IAP_ENABLED=true', '--no-allow-unauthenticated', '--iap')
  }
  'Private' {
    Write-Host 'アクセス方式: Private（IAM認証必須）' -ForegroundColor Green
    $deployArgs += @('--update-env-vars', "API_SHARED_SECRET=$secret", '--no-allow-unauthenticated')
  }
  'SharedSecret' {
    Write-Host 'アクセス方式: SharedSecret（インターネット公開 + ヘッダー認証）' -ForegroundColor Yellow
    Write-Host '  警告: ブラウザ版SPAは認証ヘッダーを送らないため 401 になります。' -ForegroundColor Yellow
    $deployArgs += @('--update-env-vars', "API_SHARED_SECRET=$secret", '--allow-unauthenticated')
  }
}

Write-Host "Cloud Run にデプロイします: $ServiceName ($Region)" -ForegroundColor Cyan
gcloud @deployArgs
if ($LASTEXITCODE -ne 0) {
  Write-Host 'デプロイに失敗しました。' -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host 'デプロイが完了しました。' -ForegroundColor Green

if ($AccessModel -eq 'Private') {
  Write-Host ''
  Write-Host 'ブラウザで開くには次のコマンドでローカルにトンネルします:' -ForegroundColor Cyan
  Write-Host "  gcloud run services proxy $ServiceName --region $Region"
}

if ($AccessModel -eq 'IAP') {
  Write-Host ''
  Write-Host '初回のみ、IAPの有効化とアクセス権の付与が必要です（docs/CloudRun_Deploy.md 手順3・5）。' -ForegroundColor Cyan
  Write-Host '起動後、ログの [apiAuth] 行でJWTの到達を確認してください。' -ForegroundColor Cyan
}
