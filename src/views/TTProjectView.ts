/**
 * TTProjectView.ts
 * 各パネルの「プロジェクト」サブパネルで表示中のファイル（表示は TextEditor のみ）。
 * パネルごとに独立して持ち、どのファイルを開くかは呼び出し側が決める。
 */

import { TTUIItem } from '../models/TTUIItem';

export class TTProjectView extends TTUIItem {
  /** 表示中の Think ID（空 = 未表示）*/
  public ThinkID: string = '';

  public override get ClassName(): string { return 'TTProjectView'; }

  constructor(panelName: string) {
    super(`${panelName}.ProjectView`);
  }

  public Open(thinkId: string): void {
    this.ThinkID = thinkId;
    this.NotifyUpdated();
  }

  public Close(): void {
    if (!this.ThinkID) return;
    this.ThinkID = '';
    this.NotifyUpdated();
  }
}
