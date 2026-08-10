# APIキー入れ替えスクリプト（1回限りの運用ツール。リポジトリには置かない）
$ErrorActionPreference = 'Stop'
$ProjectId = 'thinktankweb-483408'
$EnvFile   = 'C:\Users\gogow\Documents\ThinktankWebCC\server\.env'

function Read-Plain([string]$Prompt) {
    $sec = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try   { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Set-EnvLine([string]$Name, [string]$Value) {
    $lines   = Get-Content $EnvFile -Encoding UTF8
    $found   = $false
    $updated = $lines | ForEach-Object {
        if ($_ -match "^\s*$Name\s*=") { $found = $true; "$Name=$Value" } else { $_ }
    }
    if (-not $found) { $updated += "$Name=$Value" }
    [IO.File]::WriteAllLines($EnvFile, $updated, (New-Object Text.UTF8Encoding($false)))
}

function Update-Secret([string]$Name) {
    Write-Host ""
    Write-Host "--- $Name ---" -ForegroundColor Cyan
    Write-Host '  新しいキーを貼り付けて Enter（空 Enter でスキップ）'
    $value = Read-Plain '  値'
    if (-not $value) { Write-Host '  スキップしました' -ForegroundColor DarkGray; return }
    $tmp = [IO.Path]::GetTempFileName()
    try {
        [IO.File]::WriteAllText($tmp, $value, (New-Object Text.UTF8Encoding($false)))
        gcloud secrets versions add $Name --data-file=$tmp --project=$ProjectId --quiet
        if ($LASTEXITCODE -ne 0) { throw "$Name の登録に失敗しました" }
    } finally {
        if (Test-Path $tmp) { Remove-Item $tmp -Force }
    }
    Set-EnvLine $Name $value
    Write-Host "  更新しました（$($value.Length) 文字）" -ForegroundColor Green
}

Write-Host '各サービスで新しいキーを発行してから実行してください。'
Update-Secret 'ANTHROPIC_API_KEY'
Update-Secret 'OPENAI_API_KEY'
Update-Secret 'GEMINI_API_KEY'

Write-Host ""
Write-Host '--- API_SHARED_SECRET ---' -ForegroundColor Cyan
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$hex = -join ($bytes | ForEach-Object { $_.ToString('x2') })
Set-EnvLine 'API_SHARED_SECRET' $hex
Write-Host "  server/.env を更新しました" -ForegroundColor Green
Write-Host ""
Write-Host '完了。次に npm run deploy を実行してください。' -ForegroundColor Green
