# Phase 02: バックエンドAPI・Firestore設計

## 前提条件
- Phase 01 が完了していること
- GCPプロジェクトで Firestore (Native モード) が有効化されていること
- バックエンドに `@google-cloud/firestore` がインストール済み

## このフェーズの目標
TTCollection毎に独立したFirestoreコレクションを設計し、メモ（TTMemos）のCRUD APIを実装する。フロントエンドからメモの読み書きができる状態を作る。

---

## 段21: Firestoreコレクション設計

以下のコレクション構造をドキュメントとして `docs/firestore_schema.md` に記録してください。

```
Firestore コレクション一覧:

/tt_memos/{memoId}   ← TTMemosコレクション（メモ）
  - id: string
  - name: string (タイトル)
  - content: string (本文)
  - keywords: string
  - category: string = "Memo"
  - updatedAt: Timestamp
  - createdAt: Timestamp

/tt_chats/{chatId}   ← TTChatsコレクション（AIチャット履歴）
  - id: string
  - title: string
  - messages: array (各メッセージ)
  - createdAt: Timestamp
  - updatedAt: Timestamp

/tt_events/{eventId}   ← TTEventsコレクション（イベント）
  - id: string
  - name: string
  - content: string
  - eventDate: Timestamp
  - category: string
  - updatedAt: Timestamp

/tt_editings/{editingId}   ← TTEditingsコレクション（編集設定）
  - id: string  (= memoId)
  - foldingLines: string
  - caretPos: string
  - wordWrap: boolean
  - keywords: string
  - keywordColor: string
  - updatedAt: Timestamp

/tt_status/{key}   ← TTStatusコレクション（アプリ状態永続化）
  - key: string
  - value: string
  - updatedAt: Timestamp
```

---

## 段22: Firestoreサービスクラスの実装

`server/src/services/firestoreService.ts` を完成させてください。

```typescript
import { Firestore, Timestamp } from '@google-cloud/firestore';

export class FirestoreService {
  private db: Firestore;

  constructor() {
    this.db = new Firestore({ projectId: process.env.GCP_PROJECT_ID });
  }

  // 汎用CRUD
  async getDocument(collection: string, id: string): Promise<any | null>
  async setDocument(collection: string, id: string, data: any): Promise<void>
  async deleteDocument(collection: string, id: string): Promise<void>
  async listDocuments(collection: string, filters?: {field:string, op:string, value:any}[]): Promise<any[]>
  async queryDocuments(collection: string, field: string, searchText: string): Promise<any[]>
}

export const firestoreService = new FirestoreService();
```

---

## 段23: メモAPIルート実装

`server/src/routes/memosRoutes.ts` を作成してください。

```
GET  /api/memos         → メモ一覧取得（IDとタイトルと更新日のみ）
GET  /api/memos/:id     → 特定メモの本文取得
POST /api/memos         → メモ新規作成
PUT  /api/memos/:id     → メモ更新
DELETE /api/memos/:id   → メモ削除
```

- 各エンドポイントで firestoreService を使用
- エラー時は `{ error: 'message' }` と適切なHTTPステータスを返す
- `server/src/index.ts` に `app.use('/api/memos', memosRouter)` を追加

---

## 段24: メモID生成ルール

メモのIDは以下のフォーマットで生成する関数 `generateMemoId()` を `server/src/utils/idGenerator.ts` に実装してください。

```
フォーマット: yyyy-mm-dd-HHmmss
例: 2026-03-16-143022
```

```typescript
export function generateMemoId(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const HH = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${HH}${min}${ss}`;
}
```

---

## 段25: 全文検索APIの実装

`server/src/routes/searchRoutes.ts` を作成してください。

```
GET /api/search?q=キーワード&limit=50
```

- Firestoreの `tt_memos` コレクションを対象に検索
- `name`（タイトル）と `content`（本文）を対象
- Firestoreは全文検索が弱いため、クライアント側フィルタリングを主体とする暫定実装で可
- 返却形式:
```json
{
  "results": [
    {
      "id": "2026-03-16-143022",
      "name": "タイトル",
      "snippet": "...検索語を含む前後50文字...",
      "updatedAt": "2026-03-16-143022"
    }
  ]
}
```

### 動作確認項目
- `http://localhost:3001/api/memos` にアクセスしてJSONが返ること（Firestoreに接続できていれば空配列 `[]` でOK）
- `POST /api/memos` でメモを作成し、`GET /api/memos/:id` で取得できること

---

## 段26: チャットAPIルート実装

`server/src/routes/chatsRoutes.ts` を作成してください。

```
GET  /api/chats         → チャットセッション一覧
GET  /api/chats/:id     → 特定チャットの取得
POST /api/chats         → チャット新規作成
PUT  /api/chats/:id     → チャット更新
DELETE /api/chats/:id   → チャット削除
POST /api/chats/:id/messages → メッセージ追加（Gemini AI呼び出し含む）
```

Gemini API呼び出し部分はこの段では `{ reply: "（AI返答 placeholder）" }` を返すスタブで構いません。

---

## 段27: イベントAPIルート実装

`server/src/routes/eventsRoutes.ts` を作成してください。

```
GET  /api/events              → イベント一覧（日付フィルタ対応）
GET  /api/events/:id          → 特定イベント取得
POST /api/events              → イベント作成
PUT  /api/events/:id          → イベント更新
DELETE /api/events/:id        → イベント削除
```

イベントの `eventDate` フィールドでの範囲フィルタ（`?from=yyyy-mm-dd&to=yyyy-mm-dd`）をサポートしてください。

---

## 段28: 編集設定APIルート実装

`server/src/routes/editingsRoutes.ts` を作成してください。

```
GET  /api/editings/:memoId    → 特定メモの編集設定取得
PUT  /api/editings/:memoId    → 編集設定の保存・更新
```

IDはメモIDと対応させます（`tt_editings/{memoId}`）。

---

## 段29: APIルーターの統合

`server/src/routes/index.ts` を作成し、全ルートを統合してください。

```typescript
import { Router } from 'express';
import memosRouter from './memosRoutes';
import chatsRouter from './chatsRoutes';
import eventsRouter from './eventsRoutes';
import editingsRouter from './editingsRoutes';
import searchRouter from './searchRoutes';

const router = Router();
router.use('/memos', memosRouter);
router.use('/chats', chatsRouter);
router.use('/events', eventsRouter);
router.use('/editings', editingsRouter);
router.use('/search', searchRouter);

export default router;
```

`server/src/index.ts` を `app.use('/api', router)` に統合してください。

---

## 段30: バックエンドエラーハンドリング

`server/src/middleware/errorHandler.ts` を作成してください。

```typescript
export function errorHandler(err, req, res, next) {
  console.error('[API Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
}
```

`server/src/index.ts` の末尾に `app.use(errorHandler)` を追加してください。

---

## 段31: フロントエンドAPIサービス実装

`src/services/apiService.ts` を作成してください。

```typescript
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export const apiService = {
  // メモ
  async getMemos(): Promise<MemoListItem[]>
  async getMemo(id: string): Promise<MemoDetail>
  async createMemo(data: Partial<MemoDetail>): Promise<MemoDetail>
  async updateMemo(id: string, data: Partial<MemoDetail>): Promise<MemoDetail>
  async deleteMemo(id: string): Promise<void>
  // 検索
  async search(query: string): Promise<SearchResult[]>
  // チャット
  async getChats(): Promise<ChatSession[]>
  async sendMessage(chatId: string, message: string): Promise<ChatMessage>
};
```

---

## 段32: ローカルストレージキャッシュ戦略

フロントエンドのキャッシュ戦略を実装してください。

```typescript
// src/services/cacheService.ts

export class CacheService {
  private prefix = 'TT_';

  set(key: string, data: any, ttlMinutes = 60): void
  get<T>(key: string): T | null
  clear(key: string): void
  clearAll(): void
}

export const cacheService = new CacheService();
```

キャッシュキー一覧:
- `TT_memos_list` — メモ一覧（ID・タイトル・更新日）
- `TT_memo_{id}` — 各メモの本文
- `TT_chats_list` — チャット一覧

---

## 段33: レート制限・保存デバウンス

`src/utils/debounce.ts` を作成してください。

```typescript
// 60秒のデバウンスで重複保存を防ぐ
export function createDebounce(delayMs = 60000) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return function debounce(key: string, fn: () => void) {
    if (timers.has(key)) {
      clearTimeout(timers.get(key)!);
    }
    const timer = setTimeout(() => {
      fn();
      timers.delete(key);
    }, delayMs);
    timers.set(key, timer);
  };
}

export const memoSaveDebounce = createDebounce(60000); // 60秒
```

---

## 段34: バックエンド認証ミドルウェア（将来拡張用）

`server/src/middleware/auth.ts` を作成してください。現段階では認証をスキップするスタブ実装で構いません。

```typescript
export function authMiddleware(req, res, next) {
  // 将来: Firebase Auth / Google OAuth のトークン検証
  // 現段階は全アクセスを許可
  next();
}
```

ただし、環境変数 `AUTH_ENABLED=true` のときのみ検証を有効化するプレースホルダーを用意してください。

---

## 段35: Phase02 動作確認チェックリスト

- [ ] `GET /api/memos` が `[]`（または既存データ）を返すこと
- [ ] `POST /api/memos` → `GET /api/memos/{id}` でメモの作成・取得が動作すること
- [ ] `PUT /api/memos/{id}` → `DELETE /api/memos/{id}` で更新・削除が動作すること
- [ ] `GET /api/search?q=xxx` が検索結果を返すこと
- [ ] `GET /api/chats`, `GET /api/events` がそれぞれ応答すること
- [ ] フロントエンドの apiService から `/api/memos` を呼び出して結果を console に表示できること

---

**前フェーズ**: [Phase 01: プロジェクト基盤・環境構築](./phase01_foundation.md)
**次フェーズ**: [Phase 03: コアUIフレームワーク](./phase03_ui_framework.md)
