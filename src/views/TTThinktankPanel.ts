/**
 * TTThinktankPanel.ts
 * Phase 4: ThinktankPanelのビューモデル。
 *
 * Thoughts一覧の表示・選択・フィルタリングと
 * ThinktankAreaの開閉状態を管理する。
 */

import { TTUIItem } from '../models/TTUIItem';

/** ThinktankArea の表示モード */
export type ThinktankViewMode =
  | 'filter'    // Think一覧（タイトル/日時/種別フィルター・全文/AI検索を統合）
  | 'chat'      // AI相談
  | 'settings'; // 保管庫設定

export class TTThinktankPanel extends TTUIItem {
  /** ThinktankAreaの開閉状態（true=開いている）*/
  public IsAreaOpen: boolean = true;

  /** 現在選択中のThoughtID（空 = 未選択）*/
  public SelectedThoughtID: string = '';

  /** 複数選択中のThoughtID一覧 */
  public SharedState = { checkedIds: [] as string[] };
  public get CheckedThoughtIDs(): string[] { return this.SharedState.checkedIds; }
  public set CheckedThoughtIDs(val: string[]) {
    this.SharedState.checkedIds = val;
    if (this._parent) {
      const app = this._parent as any;
      if (app.OverviewPanel) {
        app.OverviewPanel.NotifyUpdated();
      }
    }
  }

  /** Thoughts絞り込みテキスト */
  public Filter: string = '';

  /** ThinktankArea の表示モード */
  public ViewMode: ThinktankViewMode = 'filter';

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

  /** 指定した ID (群) のチェック状態を切り替える / 指定する */
  public ToggleCheck(id: string | string[], forceChecked?: boolean): void {
    const ids = Array.isArray(id) ? id : [id];
    const current = new Set(this.CheckedThoughtIDs);

    ids.forEach(targetId => {
      const isChecked = current.has(targetId);
      const nextChecked = (forceChecked !== undefined) ? forceChecked : !isChecked;

      if (nextChecked) {
        current.add(targetId);
      } else {
        current.delete(targetId);
      }
    });

    this.CheckedThoughtIDs = Array.from(current);
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

  /** Thoughts絞り込みテキスト（コンテンツ検索用）*/
  public ContentFilter: string = '';

  /** ContentFilterテキストを更新する */
  public SetContentFilter(filter: string): void {
    this.ContentFilter = filter;
    this.NotifyUpdated();
  }
}
