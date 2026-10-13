/**
 * TTCollection.ts
 * TTObject を子として管理するコレクション基底クラス。
 *
 */

import { TTObject } from './TTObject';

export class TTCollection extends TTObject {
  protected _children: Map<string, TTObject> = new Map();
  private _itemsCache: TTObject[] | null = null;
  public Count: number = 0;
  public Description: string = 'Collection';

  /**
   * ロード完了フラグ。
   */
  public IsLoaded: boolean = false;

  public override get ClassName(): string {
    return 'TTCollection';
  }

  // ── CRUD ────────────────────────────────────────────────────────────

  public GetItem(id: string): TTObject | undefined {
    return this._children.get(id);
  }

  /**
   * `_itemsCache` を無効化する。
   *
   * サブクラス（TTVault）が `AddItem`/`DeleteItem` を経由せず `_children` を直接
   * 操作する箇所（Create*Think 系: `_children.set(...)` の直後、await を挟む前）で、
   * `Count` の更新と同じタイミングで必ず呼ぶこと。
   * `_itemsCache` は `NotifyUpdated()` でも無効化されるが、それは通常 await の後
   * （StorageManager への保存完了後）にしか呼ばれない。その間に `GetItems()` が
   * 呼ばれると、`Count` は新しい値なのに一覧はまだ古いキャッシュを返す
   * （＝作成直後の Think が一覧に出ない）不整合が起きるため、ここで先に閉じる。
   */
  protected InvalidateItemsCache(): void {
    this._itemsCache = null;
  }

  public override NotifyUpdated(updateProperty: boolean = true): void {
    this._itemsCache = null;
    super.NotifyUpdated(updateProperty);
  }

  /** リスナーを明示的に発火する（表示更新ボタンなど手動リフレッシュ用）*/
  public NotifyRefresh(): void {
    this._itemsCache = null;
    super.NotifyUpdated(false);
  }

  /** リスナー通知なしで全アイテムをクリアする（ReloadAll 用）*/
  protected ClearItemsSilent(): void {
    this._children.forEach(item => { item._parent = null; });
    this._children.clear();
    this._itemsCache = null;
    this.Count = 0;
  }

  public AddItem(item: TTObject): TTObject {
    item._parent = this;
    this._children.set(item.ID, item);
    this.Count = this._children.size;
    this._itemsCache = null;
    this.NotifyUpdated();
    return item;
  }

  public DeleteItem(id: string): void {
    const item = this._children.get(id);
    if (!item) return;
    item._parent = null;
    this._children.delete(id);
    this.Count = this._children.size;
    this._itemsCache = null;
    this.NotifyUpdated();
  }

  public GetItems(): TTObject[] {
    if (!this._itemsCache) {
      this._itemsCache = Array.from(this._children.values());
    }
    return this._itemsCache;
  }

  public ClearItems(): void {
    this._children.forEach(item => { item._parent = null; });
    this._children.clear();
    this._itemsCache = null;
    this.Count = 0;
    this.NotifyUpdated();
  }

  // ── ストレージフック（Phase 13 でオーバーライド） ────────────────────

  /**
   * ストレージからロードする（Phase 13 で StorageManager に接続予定）。
   * デフォルト実装は IsLoaded を true にするだけ。
   */
  public async LoadCache(): Promise<void> {
    this.IsLoaded = true;
  }
}
