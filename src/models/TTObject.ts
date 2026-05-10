/**
 * TTObject.ts
 * データ永続化用の基底クラス。
 * ID / Name / UpdateDate 等の共通プロパティを提供し、変更時にタイムスタンプを更新する。
 */

import { TTNotifyBase } from './TTNotifyBase';

export class TTObject extends TTNotifyBase {
  public ID: string = '';
  public Name: string = '';
  public UpdateDate: string = '';

  constructor() {
    super();
    this.ID = this.ClassName.replace(/^TT/, '');
    this.Name = this.ClassName.replace(/^TT/, '');
    this.UpdateDate = this.getNowString();
  }

  public get ClassName(): string {
    return 'TTObject';
  }

  /**
   * 変更を通知し、UpdateDate を更新する。
   * @param updateDate true（デフォルト）の場合は UpdateDate を現在時刻に更新してから通知する。
   */
  public override NotifyUpdated(updateDate: boolean = true): void {
    if (updateDate) {
      this.UpdateDate = this.getNowString();
    }
    // 親への通知伝播も含めて委譲。親が TTObject なら UpdateDate 更新が連鎖する
    super.NotifyUpdated(true);
  }

  /** 現在時刻を "yyyy-MM-dd-HHmmss-mmm-rand" 形式の文字列で返す */
  protected getNowString(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    const rand = Math.random().toString(36).slice(2, 6);
    return `${yyyy}-${mm}-${dd}-${hh}${min}${ss}-${ms}-${rand}`;
  }
}
