# Phase 02: BigQuery データ基盤（拡張テーブル含む）

## 前提条件
- Phase 01 が完了していること
- GCPプロジェクトで BigQuery API が有効化されていること
- `@google-cloud/bigquery` がバックエンドにインストール済み:
  ```
  cd server && npm install @google-cloud/bigquery
  ```

## このフェーズの目標
データストアを Firestore から BigQuery に切り替える。  
TTCollection毎に独立したBigQueryテーブルを作成し、CRUD APIとページネーション付き一覧取得、高速全文検索を実装する。

> **注意**: このフェーズは Phase02（Firestore版）の**代替**です。  
> Firestore版がすでに動いている場合は「移行」として実施します。  
> Phase02 の段21〜35 を実施していない場合は、段21のスキーマ設計から読み替えて実施してください。

---

## 段158: BigQueryデータセット・テーブル設計

GCPコンソールまたは `bq` コマンドで以下のデータセットとテーブルを作成してください。

**データセット名**: `thinktank`（リージョン: `asia-northeast1`）

```sql
-- tt_memos テーブル
CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.thinktank.tt_memos` (
  id STRING NOT NULL,
  name STRING,
  content STRING,
  keywords STRING,
  category STRING DEFAULT 'Memo',
  deleted BOOL DEFAULT FALSE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- tt_chats テーブル
CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.thinktank.tt_chats` (
  id STRING NOT NULL,
  title STRING,
  messages JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- tt_events テーブル
CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.thinktank.tt_events` (
  id STRING NOT NULL,
  name STRING,
  content STRING,
  event_date TIMESTAMP,
  category STRING,
  deleted BOOL DEFAULT FALSE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- tt_editings テーブル (memo_id が主キー相当)
CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.thinktank.tt_editings` (
  memo_id STRING NOT NULL,
  folding_lines STRING,
  caret_pos STRING,
  word_wrap BOOL,
  keywords STRING,
  keyword_color STRING,
  updated_at TIMESTAMP
);

-- tt_gmails テーブル
CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.thinktank.tt_gmails` (
  message_id STRING NOT NULL,
  subject STRING,
  from_address STRING,
  received_at TIMESTAMP,
  snippet STRING,
  body STRING,
  saved_as_memo_id STRING,
  synced_at TIMESTAMP
);
```

ドキュメントとして `docs/bigquery_schema.md` に上記スキーマを記録してください。

---

## 段159: BigQueryサービスクラスの実装

`server/src/services/bigqueryService.ts` を作成してください。

```typescript
import { BigQuery } from '@google-cloud/bigquery';

export class BigQueryService {
  private bq: BigQuery;
  private dataset: string;
  private projectId: string;

  constructor() {
    this.projectId = process.env.GCP_PROJECT_ID!;
    this.dataset = process.env.BQ_DATASET || 'thinktank';
    this.bq = new BigQuery({ projectId: this.projectId });
  }

  // 汎用SELECT（ページネーション付き）
  async select(
    table: string,
    fields: string = '*',
    where: string = '',
    orderBy: string = 'updated_at DESC',
    limit: number = 1000,
    offset: number = 0
  ): Promise<any[]>

  // 1件取得
  async selectOne(table: string, id: string): Promise<any | null>

  // INSERT（存在しなければ）またはUPDATE（存在すれば）= MERGE
  async upsert(table: string, idField: string, id: string, data: Record<string, any>): Promise<void>

  // 論理削除
  async softDelete(table: string, id: string): Promise<void>

  // 全文検索（LIKE検索）
  async fullTextSearch(
    table: string,
    searchText: string,
    fields: string[] = ['name', 'content'],
    limit: number = 200
  ): Promise<any[]>
}

export const bigqueryService = new BigQueryService();
```

---

## 段160: BiqQuery MERGE（upsert）の実装

BigQueryはUPDATE/INSERTを `MERGE` 文で行います。`upsert` メソッドを実装してください。

```typescript
async upsert(table: string, idField: string, id: string, data: Record<string, any>): Promise<void> {
  const fullTable = `\`${this.projectId}.${this.dataset}.${table}\``;
  const fields = Object.keys(data);
  const values = Object.values(data);

  // BigQueryパラメータクエリでSQLインジェクション対策
  const setClause = fields.map(f => `T.${f} = S.${f}`).join(', ');
  const insertFields = [idField, ...fields].join(', ');
  const insertValues = ['S._id', ...fields.map(f => `S.${f}`)].join(', ');

  const query = `
    MERGE ${fullTable} T
    USING (SELECT @id AS _id, ${fields.map((f, i) => `@p${i} AS ${f}`).join(', ')}) S
    ON T.${idField} = S._id
    WHEN MATCHED THEN UPDATE SET ${setClause}
    WHEN NOT MATCHED THEN INSERT (${insertFields}) VALUES (${insertValues})
  `;

  const params = { id, ...Object.fromEntries(fields.map((f, i) => [`p${i}`, values[i]])) };
  await this.bq.query({ query, params });
}
```

---

## 段161: メモAPIのBigQuery版実装

`server/src/routes/memosRoutes.ts` をBigQuery版に書き換えてください。

```typescript
// GET /api/memos?limit=1000&offset=0
// → tt_memos からページネーション付きで一覧取得（content は除く）
router.get('/', async (req, res) => {
  const limit = Number(req.query.limit) || 1000;
  const offset = Number(req.query.offset) || 0;
  const rows = await bigqueryService.select(
    'tt_memos',
    'id, name, keywords, updated_at',  // content は除外
    "deleted = FALSE AND category = 'Memo'",
    'updated_at DESC',
    limit,
    offset
  );
  res.json({ memos: rows, limit, offset });
});

// GET /api/memos/:id → content を含む1件取得
router.get('/:id', async (req, res) => {
  const row = await bigqueryService.selectOne('tt_memos', req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST /api/memos → 新規作成
router.post('/', async (req, res) => {
  const id = generateMemoId();
  const now = new Date().toISOString();
  const data = { name: req.body.name || id, content: req.body.content || '',
    keywords: req.body.keywords || '', category: 'Memo', deleted: false,
    created_at: now, updated_at: now };
  await bigqueryService.upsert('tt_memos', 'id', id, data);
  res.json({ id, ...data });
});

// PUT /api/memos/:id → 更新
router.put('/:id', async (req, res) => {
  const data = { ...req.body, updated_at: new Date().toISOString() };
  await bigqueryService.upsert('tt_memos', 'id', req.params.id, data);
  res.json({ id: req.params.id, ...data });
});

// DELETE /api/memos/:id → 論理削除
router.delete('/:id', async (req, res) => {
  await bigqueryService.softDelete('tt_memos', req.params.id);
  res.json({ success: true });
});
```

---

## 段162: 全文検索APIのBigQuery版実装

`server/src/routes/searchRoutes.ts` をBigQuery版に書き換えてください。

```typescript
// GET /api/search?q=キーワード&limit=50
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Number(req.query.limit) || 50;
  if (!q) return res.json({ results: [] });

  // BiqQueryのLIKE検索（大文字小文字区別なし）
  const rows = await bigqueryService.fullTextSearch(
    'tt_memos', q, ['name', 'content'], limit
  );

  const results = rows.map(row => ({
    id: row.id,
    name: row.name,
    snippet: extractSnippet(row.content, q, 100),
    updatedAt: row.updated_at,
  }));
  res.json({ results });
});

// スニペット抽出ヘルパー
function extractSnippet(content: string, query: string, range: number): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, range * 2);
  const start = Math.max(0, idx - range);
  const end = Math.min(content.length, idx + query.length + range);
  return (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '');
}
```

`fullTextSearch` の実装:
```typescript
async fullTextSearch(table, searchText, fields, limit) {
  const fullTable = `\`${this.projectId}.${this.dataset}.${table}\``;
  const likeConditions = fields.map(f =>
    `LOWER(IFNULL(${f}, '')) LIKE LOWER(@searchPattern)`
  ).join(' OR ');
  const query = `
    SELECT * FROM ${fullTable}
    WHERE deleted = FALSE AND (${likeConditions})
    ORDER BY updated_at DESC
    LIMIT @limit
  `;
  const [rows] = await this.bq.query({
    query,
    params: { searchPattern: `%${searchText}%`, limit }
  });
  return rows;
}
```

---

## 段163: /ttsearch の BigQuery版実装

`server/src/routes/ttsearchRoutes.ts` をBigQuery版に書き換えてください。

BigQuery版のメリット: **全件インメモリロードが不要**。SQLで直接フィルタリングするため、60,000件でも高速。

```typescript
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.send(generateEmptyHtml());

  const rows = await bigqueryService.fullTextSearch(
    'tt_memos', q, ['name', 'content'], 100
  );

  // HTML生成（段92の実装と同様フォーマット）
  const html = generateSearchResultHtml(rows, q);
  res.send(html);
});
```

---

## 段164: チャット・イベント・編集設定のBigQuery版実装

`server/src/routes/chatsRoutes.ts`、`eventsRoutes.ts`、`editingsRoutes.ts` を BigQuery版に更新してください。

```typescript
// チャットのmessagesフィールドはJSON文字列で保存・取得
// BigQueryのJSONカラムを使用、またはSTRING型でJSON.stringify/parseする

// chats: POST /api/chats/:id/messages
// → 既存messagesをSELECT → messagesにpush → upsertで更新
```

**注意**: BigQueryはリアルタイム更新（ストリーミング挿入）に別料金がかかります。  
小規模（個人利用）ではDML（INSERT/UPDATE/MERGE）を使うのが無料枠内のため、このフェーズではDMLを使用します。

---

## 段165: ページネーション対応フロントエンド一覧取得

`src/models/TTMemos.ts` の `SyncWithBigQuery` をページネーション対応に更新してください。

```typescript
public async SyncWithBigQuery(): Promise<boolean> {
  const PAGE_SIZE = 1000;
  let offset = 0;
  let totalLoaded = 0;

  while (true) {
    const res = await fetch(`/api/memos?limit=${PAGE_SIZE}&offset=${offset}`);
    const { memos } = await res.json();
    if (!memos || memos.length === 0) break;

    for (const memo of memos) {
      // 既存があればスキップ、なければ追加
      if (!this.GetItem(memo.id)) {
        const m = new TTMemo();
        m.ID = memo.id;
        m.Name = memo.name;
        (m as any).UpdateDate = memo.updated_at;
        this.AddItem(m);
      }
    }

    totalLoaded += memos.length;
    this.NotifyUpdated();

    if (memos.length < PAGE_SIZE) break; // 最終ページ
    offset += PAGE_SIZE;
  }

  return true;
}
```

---

## 段166: 環境変数の追加

`server/.env` に BigQuery 用の環境変数を追加してください。

```
BQ_DATASET=thinktank
BQ_LOCATION=asia-northeast1
```

---

## 段167: Firestoreからのデータ移行スクリプト（既存データがある場合）

`scripts/migrate-firestore-to-bigquery.js` を作成してください。

```javascript
// Firestoreの全コレクションをBigQueryにエクスポートする移行スクリプト
// 実行: node scripts/migrate-firestore-to-bigquery.js

const { Firestore } = require('@google-cloud/firestore');
const { BigQuery } = require('@google-cloud/bigquery');

const db = new Firestore({ projectId: process.env.GCP_PROJECT_ID });
const bq = new BigQuery({ projectId: process.env.GCP_PROJECT_ID });
const DATASET = process.env.BQ_DATASET || 'thinktank';

async function migrateCollection(fsCollection, bqTable, transform) {
  console.log(`[Migration] ${fsCollection} → ${bqTable}`);
  const snapshot = await db.collection(fsCollection).get();
  const rows = snapshot.docs.map(doc => transform(doc.id, doc.data()));
  if (rows.length === 0) { console.log('No data.'); return; }
  await bq.dataset(DATASET).table(bqTable).insert(rows);
  console.log(`Inserted ${rows.length} rows into ${bqTable}`);
}

async function main() {
  await migrateCollection('tt_memos', 'tt_memos', (id, d) => ({
    id, name: d.name || '', content: d.content || '',
    keywords: d.keywords || '', category: d.category || 'Memo',
    deleted: false,
    created_at: d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    updated_at: d.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
  }));
  await migrateCollection('tt_chats', 'tt_chats', (id, d) => ({
    id, title: d.title || '', messages: JSON.stringify(d.messages || []),
    created_at: d.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    updated_at: d.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
  }));
  await migrateCollection('tt_editings', 'tt_editings', (memoId, d) => ({
    memo_id: memoId, folding_lines: d.foldingLines || '',
    caret_pos: d.caretPos || '', word_wrap: d.wordWrap || false,
    keywords: d.keywords || '', keyword_color: d.keywordColor || '',
    updated_at: new Date().toISOString(),
  }));
  console.log('Migration complete.');
}

main().catch(console.error);
```

---

## 段168: BigQuery版のコスト最適化設定

BigQuery利用コストを最小化するための設定を実施してください。

```typescript
// bigqueryService.ts に追加

// ① キャッシュ有効化（同一クエリを24時間キャッシュ）
// BigQueryはデフォルトでクエリキャッシュが有効 → 同一クエリは無料で再利用

// ② データスキャン量の最小化
// 一覧取得時にcontentを除外（最大の節約効果）
// 例: SELECT id, name, keywords, updated_at FROM ... （content除外で90%以上削減）

// ③ パーティション設定（60,000件以上になったら）
// updated_at カラムでパーティション分割するとスキャン量が激減
// → ALTER TABLE tt_memos SET OPTIONS (partition_expiration_days = null)
// ※ テーブル作成時にパーティション設定を追加する方が望ましい:
```

```sql
-- パーティション付きテーブル作成（60,000件以上の場合に推奨）
CREATE TABLE `{PROJECT_ID}.thinktank.tt_memos`
PARTITION BY DATE(updated_at)
AS SELECT * FROM `{PROJECT_ID}.thinktank.tt_memos_old`;
```

---

## 段169: Phase14 動作確認チェックリスト

- [ ] `bq ls {PROJECT_ID}:thinktank` でデータセットとテーブルが存在すること
- [ ] `POST /api/memos` でメモを作成し、BigQueryコンソールで確認できること
- [ ] `GET /api/memos` でページネーション付きで一覧が返ること
- [ ] `GET /api/search?q=キーワード` でBiqQueryを使った検索結果が返ること
- [ ] `/ttsearch?q=キーワード` でWebViewに検索結果が表示されること
- [ ] フロントエンドの `/ttsearch` 全文検索が60,000件相当でも3秒以内に結果を返すこと
- [ ] （移行がある場合）`migrate-firestore-to-bigquery.js` が正常に完了すること

---

## BigQuery vs Firestore 使い分けまとめ

| 用途 | BQ | FS |
|---|---|---|
| メモ本文の全文検索 | ✅ 推奨 | ❌ 苦手 |
| リアルタイム書き込み（高頻度） | ⚠️ DMLで対応 | ✅ 推奨 |
| 編集設定（頻繁な更新） | ⚠️ コスト注意 | ✅ 推奨 |
| 大量データ分析・集計 | ✅ 推奨 | ❌ 苦手 |
| ベクトル検索（AI検索） | ✅ 対応（VECTOR_SEARCH） | ✅ 対応 |

**ハイブリッド構成も可能**: 本文検索はBigQuery、編集設定（高頻度更新）はFirestoreというように使い分けることも有効です。

---

**前フェーズ**: [Phase 02: バックエンドAPI・Firestore設計](./phase02_backend.md)（置き換え）  
**次フェーズ**: [Phase 03: コアUIフレームワーク](./phase03_ui_framework.md)（BigQuery版でも変更不要）
