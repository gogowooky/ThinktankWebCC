# Phase 08: メモ管理・全文検索

## 前提条件
- Phase 01〜07 が完了していること

## このフェーズの目標
メモのCRUD全体を安定させ、全文検索を改善する。カレンダーやキーワードタグ機能を整備する。

---

## 段111: メモ一覧のFirestore同期の完成

`src/models/TTMemos.ts` の `SyncWithFirestore` を完成させてください。

フロー:
1. `/api/memos`（一覧取得APIを呼ぶ、IDとタイトルと更新日のみ）
2. 既存のキャッシュと比較して追加・更新・削除
3. 変更があれば `NotifyUpdated()` を呼ぶ
4. 成功したらローカルストレージキャッシュも更新

**重要**: メモ本文（Content）は必要になるまで取得しません（遅延ロード）。

---

## 段112: メモ保存デバウンスの完成

メモ保存の1分デバウンスを完全に実装してください。

```typescript
// TTMemo.ts
private static _pendingSaves: Map<string, ReturnType<typeof setTimeout>> = new Map();

public scheduleSave(): void {
  const key = this.ID;
  if (TTMemo._pendingSaves.has(key)) {
    clearTimeout(TTMemo._pendingSaves.get(key)!);
  }
  const timer = setTimeout(async () => {
    await this.SaveContent();
    TTMemo._pendingSaves.delete(key);
  }, 60000); // 60秒
  TTMemo._pendingSaves.set(key, timer);
}
```

ブラウザが閉じられる前に `beforeunload` イベントで即時保存も実装してください。

---

## 段113: メモ削除 / 復元機能

以下のActionを実装してください。

```typescript
A('Application.Memo.Delete', 'メモを削除', async (ctx) => {
  // 選択中メモのIDを取得
  // 確認ダイアログを表示
  // Firestoreから削除
  // TTMemosから削除
  // 次のメモをEditorに表示
  return true;
});
```

削除は物理削除ではなく、Firestoreの `deleted: true` フラグで論理削除にしてください。

---

## 段114: 全文検索の改善

`server/src/routes/ttsearchRoutes.ts` の全文検索を改善してください。

改善内容:
- Firestoreでは全文検索が困難なため、**バックエンドサイドで `content` フィールドをインメモリでフィルタリング**
- 件数制限: 最大200件
- スニペット: 検索語の前後100文字を最大5つ抽出
- 検索語のハイライト（`<strong>` タグで太字）

> 注: 将来的にはFirestore の拡張検索（Algolia/Elasticsearch）への移行も検討してください。

---

## 段115: キーワードタグの管理

`[Panel].Editor.Keywords` の複数行キーワードを管理する仕組みを完成させてください。

- Keywords（複数行）の更新ルール:
  - 追加テキストがKeywords内に含まれる場合 → その行を最終行に移動
  - 含まれない場合 → 最終行に追加
  - Keyword（単一行）= Keywordsのカーソル行のテキスト
- フォーカスが外れたとき: 空白行・重複行を自動削除

---

## 段116: ImportAction (/ttsearch以外のインポート)

以下のActionを追加してください。

```typescript
A('Application.Memo.ImportFromText', 'テキストからメモ作成', async (ctx) => {
  // DroppedDataのtext または クリップボードのテキストを
  // 新規メモとして作成し、Editorに表示する
  return true;
});
```

---

## 段117: カレンダー表示用TTEventsコレクション

`src/models/TTEvents_.ts`（カレンダーイベント）を作成してください。

```typescript
export class TTEvents_ extends TTCollection {
  constructor() {
    super();
    this.ItemSaveProperties = 'ID,Name,EventDate,Category';
    this.ListProperties = 'ID,EventDate,Name,Category';
    this.ColumnMapping = 'ID:ID,EventDate:日時,Name:タイトル,Category:カテゴリ';
    this.ColumnMaxWidth = 'ID:18,EventDate:18,Name:50,Category:15';
  }
  // Firestore: /tt_events を使用
}
```

イベントの作成・表示は TTMemo のパターンと同様。Firestore APIは段27で実装済み。

---

## 段118: Phase08 動作確認チェックリスト

- [ ] メモ一覧がFirestoreから取得されてTableに表示されること
- [ ] メモ編集後1分で自動保存、ブラウザを閉じる前に即時保存が動作すること
- [ ] メモの論理削除が動作し、一覧から消えること
- [ ] 全文検索で複数のキーワードが含まれるメモが検索できること
- [ ] Keywords欄の追加・重複削除が正しく動作すること

---

**前フェーズ**: [Phase 07: イベント・アクションシステム統合](./phase07_event_action.md)
**次フェーズ**: [Phase 09: AIチャット機能](./phase09_ai_chat.md)

---
---

# Phase 09: AIチャット機能

## 前提条件
- Phase 01〜08 が完了していること
- `@google/generative-ai` がバックエンドにインストール済み（npm install @google/generative-ai）
- GCPプロジェクトで Gemini API が有効化されていること

## このフェーズの目標
Gemini APIを使용した AIチャット機能を実装する。チャット履歴はTTChats/TTChatコレクションとしてFirestoreに保存し、TTMemosとは独立して管理する。

---

## 段119: TTChatクラスの実装

`src/models/TTChat.ts` を作成してください。

```typescript
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export class TTChat extends TTObject {
  public Title: string = '';
  public Messages: ChatMessage[] = [];
  public IsLoaded: boolean = false;
  public Category: string = 'Chat';
  public UpdateDate: string = '';

  async LoadMessages(): Promise<void>
  async AddMessage(role: 'user' | 'assistant', content: string): Promise<void>
}
```

---

## 段120: TTChatsコレクションの実装

`src/models/TTChats.ts` を作成してください。

```typescript
export class TTChats extends TTCollection {
  constructor() {
    super();
    this.ItemSaveProperties = 'ID,Title,UpdateDate';
    this.ListProperties = 'ID,UpdateDate,Title';
    this.ColumnMapping = 'ID:チャットID,Title:タイトル,UpdateDate:更新日';
    this.ColumnMaxWidth = 'ID:18,Title:50,UpdateDate:18';
  }
  // Firestore: /tt_chats コレクションを使用
  public async SyncWithFirestore(): Promise<boolean>
  protected CreateChildInstance(): TTChat { return new TTChat(); }
}
```

TTModels に `Chats: TTChats` を追加してください。

---

## 段121: (バックエンド) Gemini APIサービスの実装

`server/src/services/geminiService.ts` を作成してください。

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

export const geminiService = {
  async sendMessage(
    messages: { role: string; content: string }[],
    systemPrompt?: string
  ): Promise<string> {
    const chat = model.startChat({
      history: messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      })),
      systemInstruction: systemPrompt,
    });
    const result = await chat.sendMessage(messages.at(-1)!.content);
    return result.response.text();
  }
};
```

`server/.env` に `GEMINI_API_KEY=xxx` を追加してください。

---

## 段122: チャットAPIの完成

段26で作成した `/api/chats/:id/messages` を完成させてください。

```
POST /api/chats/:id/messages
  body: { message: string, systemPrompt?: string }
  → Gemini APIにメッセージを送信
  → 返ってきた返答をtt_chatsに保存
  → { reply: string, messageId: string } を返す
```

---

## 段123: ChatパネルUIの実装

Chatパネルのモードとしてチャット専用UIを作成してください。

`src/components/ChatView.tsx`:

```typescript
interface ChatViewProps {
  chatId: string | null;
  messages: ChatMessage[];
  onSend: (message: string) => Promise<void>;
  isLoading: boolean;
}
```

- メッセージ一覧（スクロール可）
- 入力欄（複数行テキストエリア）+ 送信ボタン
- ユーザーメッセージと AI返答の区別表示（色・アイコン）
- Markdownレンダリング（AI返答はMarkdownで表示）
- 送信中はスピナー表示

---

## 段124: AIチャット用Actionの実装

```typescript
A('Chat.Send', 'メッセージ送信', async (ctx) => {
  // Chatパネルの入力欄のテキストを取得
  // /api/chats/:id/messages にPOST
  // 返答をメッセージ一覧に追加
  // 入力欄をクリア
  return true;
});

A('Chat.New', '新規チャットセッション', async (ctx) => {
  // 新規TTChatを作成
  // Firestoreに保存
  // Chatパネルを新規チャット表示に切り替え
  return true;
});

A('Chat.Open', '既存チャットを開く', async (ctx) => {
  // TableでチャットセッションをダブルクリックするとChatViewを表示
  return true;
});
```

---

## 段125: メモ内容をコンテキストに含めるAI機能

Editorに現在表示中のメモをAIチャットのコンテキストとして渡す機能を追加してください。

```typescript
A('Chat.SendWithMemoContext', 'メモをAIコンテキストとして送信', async (ctx) => {
  // DeskパネルのEditorの現在の内容を取得
  // メモ内容をsystemPromptまたは先頭メッセージとして付与
  // AIに質問を送信
  return true;
});
```

DefaultEvents.ts に追加:
```typescript
E('*-*-*-*', 'Alt', 'A', 'Chat.SendWithMemoContext');
```

---

## 段126: Phase09 動作確認チェックリスト

- [ ] ChatパネルのTableに既存チャットセッション一覧が表示されること
- [ ] 新規チャットを作成してメッセージを送信し、AI返答が表示されること
- [ ] チャット履歴がFirestoreに保存され、リロード後も復元されること
- [ ] `Alt+A` で現在表示しているメモをコンテキストとしてAIに送信できること
- [ ] AI返答のMarkdownが正しく表示されること

---

**前フェーズ**: [Phase 08: メモ管理・全文検索](./phase08_memo_search.md)
**次フェーズ**: [Phase 10: Google Drive連携](./phase10_gdrive.md)
