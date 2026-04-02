import { TTCollection } from './TTCollection';
import { TTMemo } from './TTMemo';
import { StorageManager } from '../services/storage';

export class TTMemos extends TTCollection {
    // Promiseキャッシュ（競合状態防止）
    private _pendingMemos: Map<string, Promise<TTMemo>> = new Map();

    public override get ClassName(): string {
        return 'TTMemos';
    }

    constructor() {
        super();
        this.ItemSaveProperties = "UpdateDate,ID,Name,Keywords";
        this.ListPropertiesMin = "Name,ID";
        this.ListProperties = "ID,UpdateDate,Name";
        this.ColumnMapping = "ID:メモID,Name:タイトル,Keywords:キーワード,UpdateDate:更新日";
        this.ColumnMaxWidth = "ID:18,Name:70,Keywords:40,UpdateDate:18";
    }

    public AddNewMemo(): TTMemo {
        const memo = new TTMemo();
        this.AddItem(memo);
        return memo;
    }

    protected CreateChildInstance(): TTMemo {
        return new TTMemo();
    }

    private formatDateString(dateVal: any): string {
        if (!dateVal) return '';
        const d = new Date(String(dateVal));
        if (!isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const MM = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const HH = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${yyyy}-${MM}-${dd}-${HH}${mm}${ss}`;
        } else {
            return String(dateVal);
        }
    }

    /**
     * メモを取得、なければ作成してコレクションに追加
     * Promiseをキャッシュして並列リクエストでの重複作成を防ぐ
     */
    public async getOrCreateMemo(id: string): Promise<TTMemo> {
        // 既にコレクションにあればそれを返す
        const existing = this.GetItem(id) as TTMemo | undefined;
        if (existing) {
            // コンテンツが未ロードの場合はバックグラウンドでロードする（awaitしない）
            if (!existing.IsLoaded) {
                existing.LoadContent().catch(e => console.error(e));
            }
            return existing;
        }

        // 既にロード中ならそのPromiseを返す
        const pending = this._pendingMemos.get(id);
        if (pending) {
            return pending;
        }

        // 新規作成のPromiseを作成してキャッシュ
        // ここもコンテンツロードを待たずにMemoオブジェクトを返すように変更
        const promise = this._createMemoAndStartLoad(id);
        this._pendingMemos.set(id, promise);

        try {
            const memo = await promise;
            return memo;
        } finally {
            // 完了したらキャッシュから削除
            this._pendingMemos.delete(id);
        }
    }

    private async _createMemoAndStartLoad(id: string): Promise<TTMemo> {
        const memo = new TTMemo();
        memo.ID = id;
        memo.Name = id;

        // バックグラウンドでロード開始（awaitしない）
        memo.LoadContent().catch(e => console.error(e));

        this.AddItem(memo);
        console.log(`[TTMemos] Created and added memo: ${id}`);
        return memo;
    }

    // 最終同期日時
    public LastSyncTime: Date | null = null;
    private readonly LAST_SYNC_KEY = 'Thinktank_Memos_LastSyncTime';

    public async LoadCache(): Promise<void> {
        console.log(`[TTMemos] LoadCache 開始...`);

        // 最終同期日時の復元
        const storedSyncTime = localStorage.getItem(this.LAST_SYNC_KEY);
        if (storedSyncTime) {
            this.LastSyncTime = new Date(storedSyncTime);
            console.log(`[TTMemos] LastSyncTime restored: ${this.LastSyncTime.toISOString()}`);
        }

        // まずBQの一覧情報からTTMemoを登録試行
        const bqSuccess = await this.SyncWithBigQuery();

        if (!bqSuccess) {
            // BQアクセス失敗時はローカルキャッシュにフォールバック
            console.log(`[TTMemos] BQアクセス失敗、ローカルキャッシュにフォールバック`);
            await super.LoadCache();
        } else {
            // BQ成功時はIsLoadedをセットしてView更新・キャッシュ保存をトリガー
            this.IsLoaded = true;
            this.NotifyUpdated();

            // 段207: 初回起動時（IndexedDBが空の場合）に直近30日分をプリフェッチ
            this._prefetchRecentMemos(30).catch(e =>
                console.warn('[TTMemos] プリフェッチ失敗:', e)
            );
        }

        console.log(`[TTMemos] LoadCache完了: ${this.Count}件`);
    }

    // 段207: 直近N日分のメモコンテンツをバックグラウンドでプリフェッチ
    private async _prefetchRecentMemos(days: number): Promise<void> {
        if (!navigator.onLine) return;

        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const memos = this.GetItems() as TTMemo[];
        const recent = memos.filter(m => {
            if (!m.UpdateDate) return false;
            const d = new Date(m.UpdateDate);
            return !isNaN(d.getTime()) && d.getTime() > cutoff;
        });

        if (recent.length === 0) return;

        // IndexedDBキャッシュに既に入っているメモはスキップ（非同期で確認）
        const { StorageManager: SM } = await import('../services/storage');

        let fetched = 0;
        for (const memo of recent) {
            if (memo.IsLoaded) continue;

            // 既にキャッシュにあるかチェック
            const cached = await SM.local.load(`memo_content_${memo.ID}`);
            if (cached.success && cached.data) continue; // キャッシュ済みはスキップ

            await memo.LoadContent();
            fetched++;

            // レート制限: 100ms間隔
            await new Promise(r => setTimeout(r, 100));
        }

        if (fetched > 0) {
            console.log(`[TTMemos] プリフェッチ完了: ${fetched}件 (直近${days}日)`);
        }
    }

    /**
     * BigQueryとメモ一覧を同期
     * キャッシュにないメモのみ追加する
     */
    public async SyncWithBigQuery(): Promise<boolean> {
        try {
            console.log(`[TTMemos] BigQuery同期開始... LastSyncTime: ${this.LastSyncTime ? this.LastSyncTime.toISOString() : 'None'}`);

            // 段203: SyncQueue保護 — 未送信変更があるメモIDを取得
            const pendingMemoIds = await StorageManager.getPendingMemoIds();
            if (pendingMemoIds.size > 0) {
                console.log(`[TTMemos] SyncQueue保護対象: ${[...pendingMemoIds].join(', ')}`);
            }

            // カテゴリ未設定のメモも拾うため、カテゴリ指定なしで全件取得してからクライアント側でフィルタリングする
            let url = '/api/bq/files';

            // 増分更新は廃止し、常に全件チェックを行う
            // (LastSyncTimeは同期完了時刻の記録としてのみ使用)

            // メモカテゴリのファイル一覧を取得
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`[TTMemos] BigQuery API失敗: ${response.status}`);
                return false;
            }
            const data = await response.json();
            const files = data.files || [];

            let addedCount = 0;
            let updatedCount = 0;
            const cacheCount = this.Count;

            // 同期開始時刻を記録（完了後にLastSyncTimeを更新するため）
            // サーバー側の時刻とのズレを考慮し、少し前倒しするか、サーバーからtimestampを返してもらうのが理想だが
            // ここでは簡易的に現在時刻とする（次回はこの時刻以降を取得）
            const syncStartTime = new Date();

            // チャンク処理用変数
            const CHUNK_SIZE = 500;
            let processCount = 0;

            // 有効なBQファイルIDを追跡（削除判定用）
            const validBqFileIds = new Set<string>();
            let filteredFilesCount = 0;

            for (const file of files) {
                // Memoカテゴリまたはカテゴリ未設定のもののみ対象
                // インポートデータなどでカテゴリが欠落している場合もMemoとして扱う
                if (file.category && file.category !== 'Memo') continue;

                filteredFilesCount++;
                validBqFileIds.add(file.file_id);

                let memo = this.GetItem(file.file_id) as TTMemo | undefined;

                if (memo) {
                    // 段203: SyncQueue保護 — 未送信変更があるメモはBQで上書きしない
                    if (pendingMemoIds.has(file.file_id)) {
                        console.log(`[TTMemos] SyncQueue保護でスキップ: ${file.file_id}`);
                        validBqFileIds.add(file.file_id);
                        continue;
                    }

                    // 段203: 編集中保護 — IsDirtyなメモはBQで上書きしない
                    if ((memo as TTMemo).IsDirty) {
                        console.log(`[TTMemos] 編集中保護でスキップ: ${file.file_id}`);
                        validBqFileIds.add(file.file_id);
                        continue;
                    }

                    // BigQueryから返る日付は文字列(ISO)の場合と、BigQueryTimestampオブジェクト等の場合がある
                    let dateVal = file.updated_at;
                    if (typeof dateVal === 'object' && dateVal !== null) {
                        if ('value' in dateVal) {
                            dateVal = (dateVal as any).value;
                        } else if (dateVal instanceof Date) {
                            dateVal = dateVal.toISOString();
                        }
                    }

                    // サーバー側の更新日時をフォーマット
                    let serverUpdateDate = '';
                    if (dateVal) {
                        serverUpdateDate = this.formatDateString(dateVal);
                    }

                    // 既に存在する場合、更新されているか確認して情報の更新
                    // タイトルや更新日が新しい場合は反映
                    let modified = false;
                    const newTitle = file.title || file.file_name || file.file_id;
                    const currentUpdateDate = (memo as any).UpdateDate || '';

                    // サーバーの方が新しい場合のみ更新する
                    // (ローカルで保存直後はローカルの方が新しいはずなので、サーバーのStaleデータを無視できる)
                    const isServerNewer = serverUpdateDate > currentUpdateDate;

                    if (isServerNewer) {
                        // UpdateDate更新
                        if (serverUpdateDate !== currentUpdateDate) {
                            (memo as any).UpdateDate = serverUpdateDate;
                            modified = true;
                        }

                        // タイトル更新
                        if (memo.Name !== newTitle) {
                            memo.Name = newTitle;
                            modified = true;
                        }
                    } else if (!memo.IsLoaded && memo.Name !== newTitle) {
                        // ロード未完了でまだコンテンツを読み込んでいない場合、
                        // かつタイムスタンプが同じか古い場合でも、タイトルがなければ設定してもよいが
                        // 基本的にはコンテンツ(ロード時)の情報を正とするためここは何もしない、
                        // または「サーバーが古くない」場合に限り反映する戦略などが考えられる。
                        // 今回は「サーバーが古くない(同じ)」かつ「まだロードしていない」ならタイトルを同期する、という手もあるが
                        // 競合回避のため「厳密に新しい場合」のみとする方針を堅持する。
                    }

                    if (modified) updatedCount++;

                } else {
                    // 新規追加
                    memo = new TTMemo();
                    memo.ID = file.file_id;
                    memo.Name = file.title || file.file_name || file.file_id;

                    let formattedDate = '';
                    let dateVal = file.updated_at;
                    if (dateVal) {
                        if (typeof dateVal === 'object' && dateVal !== null) {
                            if ('value' in dateVal) {
                                dateVal = (dateVal as any).value;
                            } else if (dateVal instanceof Date) {
                                dateVal = dateVal.toISOString();
                            }
                        }
                        formattedDate = this.formatDateString(dateVal);
                    }
                    (memo as any).UpdateDate = formattedDate;

                    this.AddItem(memo);
                    addedCount++;
                }

                processCount++;

                if (processCount % CHUNK_SIZE === 0) {
                    this.NotifyUpdated();
                    await new Promise(resolve => setTimeout(resolve, 0));
                    console.log(`[TTMemos] Sync progress: ${processCount}/${files.length}`);
                }
            }

            // BQに存在しない（またはMemoカテゴリでなくなった）メモをキャッシュから削除
            const cachedItems = this.GetItems();
            let removedCount = 0;
            for (const item of cachedItems) {
                if (!validBqFileIds.has(item.ID)) {
                    this._children.delete(item.ID);
                    item._parent = null;
                    removedCount++;
                }
            }
            if (removedCount > 0) {
                this.Count = this._children.size;
            }

            console.log(`[TTMemos] BigQuery同期完了: 取得${files.length}件 (対象${filteredFilesCount}件, 新規:${addedCount}, 更新:${updatedCount}, 削除:${removedCount}, キャッシュ:${cacheCount}→${this.Count}件)`);

            // 追加・更新・削除があった場合のみキャッシュを更新
            if (addedCount > 0 || updatedCount > 0 || removedCount > 0) {
                this.NotifyUpdated();
            }

            // 同期成功後、LastSyncTimeを更新して保存
            if (files.length > 0 || !this.LastSyncTime) {
                // ファイルがあった場合、または初回同期（LastSyncTimeなし）の場合は時間を更新
                // 何もファイルが返ってこなかった場合（=差分なし）も、同期チェックは行ったので時間を更新しても良いが、
                // 確実にデータを受けた時刻にて更新する
                this.LastSyncTime = syncStartTime;
                localStorage.setItem(this.LAST_SYNC_KEY, this.LastSyncTime.toISOString());
                console.log(`[TTMemos] LastSyncTime updated: ${this.LastSyncTime.toISOString()}`);
            }

            return true;

        } catch (e) {
            console.error('[TTMemos] BigQuery同期失敗:', e);
            return false;
        }
    }
}

