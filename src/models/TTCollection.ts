/**
 * TTCollection.ts
 * TTObject を子として管理するコレクション基底クラス。
 *
 * Phase 2: CRUD + CSV シリアライズ（StorageManager 非依存）
 * Phase 13: LoadCache / FlushCache を StorageManager に接続予定
 */

import { TTObject } from './TTObject';
import { toCsv, parseCsv } from '../utils/csv';

export class TTCollection extends TTObject {
  protected _children: Map<string, TTObject> = new Map();
  public Count: number = 0;
  public Description: string = 'Collection';

  /**
   * ロード完了フラグ。
   * false の間は FlushCache による書き込みをスキップし、データ消失を防ぐ。
   */
  public IsLoaded: boolean = false;

  // 設定プロパティ（Phase 13: StorageManager 連携時に使用）
  /** 保存対象のプロパティ名をカンマ区切りで指定（例: "ID,Name,UpdateDate"） */
  public ItemSaveProperties: string = '';
  /** ナビゲーター最小表示列（例: "ID,Name"） */
  public ListPropertiesMin: string = '';
  /** ナビゲーター通常表示列 */
  public ListProperties: string = '';

  public override get ClassName(): string {
    return 'TTCollection';
  }

  public get ItemClassName(): string {
    return this.CreateChildInstance().ClassName;
  }

  // ── CRUD ────────────────────────────────────────────────────────────

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
    const item = this._children.get(id);
    if (!item) return;
    item._parent = null;
    this._children.delete(id);
    this.Count = this._children.size;
    this.NotifyUpdated();
  }

  public GetItems(): TTObject[] {
    return Array.from(this._children.values());
  }

  public ClearItems(): void {
    this._children.forEach(item => { item._parent = null; });
    this._children.clear();
    this.Count = 0;
    this.NotifyUpdated();
  }

  // ── CSV シリアライズ ─────────────────────────────────────────────────

  /**
   * ItemSaveProperties に指定したプロパティを CSV 文字列にシリアライズする。
   */
  public SerializeToCsv(): string {
    if (!this.ItemSaveProperties) return '';
    const props = this.ItemSaveProperties.split(',').map(p => p.trim());
    const items = Array.from(this._children.values()).map(item => {
      const obj: Record<string, unknown> = {};
      props.forEach(prop => {
        obj[prop] = (item as unknown as Record<string, unknown>)[prop];
      });
      return obj;
    });
    return toCsv(items, props);
  }

  /**
   * CSV 文字列からアイテムを復元する。
   * 既存アイテムは上書き、新規アイテムは CreateChildInstance() で生成する。
   * ロード完了後に super.NotifyUpdated(false) を呼ぶ（保存トリガーなしで View のみ更新）。
   */
  public DeserializeFromCsv(content: string): void {
    const rows = parseCsv(content);
    if (rows.length === 0) return;

    const headers = rows[0];
    const propIdx = new Map<string, number>();
    headers.forEach((h, i) => propIdx.set(h.trim(), i));

    if (!propIdx.has('ID')) {
      console.error(`[TTCollection] CSV に ID 列がありません (${this.ID})`);
      return;
    }

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length !== headers.length) continue;
      const id = row[propIdx.get('ID')!];
      if (!id) continue;

      let item = this.GetItem(id);
      if (!item) {
        item = this.CreateChildInstance();
        item.ID = id;
        item._parent = this;
        this._children.set(id, item);
      }
      propIdx.forEach((idx, prop) => {
        (item as unknown as Record<string, unknown>)[prop] = row[idx];
      });
    }

    this.Count = this._children.size;
    this.IsLoaded = true;
    // 保存を再トリガーせず View 更新通知のみ行う
    super.NotifyUpdated(false);
  }

  // ── ストレージフック（Phase 13 でオーバーライド） ────────────────────

  /**
   * ストレージからロードする（Phase 13 で StorageManager に接続予定）。
   * デフォルト実装は IsLoaded を true にするだけ。
   */
  public async LoadCache(): Promise<void> {
    this.IsLoaded = true;
  }

  /**
   * ストレージへ即時書き込みする（Phase 13 で StorageManager に接続予定）。
   */
  public async FlushCache(): Promise<void> {
    // Phase 13 で実装
  }

  // ── サブクラス拡張点 ────────────────────────────────────────────────

  /** サブクラスでオーバーライドして適切な子インスタンスを返す */
  protected CreateChildInstance(): TTObject {
    return new TTObject();
  }
}
