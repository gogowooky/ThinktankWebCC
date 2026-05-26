# Phase 15 実装ガイド（修正版）: BQ正本 + オフライン耐性

## 設計方針

> **過去の教訓**: ローカル優先にした結果、リロードや多重起動でメモ更新分が消失する事例が多発した。
> そのため **BQを正本（single source of truth）として維持** する。
> ローカル（IndexedDB）は「キャッシュ」＋「オフライン時の一時保管庫」として使用する。

### 3つの不変ルール

1. **オンライン時はBQが正**: Load時もSave時もBQを第一に使う。ローカルは「高速キャッシュ」の役割
2. **編集中データは絶対に消さない**: `IsDirty === true` のメモは、BQ同期で上書きしない
3. **未送信変更は永続化**: SyncQueueに入った変更は、送信完了まで消えない（リロード耐性）

### データフロー（修正版）

```
■ Load (メモを開く)
  オンライン時:
    BQ API → 成功 → 表示 + IndexedDBにキャッシュ保存
                   → 失敗 → IndexedDBキャッシュから表示
  オフライン時:
    IndexedDBキャッシュから表示（あれば）
    なければ → 「オフラインで未取得」と表示

■ Save (メモを保存)
  オンライン時:
    BQ API POST → 成功 → IndexedDBキャッシュも更新
                       → 失敗 → IndexedDBに保存 + SyncQueueに追加
  オフライン時:
    IndexedDBに保存 + SyncQueueに追加

■ Reload / 再起動
  1. IndexedDBのSyncQueueを確認
  2. 未送信の変更があるメモIDを記録（pendingSet）
  3. BQからメモ一覧を同期（SyncWithBigQuery）
  4. pendingSetに含まれるメモは、BQデータで上書きしない
  5. SyncQueueの flush を実行

■ 多重起動 / 複数タブ
  既存のWebSocket同期（webSocketService.sendContentUpdate）はそのまま維持
  タブ間のSyncQueueは BroadcastChannel で同期
```

---

## 既存コードの活用状況

### 既に存在するが未使用のオフライン部品

| ファイル | 存在する機能 | 現在の利用状況 |
|---|---|---|
| `IndexedDBStorageService.ts` | `pendingChanges` ストア | **未使用** |
| `IndexedDBStorageService.ts` | `addPendingChange()` | **未使用** |
| `IndexedDBStorageService.ts` | `getPendingChanges()` | **未使用** |
| `IndexedDBStorageService.ts` | `removePendingChange()` | **未使用** |
| `StorageManager.ts` | `ConnectionStatus` 型 | 定義のみ、UIに非反映 |
| `StorageManager.ts` | `handleOnline()` / `handleOffline()` | ステータス変更のみ、キューflushなし |

---

## 変更箇所（5ファイル）

### 変更1: TTMemo.ts — LoadContent にキャッシュ層を追加

BQ優先を維持。BQ成功時にキャッシュへ書き込み。BQ失敗/オフライン時のみキャッシュ読み取り。

```typescript
public async LoadContent(): Promise<void> {
    // ---- オンライン: BQ優先（既存動作を維持） ----
    if (navigator.onLine) {
        try {
            const response = await fetch(`/api/bq/files/${encodeURIComponent(this.ID)}`, {
                cache: 'no-store'
            });
            if (response.ok) {
                const data = await response.json();
                this._applyLoadedData(data);       // 既存の解析ロジック
                await this._saveToLocalCache();     // ★追加: キャッシュに書き込み
                return;
            }
            if (response.status === 404) {
                this.IsLoaded = true;
                this.Content = '';
                this._savedContent = '';
                return;
            }
            // その他エラー → フォールバックへ
        } catch (e) {
            console.warn(`[TTMemo] BQ通信エラー, キャッシュフォールバック:`, e);
        }
    }
    // ---- オフライン or BQ失敗: キャッシュから取得 ----
    await this._loadFromLocalCache();
}

private async _saveToLocalCache(): Promise<void> {
    const { StorageManager } = await import('../services/storage');
    await StorageManager.local.save(`memo_content_${this.ID}`, JSON.stringify({
        content: this._content,
        updateDate: this.UpdateDate,
        cachedAt: Date.now()
    }));
}

private async _loadFromLocalCache(): Promise<void> {
    const { StorageManager } = await import('../services/storage');
    const result = await StorageManager.local.load(`memo_content_${this.ID}`);
    if (result.success && result.data) {
        const cached = JSON.parse(result.data);
        this._content = cached.content || '';
        this.updateNameFromContent();
        if (cached.updateDate) this.UpdateDate = cached.updateDate;
        this.IsLoaded = true;
        this._savedContent = this._content;
        this.NotifyUpdated(false);
    } else {
        this.IsLoaded = true;
        this._content = '';
        this._savedContent = '';
    }
}
```

### 変更2: TTMemo.ts — SaveContent にSyncQueue追加

BQ優先で保存。失敗/オフライン時にSyncQueueへ。常にキャッシュも更新。

```typescript
public async SaveContent(): Promise<void> {
    if (!this.IsDirty) return;

    // ★ 常にキャッシュを更新（高速・失敗しない）
    await this._saveToLocalCache();

    if (navigator.onLine) {
        try {
            const response = await fetch('/api/bq/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_id: this.ID,
                    title: this.Name,
                    file_type: 'md',
                    category: 'Memo',
                    content: this.Content
                })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            this._savedContent = this._content;
            if (!this._isRemoteUpdate) {
                webSocketService.sendContentUpdate(this.ID, this.Content);
            }
            this.UpdateDate = this.getNowString();
            this.NotifyUpdated();

            // ★ BQ成功 → このメモのSyncQueueエントリを削除
            await this._clearPendingChanges();
            return;
        } catch (e) {
            console.warn(`[TTMemo] BQ保存失敗, SyncQueue追加: ${this.ID}`, e);
        }
    }

    // ---- オフライン or BQ失敗 → SyncQueue追加 ----
    await this._addToSyncQueue();
    this._savedContent = this._content;
    this.UpdateDate = this.getNowString();
    this.NotifyUpdated();
}

private async _addToSyncQueue(): Promise<void> {
    const { StorageManager } = await import('../services/storage');
    await StorageManager.local.addPendingChange(this.ID, JSON.stringify({
        file_id: this.ID,
        title: this.Name,
        file_type: 'md',
        category: 'Memo',
        content: this.Content,
        updateDate: this.UpdateDate
    }), 'save');
}

private async _clearPendingChanges(): Promise<void> {
    const { StorageManager } = await import('../services/storage');
    const pending = await StorageManager.local.getPendingChanges();
    for (const change of pending) {
        if (change.path === this.ID) {
            await StorageManager.local.removePendingChange(change.id);
        }
    }
}
```

### 変更3: StorageManager.ts — SyncQueue flush + 保護API

```typescript
// handleOnline() を拡張
private async handleOnline(): void {
    console.log('[StorageManager] Online');
    this.setStatus('syncing');
    await this.flushSyncQueue();
    await this.checkVersions();
    this.setStatus('online');
}

// ★新規: SyncQueue flush
public async flushSyncQueue(): Promise<{ success: number; failed: number }> {
    const pending = await this._local.getPendingChanges();
    if (pending.length === 0) return { success: 0, failed: 0 };

    // 同一ファイルは最新のみ送信
    const latest = new Map<string, typeof pending[0]>();
    for (const c of pending) {
        const existing = latest.get(c.path);
        if (!existing || c.timestamp > existing.timestamp) latest.set(c.path, c);
    }

    let success = 0, failed = 0;
    for (const [path, change] of latest) {
        try {
            const payload = JSON.parse(change.content);
            const res = await fetch('/api/bq/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                for (const c of pending) {
                    if (c.path === path) await this._local.removePendingChange(c.id);
                }
                success++;
            } else { failed++; }
        } catch { failed++; }
    }
    this.statusListeners.forEach(cb => cb(this._connectionStatus));
    return { success, failed };
}

// ★新規: 未送信メモIDセット（SyncWithBigQueryでの保護用）
public async getPendingMemoIds(): Promise<Set<string>> {
    const pending = await this._local.getPendingChanges();
    return new Set(pending.map(p => p.path));
}

// ★新規: 未送信件数（StatusBar用）
public async getPendingCount(): Promise<number> {
    return (await this._local.getPendingChanges()).length;
}
```

### 変更4: TTMemos.ts — SyncWithBigQueryにSyncQueue保護を追加

BQ同期時、SyncQueueに未送信変更があるメモとIsDirtyなメモはBQデータで上書きしない。

```typescript
// SyncWithBigQuery() の冒頭に追加
const pendingMemoIds = await StorageManager.getPendingMemoIds();
if (pendingMemoIds.size > 0) {
    console.log(`[TTMemos] SyncQueue保護対象: ${[...pendingMemoIds].join(', ')}`);
}

// 既存メモの更新ループ内（line 174付近）に追加
if (memo) {
    // ★追加: SyncQueue保護 — 未送信変更があるメモはBQで上書きしない
    if (pendingMemoIds.has(file.file_id)) {
        console.log(`[TTMemos] SyncQueue保護: ${file.file_id}`);
        validBqFileIds.add(file.file_id); // 削除対象にもしない
        continue;
    }

    // ★追加: 編集中保護 — IsDirtyなメモはBQで上書きしない
    if ((memo as TTMemo).IsDirty) {
        console.log(`[TTMemos] 編集中保護: ${file.file_id}`);
        validBqFileIds.add(file.file_id);
        continue;
    }

    // ... (既存の isServerNewer チェック — そのまま維持) ...
}
```

### 変更5: StatusBar に同期状態を表示

```typescript
// ● Synced         (緑) — オンライン、未送信なし
// ◐ Syncing        (青) — 同期中
// ○ Offline        (灰) — オフライン、未送信なし
// ○ Offline (N件)  (黄) — オフライン、未送信あり
// ◐ Pending (N件)  (橙) — オンラインだがflush中/未完了
```

---

## 安全性の検証マトリクス

| シナリオ | 動作 | メモが消えないか |
|---|---|---|
| 通常のリロード（オンライン） | BQからLoad → 最新が表示される | ✅ BQが正本 |
| 通常のリロード（オフライン） | IndexedDBキャッシュからLoad | ✅ 直前のBQデータが表示 |
| 編集→保存→リロード（オンライン） | 保存時にBQに書かれている。リロードでBQ取得 | ✅ |
| 編集→保存失敗→リロード | SyncQueueにある→pendingMemoIds保護 | ✅ BQ上書き防止 |
| 編集中（未保存）にリロード | IsDirtyチェックで保護…だがリロードでstateは消える | ⚠ beforeunloadで即時保存が必要(*) |
| オフラインで編集→ブラウザ閉→再起動 | SyncQueueに残る→復帰時flush | ✅ IndexedDB永続 |
| 2タブで同じメモを開く | WebSocket同期（既存維持） | ✅ |
| 2端末でオフライン編集→復帰 | 後勝ち。衝突検出は段204で対応 | ⚠ 後勝ちだが両版保存可能 |

(*) 既にrefactor_plan1の段112でbeforeunloadの即時保存が計画済み。
    SyncQueue版では、beforeunloadで `_addToSyncQueue()` + `_saveToLocalCache()` を呼ぶ。

---

## 変更しないファイル

| ファイル | 理由 |
|---|---|
| `IndexedDBStorageService.ts` | 既にpendingChanges機構が完全実装済み |
| `BigQueryStorageService.ts` | BQ側のロジック変更不要 |
| `server/services/BigQueryService.ts` | バックエンド変更不要 |
| `IStorageService.ts` | インターフェース変更不要 |
| `WebSocketService.ts` | 既存の同期機構を維持 |
