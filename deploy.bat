@echo off
REM このファイルは UTF-8 で保存されているため、コンソールも UTF-8 に切り替える
chcp 65001 >nul
REM デプロイ処理の実体は deploy.ps1 に一本化している。
REM 認証設定の検証（API_SHARED_SECRET 必須・アクセス方式の明示）を
REM 経路によらず必ず通すため、ここでは委譲のみを行う。
setlocal

if "%~1"=="" (
  echo アクセス方式を指定してください。
  echo.
  echo   deploy.bat IAP            IAP認証（推奨。ブラウザからGoogleログインで利用可）
  echo   deploy.bat Private        IAM認証必須
  echo   deploy.bat SharedSecret   公開のまま共有シークレット認証
  echo.
  echo 注意: SharedSecret ではブラウザ版SPAが 401 になります。
  pause
  exit /b 1
)

echo TTWebのGCP Cloud Runデプロイを開始します...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" -AccessModel %~1
set EXITCODE=%ERRORLEVEL%

pause
exit /b %EXITCODE%
