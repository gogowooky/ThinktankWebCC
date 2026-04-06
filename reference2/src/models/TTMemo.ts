import { TTObject } from './TTObject';
import { webSocketService, ContentUpdateMessage } from '../services/sync/WebSocketService';

export class TTMemo extends TTObject {
    public Keywords: string = '';
    private _content: string = '';
    public IsLoaded: boolean = false;

    public override get ClassName(): string {
        return 'TTMemo';
    }

    // 最後に保存/ロードされたコンテンツ（変更検出用）
    private _savedContent: string = '';

    // WebSocketからの更新かどうかを追跡（ループ防止）
    private _isRemoteUpdate: boolean = false;

    // 改行コードを正規化するヘルパー
    private normalizeContent(s: string): string {
        return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    // Content変更時に通知を発行するためのgetter/setter
    public get Content(): string {
        return this._content;
    }
    public set Content(value: string) {
        if (this.normalizeContent(this._content) === this.normalizeContent(value)) return;
        this._content = value;
        // 最初の行からタイトルを抽出してNameを更新
        this.updateNameFromContent();
        // 変更を通知して、同じメモを参照する他のパネルに伝播
        this.NotifyUpdated();
    }

    // コンテンツの最初の行からNameを更新
    private updateNameFromContent(): void {
        if (!this._content) {
            this.Name = `[${this.ID}] 新しいメモ`;
            return;
        }
        const firstLine = this._content.split('\n')[0].trim();
        // マークダウン見出し記号を除去
        const title = firstLine.replace(/^#+\s*/, '');
        this.Name = title || `[${this.ID}] 新しいメモ`;
    }

    // 外部からの同期時にNotifyUpdatedを呼ばずにContentを設定
    // ただしNameは更新する（Tableへの反映用）
    public setContentSilent(value: string): void {
        if (this.normalizeContent(this._content) === this.normalizeContent(value)) return;
        this._content = value;
        this.updateNameFromContent();
    }

    // WebSocketからの更新を適用（NotifyUpdatedは呼ぶがWebSocket送信はしない）
    public applyRemoteUpdate(content: string): void {
        if (this.normalizeContent(this._content) === this.normalizeContent(content)) return;
        this._isRemoteUpdate = true;
        this._content = content;
        this.NotifyUpdated();
        this._isRemoteUpdate = false;
    }

    constructor() {
        super();
        const memoid = this.getNowString();
        this.ID = memoid;
        this.Name = `[${memoid}] 新しいメモ`;
        this.UpdateDate = this.getNowString();
    }

    // ─────────────────────────────────────────────────────────────
    // 段200: LoadContent — BQ優先 + IndexedDBキャッシュフォールバック
    // ─────────────────────────────────────────────────────────────
    public async LoadContent(): Promise<void> {
        console.log(`[TTMemo.LoadContent] Loading content for ${this.ID}...`);

        // ── オンライン時: BQ優先（既存動作を維持） ──
        if (navigator.onLine) {
            try {
                const response = await fetch(`/api/bq/files/${encodeURIComponent(this.ID)}`, {
                    cache: 'no-store'
                });
                console.log(`[TTMemo.LoadContent] Response status: ${response.status}`);

                if (response.ok) {
                    const data = await response.json();
                    this._applyLoadedData(data);
                    await this._saveToLocalCache();   // ★ キャッシュに書き込み
                    return;
                }

                if (response.status === 404) {
                    this.IsLoaded = true;
                    this.Content = '';
                    this._savedContent = '';
                    return;
                }
                // その他エラー → キャッシュフォールバックへ
                console.warn(`[TTMemo.LoadContent] BQ error ${response.status}, falling back to cache`);
            } catch (e) {
                console.warn(`[TTMemo.LoadContent] BQ通信エラー, キャッシュフォールバック:`, e);
            }
        }

        // ── オフライン or BQ失敗: IndexedDBキャッシュから取得 ──
        await this._loadFromLocalCache();
    }

    // BQ応答データをメモに適用する（既存ロジックを抽出）
    private _applyLoadedData(data: any): void {
        this.IsLoaded = true;
        const newContent = data.file?.content || '';
        this._content = newContent;
        this.updateNameFromContent();
        this._savedContent = this._content;

        if (data.file?.updated_at) {
            let val = data.file.updated_at;
            if (typeof val === 'object' && val !== null) {
                if ('value' in val) val = val.value;
            }
            const d = new Date(val);
            if (!isNaN(d.getTime())) {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const hh = String(d.getHours()).padStart(2, '0');
                const min = String(d.getMinutes()).padStart(2, '0');
                const ss = String(d.getSeconds()).padStart(2, '0');
                this.UpdateDate = `${yyyy}-${mm}-${dd}-${hh}${min}${ss}`;
            } else if (typeof val === 'string') {
                this.UpdateDate = val;
            } else {
                this.UpdateDate = String(val);
            }
        }

        this.NotifyUpdated(false);

        // タイトルを再評価（サーバーデータで上書きされた場合を排除）
        const oldName = this.Name;
        this.updateNameFromContent();
        if (oldName !== this.Name) {
            this.NotifyUpdated(false);
        }

        console.log(`[TTMemo.LoadContent] Loaded from BQ. ID=${this.ID}, Name=${this.Name}, ContentLength=${this.Content.length}`);
    }

    // IndexedDBキャッシュへ書き込み
    private async _saveToLocalCache(): Promise<void> {
        try {
            const { StorageManager } = await import('../services/storage');
            await StorageManager.local.save(`memo_content_${this.ID}`, JSON.stringify({
                content: this._content,
                updateDate: this.UpdateDate,
                cachedAt: Date.now(),
            }));
        } catch (e) {
            console.warn(`[TTMemo] キャッシュ書き込み失敗 (${this.ID}):`, e);
        }
    }

    // IndexedDBキャッシュから読み込み
    private async _loadFromLocalCache(): Promise<void> {
        try {
            const { StorageManager } = await import('../services/storage');
            const result = await StorageManager.local.load(`memo_content_${this.ID}`);
            if (result.success && result.data) {
                const cached = JSON.parse(result.data as string);
                this._content = cached.content || '';
                this.updateNameFromContent();
                if (cached.updateDate) this.UpdateDate = cached.updateDate;
                this.IsLoaded = true;
                this._savedContent = this._content;
                this.NotifyUpdated(false);
                console.log(`[TTMemo.LoadContent] Loaded from IndexedDB cache. ID=${this.ID}`);
                return;
            }
        } catch (e) {
            console.warn(`[TTMemo] キャッシュ読み込み失敗 (${this.ID}):`, e);
        }
        // キャッシュもない
        this.IsLoaded = true;
        this._content = '';
        this._savedContent = '';
        console.log(`[TTMemo.LoadContent] No cache available for ${this.ID}, using empty content`);
    }

    // コンテンツが変更されているかチェック
    public get IsDirty(): boolean {
        return this.normalizeContent(this._content) !== this.normalizeContent(this._savedContent);
    }

    // ─────────────────────────────────────────────────────────────
    // 段201: SaveContent — 常にキャッシュ更新 + BQ優先 + SyncQueue統合
    // ─────────────────────────────────────────────────────────────
    public async SaveContent(): Promise<void> {
        if (!this.IsDirty) {
            console.log(`[TTMemo] Content unchanged for ${this.ID}, skipping save.`);
            return;
        }

        // ★ 常にIndexedDBキャッシュを更新（高速・失敗しない）
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
                        content: this.Content,
                    })
                });

                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.error || `HTTP ${response.status}`);
                }

                console.log(`[TTMemo] Saved to BQ: ${this.ID}`);
                this._savedContent = this._content;

                if (!this._isRemoteUpdate) {
                    webSocketService.sendContentUpdate(this.ID, this.Content);
                }

                this.UpdateDate = this.getNowString();
                this.NotifyUpdated();

                // ★ BQ成功 → SyncQueueから該当エントリを削除
                await this._clearPendingChanges();
                return;
            } catch (e) {
                console.warn(`[TTMemo] BQ保存失敗, SyncQueueに追加: ${this.ID}`, e);
            }
        }

        // ── オフライン or BQ失敗 → SyncQueueに追加 ──
        await this._addToSyncQueue();
        this._savedContent = this._content;
        this.UpdateDate = this.getNowString();
        this.NotifyUpdated();
        console.log(`[TTMemo] Added to SyncQueue: ${this.ID}`);
    }

    // SyncQueueへ追加
    private async _addToSyncQueue(): Promise<void> {
        try {
            const { StorageManager } = await import('../services/storage');
            await StorageManager.local.addPendingChange(
                this.ID,
                JSON.stringify({
                    file_id: this.ID,
                    title: this.Name,
                    file_type: 'md',
                    category: 'Memo',
                    content: this.Content,
                    updateDate: this.UpdateDate,
                }),
                'save'
            );
        } catch (e) {
            console.warn(`[TTMemo] SyncQueue追加失敗 (${this.ID}):`, e);
        }
    }

    // BQ保存成功後にSyncQueueから自分のエントリを削除
    private async _clearPendingChanges(): Promise<void> {
        try {
            const { StorageManager } = await import('../services/storage');
            const pending = await StorageManager.local.getPendingChanges();
            for (const change of pending) {
                if (change.path === this.ID) {
                    await StorageManager.local.removePendingChange(change.id);
                }
            }
        } catch (e) {
            console.warn(`[TTMemo] SyncQueueクリア失敗 (${this.ID}):`, e);
        }
    }
}

// WebSocketメッセージハンドラを登録（グローバル）
export function setupMemoWebSocketHandler(getMemo: (fileId: string) => TTMemo | undefined): void {
    webSocketService.addHandler('TTMemo', (message) => {
        if (message.type === 'content-update') {
            const update = message as ContentUpdateMessage;
            const memo = getMemo(update.fileId);
            if (memo) {
                console.log(`[TTMemo] Received remote update for ${update.fileId}`);
                memo.applyRemoteUpdate(update.content);
            }
        }
    });
}
