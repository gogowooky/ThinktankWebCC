/**
 * TTUIItem.ts
 * UI 状態管理用の軽量基底クラス。
 * 永続化用のタイムスタンプ更新（NotifyUpdated での文字列生成）を排除し、
 * React UI との連動に特化する。
 */

import { TTNotifyBase } from './TTNotifyBase';

export class TTUIItem extends TTNotifyBase {
  public ID: string = '';
  public Name: string = '';

  constructor(id?: string) {
    super();
    this.ID = id || this.ClassName.replace(/^TT/, '');
    this.Name = this.ID;
  }

  public get ClassName(): string {
    return 'TTUIItem';
  }

  /**
   * UI の変更を通知する。
   * TTObject と異なり、タイムスタンプ更新（文字列生成）を行わないため軽量。
   */
  public override NotifyUpdated(propagateParent: boolean = true): void {
    super.NotifyUpdated(propagateParent);
  }

  /** ID生成用の現在時刻文字列を取得 (yyyy-MM-dd-HHmmss) */
  protected getNowString(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
}
