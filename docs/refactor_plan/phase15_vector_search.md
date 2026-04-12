# Phase 15: ベクトル検索・セマンティックサーチ

## 前提条件
- Phase 13（統一エントリーモデル）、Phase 14（Google Drive）が完了していること
- Embedding API（OpenAI text-embedding-3-small、Google text-embedding-004、またはClaude）が利用可能なこと

## このフェーズの目標
全文検索（キーワード一致）に加えて、意味的類似検索（セマンティックサーチ）を実装する。
「あの時考えたこと」のような曖昧な検索や、表現は異なるが概念が近いメモの発見を可能にする。

---

## 段240: Embeddingサービスの実装

`server/services/EmbeddingService.ts` を作成してください。

```typescript
export class EmbeddingService {
  // テキストをベクトルに変換
  async embed(text: string): Promise<number[]> {
    // OpenAI text-embedding-3-small (1536次元)
    // または Google textembedding-gecko (768次元)
    // または Sentence-Transformers (ローカル実行)
  }

  // 複数テキストを一括ベクトル化
  async embedBatch(texts: string[]): Promise<number[][]>
}
```

---

## 段241: ベクトルストアの選定と実装

`server/services/VectorStoreService.ts` を作成してください。

**推奨選択肢（3つから1つを選択）**:

A) **pgvector (PostgreSQL拡張)** — 既存のCloud SQLがあれば最も手軽
```typescript
export class PgVectorStore {
  async upsert(id: string, vector: number[], metadata: Record<string, any>): Promise<void>
  async search(queryVector: number[], limit: number): Promise<VectorSearchResult[]>
  async delete(id: string): Promise<void>
}
```

B) **Qdrant (専用ベクトルDB)** — 高性能だが追加インフラが必要
```typescript
// Qdrant Cloud (SaaS) を使えばインフラ管理不要
```

C) **BigQuery VECTOR_SEARCH** — 追加インフラ不要だがリアルタイム性に劣る
```sql
-- tt_embeddings テーブル
CREATE TABLE `{PROJECT_ID}.thinktank.tt_embeddings` (
  entry_id STRING NOT NULL,
  embedding ARRAY<FLOAT64>,
  model_name STRING,
  created_at TIMESTAMP
);

-- ベクトル検索
SELECT entry_id, ML.DISTANCE(embedding, @query_vector, 'COSINE') as distance
FROM `thinktank.tt_embeddings`
ORDER BY distance ASC
LIMIT 10;
```

> **推奨**: 初期段階ではC（BigQuery）で開始し、レスポンス速度が問題になったらA（pgvector）に移行

---

## 段242: Embedding生成パイプライン

メモ保存時に自動でEmbeddingを生成・保存するパイプラインを実装してください。

```typescript
// server/services/EmbeddingPipeline.ts
export class EmbeddingPipeline {
  async processEntry(entryId: string, content: string): Promise<void> {
    // 1. コンテンツを適切な長さに切り詰め（トークン制限）
    const truncated = content.substring(0, 8000);
    // 2. Embedding生成
    const vector = await embeddingService.embed(truncated);
    // 3. ベクトルストアに保存
    await vectorStore.upsert(entryId, vector, { title: entry.Name });
  }
}
```

バックエンドAPIに追加:
```
POST /api/embeddings/generate   — 単一エントリーのEmbedding生成
POST /api/embeddings/batch      — 全エントリーの一括Embedding生成
GET  /api/embeddings/search?q=  — セマンティック検索
```

---

## 段243: セマンティック検索APIの実装

```typescript
// server/routes/embeddingRoutes.ts
router.get('/api/embeddings/search', async (req, res) => {
  const query = req.query.q as string;
  const limit = parseInt(req.query.limit as string) || 10;

  // 1. クエリテキストをベクトル化
  const queryVector = await embeddingService.embed(query);

  // 2. ベクトルストアで類似検索
  const results = await vectorStore.search(queryVector, limit);

  // 3. 結果にメモのメタデータを付与
  const enriched = await enrichWithMetadata(results);

  res.json({ results: enriched });
});
```

---

## 段244: フロントエンドの検索UI統合

`SearchApp.tsx` にセマンティック検索モードを追加してください。

```typescript
// SearchApp.tsx に検索モード切替を追加
type SearchMode = 'fulltext' | 'semantic' | 'hybrid';

// hybrid: まずセマンティック検索で候補を取得し、
//         次に全文検索の結果とマージして表示
```

TTAction追加:
```typescript
A('Application.Search.Semantic', 'セマンティック検索', async (ctx) => {
  // セマンティック検索モードで /ttsearch を開く
});
```

---

## 段245: Embedding一括生成Action

```typescript
A('AI.Embedding.BatchAll', '全エントリーのEmbedding一括生成', async (ctx) => {
  // 未Embedding化のエントリーを全件取得
  // バッチでEmbedding生成（API レート制限考慮）
  // 進捗をStatusBarに表示
});
```

---

## 段246: TTEmbeddingsメタデータ管理

`src/models/TTEmbeddings.ts` を作成してください。

```typescript
export class TTEmbedding extends TTObject {
  public EntryId: string = '';
  public ModelName: string = '';
  public Dimensions: number = 0;
  public override get ClassName(): string { return 'TTEmbedding'; }
}

export class TTEmbeddings extends TTCollection {
  constructor() {
    super();
    this.ItemSaveProperties = 'ID,EntryId,ModelName,Dimensions,UpdateDate';
  }
  protected CreateChildInstance(): TTEmbedding { return new TTEmbedding(); }
}
```

---

## 段247〜254: Phase 17 動作確認チェックリスト

- [ ] **段240**: Embeddingサービスがテキストをベクトル化できること
- [ ] **段241**: ベクトルストアにupsert/searchが動作すること
- [ ] **段242**: メモ保存時にEmbeddingが自動生成されること
- [ ] **段243**: セマンティック検索APIが動作すること
- [ ] **段244**: SearchAppでセマンティック検索が選択・実行できること
- [ ] **段245**: 一括Embedding生成が動作すること
- [ ] 曖昧な検索（「以前考えた研究アイデア」等）で関連メモが見つかること
- [ ] AI Facilitatorの関連メモリコール（Phase 18）がベクトル検索を活用できること

---

**前フェーズ**: Phase 14 (Google Drive連携)
**次フェーズ**: Phase 16 (出力モード拡張)
