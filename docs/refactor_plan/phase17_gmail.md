# Phase 17: Gmail連携

## 前提条件
- Phase 01〜16 が完了していること
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