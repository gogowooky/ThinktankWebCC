/**
 * TTThinktankPanel.ts
 * Phase 4: ThinktankPanelのビューモデル。
 *
 * Thoughts一覧の表示・選択・フィルタリングと
 * ThinktankAreaの開閉状態を管理する。
 */

import { TTObject } from '../models/TTObject';

/** ThinktankArea の表示モード */
export type ThinktankViewMode =
  | 'thoughts'  // Thoughtデータのみ表示（デフォルト）
  | 'filter'    // タイトル・日時でフィルター
  | 'search'    // 全文検索
  | 'ai'        // AI相談（Phase 14 で接続）
  | 'settings'; // 保管庫設定

export class TTThinktankPanel extends TTObject {
  /** ThinktankAreaの開閉状態（true=開いている）*/
  public IsAreaOpen: boolean = true;

  /** 現在選択中のThoughtID（空 = 未選択）*/
  public SelectedThoughtID: string = '';

  /** 複数選択中のThoughtID一覧 */
  public CheckedThoughtIDs: string[] = [];

  /** Thoughts絞り込みテキスト */
  public Filter: string = '';

  /** ThinktankArea の表示モード */
  public ViewMode: ThinktankViewMode = 'thoughts';

  /** チェック済みアイテムのみ表示するフラグ */
  public ShowCheckedOnly: boolean = false;

  public override get ClassName(): string {
    return 'TTThinktankPanel';
  }

  constructor() {
    super();
    this.ID = 'ThinktankPanel';
    this.Name = 'ThinktankPanel';
  }

  // ── Area開閉 ──────────────────────────────────────────────────────────

  /** ThinktankAreaの開閉を切り替える */
  public ToggleArea(): void {
    this.IsAreaOpen = !this.IsAreaOpen;
    this.NotifyUpdated();
  }

  /** ThinktankAreaを開く */
  public OpenArea(): void {
    if (!this.IsAreaOpen) {
      this.IsAreaOpen = true;
      this.NotifyUpdated();
    }
  }

  /** ThinktankAreaを閉じる */
  public CloseArea(): void {
    if (this.IsAreaOpen) {
      this.IsAreaOpen = false;
      this.NotifyUpdated();
    }
  }

  // ── Thought選択 ───────────────────────────────────────────────────────

  /**
   * Thoughtを選択する。
   * @returns 選択したThoughtID
   */
  public SelectThought(thoughtId: string): string {
    this.SelectedThoughtID = thoughtId;
    this.NotifyUpdated();
    return thoughtId;
  }

  /** Thought選択を解除する */
  public ClearSelection(): void {
    this.SelectedThoughtID = '';
    this.NotifyUpdated();
  }

  // ── チェックボックス選択 ──────────────────────────────────────────────

  /** 指定IDをすべてチェック状態にする */
  public CheckAll(ids: string[]): void {
    this.CheckedThoughtIDs = [...ids];
    this.NotifyUpdated();
  }

  /** ThoughtのチェックON/OFFを切り替える */
  public ToggleCheck(thoughtId: string): void {
    const idx = this.CheckedThoughtIDs.indexOf(thoughtId);
    if (idx === -1) {
      this.CheckedThoughtIDs = [...this.CheckedThoughtIDs, thoughtId];
    } else {
      this.CheckedThoughtIDs = this.CheckedThoughtIDs.filter(id => id !== thoughtId);
    }
    this.NotifyUpdated();
  }

  /** 全チェックをクリアする */
  public ClearChecks(): void {
    this.CheckedThoughtIDs = [];
    this.NotifyUpdated();
  }

  // ── 表示モード ────────────────────────────────────────────────────────

  /** チェックのみ表示を切り替える */
  public ToggleShowCheckedOnly(): void {
    this.ShowCheckedOnly = !this.ShowCheckedOnly;
    this.NotifyUpdated();
  }

  /** 表示モードを切り替える */
  public SetViewMode(mode: ThinktankViewMode): void {
    this.ViewMode = mode;
    this.NotifyUpdated();
  }

  // ── フィルター ────────────────────────────────────────────────────────

  /** Filterテキストを更新する */
  public SetFilter(filter: string): void {
    this.Filter = filter;
    this.NotifyUpdated();
  }

  /** Filterをクリアする */
  public ClearFilter(): void {
    this.Filter = '';
    this.NotifyUpdated();
  }
}
