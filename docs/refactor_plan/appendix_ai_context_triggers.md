# Phase 11 / Phase 12 拡張: AIコンテキストソースと対話トリガー

## 概要

AI対話の質を高めるため、2つの拡張を行う:

1. **AIコンテキストソース**: Google Drive特定フォルダ、NotebookLMノートブック、現在のメモを参照資料としてAIに渡す
2. **AI対話トリガー**: リマインダー / アラート・お知らせ / ユーザー質問 の3種類の起点からチャットに遷移するUI

---

## Part A: AIコンテキストソース

### A1. コンテキストソースの種類

| ソース | 内容 | 取得方法 |
|---|---|---|
| **現在のメモ** | Deskパネルで表示中のメモ本文 | 既存（段125で実装済み） |
| **Google Driveフォルダ** | 指定フォルダ内の文書群 | Drive API（Phase 10のDriveService拡張） |
| **NotebookLMノートブック** | エクスポートされたノートブック | ①Drive経由でソース文書取得、または②手動エクスポートしてBQ保存 |
| **関連メモ群** | ベクトル検索で類似メモ | Phase 17のEmbeddingService |
| **タグ指定メモ群** | 指定タグのメモ一覧 | BQ検索 |

### A2. コンテキスト設定モデル

`src/models/TTAIContext.ts` を作成:

```typescript
export type ContextSourceType = 'memo' | 'drive_folder' | 'notebook' | 'related' | 'tagged';

export interface AIContextSource {
  id: string;
  type: ContextSourceType;
  name: string;              // 表示名（例: "Stomagen研究フォルダ"）
  enabled: boolean;
  config: {
    // drive_folder
    driveFolderId?: string;  // Google DriveのフォルダID
    driveFolderName?: string;
    maxFiles?: number;       // フォルダ内の最大取得件数（デフォルト: 10）
    fileTypes?: string[];    // 対象ファイル種別 ['doc','pdf','txt','md']

    // notebook
    notebookSourceIds?: string[];  // NotebookLMのソース文書のDrive IDs
    notebookExportId?: string;     // エクスポート済みノートブックのBQ ID

    // related
    similarityThreshold?: number;  // 類似度閾値（0.0-1.0）
    maxRelated?: number;           // 最大件数

    // tagged
    tags?: string[];               // 対象タグ
    maxTagged?: number;
  };
}

export class TTAIContext extends TTObject {
  public Sources: AIContextSource[] = [];

  // 設定をBQに保存（category='AIContext'で管理）
  async save(): Promise<void>
  async load(): Promise<void>

  // 有効なソースからコンテキストテキストを収集
  async gatherContext(): Promise<ContextChunk[]>
}

export interface ContextChunk {
  sourceType: ContextSourceType;
  sourceName: string;
  title: string;
  content: string;       // テキスト本文（トークン制限のため切り詰め済み）
  tokenEstimate: number; // おおよそのトークン数
}
```

### A3. Google Driveフォルダからのコンテキスト取得

`server/services/DriveContextService.ts` を作成:

```typescript
export class DriveContextService {
  private drive: any; // googleapis drive v3

  /**
   * 指定フォルダ内の文書一覧を取得
   */
  async listDocuments(folderId: string, maxFiles: number = 10): Promise<DriveDocument[]> {
    const res = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed = false and (
        mimeType = 'application/vnd.google-apps.document' or
        mimeType = 'application/pdf' or
        mimeType = 'text/plain' or
        mimeType = 'text/markdown'
      )`,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: maxFiles
    });
    return res.data.files || [];
  }

  /**
   * Google Docの本文をテキストとして取得
   */
  async getDocumentContent(fileId: string, mimeType: string): Promise<string> {
    if (mimeType === 'application/vnd.google-apps.document') {
      // Google Doc → プレーンテキストとしてexport
      const res = await this.drive.files.export({
        fileId,
        mimeType: 'text/plain'
      });
      return res.data as string;
    }
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      // テキストファイル → 直接取得
      const res = await this.drive.files.get({
        fileId,
        alt: 'media'
      });
      return res.data as string;
    }
    if (mimeType === 'application/pdf') {
      // PDF → テキスト抽出（pdf-parseライブラリ使用）
      // トークン節約のため最初の5000文字まで
      return await this.extractPdfText(fileId);
    }
    return '';
  }

  /**
   * フォルダ内の全文書をコンテキストとして収集
   */
  async gatherFolderContext(folderId: string, maxFiles: number = 10, maxCharsPerFile: number = 3000): Promise<ContextChunk[]> {
    const docs = await this.listDocuments(folderId, maxFiles);
    const chunks: ContextChunk[] = [];

    for (const doc of docs) {
      const content = await this.getDocumentContent(doc.id, doc.mimeType);
      chunks.push({
        sourceType: 'drive_folder',
        sourceName: doc.name,
        title: doc.name,
        content: content.substring(0, maxCharsPerFile),
        tokenEstimate: Math.ceil(content.substring(0, maxCharsPerFile).length / 3)
      });
    }
    return chunks;
  }
}
```

### A4. NotebookLMノートブックの取り込み

NotebookLMには公開APIがないため、以下の2つの方法で対応:

**方法1: ソース文書参照（推奨）**
NotebookLMに投入した元の文書はGoogle Driveに存在するため、
その文書のDrive IDを `AIContextSource.config.notebookSourceIds` に登録し、
DriveContextService で取得する。

**方法2: エクスポート取り込み**
NotebookLMの「ノート」や「サマリー」をテキストとしてコピーし、
TT Standの専用メモ（category='Notebook'）として保存。
AIコンテキストとしてはこのメモを参照する。

```typescript
// NotebookLMソース参照用のAction
A('AI.Context.AddNotebookSources', 'NotebookLMソースを追加', async (ctx) => {
  // Drive Picker UIを開き、NotebookLMのソース文書を選択
  // 選択された文書のDrive IDを AIContextSource に登録
  return true;
});

// NotebookLMエクスポート取り込み用のAction
A('AI.Context.ImportNotebookExport', 'NotebookLMエクスポート取り込み', async (ctx) => {
  // テキスト入力ダイアログを表示
  // 貼り付けられたテキストをcategory='Notebook'のTTMemoとして保存
  // AIContextSource に登録
  return true;
});
```

### A5. コンテキスト収集とAIプロンプトへの注入

`src/services/ai/ContextGatherer.ts` を作成:

```typescript
export class ContextGatherer {
  private _aiContext: TTAIContext;
  private _tokenBudget: number = 30000; // AIに渡す最大トークン数

  /**
   * 有効なすべてのコンテキストソースからテキストを収集し、
   * トークン予算内に収まるよう優先順位付けして返す
   */
  async gather(): Promise<string> {
    const chunks: ContextChunk[] = [];

    for (const source of this._aiContext.Sources) {
      if (!source.enabled) continue;

      switch (source.type) {
        case 'memo':
          chunks.push(await this._gatherCurrentMemo());
          break;
        case 'drive_folder':
          chunks.push(...await this._gatherDriveFolder(source));
          break;
        case 'notebook':
          chunks.push(...await this._gatherNotebook(source));
          break;
        case 'related':
          chunks.push(...await this._gatherRelatedMemos(source));
          break;
        case 'tagged':
          chunks.push(...await this._gatherTaggedMemos(source));
          break;
      }
    }

    // トークン予算内に収まるよう切り詰め
    return this._buildContextPrompt(chunks);
  }

  private _buildContextPrompt(chunks: ContextChunk[]): string {
    let totalTokens = 0;
    const included: string[] = [];

    // 優先順位: memo > notebook > drive_folder > related > tagged
    const priority: ContextSourceType[] = ['memo', 'notebook', 'drive_folder', 'related', 'tagged'];
    const sorted = chunks.sort((a, b) =>
      priority.indexOf(a.sourceType) - priority.indexOf(b.sourceType)
    );

    for (const chunk of sorted) {
      if (totalTokens + chunk.tokenEstimate > this._tokenBudget) break;
      included.push(`--- ${chunk.sourceName} (${chunk.sourceType}) ---\n${chunk.content}`);
      totalTokens += chunk.tokenEstimate;
    }

    if (included.length === 0) return '';

    return `以下はユーザーの参照資料です。回答時にこれらの情報を活用してください。\n\n${included.join('\n\n')}`;
  }
}
```

### A6. コンテキスト設定UI

`src/components/AI/AIContextSettings.tsx` を作成:

```typescript
// コンテキストソースの管理画面
// CommandPalette or 専用設定パネルで表示

interface AIContextSettingsProps {
  sources: AIContextSource[];
  onAdd: (source: AIContextSource) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (id: string, config: Partial<AIContextSource>) => void;
}

// UI構成:
// ┌─────────────────────────────────────────┐
// │ AIコンテキスト設定                        │
// ├─────────────────────────────────────────┤
// │ ☑ 現在のメモ                    [既定]   │
// │ ☑ Stomagen研究フォルダ    [Drive] [編集]  │
// │ ☑ ペプチド設計NB          [NB]   [編集]  │
// │ ☐ Split enzyme論文        [Drive] [編集]  │
// │ ☑ 関連メモ (類似度0.7+)   [自動]  [編集]  │
// ├─────────────────────────────────────────┤
// │ [+ Driveフォルダ追加]                     │
// │ [+ NotebookLMソース追加]                  │
// │ [+ タグ指定メモ追加]                      │
// └─────────────────────────────────────────┘
```

TTStatus に設定を追加:
```typescript
S.RegisterState('AI.Context.Sources', {
  Default: () => JSON.stringify([
    { id: 'current_memo', type: 'memo', name: '現在のメモ', enabled: true, config: {} }
  ])
});
```

バックエンドAPIに追加:
```
GET  /api/ai/context/sources         — ソース一覧取得
POST /api/ai/context/sources         — ソース追加
PUT  /api/ai/context/sources/:id     — ソース更新
DELETE /api/ai/context/sources/:id   — ソース削除
GET  /api/ai/context/gather          — コンテキスト収集（全有効ソースからテキスト取得）
POST /api/drive/folder/list          — Driveフォルダ内のファイル一覧
POST /api/drive/folder/content       — Driveフォルダ内文書のテキスト取得
```

---

## Part B: AI対話トリガーと統合UI

### B1. 3種類のトリガー

| トリガー | 起動者 | タイミング | 例 |
|---|---|---|---|
| **1. リマインダー** | ユーザーが設定 | 指定日時に発火 | 「3日後にStomagen進捗を確認」 |
| **2. アラート/お知らせ** | AI Facilitator | 条件検出時に自動発火 | 「1年前のメモ」「パターン検出」 |
| **3. ユーザー質問** | ユーザーが直接 | 任意のタイミング | 「このメモの要約を教えて」 |

すべてのトリガーは最終的に**Chatパネルでの対話**に遷移する。

### B2. TTReminder モデル

`src/models/TTReminder.ts` を作成:

```typescript
export type ReminderStatus = 'pending' | 'fired' | 'snoozed' | 'dismissed';

export class TTReminder extends TTObject {
  public Title: string = '';           // リマインダー内容
  public FireAt: string = '';          // 発火日時 (ISO 8601)
  public RepeatRule: string = '';      // 繰り返し規則 ('none'|'daily'|'weekly'|'monthly')
  public RelatedMemoId: string = '';   // 関連メモID（あれば）
  public Status: ReminderStatus = 'pending';
  public AIPrompt: string = '';        // 発火時にAIに送るプロンプト（オプション）

  public override get ClassName(): string { return 'TTReminder'; }

  get isFired(): boolean {
    return this.Status === 'pending' && new Date(this.FireAt) <= new Date();
  }
}

export class TTReminders extends TTCollection {
  constructor() {
    super();
    this.ItemSaveProperties = 'ID,Title,FireAt,RepeatRule,RelatedMemoId,Status,UpdateDate';
    this.ListProperties = 'Status,FireAt,Title,RelatedMemoId';
    this.ColumnMapping = 'Status:状態,FireAt:予定日時,Title:内容,RelatedMemoId:関連メモ';
    this.ColumnMaxWidth = 'Status:8,FireAt:18,Title:50,RelatedMemoId:18';
  }
  protected CreateChildInstance(): TTReminder { return new TTReminder(); }

  // 発火すべきリマインダーを取得
  getFiredReminders(): TTReminder[] {
    return this.GetItems()
      .filter(r => (r as TTReminder).isFired)
      .sort((a, b) => (a as TTReminder).FireAt.localeCompare((b as TTReminder).FireAt)) as TTReminder[];
  }
}
```

BigQueryテーブル:
```sql
CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.thinktank.tt_reminders` (
  id STRING NOT NULL,
  title STRING,
  fire_at TIMESTAMP NOT NULL,
  repeat_rule STRING DEFAULT 'none',
  related_memo_id STRING,
  status STRING DEFAULT 'pending',
  ai_prompt STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### B3. トリガー監視ループ

`src/services/ai/TriggerMonitor.ts` を作成:

```typescript
export class TriggerMonitor {
  private _checkInterval: number | null = null;

  start(): void {
    // 1分ごとにチェック
    this._checkInterval = window.setInterval(() => {
      this._checkTriggers();
    }, 60 * 1000);

    // 起動時にも即座にチェック
    this._checkTriggers();
  }

  stop(): void {
    if (this._checkInterval) clearInterval(this._checkInterval);
  }

  private async _checkTriggers(): void {
    // 1. リマインダーチェック
    await this._checkReminders();

    // 2. AI Facilitatorアラートチェック（Phase 18のSuggestions）
    await this._checkAlerts();
  }

  private async _checkReminders(): void {
    const reminders = models.Reminders.getFiredReminders();
    for (const reminder of reminders) {
      // ChatパネルにNotification Card表示
      this._showNotification({
        type: 'reminder',
        title: '⏰ リマインダー',
        body: reminder.Title,
        relatedMemoId: reminder.RelatedMemoId,
        aiPrompt: reminder.AIPrompt,
        actions: [
          { label: 'チャットを開始', action: 'open_chat' },
          { label: '30分後に再通知', action: 'snooze_30' },
          { label: '明日再通知', action: 'snooze_1day' },
          { label: '完了', action: 'dismiss' }
        ]
      });

      reminder.Status = 'fired';
      // 繰り返し設定の場合は次回を計算
      if (reminder.RepeatRule !== 'none') {
        this._scheduleNext(reminder);
      }
    }
  }

  private async _checkAlerts(): void {
    const suggestions = models.Suggestions.getActiveSuggestions();
    for (const suggestion of suggestions) {
      // 既に通知済みでなければNotification Card表示
      if (!suggestion.notified) {
        this._showNotification({
          type: 'alert',
          title: this._getAlertIcon(suggestion.Type) + ' ' + suggestion.Title,
          body: suggestion.Body,
          relatedMemoId: suggestion.RelatedMemoIds.split(',')[0],
          actions: [
            { label: 'チャットで深堀り', action: 'open_chat' },
            { label: 'メモを開く', action: 'open_memo' },
            { label: '後で', action: 'snooze' },
            { label: '却下', action: 'dismiss' }
          ]
        });
        suggestion.notified = true;
      }
    }
  }

  private _getAlertIcon(type: string): string {
    switch (type) {
      case 'anniversary': return '📅';
      case 'recall': return '💡';
      case 'pattern': return '🔍';
      case 'socratic': return '💭';
      case 'digest': return '📊';
      default: return '🔔';
    }
  }
}
```

### B4. 統合Notification UI（Chatパネル内）

`src/components/AI/NotificationCenter.tsx` を作成:

```typescript
// Chatパネルの上部に常駐するNotificationエリア

export interface Notification {
  id: string;
  type: 'reminder' | 'alert' | 'user_question';
  title: string;
  body: string;
  timestamp: string;
  relatedMemoId?: string;
  aiPrompt?: string;        // この通知からチャット開始時のAIプロンプト
  contextSources?: string[];// この通知に関連するコンテキストソース
  actions: NotificationAction[];
  read: boolean;
}

export interface NotificationAction {
  label: string;
  action: 'open_chat' | 'open_memo' | 'snooze_30' | 'snooze_1day' | 'snooze' | 'dismiss';
}

// Chatパネルのレイアウト:
// ┌──────────────────────────────────────┐
// │ 🔔 通知 (3件)               [すべて表示] │
// ├──────────────────────────────────────┤
// │ ⏰ リマインダー                         │
// │ 「Stomagen進捗確認」                    │
// │ [チャット開始] [30分後] [完了]           │
// ├──────────────────────────────────────┤
// │ 📅 1年前のメモ                          │
// │ 「Split enzyme初期調査メモ」            │
// │ [チャットで深堀り] [メモを開く] [却下]   │
// ├──────────────────────────────────────┤
// │                                        │
// │ （チャット領域）                         │
// │ User: このメモの要約を教えて              │
// │ AI: このメモは...                       │
// │                                        │
// ├──────────────────────────────────────┤
// │ 📎コンテキスト: 現在のメモ + 研究フォルダ │
// │ [入力欄]                    [送信] 🎤   │
// └──────────────────────────────────────┘
```

### B5. 通知→チャット遷移

通知の「チャットを開始」「チャットで深堀り」ボタンを押した時の処理:

```typescript
A('AI.Notification.OpenChat', '通知からチャットを開始', async (ctx) => {
  const notification = ctx.Sender as Notification;

  // 1. 新規チャットセッション作成
  const chat = models.Chats.AddNewChat();

  // 2. コンテキスト収集
  const contextGatherer = new ContextGatherer();
  const context = await contextGatherer.gather();

  // 3. 通知固有のプロンプトがあれば付与
  let systemPrompt = `あなたはユーザーの知識ベースアプリ「TT Stand」のAIアシスタントです。
ユーザーの過去のメモや参照資料を踏まえて、記憶の想起と判断の支援を行ってください。`;

  if (context) {
    systemPrompt += `\n\n${context}`;
  }

  // 4. 通知の内容に応じた初期メッセージ
  let initialMessage = '';
  switch (notification.type) {
    case 'reminder':
      initialMessage = `リマインダー「${notification.body}」について確認しましょう。`;
      if (notification.relatedMemoId) {
        const memo = models.Memos.GetItem(notification.relatedMemoId) as TTMemo;
        if (memo?.Content) {
          initialMessage += `\n\n関連メモ:\n${memo.Content.substring(0, 500)}`;
        }
      }
      break;
    case 'alert':
      initialMessage = notification.body;
      break;
  }

  if (initialMessage) {
    // AIに初期メッセージを自動送信
    await chat.AddMessage('user', initialMessage);
    const reply = await aiApiService.complete({
      system: systemPrompt,
      user: initialMessage
    });
    await chat.AddMessage('assistant', reply);
  }

  // 5. Chatパネルに表示
  const app = TTApplication.Instance;
  const chatPanel = app.getPanel('Chat');
  models.Status.SetValue('Chat.Current.Mode', 'Chat');
  models.Status.SetValue('Chat.Chat.Resource', chat.ID);

  return true;
});
```

### B6. ユーザー質問UI

チャット入力欄の拡張:

```typescript
// ChatInputBar.tsx
// 入力欄の下にコンテキスト表示エリアを追加

interface ChatInputBarProps {
  onSend: (message: string) => void;
  onVoiceInput: () => void;
  contextSources: AIContextSource[];
}

// UI:
// ┌──────────────────────────────────────┐
// │ 📎 コンテキスト:                       │
// │  ✓現在のメモ  ✓研究フォルダ  ✓関連メモ  │
// │  [コンテキスト設定...]                  │
// ├──────────────────────────────────────┤
// │ [メッセージを入力...]       [送信] [🎤] │
// └──────────────────────────────────────┘

// Alt+Enter でメモコンテキスト付き送信
// Ctrl+Enter で通常送信（コンテキストなし）
```

### B7. リマインダー作成UI

```typescript
A('AI.Reminder.Create', 'リマインダー作成', async (ctx) => {
  // CommandPaletteを利用した簡易入力
  // または専用モーダル
  return true;
});

A('AI.Reminder.CreateFromMemo', '現在のメモにリマインダー設定', async (ctx) => {
  // 現在表示中のメモIDを RelatedMemoId に自動設定
  // 日時選択のみ入力
  return true;
});

// メモ内の [Remind:2026-04-01] タグからリマインダーを自動作成
A('AI.Reminder.ParseFromContent', 'メモ内のリマインダータグを解析', async (ctx) => {
  // TTRequest で [Remind:yyyy-mm-dd] パターンをマッチ
  // マッチしたら自動的にTTReminder作成
  return true;
});
```

リマインダー作成モーダル:
```
┌─────────────────────────────────┐
│ リマインダー設定                  │
├─────────────────────────────────┤
│ 内容: [Stomagen進捗確認      ]  │
│ 日時: [2026-04-01] [09:00]     │
│ 繰り返し: [なし ▼]              │
│ 関連メモ: [現在のメモ ✓]        │
│ AI質問: [進捗状況をまとめて  ]   │
│         (発火時にAIに自動送信)   │
├─────────────────────────────────┤
│           [キャンセル] [設定]    │
└─────────────────────────────────┘
```

DefaultEvents:
```typescript
E('*-*-*-*', 'Alt', 'R', 'AI.Reminder.Create');
E('*-*-*-*', 'Alt+Shift', 'R', 'AI.Reminder.CreateFromMemo');
```

TTRequests に追加:
```typescript
R('Remind', 'リマインダー', '\\[Remind:([\\d-]+)\\]');
```

### B8. Chatパネルのモード拡張

現在のChatパネルを以下の3つのサブモードに分割:

```typescript
export type ChatSubMode = 'notifications' | 'chat' | 'reminders';

S.RegisterState('Chat.SubMode', { Default: () => 'notifications' });
```

サブモード切替タブ:
```
[ 🔔 通知 (3) | 💬 チャット | ⏰ リマインダー ]
```

| サブモード | 表示内容 |
|---|---|
| 通知 | アラート・リマインダー発火のNotification Card一覧 |
| チャット | AIチャット（既存のChatView + コンテキスト表示） |
| リマインダー | 設定済みリマインダーのTable一覧 |

---

## Part C: TTAction / TTEvent の追加一覧

### Actions

```typescript
// コンテキスト設定
A('AI.Context.Settings', 'AIコンテキスト設定を開く', ...);
A('AI.Context.AddDriveFolder', 'Driveフォルダをコンテキストに追加', ...);
A('AI.Context.AddNotebookSources', 'NotebookLMソースを追加', ...);
A('AI.Context.AddTaggedMemos', 'タグ指定メモをコンテキストに追加', ...);
A('AI.Context.Toggle', 'コンテキストソースの有効/無効切替', ...);

// リマインダー
A('AI.Reminder.Create', 'リマインダー作成', ...);
A('AI.Reminder.CreateFromMemo', '現在のメモにリマインダー設定', ...);
A('AI.Reminder.Snooze', 'リマインダーを再通知', ...);
A('AI.Reminder.Dismiss', 'リマインダーを完了', ...);
A('AI.Reminder.ParseFromContent', 'メモ内リマインダータグ解析', ...);

// 通知
A('AI.Notification.OpenChat', '通知からチャット開始', ...);
A('AI.Notification.OpenMemo', '通知から関連メモを開く', ...);
A('AI.Notification.DismissAll', '全通知を消去', ...);

// チャット（既存拡張）
A('Chat.SendWithContext', 'コンテキスト付きメッセージ送信', ...);
A('Chat.SubMode.Notifications', '通知タブに切替', ...);
A('Chat.SubMode.Chat', 'チャットタブに切替', ...);
A('Chat.SubMode.Reminders', 'リマインダータブに切替', ...);
```

### Events

```typescript
E('*-*-*-*', 'Alt', 'R', 'AI.Reminder.Create');
E('*-*-*-*', 'Alt+Shift', 'R', 'AI.Reminder.CreateFromMemo');
E('*-*-*-*', 'Alt', 'C', 'AI.Context.Settings');
E('*-*-*-*', 'Alt', 'N', 'Chat.SubMode.Notifications');
```

---

## Part D: フェーズへの組み込み

### Phase 09★ への追加段

| 段 | 内容 |
|---|---|
| 段125b | AIコンテキストソース基盤（TTAIContext, ContextGatherer） |
| 段125c | DriveContextService（Driveフォルダからのコンテキスト取得） |
| 段125d | NotebookLMソース連携 |
| 段125e | コンテキスト設定UI（AIContextSettings.tsx） |
| 段125f | コンテキスト付きチャット送信（ChatInputBar拡張） |

### Phase 18☆ への追加段

| 段 | 内容 |
|---|---|
| 段268b | TTReminder / TTReminders モデル |
| 段268c | TriggerMonitor（リマインダー + アラート監視ループ） |
| 段268d | NotificationCenter UI（Chatパネル上部） |
| 段268e | 通知→チャット遷移（AIプロンプト自動構築） |
| 段268f | リマインダー作成UI + メモ内タグ解析 |
| 段268g | Chatパネルのサブモード分割（通知/チャット/リマインダー） |

### BigQueryテーブル追加（Phase 14★）

```sql
-- tt_reminders
-- tt_ai_context_sources（コンテキスト設定の永続化）
```

### TTModels 追加

```typescript
public Reminders: TTReminders;      // Phase 18 段268b
public AIContext: TTAIContext;       // Phase 09 段125b
```
