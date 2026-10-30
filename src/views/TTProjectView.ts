/**
 * TTProjectView.ts
 * 各パネルの「プロジェクト」サブパネルで表示中のファイルと表示形式。
 * パネルごとに独立して持ち、どのファイルを開くかは呼び出し側が決める。
 */

import { TTUIItem } from '../models/TTUIItem';

export type ProjectViewMediaType = 'texteditor' | 'markdown';

export class TTProjectView extends TTUIItem {
  /** 表示中の Think ID（空 = 未表示）*/
  public ThinkID: string = '';
  public MediaType: ProjectViewMediaType = 'texteditor';

  public override get ClassName(): string { return 'TTProjectView'; }

  constructor(panelName: string) {
    super(`${panelName}.ProjectView`);
  }

  public Open(thinkId: string, mediaType: ProjectViewMediaType = this.MediaType): void {
    this.ThinkID = thinkId;
    this.MediaType = mediaType;
    this.NotifyUpdated();
  }

  public SetMediaType(mediaType: ProjectViewMediaType): void {
    if (this.MediaType === mediaType) return;
    this.MediaType = mediaType;
    this.NotifyUpdated();
  }

  public Close(): void {
    if (!this.ThinkID) return;
    this.ThinkID = '';
    this.NotifyUpdated();
  }
}
