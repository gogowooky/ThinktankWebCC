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

# Phase 12: スマートフォン・タブレット対応

## 前提条件
- Phase 01〜11 が完了していること

## このフェーズの目標
スマートフォン・タブレットで最適な表示と操作を実現する。デバイス種別と向きに応じてパネル構成・モード・レイアウトを自動切り替えし、スワイプとボトムナビゲーションで操作できる状態を作る。

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

### デバイス・向きによるパネル構成

| デバイス | 向き | 使用パネル | 表示方法 |
|---|---|---|---|
| タブレット | **縦置き** | Shelf・Desk・System | Shelf と Desk を上下2分割 |
| タブレット | **横置き** | Index・Desk・Log | Index と Desk を左右2分割 |
| スマホ | 縦/横 | Index・Desk・Log | Desk を Zenモード（全画面） |
| PC | — | 全7パネル | 通常の3カラムレイアウト |

### 各パネルのモード固定（タッチデバイス）

| パネル | モード | Resource / URL |
|---|---|---|
| Desk | **Editor固定** | 前回のメモ |
| Shelf / Index | **Table固定** | `Memos`（TTMemosコレクション） |
| System / Log | **WebView固定** | `/ttmarkdown`（同パネルEditorのMarkdownプレビュー） |

### CSSメディアクエリ

`src/index.css` にメディアクエリを追加してください。

```css
/* ---- タブレット縦置き: Shelf上 + Desk下、System非表示枠 ---- */
@media (min-width: 641px) and (max-width: 1024px) and (orientation: portrait) {
  .app-container {
    display: grid;
    grid-template-rows: 1fr 2fr auto; /* Shelf:Desk = 1:2 */
    grid-template-columns: 1fr;
    height: 100dvh;
  }
  /* 使用するパネルのみ表示 */
  .panel[data-panel="Shelf"] { grid-row: 1; display: flex; flex-direction: column; }
  .panel[data-panel="Desk"]  { grid-row: 2; display: flex; flex-direction: column; }
  /* System は MobileSwipe で表示切替（デフォルト非表示） */
  .panel[data-panel="System"].swipe-visible { grid-row: 1; display: flex; flex-direction: column; }
  /* 不要パネルを非表示 */
  .panel:not([data-panel="Shelf"]):not([data-panel="Desk"]):not([data-panel="System"]) { display: none; }
  .mobile-bottom-nav { display: flex; }
}

/* ---- タブレット横置き: Index左 + Desk右、Log非表示枠 ---- */
@media (min-width: 641px) and (max-width: 1366px) and (orientation: landscape) {
  .app-container {
    display: grid;
    grid-template-columns: 1fr 2fr; /* Index:Desk = 1:2 */
    grid-template-rows: 1fr auto;
    height: 100dvh;
  }
  .panel[data-panel="Index"] { grid-column: 1; display: flex; flex-direction: column; }
  .panel[data-panel="Desk"]  { grid-column: 2; display: flex; flex-direction: column; }
  /* Log は MobileSwipe で表示切替（デフォルト非表示） */
  .panel[data-panel="Log"].swipe-visible { grid-column: 1; display: flex; flex-direction: column; }
  .panel:not([data-panel="Index"]):not([data-panel="Desk"]):not([data-panel="Log"]) { display: none; }
  .mobile-bottom-nav { display: flex; }
}

/* ---- スマートフォン: DeskのみZenモード ---- */
@media (max-width: 640px) {
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100dvh;
  }
  .panel { display: none; }
  .panel.active-zen { display: flex; flex: 1; flex-direction: column; } /* Desk */
  /* スワイプで表示する Index / Log */
  .panel.swipe-visible { display: flex; flex: 1; flex-direction: column; }
  .mobile-bottom-nav { display: flex; }
}

/* PC: ボトムナビを非表示 */
@media (min-width: 1025px) {
  .mobile-bottom-nav { display: none; }
}
```

---

## 段142: 起動時のデバイス別パネル初期化

タッチデバイス起動時に、デバイス種別と向きに応じてパネルのモード・Resourceを自動設定してください。

```typescript
// TTApplication.ts のコンストラクタ内
export class TTApplication {
  private _mobileLayout: 'pc' | 'tablet-portrait' | 'tablet-landscape' | 'mobile' = 'pc';

  constructor() {
    this._initMobileLayout();
    window.addEventListener('orientationchange', () => this._initMobileLayout());
    window.addEventListener('resize', () => this._initMobileLayout());
  }

  private _initMobileLayout(): void {
    const { width, height } = deviceUtils.getViewportSize();
    const isPortrait = height > width;
    const isMobile   = deviceUtils.isMobile();
    const isTablet   = deviceUtils.isTablet();

    if (isMobile) {
      this._mobileLayout = 'mobile';
      // Desk: Editor固定 / Zenモード
      this.SetZenMode('Desk');
      this._setMobilePanelModes();
    } else if (isTablet && isPortrait) {
      this._mobileLayout = 'tablet-portrait';
      this._setTabletPortraitModes();
    } else if (isTablet && !isPortrait) {
      this._mobileLayout = 'tablet-landscape';
      this._setTabletLandscapeModes();
    } else {
      this._mobileLayout = 'pc';
    }
    this.NotifyRedraw();
  }

  // モード・Resource の設定（共通）
  private _applyMobilePanelDefaults(): void {
    const S = this.models.Status;
    // Desk: Editorモード固定
    S.SetValue('Desk.Current.Mode', 'Editor');
    // Shelf / Index: TableモードでMemos固定
    S.SetValue('Shelf.Current.Mode', 'Table');
    S.SetValue('Shelf.Table.Resource', 'Memos');
    S.SetValue('Index.Current.Mode', 'Table');
    S.SetValue('Index.Table.Resource', 'Memos');
    // System / Log: WebViewモードで /ttmarkdown 固定
    S.SetValue('System.Current.Mode', 'WebView');
    S.SetValue('System.WebView.Keyword', '/ttmarkdown');
    S.SetValue('Log.Current.Mode', 'WebView');
    S.SetValue('Log.WebView.Keyword', '/ttmarkdown');
  }

  private _setMobilePanelModes(): void { this._applyMobilePanelDefaults(); }
  private _setTabletPortraitModes(): void { this._applyMobilePanelDefaults(); }
  private _setTabletLandscapeModes(): void { this._applyMobilePanelDefaults(); }
}
```

> **重要**: モバイル時はパネルのモード切替（`Alt+M` 等）を無効化し、固定モードを維持してください。

---

## 段143: ボトムナビゲーション（モバイル共通）

`src/components/MobileNav.tsx` を作成してください。タブレット・スマホ共通で画面下部に固定表示します。

### 表示内容

パネル切り替えアイコンに加え、以下の操作ボタンを配置してください。

| ボタン | アイコン案 | 動作 |
|---|---|---|
| 音声入力 On/Off | 🎤 / 🔇 | `Application.Voice.Input` を `on`/`off` でトグル |
| 文字削除 | ⌫ | アクティブEditorにBackspaceを送信 |
| ペースト | 📋 | クリップボードからEditorにテキスト貼り付け |
| コピー | 📄 | Editor選択テキストをクリップボードにコピー |

```typescript
export function MobileNav({ app }: { app: TTApplication }) {
  const isVoiceOn = app.models.Status.GetValue('Application.Voice.Input') === 'on';

  const handleVoiceToggle = () =>
    app.models.Actions.Invoke('Application.Voice.Toggle', {});
  const handleDelete = () =>
    app.models.Actions.Invoke('Editor.Input.Backspace', {});
  const handlePaste = async () => {
    const text = await navigator.clipboard.readText();
    app.models.Actions.Invoke('Editor.Input.InsertText', { text });
  };
  const handleCopy = () =>
    app.models.Actions.Invoke('Editor.Input.CopySelection', {});

  return (
    <div className="mobile-bottom-nav">
      {/* 音声入力 */}
      <button className={`nav-btn ${isVoiceOn ? 'active' : ''}`}
              onClick={handleVoiceToggle}>{isVoiceOn ? '🔇' : '🎤'}</button>
      {/* 文字削除 */}
      <button className="nav-btn" onClick={handleDelete}>⌫</button>
      {/* ペースト */}
      <button className="nav-btn" onClick={handlePaste}>📋</button>
      {/* コピー */}
      <button className="nav-btn" onClick={handleCopy}>📄</button>
    </div>
  );
}
```

DefaultActions / DefaultEvents に以下を追加してください。

```typescript
// Actions
A('Application.Voice.Toggle', '音声入力トグル', async (ctx) => {
  const cur = models.Status.GetValue('Application.Voice.Input');
  models.Status.SetValue('Application.Voice.Input', cur === 'on' ? 'off' : 'on');
  return true;
});
A('Editor.Input.Backspace',     'Backspace送信',         async (ctx) => { /* Editor.execCommand('deleteLeft') */ return true; });
A('Editor.Input.InsertText',    'テキスト挿入',           async (ctx) => { /* Editor.executeEdits insert ctx.text */ return true; });
A('Editor.Input.CopySelection', '選択テキストをコピー',   async (ctx) => { /* navigator.clipboard.writeText */ return true; });
```

---

## 段144: タッチジェスチャーによるパネル切り替え

Phase07の `TouchGestureRecognizer` を拡張し、デバイス・向き別のスワイプ挙動を実装してください。

### スワイプ仕様

| デバイス | スワイプ方向 | 切り替え |
|---|---|---|
| タブレット縦置き | **上スワイプ** | `Shelf+Desk` → `Desk+System` へ（Systemが上に出る） |
| タブレット縦置き | **下スワイプ** | `Desk+System` → `Shelf+Desk` へ（Shelfが上に出る） |
| タブレット横置き | **左スワイプ** | `Index+Desk` → `Desk+Log` へ（Logが左に出る） |
| タブレット横置き | **右スワイプ** | `Desk+Log` → `Index+Desk` へ（Indexが左に出る） |
| スマホ | **左スワイプ** | `Index` → `Desk` → `Log` の順に表示 |
| スマホ | **右スワイプ** | `Log` → `Desk` → `Index` の順に表示 |

### フォーカス方針
- **Deskには常にフォーカスがある**（`Application.Current.Panel` は常に `Desk`）
- Shelf / Index / System / Log への操作は **ExPanelモード** として扱う
  - 例: IndexのTableをタップ → ExModeを `ExPanel:Index` に設定して操作

### DefaultEvents.ts への追加

```typescript
// --- モバイルスワイプ ---
// スマホ: 左右スワイプでパネル順に切り替え
E('*-*-*-*', '', 'SWIPE_LEFT',  'Mobile.Panel.SwipeNext');
E('*-*-*-*', '', 'SWIPE_RIGHT', 'Mobile.Panel.SwipePrev');
// タブレット縦置き: 上下スワイプで上パネル切り替え
E('*-*-*-*', '', 'SWIPE_UP',    'Mobile.Panel.SwipeUp');
E('*-*-*-*', '', 'SWIPE_DOWN',  'Mobile.Panel.SwipeDown');
// ロングプレス: コンテキストメニュー
E('*-*-*-*',    '', 'PanelTitle_LONGPRESS', 'Request.PanelTitle.ContextMenu');
E('*-Editor-*-*', '', 'LONGPRESS', 'Request.Editor.ContextMenu');
E('*-Table-*-*',  '', 'LONGPRESS', 'Request.Table.ContextMenu');
```

### DefaultActions.ts への追加

```typescript
A('Mobile.Panel.SwipeNext', 'スマホ: 次パネル表示', async (ctx) => {
  // layout='mobile': Index→Desk→Log の順にスワイプ表示
  // layout='tablet-landscape': Index+Desk ↔ Desk+Log を切り替え
  return true;
});
A('Mobile.Panel.SwipePrev', 'スマホ: 前パネル表示', async (ctx) => { return true; });
A('Mobile.Panel.SwipeUp',   'タブレット縦: 上パネル切り替え', async (ctx) => {
  // Shelf+Desk → Desk+System (`.swipe-visible` クラスを付け替え)
  return true;
});
A('Mobile.Panel.SwipeDown', 'タブレット縦: 下パネル切り替え', async (ctx) => { return true; });
```

---

## 段145: スマートフォン向けエディター調整

モバイルデバイスでのMonaco Editor使用上の問題を解決してください。

- スマートフォン（`isMobile()`）では Monaco の代わりに **`<textarea>` ベースのシンプルなエディター**を使用
  - 理由: MonacoはモバイルIME・仮想キーボードとの相性が悪い
- タブレット（`isTablet()`）では Monaco をそのまま使用
- 切り替えは `EditorView.tsx` 内で `deviceUtils.isMobile()` で判定
- モバイル時はパネルのモードが Editor 固定のため、`textarea` エディターが常に表示される

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

**PC:**
- [ ] 全7パネルが3カラムで表示されること
- [ ] ボトムナビゲーションが非表示であること

**タブレット縦置き（iPad縦等）:**
- [ ] ShelfとDeskが上下2分割で表示されること
- [ ] ShelfパネルがTableモード・Memos一覧表示であること
- [ ] SystemパネルがWebViewモード・`/ttmarkdown`表示であること
- [ ] 上スワイプでSystemが上に表示（Shelf非表示）になること
- [ ] 下スワイプでShelfが上に戻ること

**タブレット横置き（iPad横等）:**
- [ ] IndexとDeskが左右2分割で表示されること
- [ ] IndexパネルがTableモード・Memos一覧表示であること
- [ ] LogパネルがWebViewモード・`/ttmarkdown`表示であること
- [ ] 左スワイプでLogが左に表示（Index非表示）になること
- [ ] 右スワイプでIndexが左に戻ること

**スマートフォン（iPhone/Android）:**
- [ ] DeskパネルのみZenモード（全画面）で表示されること
- [ ] DeskがEditorモード固定であること
- [ ] 左右スワイプで Index ↔ Desk ↔ Log が切り替わること
- [ ] Desk以外（Index/Log）のタップ操作がExPanelモード扱いになること

**ボトムナビゲーション（タブレット・スマホ共通）:**
- [ ] 🎤 ボタンで音声入力のOn/Offが切り替わること
- [ ] ⌫ ボタンでEditorの文字が削除されること
- [ ] 📋 ボタンでクリップボードのテキストがEditorに貼り付けられること
- [ ] 📄 ボタンでEditorの選択テキストがコピーされること

**共通:**
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
