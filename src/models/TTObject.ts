/**
 * TTObject.ts
 * Observer パターン基底クラス。
 * 全モデルクラスの共通インターフェース（ID / Name / UpdateDate / 通知）を提供する。
 */

export class TTObject {
  public _parent: TTObject | null = null;
  public ID: string = '';
  public Name: string = '';
  public UpdateDate: string = '';

  private _updateListeners: Map<string, () => void> = new Map();

  constructor() {
    this.ID = this.ClassName.replace(/^TT/, '');
    this.Name = this.ClassName.replace(/^TT/, '');
    this.UpdateDate = this.getNowString();
  }

  public get ClassName(): string {
    return 'TTObject';
  }

  /**
   * 変更を通知する。
   * @param updateDate true（デフォルト）の場合は UpdateDate を現在時刻に更新してから通知する。
   *                   親への伝播時は false を渡して二重更新を防ぐ。
   */
  public NotifyUpdated(updateDate: boolean = true): void {
    if (updateDate) {
      this.UpdateDate = this.getNowString();
    }
    this._updateListeners.forEach(cb => cb());
    // 親コレクションへ伝播（UpdateDate は更新しない）
    if (this._parent) {
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

  /** 現在時刻を "yyyy-MM-dd-HHmmss-mmm-rand" 形式の文字列で返す（ミリ秒 + ランダムで確実に一意） */
  protected getNowString(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    // ランダムなサフィックス（4文字）で同一ミリ秒内での重複を防止
    const rand = Math.random().toString(36).slice(2, 6);
    return `${yyyy}-${mm}-${dd}-${hh}${min}${ss}-${ms}-${rand}`;
  }
}
