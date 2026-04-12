import { TTObject } from './TTObject';
import { StorageManager } from '../services/storage';
import { toCsv, parseCsv } from '../utils/csv';


export class TTCollection extends TTObject {
    protected _children: Map<string, TTObject>;
    public Count: number;
    public Description: string;

    // 設定用プロパティ
    public ItemSaveProperties: string = "";
    public ListPropertiesMin: string = "";
    public ListProperties: string = "";
    public ColumnMapping: string = "";
    public ColumnMaxWidth: string = "";  // 列ごとの最大幅（例: "ID:20,Name:-1"）。-1は無制限

    private _saveTimer: number | null = null;

    constructor() {
        super();
        this._children = new Map();
        this.Count = 0;
        this.Description = 'Template';
    }

    public get ItemClassName(): string {
        return this.CreateChildInstance().ClassName;
    }

    public override get ClassName(): string {
        return 'TTCollection';
    }

    public NotifyUpdated(): void {
        super.NotifyUpdated();
        this.SaveCache();
    }

    private async SaveCache(): Promise<void> {
        if (!this.ItemSaveProperties) return;

        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
        }

        this._saveTimer = window.setTimeout(() => {
            this._DoSave();
        }, 5000); // 5秒の遅延（リクエストがあるたびにリセットされる）
    }

    /**
     * キャッシュを強制的に即時保存します。
     */
    public async FlushCache(): Promise<void> {
        if (!this.ItemSaveProperties) return;
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        await this._DoSave();
    }

    private _isSaving: boolean = false;
    private _nextSaveScheduled: boolean = false;

    public IsLoaded: boolean = false;

    private async _DoSave(): Promise<void> {
        if (this._isSaving) {
            // 保存中に次のリクエストが来たら、完了後に再実行フラグを立てる
            this._nextSaveScheduled = true;
            return;
        }

        this._isSaving = true;
        this._nextSaveScheduled = false;

        // ロード未完了の場合は保存しない（データ消失防止）
        if (!this.IsLoaded) {
            // ロード完了を待つために再スケジュールして終了
            // finallyブロックで _isSaving = false になり、_nextSaveScheduled = true なので SaveCache() が呼ばれる
            this._nextSaveScheduled = true;
            this._isSaving = false; // ここでfalseにしないとfinallyまで行かない（returnするので）
            // returnする前にfinallyに行く？いや明示的にfalseにする必要
            // try-finallyではないので、ここでreturnするとfinallyは実行されない（この関数全体がtryに入っていない）
            // LoadCache完了を待つ
            return;
        }

        const props = this.ItemSaveProperties.split(',').map(p => p.trim());
        if (props.length === 0) {
            this._isSaving = false;
            return;
        }

        // CSV ユーティリティを使用してシリアライズ
        const items = Array.from(this._children.values()).map(item => {
            const obj: Record<string, unknown> = {};
            props.forEach(prop => {
                obj[prop] = (item as unknown as Record<string, unknown>)[prop];
            });
            return obj;
        });
        const content = toCsv(items, props);
        const fileName = `${this.ID}.csv`;

        try {
            // ローカルキャッシュに保存
            await StorageManager.local.save(fileName, content);

            // BigQueryにも保存
            const bqResult = await StorageManager.bigquery.save(fileName, content);
            if (bqResult.success) {
                console.log(`Saved to BigQuery: ${fileName}`);
            } else {
                console.warn(`Failed to save to BigQuery: ${fileName}`, bqResult.error);
            }
        } catch (error) {
            console.error(`Failed to save cache ${fileName}:`, error);
        } finally {
            this._isSaving = false;

            // 保存中にリクエストがあった場合は再実行
            if (this._nextSaveScheduled) {
                this.SaveCache(); // タイマー経由で再スケジュール
            }
        }
    }

    public GetItem(id: string): TTObject | undefined {
        return this._children.get(id);
    }

    public AddItem(item: TTObject): TTObject {
        item._parent = this;
        this._children.set(item.ID, item);
        this.Count = this._children.size;
        this.NotifyUpdated();
        return item;
    }

    public DeleteItem(id: string): void {
        if (this._children.has(id)) {
            const item = this._children.get(id);
            if (item) {
                item._parent = null;
            }
            this._children.delete(id);
            this.Count = this._children.size;
            this.NotifyUpdated();
        }
    }

    public GetItems(): TTObject[] {
        return Array.from(this._children.values());
    }

    public ClearItems(): void {
        this._children.forEach(item => {
            item._parent = null;
        });
        this._children.clear();
        this.Count = 0;
        this.NotifyUpdated();
    }

    public async LoadCache(): Promise<void> {
        if (!this.ItemSaveProperties) return;
        const fileName = `${this.ID}.csv`;

        try {
            // まずローカルキャッシュから読み込み
            let result = await StorageManager.local.load(fileName);

            // ローカルにない場合はBigQueryから取得
            if (!result.success || !result.data) {
                result = await StorageManager.bigquery.load(fileName);
                if (result.success && result.data) {
                    // BigQueryから取得したデータをローカルにキャッシュ
                    await StorageManager.local.save(fileName, result.data);
                    console.log(`Loaded from BigQuery and cached locally: ${fileName}`);
                }
            }

            if (!result.success || !result.data) return;

            // CSV ユーティリティを使用してパース
            const rows = parseCsv(result.data);
            if (rows.length === 0) return;

            const headers = rows[0];
            const propertyMap = new Map<string, number>();
            headers.forEach((h: string, i: number) => propertyMap.set(h.trim(), i));

            if (!propertyMap.has('ID')) {
                console.error(`Cache for ${this.ID} missing ID column`);
                return;
            }

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (row.length !== headers.length) continue;

                const id = row[propertyMap.get('ID')!];
                if (!id) continue;

                let item = this.GetItem(id);
                if (!item) {
                    item = this.CreateChildInstance();
                    item.ID = id;
                    item._parent = this;
                    this._children.set(id, item);
                }

                propertyMap.forEach((index, prop) => {
                    const val = row[index];
                    (item as unknown as Record<string, unknown>)[prop] = val;
                });
            }

            this.Count = this._children.size;

            // ロード完了フラグを立てる
            this.IsLoaded = true;

            // ロード中に保存リクエストがあった場合は、ここで保存を実行する
            if (this._nextSaveScheduled) {
                this.SaveCache();
            }

            // NotifyUpdatedを呼ぶと保存がトリガーされるので、直接親メソッドを呼ぶ
            // ただし上記でSaveCacheを呼んでいるので、ここでは純粋にView更新通知のみを行う
            super.NotifyUpdated();
        } catch (error) {
            console.error(`Failed to load cache for ${this.ID}:`, error);
        }
    }

    protected CreateChildInstance(): TTObject {
        return new TTObject();
    }
}
