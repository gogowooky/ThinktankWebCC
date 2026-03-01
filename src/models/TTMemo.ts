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

    public async LoadContent(): Promise<void> {
        console.log(`[TTMemo.LoadContent] Loading content for ${this.ID}...`);
        try {
            // BigQuery APIからコンテンツを取得
            const response = await fetch(`/api/bq/files/${encodeURIComponent(this.ID)}`, {
                cache: 'no-store'  // キャッシュを使用せず、常に最新データを取得
            });
            console.log(`[TTMemo.LoadContent] Response status: ${response.status}`);
            if (response.ok) {
                const data = await response.json();
                console.log(`[TTMemo.LoadContent] Loaded data:`, data);

                // ループ防止のため、NotifyUpdated (Content setter) の前にフラグを立てる
                this.IsLoaded = true;

                // Contentセッターを使うとNotifyUpdatedが走り、UpdateDateが現在時刻になってしまうため、
                // 内部フィールドに直接セットする
                const newContent = data.file?.content || '';
                this._content = newContent;
                this.updateNameFromContent();
                this._savedContent = this._content; // ロード時のコンテンツを記録

                // サーバーから更新日時の返却があればセットする（なければ維持）
                if (data.file?.updated_at) {
                    let val = data.file.updated_at;
                    // オブジェクトの場合の処理（{value: "..."}形式への対応など）
                    if (typeof val === 'object' && val !== null) {
                        if ('value' in val) val = val.value;
                    }

                    // 日付として解析・整形
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
                        // 不明な形式の場合は文字列化しておく
                        this.UpdateDate = String(val);
                    }
                }

                // Viewに通知（更新日付は更新しない）
                this.NotifyUpdated(false);

                // デバッグ: タイトルが不正になる問題を調査
                console.log(`[TTMemo.LoadContent] Loaded. ID=${this.ID}, Name=${this.Name}, ContentLength=${this.Content.length}, UpdateDate=${this.UpdateDate}`);

                // 強制的に名前を再評価（サーバーからの古いタイトルで上書きされている可能性を排除）
                const oldName = this.Name;
                this.updateNameFromContent();
                if (oldName !== this.Name) {
                    console.warn(`[TTMemo.LoadContent] Name mismatched! Server/Cache='${oldName}' -> Content derived='${this.Name}'`);
                    // 名前が変わったので通知が必要だが、UpdateDateは変えたくない
                    this.NotifyUpdated(false);
                }

            } else if (response.status === 404) {
                // 新規メモの場合
                console.log(`[TTMemo.LoadContent] 404 - 新規メモとして扱います`);
                this.IsLoaded = true;
                this.Content = '';
                this._savedContent = '';
            } else {
                console.warn(`Failed to load content for ${this.ID}: ${response.statusText}`);
                this.IsLoaded = true; // エラーでも完了としてマーク（無限ループ防止）
                this.Content = '';
                this._savedContent = '';
            }
        } catch (e) {
            console.error(`Error loading content for ${this.ID}`, e);
            this.IsLoaded = true; // エラーでも完了としてマーク
            this.Content = '';
        }
    }

    // コンテンツが変更されているかチェック
    public get IsDirty(): boolean {
        return this.normalizeContent(this._content) !== this.normalizeContent(this._savedContent);
    }

    public async SaveContent(): Promise<void> {
        // テキストの変更がない場合は保存しない
        if (!this.IsDirty) {
            console.log(`[TTMemo] Content unchanged for ${this.ID}, skipping save.`);
            return;
        }

        try {
            // BigQuery APIにコンテンツを保存
            const response = await fetch('/api/bq/files', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    file_id: this.ID,
                    title: this.Name,
                    file_type: 'md',
                    category: 'Memo',
                    content: this.Content
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Unknown error');
            }
            console.log(`Saved content for ${this.ID}`);
            // 保存成功後、保存済みコンテンツを更新
            this._savedContent = this._content;

            // WebSocket経由で他のブラウザ/タブに通知（リモート更新でなければ）
            if (!this._isRemoteUpdate) {
                webSocketService.sendContentUpdate(this.ID, this.Content);
            }

            // 保存成功直後にローカルのUpdateDateを更新
            // これにより、直後に走るSyncWithBigQueryで、サーバーからの古いデータ(stale read)による上書きを防ぐ
            this.UpdateDate = this.getNowString();

            this.NotifyUpdated();
        } catch (e) {
            console.error(`Error saving content for ${this.ID}`, e);
            throw e;
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
