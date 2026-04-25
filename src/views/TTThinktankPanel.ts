/**
 * TTThinktankPanel.ts
 * Phase 4: ThinktankPanelのビューモデル。
 *
 * Thoughts一覧の表示・選択・フィルタリングと
 * ThinktankAreaの開閉状態を管理する。
 */

import { TTObject } from '../models/TTObject';

export class TTThinktankPanel extends TTObject {
  /** ThinktankAreaの開閉状態（true=開いている）*/
  public IsAreaOpen: boolean = true;

  /** 現在選択中のThoughtID（空 = 未選択）*/
  public SelectedThoughtID: string = '';

  /** 複数選択中のThoughtID一覧 */
  public CheckedThoughtIDs: string[] = [];

  /** Thoughts絞り込みテキスト */
  public Filter: string = '';

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
