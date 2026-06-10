// Observer パターンの基底クラス（仕様書03 §1.1）

export type NotifyListener = () => void;

export class TTNotifyBase {
  _parent: TTNotifyBase | null = null;
  private _listeners = new Set<NotifyListener>();

  AddListener(listener: NotifyListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  RemoveListener(listener: NotifyListener): void {
    this._listeners.delete(listener);
  }

  NotifyUpdated(propagateParent = true): void {
    for (const l of [...this._listeners]) l();
    if (propagateParent && this._parent) {
      // 親のプロパティ更新（UpdateDate変更）を発生させずに通知のみ伝播
      this._parent.NotifyUpdated(false);
    }
  }
}
