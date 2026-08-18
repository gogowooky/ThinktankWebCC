/**
 * TTThinktankPanel.ts
 * Phase 4: ThinktankPanelのビューモデル。
 *
 * Thoughts一覧の表示・選択・フィルタリングと
 * ThinktankAreaの開閉状態を管理する。
 */

import { TTUIItem } from '../models/TTUIItem';
import type { ContentType } from '../types/index';
import type { TTThink } from '../models/TTThink';
import { TTUIStateManager } from './TTUIStateManager';
import { loadAiModelSelection, saveAiModelSelection } from '../services/aiModels';
import type { AiModelSelection, AiProvider } from '../services/aiModels';

const AI_MODEL_STORAGE_KEY = 'tt-ai-model-thinktank';

/** ThinktankArea の表示モード */
export type ThinktankViewMode =
  | 'filter'    // Think一覧（タイトル/日時/種別フィルター・全文/AI検索を統合）
  | 'chat'      // AI相談
  | 'settings'; // 保管庫設定

export class TTThinktankPanel extends TTUIItem {
  /** ThinktankAreaの開閉状態（true=開いている）*/
  public IsAreaOpen: boolean = true;

  /** 現在選択中のBundleID（空 = 未選択）*/
  public SelectedBundleID: string = '';

  /** 複数選択中のThoughtID一覧 */
  public SharedState = { checkedIds: [] as string[] };
  public get CheckedThoughtIDs(): string[] { return this.SharedState.checkedIds; }
  public set CheckedThoughtIDs(val: string[]) {
    this.SharedState.checkedIds = val;
    if (this._parent) {
      const app = this._parent as any;
      for (const key of ['OverviewPanel', 'WorkoutPanel', 'ReThinkPanel']) {
        app[key]?.NotifyUpdated();
      }
    }
    TTUIStateManager.instance.notifyPropertyChanged('Application.CheckedItem.IDs');
  }

  /** Thoughts絞り込みテキスト（タイトル/キーワード欄） */
  public Filter: string = '';

  /** コンテンツ検索テキスト（全文検索欄、セット後に検索実行） */
  public ContentFilter: string = '';

  /** フィルター適用時に上書きする種別リスト（null = 変更しない） */
  public FilterVisibleTypes: ContentType[] | null = null;

  /** ThinktankArea の表示モード */
  public ViewMode: ThinktankViewMode = 'filter';

  /** チェック済みアイテムのみ表示するフラグ */
  public ShowCheckedOnly: boolean = false;

  /** 全種別表示へのリセット要求フラグ */
  public ShouldResetTypesToAll: boolean = false;

  /** 現在カーソル（フォーカス）が当たっているItemのID */
  public CurrentItemID: string = '';

  /** フィルタ適用後の表示中Think一覧（CursorPosアクション用スナップショット） */
  public FilteredThoughts: TTThink[] = [];

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

  // ── Bundle選択 ───────────────────────────────────────────────────────

  /**
   * Bundleを選択する。
   * @returns 選択したBundleID
   */
  public SelectBundle(bundleId: string): string {
    this.SelectedBundleID = bundleId;
    this.NotifyUpdated();
    return bundleId;
  }

  /** Bundle選択を解除する */
  public ClearSelection(): void {
    this.SelectedBundleID = '';
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

  /** タイトル/キーワード欄にフィルターをセットする */
  public SetFilter(filter: string, visibleTypes?: ContentType[]): void {
    this.Filter = filter;
    this.ContentFilter = '';
    this.FilterVisibleTypes = visibleTypes ?? null;
    this.NotifyUpdated();
  }

  /** コンテンツ検索欄にフィルターをセットし全文検索を起動する */
  public SetContentFilter(query: string, visibleTypes?: ContentType[]): void {
    this.ContentFilter = query;
    this.Filter = '';
    this.FilterVisibleTypes = visibleTypes ?? null;
    this.NotifyUpdated();
  }

  /** フィルター状態をクリアする */
  public ClearFilter(): void {
    this.Filter = '';
    this.ContentFilter = '';
    this.FilterVisibleTypes = null;
    this.NotifyUpdated();
  }

  // ── AI Chat モデル選択 ────────────────────────────────────────────────

  /** AI Chat のホストプロバイダ（このパネル専用。ブラウザ再起動後も localStorage から復元） */
  public AIChatProvider: AiProvider = loadAiModelSelection(AI_MODEL_STORAGE_KEY).provider;
  /** AI Chat のホストモデルID */
  public AIChatModel: string = loadAiModelSelection(AI_MODEL_STORAGE_KEY).model;

  public SetAIChatModel(selection: AiModelSelection): void {
    this.AIChatProvider = selection.provider;
    this.AIChatModel = selection.model;
    saveAiModelSelection(AI_MODEL_STORAGE_KEY, selection);
    this.NotifyUpdated();
  }
}
