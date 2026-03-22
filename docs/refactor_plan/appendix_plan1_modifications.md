# refactor_plan1 既存フェーズの変更点

> このドキュメントは refactor_plan1 の既存フェーズ(★マーク)のうち、
> TT Stand 構想に合わせて変更・拡張すべき箇所をまとめています。
> 変更がないフェーズ（Phase 01〜08, 07B, 11, 13）は refactor_plan1 をそのまま使用してください。

---

## Phase 09★: AIチャット機能 → AI基盤＋Facilitator準備

### 変更概要
refactor_plan1では Gemini API のみ。Claude API対応と、AI Facilitator用の共通基盤を追加。

### 変更箇所

**段119: TTChatクラス** — 変更なし

**段120: TTChatsコレクション** — 変更なし

**段121: AIチャットバックエンドAPI** — 以下を追加:

```typescript
// server/services/AIApiService.ts
// Gemini と Claude の両方に対応する統一APIラッパー

export interface AICompletionRequest {
  system: string;
  user: string;
  maxTokens?: number;
  model?: 'gemini' | 'claude';  // ☆追加: モデル選択
}

export class AIApiService {
  async complete(req: AICompletionRequest): Promise<string> {
    if (req.model === 'claude') {
      return this._callClaude(req);
    }
    return this._callGemini(req);
  }

  private async _callGemini(req: AICompletionRequest): Promise<string> {
    // 既存のGemini実装
  }

  private async _callClaude(req: AICompletionRequest): Promise<string> {
    // ☆追加: Claude API呼び出し
    // npm install @anthropic-ai/sdk
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: req.maxTokens || 1024,
      system: req.system,
      messages: [{ role: 'user', content: req.user }]
    });
    return response.content[0].text;
  }
}
```

**段122: AIチャットUI** — 変更なし

**段123: メモコンテキスト送信** — 変更なし

**段124〜126** — 以下を追加:

```typescript
// ☆追加: AI設定の状態管理
S.RegisterState('AI.Model', { Default: () => 'gemini' }); // 'gemini' | 'claude'
S.RegisterState('AI.ApiKey.Gemini', { Default: () => '' });
S.RegisterState('AI.ApiKey.Claude', { Default: () => '' });

// ☆追加: モデル切替Action
A('AI.Model.Toggle', 'AIモデル切替', async (ctx) => {
  const current = models.Status.GetValue('AI.Model');
  models.Status.SetValue('AI.Model', current === 'gemini' ? 'claude' : 'gemini');
  return true;
});
```

環境変数に追加:
```
ANTHROPIC_API_KEY=sk-ant-xxx
```

---

## Phase 10★: Google Drive連携 → メディアストレージ強化

### 変更概要
refactor_plan1ではテキストファイルのD&D保存のみ。メディアファイル（画像・音声・動画）の
サムネイル生成、メタデータ抽出、TTEntry連携を追加。

### 変更箇所

**段127-129: DriveService、アップロードAPI、ドロップAction** — 基本は変更なし

**段130: ビジュアルフィードバック** — 以下を追加:

```typescript
// ☆追加: メディアタイプに応じたサムネイル生成
// server/services/ThumbnailService.ts
export class ThumbnailService {
  async generateThumbnail(file: Buffer, mimeType: string): Promise<string> {
    if (mimeType.startsWith('image/')) {
      // sharp ライブラリで200x200リサイズ → DataURL
    }
    if (mimeType.startsWith('video/')) {
      // ffmpeg で先頭フレーム抽出 → リサイズ → DataURL
    }
    if (mimeType.startsWith('audio/')) {
      // デフォルトの音声アイコンを返す
    }
    return defaultThumbnail;
  }
}
```

**☆追加: 段130b: TTEntry自動作成**

ファイルドロップ時にTTEntry（Phase 16）も同時に作成するようにActionを拡張:

```typescript
// Application.Drop.Default の拡張
A('Application.Drop.Default', 'ファイルドロップ処理', async (ctx) => {
  // ...既存のGoogle Drive保存処理...

  // ☆追加: TTEntry作成
  if (models.Entries) {
    const entry = new TTEntry();
    entry.EntryType = detectEntryType(file.type); // 'image' | 'audio' | 'video' | 'file'
    entry.SourceDevice = 'pc';
    entry.Name = file.name;
    entry.Content = `[${entry.EntryType}] ${file.name}`;
    entry.Metadata = {
      entry_type: entry.EntryType,
      source_device: 'pc',
      media_url: driveResult.webViewLink,
      media_thumbnail: thumbnail,
      mime_type: file.type,
      file_size: file.size
    };
    models.Entries.AddItem(entry);
  }
  return true;
});
```

---

## Phase 12★: スマートフォン・タブレット対応 → PWA Share Target追加

### 変更概要
refactor_plan1のレスポンシブ対応に加え、PWA Share Target と
モバイルからのクイックキャプチャUIを追加。

### 変更箇所

**段140-147** — 基本は変更なし

**☆追加: 段147b: モバイル用ボトムナビのキャプチャボタン**

```typescript
// BottomNavigation.tsx の拡張
// 既存: 音声入力ON/OFF、文字削除、ペースト、コピー
// ☆追加: 📷 写真キャプチャ、📍 位置メモ、🎤 音声クイックメモ
```

**☆追加: 段147c: PWA Share Target基盤**

manifest.json への share_target 追加（詳細は Phase 21 段320）。
ただし受信側の簡易処理だけここで実装し、本格的なキャプチャパイプラインは Phase 21 で完成させる。

---

## Phase 14★: BigQuery移行 → 拡張テーブル設計

### 変更概要
refactor_plan1の5テーブルに加え、TT Stand用の4テーブルを追加設計に含める。

### 変更箇所

**段158: テーブル設計** — 以下を追加:

```sql
-- ☆追加: tt_entries テーブル（統一エントリー）
CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.thinktank.tt_entries` (
  id STRING NOT NULL,
  name STRING,
  entry_type STRING NOT NULL DEFAULT 'text',
  source_device STRING DEFAULT 'pc',
  content STRING,
  keywords STRING,
  metadata JSON,
  deleted BOOL DEFAULT FALSE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- ☆追加: tt_embeddings テーブル（Embeddingメタデータ）
CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.thinktank.tt_embeddings` (
  id STRING NOT NULL,
  entry_id STRING NOT NULL,
  model_name STRING,
  dimensions INT64,
  embedding ARRAY<FLOAT64>,
  created_at TIMESTAMP
);

-- ☆追加: tt_suggestions テーブル（AI提案履歴）
CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.thinktank.tt_suggestions` (
  id STRING NOT NULL,
  type STRING NOT NULL,
  title STRING,
  body STRING,
  related_memo_ids JSON,
  priority INT64 DEFAULT 50,
  dismissed BOOL DEFAULT FALSE,
  acted_on BOOL DEFAULT FALSE,
  created_at TIMESTAMP
);

-- ☆追加: tt_digests テーブル（ダイジェスト）
CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.thinktank.tt_digests` (
  id STRING NOT NULL,
  period STRING NOT NULL,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  summary STRING,
  topics JSON,
  total_entries INT64,
  highlight_memo_ids JSON,
  created_at TIMESTAMP
);
```

**段159以降: CRUD API** — 新テーブルへのAPI追加は各フェーズで段階的に実装。
Phase 14 ではテーブル作成とバックエンドルーティングの雛形のみ準備する。

---

## 共通変更: 環境変数の追加

Phase 13（デプロイ）の段150で設定すべき環境変数一覧に以下を追加:

```
# TT Stand 追加分
ANTHROPIC_API_KEY=sk-ant-xxx         # Claude API
OPENAI_API_KEY=sk-xxx                # Embedding API（OpenAI使用時）
VECTOR_STORE_TYPE=bigquery           # bigquery | pgvector | qdrant
PGVECTOR_CONNECTION_STRING=xxx       # pgvector使用時
QDRANT_URL=xxx                       # Qdrant使用時
QDRANT_API_KEY=xxx                   # Qdrant使用時
```
