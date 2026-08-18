/**
 * TTOverviewPanel.ts
 * Phase 4: OverviewPanelのビューモデル。
 *
 * 選択されたBundleの内容表示・分析モードと
 * OverviewAreaの開閉状態を管理する。
 */

import { TTUIItem } from '../models/TTUIItem';
import type { MediaType } from '../types';
import type { TTThink } from '../models/TTThink';
import { TTUIStateManager } from './TTUIStateManager';
import { loadAiModelSelection, saveAiModelSelection } from '../services/aiModels';
import type { AiModelSelection, AiProvider } from '../services/aiModels';

const AI_MODEL_STORAGE_KEY = 'tt-ai-model-overview';

export type OverviewViewMode = 'filter' | 'graph' | 'chat' | 'settings';

export class TTOverviewPanel extends TTUIItem {
  /** OverviewAreaの開閉状態（true=開いている）*/
  public IsAreaOpen: boolean = true;

  /** 表示中のBundleID（空 = 未選択）*/
  public BundleID: string = '';

  /** チェックされているThink IDリスト（Thinktank/Overview/Workout/ReThink で共通） */
  public SharedState = { checkedIds: [] as string[] };
  public get CheckedThoughtIDs(): string[] { return this.SharedState.checkedIds; }
  public set CheckedThoughtIDs(val: string[]) {
    this.SharedState.checkedIds = val;
    if (this._parent) {
      const app = this._parent as any;
      for (const key of ['ThinktankPanel', 'WorkoutPanel', 'ReThinkPanel']) {
        app[key]?.NotifyUpdated();
      }
    }
    TTUIStateManager.instance.notifyPropertyChanged('Application.CheckedItem.IDs');
  }

  /** 表示モード（filter/graph/chat/settings）*/
  public ViewMode: OverviewViewMode = 'filter';

  /** MediaTypeの後方互換ゲッター（ViewModeから導出）*/
  public get MediaType(): MediaType {
    // Think一覧（filter）と設定は datagrid メディアで描画する
    return (this.ViewMode === 'settings' || this.ViewMode === 'filter' ? 'datagrid' : this.ViewMode) as MediaType;
  }

  /** 全文検索テキスト */
  public SearchQuery: string = '';

  /** 現在カーソル（フォーカス）が当たっているItemのID */
  public CurrentItemID: string = '';

  /** フィルタ適用後の表示中Think一覧（CursorPosアクション用スナップショット） */
  public FilteredThoughts: TTThink[] = [];

  public override get ClassName(): string {
    return 'TTOverviewPanel';
  }

  constructor() {
    super();
    this.ID = 'OverviewPanel';
    this.Name = 'OverviewPanel';
  }

  // ── Area開閉 ──────────────────────────────────────────────────────────

  /** OverviewAreaの開閉を切り替える */
  public ToggleArea(): void {
    this.IsAreaOpen = !this.IsAreaOpen;
    this.NotifyUpdated();
  }

  /** OverviewAreaを開く */
  public OpenArea(): void {
    if (!this.IsAreaOpen) {
      this.IsAreaOpen = true;
      this.NotifyUpdated();
    }
  }

  /** OverviewAreaを閉じる */
  public CloseArea(): void {
    if (this.IsAreaOpen) {
      this.IsAreaOpen = false;
      this.NotifyUpdated();
    }
  }

  // ── Bundle表示 ───────────────────────────────────────────────────────

  /**
   * BundleをOverviewAreaで開く。
   * Areaが閉じていれば自動的に開く。
   */
  public OpenBundle(bundleId: string, mediaType: MediaType = 'datagrid'): void {
    this.BundleID = bundleId;
    this.CheckedThoughtIDs = []; // チェッククリア
    if (mediaType !== 'settings' as string) {
      // datagrid メディアは Think一覧（filter）モードにマップする
      this.ViewMode = (mediaType === 'datagrid' ? 'filter' : mediaType) as OverviewViewMode;
    }
    if (!this.IsAreaOpen) {
      this.IsAreaOpen = true;
    }
    this.NotifyUpdated();
    TTUIStateManager.instance.notifyPropertyChanged('Overview.Bundle.Name');
  }

  /** Bundle表示をクリアする */
  public ClearBundle(): void {
    this.BundleID = '';
    this.CheckedThoughtIDs = []; // チェッククリア
    this.NotifyUpdated();
    TTUIStateManager.instance.notifyPropertyChanged('Overview.Bundle.Name');
  }

  /** チェック状態を更新する */
  public SetCheckedThoughtIDs(ids: string[]): void {
    this.CheckedThoughtIDs = ids;
    this.NotifyUpdated();
  }

  /** 指定した ID (群) のチェック状態を切り替える / 指定する */
  public ToggleCheck(id: string | string[], forceChecked?: boolean): void {
    const ids = Array.isArray(id) ? id : [id];
    const current = new Set(this.CheckedThoughtIDs);

    ids.forEach(targetId => {
      const nextChecked = (forceChecked !== undefined) ? forceChecked : !current.has(targetId);
      if (nextChecked) {
        current.add(targetId);
      } else {
        current.delete(targetId);
      }
    });

    this.CheckedThoughtIDs = Array.from(current);
    this.NotifyUpdated();
  }

  // ── 表示モード ────────────────────────────────────────────────────────

  /** 表示モードを切り替える */
  public SetViewMode(mode: OverviewViewMode): void {
    this.ViewMode = mode;
    this.NotifyUpdated();
  }

  /** 後方互換：MediaTypeで表示モードを設定（settingsモード以外） */
  public SetMediaType(mediaType: MediaType): void {
    // datagrid メディアは Think一覧（filter）モードにマップする
    this.ViewMode = (mediaType === 'datagrid' ? 'filter' : mediaType) as OverviewViewMode;
    this.NotifyUpdated();
  }

  // ── 全文検索 ──────────────────────────────────────────────────────────

  /** 全文検索クエリを更新する */
  public SetSearchQuery(query: string): void {
    this.SearchQuery = query;
    this.NotifyUpdated();
  }

  /** 全文検索をクリアする */
  public ClearSearch(): void {
    this.SearchQuery = '';
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
