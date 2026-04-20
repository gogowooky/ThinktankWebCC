# Phase 11: AIチャット・コンテキスト・対話トリガー

> **補足資料**: 本フェーズの実装時は **[appendix_ai_context_triggers.md](./appendix_ai_context_triggers.md)** も必ず併せてAIに渡してください。
> AIコンテキストソース（Google Drive フォルダ、NotebookLM ノートブック等）の詳細設計、
> DriveContextService の実装仕様、コンテキスト設定UI、ContextGatherer のトークン予算管理が記載されています。
> 本ファイルの段119〜126を実装した後、appendix の段125b〜125f を続けて実装してください。

## 前提条件
- Phase 01〜10 が完了していること
- `@google/generative-ai` がバックエンドにインストール済み（npm install @google/generative-ai）
- GCPプロジェクトで Gemini API が有効化されていること
- （Claude API併用の場合）`@anthropic-ai/sdk` がインストール済み、`ANTHROPIC_API_KEY` が設定済み

## このフェーズの目標
Gemini API / Claude API を使用したAIチャット機能を実装する。チャット履歴はTTChats/TTChatコレクションとしてBigQueryに保存し、TTMemosとは独立して管理する。
さらに、AIに渡すコンテキストソース（Google Driveフォルダ、NotebookLM等）の基盤と設定UIを構築する。

> **注意**: 本ファイルは refactor_plan1 の Phase 09 をベースとしています。
> 「Firestore」の記述は「BigQuery（Phase 02 で構築済み）」に読み替えてください。
> APIエンドポイントは `/api/bq/chats` 等、Phase 02 で追加した BigQuery ルートを使用します。

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
  // BigQuery: tt_chats テーブルを使用
  public async SyncWithBigQuery(): Promise<boolean>
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
  // BigQueryに保存
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
- [ ] チャット履歴がBigQueryに保存され、リロード後も復元されること
- [ ] `Alt+A` で現在表示しているメモをコンテキストとしてAIに送信できること
- [ ] AI返答のMarkdownが正しく表示されること

---

**前フェーズ**: [Phase 08: メモ管理・全文検索](./phase08_memo_search.md)
**次フェーズ**: [Phase 10: Google Drive連携](./phase10_gdrive.md)
