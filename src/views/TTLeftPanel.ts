/**
 * TTLeftPanel.ts
 * 左パネルのビューモデル。
 * リボンのアイコンクリックで開閉し、ナビゲーター/検索/タグ/最近 を切り替える。
 *
 * Phase 4: 状態管理（IsOpen / Width / PanelType / Filter / SelectedItemID）
 * Phase 5 以降: AppLayout の Splitter と接続して幅を変更可能にする
 * Phase 6 以降: NavigatorView がこのビューモデルを購読してリスト表示する
 */

import { TTObject } from '../models/TTObject';
import type { LeftPanelType } from '../types';

export class TTLeftPanel extends TTObject {
  /** パネルの開閉状態 */
  public IsOpen: boolean = true;

  /** パネル幅（px）。Splitter でドラッグ変更される。*/
  public Width: number = 260;

  /** 表示中のパネル種別 */
  public PanelType: LeftPanelType = 'navigator';

  /**
   * ナビゲーターのフィルタ文字列。
   * AND / OR / NOT 構文（Phase 6 の NavigatorView で解析）。
   */
  public Filter: string = '';

  /** ナビゲーターで選択中のアイテム ID */
  public SelectedItemID: string = '';

  public override get ClassName(): string {
    return 'TTLeftPanel';
  }

  constructor() {
    super();
    this.ID = 'LeftPanel';
    this.Name = 'LeftPanel';
  }

  // ── 操作 ──────────────────────────────────────────────────────────

  /** パネルを開く */
  public Open(): void {
    if (this.IsOpen) return;
    this.IsOpen = true;
    this.NotifyUpdated();
  }

  /** パネルを閉じる */
  public Close(): void {
    if (!this.IsOpen) return;
    this.IsOpen = false;
    this.NotifyUpdated();
  }

  /** 開閉をトグルする */
  public Toggle(): void {
    this.IsOpen ? this.Close() : this.Open();
  }

  /**
   * パネル種別を切り替える。
   * 同じ種別をクリックした場合は開閉トグル。
   */
  public SwitchTo(type: LeftPanelType): void {
    if (this.PanelType === type && this.IsOpen) {
      this.Close();
      return;
    }
    this.PanelType = type;
    this.IsOpen = true;
    this.NotifyUpdated();
  }

  /** フィルタ文字列を更新する */
  public SetFilter(filter: string): void {
    if (this.Filter === filter) return;
    this.Filter = filter;
    this.NotifyUpdated();
  }

  /** 選択アイテムを更新する */
  public SelectItem(id: string): void {
    if (this.SelectedItemID === id) return;
    this.SelectedItemID = id;
    this.NotifyUpdated();
  }

  /** 幅を更新する（Splitter からドラッグ完了時に呼ぶ）*/
  public SetWidth(width: number): void {
    const clamped = Math.max(180, Math.min(600, width));
    if (this.Width === clamped) return;
    this.Width = clamped;
    this.NotifyUpdated();
  }
}
