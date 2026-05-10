/**
 * TTNotifyBase.ts
 * 通知機能（Observer パターン）の最小基底クラス。
 * 永続化プロパティを持たず、メモリ上の状態変更を React 等に伝えることに特化する。
 */

export class TTNotifyBase {
  public _parent: TTNotifyBase | null = null;
  private _updateListeners: Map<string, () => void> = new Map();

  /**
   * 変更を通知する。
   * @param propagateParent 親ノードへ通知を伝播させるかどうか（デフォルト: true）
   */
  public NotifyUpdated(propagateParent: boolean = true): void {
    this._updateListeners.forEach(cb => cb());
    
    // 親への伝播（親ノード自体のプロパティ更新は不要なので false を渡す）
    if (propagateParent && this._parent) {
      this._parent.NotifyUpdated(false);
    }
  }

  /** Observer を登録する */
  public AddOnUpdate(key: string, callback: () => void): void {
    this._updateListeners.set(key, callback);
  }

  /** Observer を削除する */
  public RemoveOnUpdate(key: string): void {
    this._updateListeners.delete(key);
  }

  /** 登録済みの Observer キー一覧（デバッグ用） */
  public get ListenerKeys(): string[] {
    return Array.from(this._updateListeners.keys());
  }
}
