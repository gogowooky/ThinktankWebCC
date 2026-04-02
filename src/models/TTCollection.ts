import { TTObject } from './TTObject';
import { toCsv, parseCsv } from '../utils/csv';

/**
 * TTCollection - データコンテナ
 *
 * TTObjectを継承し、子要素のMap管理、CSV直列化、デバウンス自動保存を提供する。
 * 将来的にStorageManagerと統合してBigQuery/IndexedDBへの永続化を行う。
 */
export class TTCollection extends TTObject {
  /** 子要素Map */
  protected _children: Map<string, TTObject>;

  /** 子要素数 */
  public Count: number = 0;

  /** コレクションの説明 */
  public Description: string = '';

  /** データベース識別子（コレクション毎のテーブル/ストアを決定） */
  public DatabaseID: string = '';

  // ─── 表示・保存設定 ───

  /** CSV保存対象プロパティ（カンマ区切り） */
  public ItemSaveProperties: string = '';

  /** DataGrid表示プロパティ（簡易版、カンマ区切り） */
  public ListPropertiesMin: string = '';

  /** DataGrid表示プロパティ（完全版、カンマ区切り） */
  public ListProperties: string = '';

  /** 列名マッピング (例: "ID:番号,Name:タイトル") */
  public ColumnMapping: string = '';

  /** 列最大幅 (例: "ID:20,Name:-1") -1は無制限 */
  public ColumnMaxWidth: string = '';

  // ─── 保存制御 ───

  private _saveTimer: number | null = null;
  private _isSaving: boolean = false;
  private _nextSaveScheduled: boolean = false;

  /** ロード完了フラグ（未ロード時の保存によるデータ消失を防止） */
  public IsLoaded: boolean = false;

  constructor() {
    super();
    this._children = new Map();
  }

  public override get ClassName(): string {
    return 'TTCollection';
  }

  /** 子要素のクラス名 */
  public get ItemClassName(): string {
    return this.CreateChildInstance().ClassName;
  }

  // ═══════════════════════════════════════════════════════════════
  // CRUD操作
  // ═══════════════════════════════════════════════════════════════

  /** IDで子要素を取得 */
  public GetItem(id: string): TTObject | undefined {
    return this._children.get(id);
  }

  /** 子要素を追加（既存IDは上書き） */
  public AddItem(item: TTObject): TTObject {
    item._parent = this;
    this._children.set(item.ID, item);
    this.Count = this._children.size;
    this.NotifyUpdated();
    return item;
  }

  /** IDで子要素を削除 */
  public DeleteItem(id: string): void {
    const item = this._children.get(id);
    if (item) {
      item._parent = null;
      this._children.delete(id);
      this.Count = this._children.size;
      this.NotifyUpdated();
    }
  }

  /** 全子要素を配列で取得 */
  public GetItems(): TTObject[] {
    return Array.from(this._children.values());
  }

  /** 全子要素をクリア */
  public ClearItems(): void {
    this._children.forEach(item => {
      item._parent = null;
    });
    this._children.clear();
    this.Count = 0;
    this.NotifyUpdated();
  }

  /** 条件に合致する子要素を検索 */
  public FindItems(predicate: (item: TTObject) => boolean): TTObject[] {
    return this.GetItems().filter(predicate);
  }

  // ═══════════════════════════════════════════════════════════════
  // 列設定ヘルパー
  // ═══════════════════════════════════════════════════════════════

  /** ColumnMappingをパースしてRecord<string,string>で返す */
  public GetColumnMappingRecord(): Record<string, string> {
    if (!this.ColumnMapping) return {};
    const result: Record<string, string> = {};
    this.ColumnMapping.split(',').forEach(pair => {
      const [key, value] = pair.split(':').map(s => s.trim());
      if (key && value) result[key] = value;
    });
    return result;
  }

  /** ColumnMaxWidthをパースしてRecord<string,number>で返す */
  public GetColumnMaxWidthRecord(): Record<string, number> {
    if (!this.ColumnMaxWidth) return {};
    const result: Record<string, number> = {};
    this.ColumnMaxWidth.split(',').forEach(pair => {
      const [key, value] = pair.split(':').map(s => s.trim());
      if (key && value) result[key] = parseInt(value, 10);
    });
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // CSV シリアライズ
  // ═══════════════════════════════════════════════════════════════

  /** 子要素をCSV文字列にシリアライズ */
  public ToCsvString(): string {
    if (!this.ItemSaveProperties) return '';

    const props = this.ItemSaveProperties.split(',').map(p => p.trim());
    if (props.length === 0) return '';

    const items = this.GetItems().map(item => {
      const obj: Record<string, unknown> = {};
      props.forEach(prop => {
        obj[prop] = (item as unknown as Record<string, unknown>)[prop];
      });
      return obj;
    });

    return toCsv(items, props);
  }

  /** CSV文字列から子要素を復元 */
  public FromCsvString(content: string): void {
    if (!content) return;

    const rows = parseCsv(content);
    if (rows.length === 0) return;

    const headers = rows[0];
    const propertyMap = new Map<string, number>();
    headers.forEach((h, i) => propertyMap.set(h.trim(), i));

    if (!propertyMap.has('ID')) {
      console.error(`CSV for ${this.ID} missing ID column`);
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
        (item as unknown as Record<string, unknown>)[prop] = row[index];
      });
    }

    this.Count = this._children.size;
    this.IsLoaded = true;
  }

  // ═══════════════════════════════════════════════════════════════
  // キャッシュ保存/読込（Phase 12でStorageManager統合）
  // ═══════════════════════════════════════════════════════════════

  public override NotifyUpdated(updateDate: boolean = true): void {
    super.NotifyUpdated(updateDate);
    this._scheduleSave();
  }

  /** デバウンス付き保存スケジュール（5秒） */
  private _scheduleSave(): void {
    if (!this.ItemSaveProperties) return;

    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }

    this._saveTimer = window.setTimeout(() => {
      this._doSave();
    }, 5000);
  }

  /** キャッシュを即時保存 */
  public async FlushCache(): Promise<void> {
    if (!this.ItemSaveProperties) return;
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    await this._doSave();
  }

  private async _doSave(): Promise<void> {
    if (this._isSaving) {
      this._nextSaveScheduled = true;
      return;
    }

    if (!this.IsLoaded) {
      this._nextSaveScheduled = true;
      return;
    }

    this._isSaving = true;
    this._nextSaveScheduled = false;

    try {
      const csv = this.ToCsvString();
      const fileName = `${this.ID}.csv`;

      // Phase 12でStorageManagerに置き換え
      // 現時点ではconsoleログのみ
      console.log(`[TTCollection] Save scheduled: ${fileName} (${this.Count} items)`);
      console.debug(csv);
    } catch (error) {
      console.error(`Failed to save cache ${this.ID}:`, error);
    } finally {
      this._isSaving = false;

      if (this._nextSaveScheduled) {
        this._scheduleSave();
      }
    }
  }

  /** キャッシュからロード（Phase 12でStorageManager統合） */
  public async LoadCache(): Promise<void> {
    // Phase 12でStorageManagerから読み込みを実装
    // 現時点ではロード完了フラグのみ設定
    this.IsLoaded = true;
    console.log(`[TTCollection] LoadCache: ${this.ID} (stub - will integrate StorageManager in Phase 12)`);
  }

  // ═══════════════════════════════════════════════════════════════
  // ファクトリメソッド（サブクラスでオーバーライド）
  // ═══════════════════════════════════════════════════════════════

  /** 子要素のインスタンスを生成する（サブクラスでオーバーライド） */
  protected CreateChildInstance(): TTObject {
    return new TTObject();
  }
}
