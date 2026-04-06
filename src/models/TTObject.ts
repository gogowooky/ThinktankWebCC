import type { UpdateCallback } from '../types';

/**
 * TTObject - 全モデルの基底クラス
 *
 * Observerパターンによる反応性を提供:
 * - AddOnUpdate(key, callback): 更新通知を購読
 * - RemoveOnUpdate(key): 購読を解除
 * - NotifyUpdated(): 更新を通知（親への伝播あり）
 */
export class TTObject {
  /** 親オブジェクト（コレクションに所属する場合） */
  public _parent: TTObject | null = null;

  /** 識別子 */
  public ID: string = '';

  /** 表示名 */
  public Name: string = '';

  /** 最終更新日時 (yyyy-MM-dd-HHmmss形式) */
  public UpdateDate: string = '';

  /** 更新リスナーMap */
  private _updateListeners: Map<string, UpdateCallback> = new Map();

  constructor() {
    this.ID = this.ClassName.replace(/^TT/, '');
    this.Name = this.ClassName.replace(/^TT/, '');
    this.UpdateDate = TTObject.getNowString();
  }

  /** クラス名（サブクラスでオーバーライド） */
  public get ClassName(): string {
    return 'TTObject';
  }

  /**
   * 更新を通知する
   * @param updateDate trueの場合、UpdateDateを現在日時に更新
   */
  public NotifyUpdated(updateDate: boolean = true): void {
    if (updateDate) {
      this.UpdateDate = TTObject.getNowString();
    }

    // 全リスナーに通知
    this._updateListeners.forEach(callback => callback());

    // 親コレクションにも通知を伝播
    if (this._parent) {
      this._parent.NotifyUpdated(false);
    }
  }

  /**
   * 更新通知を購読する
   * @param key 一意のキー（同一キーは上書き）
   * @param callback 更新時に呼ばれるコールバック
   */
  public AddOnUpdate(key: string, callback: UpdateCallback): void {
    this._updateListeners.set(key, callback);
  }

  /**
   * 更新通知の購読を解除する
   * @param key 登録時のキー
   */
  public RemoveOnUpdate(key: string): void {
    this._updateListeners.delete(key);
  }

  /**
   * 現在日時をID形式の文字列で返す
   * @returns yyyy-MM-dd-HHmmss形式の文字列
   */
  public static getNowString(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}-${hh}${min}${ss}`;
  }

  /**
   * Date オブジェクトからID形式の文字列に変換
   */
  public static toIdString(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}-${hh}${min}${ss}`;
  }
}
