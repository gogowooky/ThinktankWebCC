# Phase 10: オフライン耐性（BQ正本 + SyncQueue）

## 前提条件
- Phase 01〜09 が完了していること
- IndexedDBStorageService と BigQueryStorageService が動作していること
- StorageManager が両ストレージを管理していること

## このフェーズの目標
**BQを正本（single source of truth）として維持したまま**、
ネットワーク非接続時もメモの閲覧・編集が可能で、未保存の変更が失われない状態を作る。

> **過去の教訓**: ローカル優先にした結果、リロードや多重起動でメモ更新分が消失する事例が多発した。
> Phase 15では**BQ優先を堅持**し、ローカルは「キャッシュ＋オフライン保管庫」として使用する。

### 3つの不変ルール

1. **オンライン時はBQが正**: Load/SaveともBQ第一。ローカルは高速キャッシュの役割
2. **編集中データは絶対に消さない**: IsDirty === true のメモはBQ同期で上書きしない
3. **未送信変更は永続化**: SyncQueueはIndexedDBに保存され、リロード・再起動後も消えない

> **詳細な変更差分は `phase15_gap_analysis.md` を参照**

---

## 段200: TTMemo.LoadContent のキャッシュ層追加

`src/models/TTMemo.ts` の `LoadContent()` を修正してください。

動作:
1. **オンライン**: BQ APIから取得（既存動作を維持）→ 成功時にIndexedDBキャッシュに書き込み
2. **BQ失敗 or オフライン**: IndexedDBキャッシュから読み取り
3. **キャッシュもない**: 空メモとして扱う

キャッシュ形式:
```typescript
// IndexedDB に保存するキー: `memo_content_${memoId}`
// 値: JSON文字列
{
  content: string;      // メモ本文
  updateDate: string;   // BQ上のUpdateDate（正本の日付を保持）
  cachedAt: number;     // キャッシュ時刻（デバッグ用）
}
```

**重要**: 既存の `_applyLoadedData()` ロジック（line 86-135のBQ応答解析）はそのまま維持し、
その直後に `_saveToLocalCache()` を呼ぶだけの最小変更とすること。

### 動作確認項目
- オンライン: 既存と同じ動作（BQから取得して表示）
- DevTools → Network → Offline にして既に開いたメモを再度開く → キャッシュから表示されること
- オフラインで未取得のメモを開く → エラーではなく空表示になること

---

## 段201: TTMemo.SaveContent のSyncQueue統合

`src/models/TTMemo.ts` の `SaveContent()` を修正してください。

動作:
1. **常に**: IndexedDBキャッシュを更新（即時・失敗しない）
2. **オンライン**: BQ APIに保存（既存動作）
   - 成功 → WebSocket通知（既存）+ SyncQueue該当エントリ削除
   - 失敗 → SyncQueueに追加
3. **オフライン**: SyncQueueに追加

SyncQueueデータ形式:
```typescript
// IndexedDB pendingChanges ストアに保存
{
  path: string;      // memo ID
  content: string;   // JSON.stringify({ file_id, title, file_type, category, content, updateDate })
  action: 'save';
  timestamp: number;
}
```

**重要**: `beforeunload` イベントで未保存メモの `_addToSyncQueue()` + `_saveToLocalCache()` を呼ぶこと。
これによりブラウザを閉じても未保存の変更がSyncQueueに残る。

### 動作確認項目
- オンライン: 既存と同じ動作（BQに保存される）
- オフラインでメモを編集・保存 → エラーにならず、StatusBarに「Pending」が表示されること
- オフラインで保存後にブラウザを閉じ→再度開く→SyncQueueに残っていること

---

## 段202: StorageManager の SyncQueue flush 実装

`src/services/storage/StorageManager.ts` を修正してください。

追加するメソッド:
- `flushSyncQueue()`: pendingChangesの全アイテムをBQに送信。同一ファイルは最新のみ送信
- `getPendingMemoIds()`: 未送信変更があるメモIDのSetを返す（SyncWithBigQuery保護用）
- `getPendingCount()`: 未送信件数を返す（StatusBar用）

`handleOnline()` を拡張:
```
Online復帰 → setStatus('syncing') → flushSyncQueue() → checkVersions() → setStatus('online')
```

### 動作確認項目
- オフラインでメモ編集 → ネットワーク復帰 → 自動的にBQに同期されること
- StatusBarが syncing → online に遷移すること
- BQ上のメモが最新内容に更新されていること（BigQueryコンソールで確認）

---

## 段203: TTMemos.SyncWithBigQuery のSyncQueue保護

`src/models/TTMemos.ts` の `SyncWithBigQuery()` を修正してください。

BQ同期処理の冒頭で `StorageManager.getPendingMemoIds()` を呼び、
未送信変更があるメモと `IsDirty` なメモはBQデータで上書きしない。

```typescript
// 既存メモの更新ループ内に追加
if (pendingMemoIds.has(file.file_id)) {
    // このメモはローカル変更がBQ未反映なので、BQ側のデータで上書きしない
    continue;
}
if ((memo as TTMemo).IsDirty) {
    // 現在エディタで編集中のメモを上書きしない
    continue;
}
// ... 既存の isServerNewer チェック（そのまま維持）...
```

### 動作確認項目
- オフラインでメモAを編集→オンライン復帰→SyncWithBigQuery実行→メモAの編集内容が消えないこと
- メモAの編集内容がBQに保存された後は、次回SyncWithBigQueryで正常に同期されること
- 編集していないメモBは通常通りBQから更新されること

---

## 段204: 衝突検出と保存

オフラインで編集中に別端末から同じメモが編集された場合の衝突処理。

`src/services/storage/ConflictResolver.ts` を作成してください。

```typescript
export class ConflictResolver {
  // SyncQueue flush時に衝突を検出
  async checkBeforeFlush(memoId: string, localUpdateDate: string): Promise<boolean> {
    // BQの最新UpdateDateを取得
    // localUpdateDate < BQ UpdateDate なら衝突
    return isConflict;
  }

  // 衝突時: ローカル版を別メモとして保存
  async saveConflictVersion(memoId: string, content: string): Promise<void> {
    // `${memoId}_conflict_${timestamp}` という新規メモを作成
    // 元メモはBQ版を正とする
  }
}
```

衝突時の動作:
1. BQ版をメインとして維持
2. ローカル版を `[元ID]_conflict_[日時]` という別メモとして保存
3. StatusBarに「衝突検出: N件」と通知
4. ユーザーが手動でマージまたはどちらかを削除

### 動作確認項目
- 2つのブラウザで同じメモを同時にオフライン編集→同時にオンライン復帰→衝突が検出されること
- 衝突版が別メモとして保存され、メモ一覧に表示されること
- 衝突がない通常ケースでは追加オーバーヘッドが最小限であること

---

## 段205: StatusBar への同期状態表示

`src/components/Status/StatusBar.tsx` に同期インジケーターを追加してください。

| 状態 | 表示 | 色 |
|---|---|---|
| オンライン・同期済み | `● Synced` | 緑 |
| オンライン・同期中 | `◐ Syncing` | 青 |
| オフライン・未送信なし | `○ Offline` | 灰 |
| オフライン・未送信あり | `○ Offline (N件未送信)` | 黄 |
| 未送信あり（オンライン） | `◐ Pending (N件)` | 橙 |
| 衝突あり | `⚠ Conflict (N件)` | 赤 |

StorageManager.addStatusListener() を使い、ConnectionStatus変更時に自動更新。
SyncQueue件数は定期的にポーリング（10秒間隔）。

### 動作確認項目
- オフラインにすると灰色表示に切り替わること
- オフラインでメモ編集すると「N件未送信」が表示されること
- オンライン復帰後に同期が完了すると緑に戻ること

---

## 段206: オフライン全文検索（ローカルフォールバック）

`src/services/storage/LocalSearchService.ts` を作成してください。

```typescript
export class LocalSearchService {
  // IndexedDB内の全キャッシュメモを部分文字列マッチ検索
  async search(query: string): Promise<SearchResult[]> {
    // キャッシュ済みメモの content を全スキャン
    // query をスペースで分割し、すべて含むメモを抽出
    // updated_at 降順ソート、上位200件を返す
  }
}
```

SearchApp.tsx を修正:
```typescript
// オフライン時は /api/bq/ttsearch の代わりにLocalSearchServiceを使用
const results = navigator.onLine
  ? await fetchFromBQ(query)
  : await localSearchService.search(query);
```

### 動作確認項目
- オフラインで /ttsearch の検索が動作すること（キャッシュ済みメモのみ対象）
- オンライン時はBQ検索が使われること（既存動作維持）

---

## 段207: 初回起動時のキャッシュ構築

アプリ初回起動時（IndexedDBが空）のキャッシュ構築を最適化してください。

```typescript
// StorageManager.initialize() に追加
// BQからメモ一覧取得成功後、直近30日分のcontentを優先プリフェッチ
async prefetchRecentMemos(memos: TTMemo[], days: number = 30): Promise<void> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = memos.filter(m => new Date(m.UpdateDate).getTime() > cutoff);

  for (const memo of recent) {
    if (!memo.IsLoaded) {
      await memo.LoadContent(); // BQ取得 → キャッシュ自動保存
      await new Promise(r => setTimeout(r, 100)); // レート制限
    }
  }
}
```

### 動作確認項目
- 新しいブラウザで初回起動 → メモ一覧表示後、直近30日分がバックグラウンドでキャッシュされること
- キャッシュ完了後にオフラインにしても、直近メモの本文が閲覧できること

---

## 段208〜214: Phase 15 動作確認チェックリスト

- [ ] **段200**: BQ取得成功時にキャッシュに書き込まれ、オフラインで読めること
- [ ] **段201**: オフラインでのメモ保存がSyncQueueに追加されること
- [ ] **段201**: ブラウザを閉じて再起動してもSyncQueueが残っていること
- [ ] **段202**: オンライン復帰時にSyncQueueが自動flushされること
- [ ] **段203**: SyncQueue保護により、未送信メモがBQ同期で上書きされないこと
- [ ] **段203**: 編集中（IsDirty）メモがBQ同期で上書きされないこと
- [ ] **段204**: 衝突時にローカル版が別メモとして保存されること
- [ ] **段205**: StatusBarに同期状態が正しく表示されること
- [ ] **段206**: オフラインで全文検索が動作すること
- [ ] **段207**: 初回起動時に直近メモがプリフェッチされること
- [ ] **通常操作**: オンラインでの通常操作が既存と同じ速度・動作であること
- [ ] **リロード**: メモ編集→保存→リロード→最新内容が表示されること（BQ正本）
- [ ] **多重タブ**: 2タブで同じメモを開いた場合、WebSocket同期が正常に動作すること

---

**前フェーズ**: Phase 09 (メモ管理・全文検索)
**次フェーズ**: Phase 11 (AIチャット・コンテキスト)
