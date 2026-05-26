# Phase 19: デプロイ・仕上げ

## 前提条件
- Phase 01〜18 が完了していること
- `gcloud` CLIがインストール・認証済み

## このフェーズの目標
アプリケーションをGoogle Cloud Runにデプロイして本番環境で動作確認する。

---

## 段148: 本番ビルドの準備

生産環境向けのビルド設定を確認・整備してください。

```typescript
// vite.config.ts に本番設定を追加
build: {
  outDir: 'dist',
  sourcemap: false,
  minify: 'esbuild',
}
```

`npm run build` でエラーなくビルドが完了することを確認してください。

---

## 段149: Cloud Run デプロイスクリプト

`deploy.ps1` を更新してください。

```powershell
# deploy.ps1
$PROJECT_ID = "thinktankweb-XXXXXXX"
$REGION = "asia-northeast1"
$SERVICE_NAME = "thinktank-web"

# ビルド + デプロイ
gcloud run deploy $SERVICE_NAME `
  --source . `
  --region $REGION `
  --allow-unauthenticated `
  --project $PROJECT_ID `
  --set-env-vars "GCP_PROJECT_ID=$PROJECT_ID,GEMINI_API_KEY=$env:GEMINI_API_KEY" `
  --memory 512Mi `
  --timeout 60
```

---

## 段150: 環境変数の Cloud Run への設定

Cloud Run の環境変数（Secrets）を設定する手順を `docs/deployment.md` に記録してください。

設定すべき環境変数一覧:
- `GCP_PROJECT_ID`
- `GEMINI_API_KEY`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REDIRECT_URI`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_FILTER_SUBJECT`
- `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON文字列をBase64エンコード)

---

## 段151: ヘルスチェックの実装

Cloud Run のヘルスチェックに対応してください。

```typescript
// server/src/index.ts に追加
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString()
  });
});
```

---

## 段152: 本番環境でのCORS設定

本番環境（Cloud Run URL）でのCORS設定を更新してください。

```typescript
const allowedOrigins = [
  'http://localhost:5173',
  'https://thinktank-web-XXXXXXXX.asia-northeast1.run.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
```

---

## 段153: セキュリティヘッダーの追加

`server/src/middleware/securityHeaders.ts` を作成してください。

```typescript
import helmet from 'helmet';
app.use(helmet());
// CSPの設定でiframe(WebView)を許可
// Content-Security-Policy: frame-src 'self' https://drive.google.com;
```

`npm install helmet` をバックエンドに追加してください。

---

## 段154: ロギングの整備

`server/src/utils/logger.ts` を作成してください。

```typescript
const logger = {
  info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data || ''),
};
export default logger;
```

全APIルートでリクエストログを出力するミドルウェアも追加してください。

---

## 段155: キャッシュ戦略の最終確認

本番環境でのキャッシュ動作を確認・最終調整してください。

- フロントエンド: `vite.config.ts` で `assetsDir` の静的ファイルキャッシュ設定
- API レスポンス: `Cache-Control: no-store` でAPIのキャッシュを無効化
- メモ一覧: ローカルストレージのTTLを60分に設定

---

## 段156: 最終仕上げ: HealthCheck削除

Phase01で追加した `HealthCheck.tsx` コンポーネントを削除し、StatusBarのみに情報を表示するように整理してください。

---

## 段157: Phase13（最終）動作確認チェックリスト

**デプロイ先:**
```
https://thinktank-web-XXXXXXXX.asia-northeast1.run.app
```

- [ ] Cloud Run へのデプロイが成功すること
- [ ] 本番URLでアプリが起動すること
- [ ] メモの一覧・作成・編集・保存が動作すること
- [ ] 全文検索が動作すること
- [ ] AIチャットが動作すること
- [ ] Google Drive へのファイルアップロードが動作すること
- [ ] Gmail同期が動作すること
- [ ] スマートフォンブラウザで正常表示されること
- [ ] `/healthz` が `{"status":"healthy"}` を返すこと

---

## 付録: 追加機能のアイデア（将来のフェーズ用）

以下は本157段には含まれておらず、必要に応じて追加の指令として依頼してください。

| 機能 | 内容 |
|---|---|
| カレンダービュー | 日・週・月単位のイベント表示 |
| 音声入力 | Web Speech API による音声テキスト変換 |
| タグ分類・詳細 | メモ・イベントのタグフィルタリング |
| 日記・週報 | 定型フォーマットの自動生成 |
| Google Photos連携 | 検索語でサムネイル表示 |
| Outlook連携 | メールサーバーAPIとの連携 |
| 共有機能 | 複数ユーザー対応（Firebase Auth） |

---

**プロジェクト完成！**

以上の13フェーズ・157段で ThinktankWebCC の段階的再構築が完了します。
各フェーズ完了ごとにブラウザで動作確認し、必要に応じて機能追加の指令を追記してください。