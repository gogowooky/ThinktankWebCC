# Phase 10: Google Drive連携

## 前提条件
- Phase 01〜09 が完了していること
- GCPプロジェクトで Google Drive API が有効化されていること
- サービスアカウントに Drive APIへのアクセス権が設定済み

## このフェーズの目標
ドラッグ&ドロップされたファイルをGoogle Driveの `yyyy-mm-dd` フォルダへ自動格納する。

---

## 段127: Google Drive APIサービスの実装

`server/src/services/driveService.ts` を作成してください。

```typescript
import { google } from 'googleapis';

export class DriveService {
  private drive: any;

  constructor() {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    this.drive = google.drive({ version: 'v3', auth });
  }

  // 日付フォルダの取得または作成 (親フォルダ: Thinktank)
  async getOrCreateDateFolder(date: string): Promise<string>
  // 例: date='2026-03-16' → GoogleDriveに '2026-03-16' フォルダを作成してIDを返す

  // ファイルのアップロード
  async uploadFile(folderId: string, fileName: string, mimeType: string, buffer: Buffer): Promise<string>
  // → Google Drive上のファイルIDを返す

  // ファイル一覧
  async listFiles(folderId: string): Promise<{id:string, name:string, mimeType:string}[]>
}

export const driveService = new DriveService();
```

---

## 段128: ファイルアップロードAPIの実装

`server/src/routes/driveRoutes.ts` を作成してください。

```
POST /api/drive/upload
  body: multipart/form-data (FileとともにdateおよびmemoIdを含む)
  → 今日の日付フォルダに格納
  → { fileId, webViewLink } を返す
```

- `npm install multer @types/multer` をバックエンドに追加
- 最大ファイルサイズ: 50MB
- ファイル名は元のファイル名をそのまま使用

---

## 段129: ドロップファイル格納Actionの実装

`Application.Drop.Default` Actionを完成させてください。

```typescript
A('Application.Drop.Default', 'ファイルドロップ処理', async (ctx) => {
  const files = ctx.DroppedData?.files as File[];
  if (!files || files.length === 0) return false;

  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('date', new Date().toISOString().slice(0, 10)); // 'yyyy-mm-dd'

    const res = await fetch('/api/drive/upload', {
      method: 'POST',
      body: formData,
    });
    const { fileId, webViewLink } = await res.json();

    // メモタグとしてEditorのカーソル位置に挿入
    // [File:ファイル名](webViewLink) の形式
    app.ActivePanel.EditorBehavior?.InsertAtCursor(`[File:${file.name}](${webViewLink})`);
  }
  return true;
});
```

DefaultEvents.ts に追加:
```typescript
E('*-*-*-*', '', 'DROP', 'Application.Drop.Default');
```

---

## 段130: ドロップ時のビジュアルフィードバック

ファイルドロップ時のUI改善:

- `dragover` イベントでパネルのオーバーレイ表示（「ここにドロップ」）
- `dragleave` で非表示
- アップロード完了後に「✓ 保存完了: ファイル名」をStatusBarに表示
- アップロード失敗時は「× アップロード失敗: エラーメッセージ」を表示

---

## 段131: Google Driveリンクのリクエストタグ登録

DefaultRequests.ts に Drive ファイルのリクエストタグを追加してください。

```typescript
// [File:ファイル名](https://drive.google.com/...) にマッチ
R('File', 'ファイル参照', '\\[File:([^\\]]+)\\]\\(([^)]+)\\)');
```

対応するAction:
```typescript
A('Request.File.Default', 'ファイルを開く', async (ctx) => {
  // ctx.RequestTag から URL を抽出して新しいタブで開く
  return true;
});
```

---

## 段132: Phase10 動作確認チェックリスト

- [ ] ファイルをEditorパネルにドロップしてGoogle Driveの今日の日付フォルダに保存されること
- [ ] StatusBarにアップロード完了メッセージが表示されること
- [ ] EditorにFileタグが挿入されること
- [ ] FileタグをCtrl+Clickして新しいタブでGoogle Driveのファイルが開くこと

---

**前フェーズ**: [Phase 09: AIチャット機能](./phase08_09_memo_ai.md)
**次フェーズ**: [Phase 11: Gmail連携](./phase10_gdrive.md)

---
---

# Phase 11: Gmail連携

## 前提条件
- Phase 01〜10 が完了していること
- GCPプロジェクトで Gmail API が有効化されていること
- サービスアカウントまたはOAuth 2.0の認証設定が完了していること

> **注**: Gmailはサービスアカウントによるアクセスに制限があります（Google Workspace環境が必要）。個人Gmailの場合はOAuth 2.0を使用してください。このフェーズではOAuth 2.0フローを実装します。

---

## 段133: Gmail OAuth 2.0の設定

`server/src/services/gmailAuthService.ts` を作成してください。

```typescript
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI // 例: 'http://localhost:3001/api/gmail/callback'
);

export const gmailAuthService = {
  getAuthUrl(): string,
  async exchangeCode(code: string): Promise<string>, // refresh_token を返す
  async getClient(refreshToken: string): Promise<any>,
};
```

`server/.env` に以下を追加:
```
GMAIL_CLIENT_ID=xxx
GMAIL_CLIENT_SECRET=xxx
GMAIL_REDIRECT_URI=http://localhost:3001/api/gmail/callback
GMAIL_REFRESH_TOKEN=xxx  ← 初回認証後に保存
GMAIL_FILTER_SUBJECT=ThinktankNote  ← 読み込む対象件名（変更可能）
```

---

## 段134: Gmail APIサービスの実装

`server/src/services/gmailService.ts` を作成してください。

```typescript
import { google } from 'googleapis';

export class GmailService {
  // 指定した件名フィルタでメールを取得
  async getMailsBySubject(
    subjectFilter: string,   // 環境変数 GMAIL_FILTER_SUBJECT で設定
    maxResults: number = 50,
    afterDate?: Date         // この日以降のメールのみ
  ): Promise<GmailItem[]>

  // メール本文をテキストで取得
  async getMailBody(messageId: string): Promise<string>
}

export interface GmailItem {
  messageId: string;
  subject: string;
  from: string;
  date: string;      // ISO文字列
  snippet: string;   // 本文の冒頭200文字
  body?: string;     // 本文全体（遅延ロード）
}
```

---

## 段135: Gmail取得APIルートの実装

`server/src/routes/gmailRoutes.ts` を作成してください。

```
GET /api/gmail/mails?subject=xxx&limit=50&after=yyyy-mm-dd
  → GmailItemの配列を返す

GET /api/gmail/mails/:messageId/body
  → メール本文を返す

GET /api/gmail/auth
  → OAuth認証URLにリダイレクト

GET /api/gmail/callback
  → コールバック、refresh_tokenを環境変数的に保存
```

---

## 段136: TTGMailItemクラスとTTGMailsコレクション

`src/models/TTGMail.ts` を作成してください。

```typescript
export class TTGMailItem extends TTObject {
  public Subject: string = '';
  public From: string = '';
  public Date: string = '';
  public Snippet: string = '';
  public Body: string = '';
  public IsLoaded: boolean = false;

  async LoadBody(): Promise<void>
}

export class TTGMails extends TTCollection {
  constructor() {
    super();
    this.ListProperties = 'Date,From,Subject';
    this.ColumnMapping = 'Date:日時,From:送信者,Subject:件名';
    this.ColumnMaxWidth = 'Date:18,From:30,Subject:60';
  }
  // APIから取得してコレクション同期
  public async SyncWithGmailApi(subjectFilter: string): Promise<void>
}
```

TTModels に `GMails: TTGMails` を追加してください。

---

## 段137: Gmail同期Action

```typescript
A('Application.Gmail.Sync', 'Gmailを同期', async (ctx) => {
  // GMAIL_FILTER_SUBJECT（環境変数）のメールを取得
  // TTGMailsに同期
  // Chatパネル（またはGmailパネル）に一覧を表示
  return true;
});

A('Application.Gmail.OpenMail', 'メールを開く', async (ctx) => {
  // 選択中のGMailItemのBodyをロード
  // EditorパネルにMarkdown形式で表示
  // （Form: 件名・送信者・日時・本文）
  return true;
});
```

DefaultEvents.ts に追加:
```typescript
E('*-*-*-*', 'Alt', 'G', 'Application.Gmail.Sync');
```

---

## 段138: GMailをTTMemoとして管理

Gmailのメールを TTMemo として保存する機能を追加してください。

```typescript
A('Application.Gmail.SaveAsMemo', 'メールをメモとして保存', async (ctx) => {
  // 選択中GMailItemの内容を新規TTMemoとして作成
  // タイトル: 件名
  // 内容: 送信者・日時・本文をMarkdown形式に変換
  // Firestoreに保存
  // EditorパネルにMemoを表示
  return true;
});
```

---

## 段139: Phase11 動作確認チェックリスト

- [ ] `Alt+G` でGmail同期が動作し、Tableに件名一覧が表示されること
- [ ] メールをダブルクリックして本文がEditorに表示されること
- [ ] 件名フィルタ（GMAIL_FILTER_SUBJECT）が正しく機能すること
- [ ] Gmailのメールをメモとして保存できること

---

**前フェーズ**: [Phase 10: Google Drive連携](./phase10_gdrive.md)
**次フェーズ**: [Phase 12: スマートフォン対応](./phase12_mobile.md)

---
---

# Phase 12: スマートフォン対応

## 前提条件
- Phase 01〜11 が完了していること

## このフェーズの目標
スマートフォン・タブレットでの表示と操作に対応する。タッチデバイスでは1パネルのZenモード表示とジェスチャー操作を実装する。

---

## 段140: デバイス判定ユーティリティ

`src/utils/deviceUtils.ts` を作成してください。

```typescript
export const deviceUtils = {
  isTouchDevice(): boolean {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  },

  isMobile(): boolean {
    return /iPhone|Android|Mobile/.test(navigator.userAgent) && this.isTouchDevice();
  },

  isTablet(): boolean {
    return this.isTouchDevice() && !this.isMobile();
  },

  getViewportSize(): { width: number; height: number } {
    return { width: window.innerWidth, height: window.innerHeight };
  }
};
```

---

## 段141: レスポンシブレイアウトの実装

`src/index.css` にメディアクエリを追加してください。

```css
/* タブレット: 中央1カラム + パネル切替ナビゲーション */
@media (max-width: 1024px) {
  .app-container {
    grid-template-columns: 1fr;
  }
  .col-left, .col-right {
    display: none; /* パネル切替で表示 */
  }
}

/* スマートフォン: 1パネルZenモード */
@media (max-width: 640px) {
  .app-container {
    display: flex;
    flex-direction: column;
  }
  .panel {
    display: none;
  }
  .panel.active-zen {
    display: flex;
    flex: 1;
    flex-direction: column;
  }
}
```

---

## 段142: スマートフォン向けZenモード起動

タッチデバイスの場合、起動時に自動的にDeskパネルをZenモード（全画面表示）にする処理を追加してください。

```typescript
// TTApplication.ts のコンストラクタ内
if (deviceUtils.isTouchDevice()) {
  this.SetZenMode('Desk');
}

SetZenMode(panelName: PanelName | null): void {
  this._zenPanel = panelName;
  this.NotifyRedraw();
}
```

---

## 段143: スマートフォン向けボトムナビゲーション

スマートフォン表示時に画面下部にパネル切り替えナビゲーションバーを表示してください。

`src/components/MobileNav.tsx`:

```typescript
const MOBILE_PANELS: PanelName[] = ['Desk', 'Index', 'Chat', 'Log'];

export function MobileNav({ activePanel, onPanelChange }) {
  // 下部固定のナビゲーションバー
  // 各パネルのアイコン（絵文字またはSVGアイコン）
  // タップでパネル切り替え + Zenモード設定
}
```

アイコン案:
- Desk: ✏️ (編集)
- Index: 📋 (リスト)
- Chat: 💬 (チャット)
- Log: 📊 (ログ)

---

## 段144: タッチジェスチャーのAction登録

Phase07で作成した `TouchGestureRecognizer` を TTApplication に統合してください。

DefaultEvents.ts にモバイル用イベントを追加:

```typescript
// スワイプでパネル切り替え
E('*-*-*-*', '', 'SWIPE_LEFT',  'Application.Panel.Next');
E('*-*-*-*', '', 'SWIPE_RIGHT', 'Application.Panel.Prev');

// タイトルへのロングプレスでメニュー表示
E('*-*-*-*', '', 'PanelTitle_LONGPRESS', 'Request.Panel.ContextMenu');

// コンテンツへのロングプレス
E('*-Editor-*-*', '', 'LONGPRESS', 'Request.Editor.ContextMenu');
E('*-Table-*-*',  '', 'LONGPRESS', 'Request.Table.ContextMenu');
```

---

## 段145: スマートフォン向けエディター調整

モバイルデバイスでのMonaco Editor使用上の問題を解決してください。

- Monaco EditorはモバイルでIMEや仮想キーボードとの相性が悪いため、スマートフォン（`isMobile()`）では Monaco の代わりに `<textarea>` をベースにしたシンプルなエディターを使用
- Tabletでは Monaco を使用
- 切り替えは `EditorView.tsx` 内で `deviceUtils.isMobile()` で判定

---

## 段146: PWA対応

`public/manifest.json` を作成してください。

```json
{
  "name": "ThinktankWebCC",
  "short_name": "Thinktank",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1e1e2e",
  "theme_color": "#89b4fa",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`index.html` に `<link rel="manifest" href="/manifest.json">` を追加。
アイコン画像 `icon-192.png` / `icon-512.png` を `public/` に配置してください。

---

## 段147: Phase12 動作確認チェックリスト

- [ ] PC（デスクトップ）ブラウザで全7パネルが表示されること
- [ ] タブレット（iPad等）でブラウザを開いたときに中央カラムが全画面表示されること
- [ ] スマートフォン（iPhone/Android）でDeskパネルだけが全画面表示されること
- [ ] スマートフォンでボトムナビゲーションが表示されてパネル切り替えができること
- [ ] 左右スワイプでパネルが切り替わること
- [ ] ロングプレスでコンテキストメニューが表示されること
- [ ] PWAとしてホーム画面に追加してスタンドアロン起動できること

---

**前フェーズ**: [Phase 11: Gmail連携](./phase11_gmail_in_phase08_09.md)
**次フェーズ**: [Phase 13: デプロイ・仕上げ](./phase13_deploy.md)

---
---

# Phase 13: デプロイ・仕上げ

## 前提条件
- Phase 01〜12 が完了していること
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
