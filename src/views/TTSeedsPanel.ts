/**
 * TTSeedsPanel.ts
 * SeedsPanelのビューモデル。
 *
 * 選択されたBundleの内容表示・分析モードと
 * SeedsAreaの開閉状態を管理する。
 */

import { TTUIItem } from '../models/TTUIItem';
import type { MediaType } from '../types';
import type { TTThink } from '../models/TTThink';
import { TTUIStateManager } from './TTUIStateManager';
import { selectionFor, type AiChatProviderName } from '../services/aiChatModelStatus';
import { setPanelCheckedIds, togglePanelChecks, setPanelAreaOpen, setPanelAiModel, subscribePanelAiModel } from './panelBehavior';
import type { AiModelSelection, AiProvider } from '../services/aiModels';
import { INIT_AREA_WIDTH, type AreaWidthMode } from '../utils/panelAreaWidth';


export type SeedsViewMode = 'filter' | 'graph' | 'chat' | 'settings';

export class TTSeedsPanel extends TTUIItem {
  /** SeedsAreaの開閉状態（true=開いている）*/
  public IsAreaOpen: boolean = true;
  /** Area 表示幅のモード（init=起動時の値 / user=ユーザー設定値 / foredit=編集用の幅）。
   *  Status `SeedsPanel.Area.OpenWidth` の実体。px は panelAreaWidth.ts が導出する。 */
  public AreaWidthMode: AreaWidthMode = 'init';

  /** ユーザーが Splitter で設定した幅(px)。AreaWidthMode='user' のときに使う。 */
  public AreaUserWidth: number = INIT_AREA_WIDTH.Seeds;


  /** 表示中のBundleID（空 = 未選択）*/
  public BundleID: string = '';

  /** チェックされているThink IDリスト（Thinktank/Seeds/Discuss/Harvest で共通） */
  public SharedState = { checkedIds: [] as string[] };
  public get CheckedThoughtIDs(): string[] { return this.SharedState.checkedIds; }
  public set CheckedThoughtIDs(val: string[]) {
    setPanelCheckedIds(this, 'SeedsPanel', val);
  }

  /** 表示モード（filter/graph/chat/settings）*/
  public ViewMode: SeedsViewMode = 'filter';

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
    return 'TTSeedsPanel';
  }

  constructor() {
    super();
    this.ID = 'SeedsPanel';
    this.Name = 'SeedsPanel';
  }

  // ── Area開閉 ──────────────────────────────────────────────────────────

  /** SeedsAreaの開閉を切り替える */
  public ToggleArea(): void {
    setPanelAreaOpen(this, !this.IsAreaOpen);
  }

  /** SeedsAreaを開く */
  public OpenArea(): void {
    setPanelAreaOpen(this, true);
  }

  /** SeedsAreaを閉じる */
  public CloseArea(): void {
    setPanelAreaOpen(this, false);
  }

  // ── Bundle表示 ───────────────────────────────────────────────────────

  /**
   * BundleをSeedsAreaで開く。
   * Areaが閉じていれば自動的に開く。
   */
  public OpenBundle(bundleId: string, mediaType: MediaType = 'datagrid'): void {
    this.BundleID = bundleId;
    this.CheckedThoughtIDs = []; // チェッククリア
    if (mediaType !== 'settings' as string) {
      // datagrid メディアは Think一覧（filter）モードにマップする
      this.ViewMode = (mediaType === 'datagrid' ? 'filter' : mediaType) as SeedsViewMode;
    }
    if (!this.IsAreaOpen) {
      this.IsAreaOpen = true;
    }
    this.NotifyUpdated();
    TTUIStateManager.instance.notifyPropertyChanged('SeedsPanel.Bundle.ID');
  }

  /** Bundle表示をクリアする */
  public ClearBundle(): void {
    this.BundleID = '';
    this.CheckedThoughtIDs = []; // チェッククリア
    this.NotifyUpdated();
    TTUIStateManager.instance.notifyPropertyChanged('SeedsPanel.Bundle.ID');
  }

  /** チェック状態を更新する */
  public SetCheckedThoughtIDs(ids: string[]): void {
    this.CheckedThoughtIDs = ids;
    this.NotifyUpdated();
  }

  /** 指定した ID (群) のチェック状態を切り替える / 指定する */
  public ToggleCheck(id: string | string[], forceChecked?: boolean): void {
    togglePanelChecks(this, id, forceChecked);
  }

  // ── 表示モード ────────────────────────────────────────────────────────

  /** 表示モードを切り替える */
  public SetViewMode(mode: SeedsViewMode): void {
    this.ViewMode = mode;
    this.NotifyUpdated();
  }

  /** 後方互換：MediaTypeで表示モードを設定（settingsモード以外） */
  public SetMediaType(mediaType: MediaType): void {
    // datagrid メディアは Think一覧（filter）モードにマップする
    this.ViewMode = (mediaType === 'datagrid' ? 'filter' : mediaType) as SeedsViewMode;
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

  // プロバイダ（Status SeedsPanel.AIChat.ModelName）はこのパネル専用、モデルはプロバイダ単位で
  // 全パネル共通（Status AIChat.ModelNames.*。services/aiChatModelStatus.ts）。

  /** Status SeedsPanel.AIChat.ModelName の実体 */
  public AIChatProviderName: AiChatProviderName = 'Claude';

  /** 送信に使うプロバイダ（AIChatProviderName と AIChat.ModelNames.* から導く） */
  public get AIChatProvider(): AiProvider { return selectionFor(this.AIChatProviderName).provider; }
  /** 送信に使うモデルID */
  public get AIChatModel(): string { return selectionFor(this.AIChatProviderName).model; }

  public SetAIChatModel(selection: AiModelSelection): void {
    setPanelAiModel(this, selection);
  }

  // 他パネルで同じプロバイダのモデルが選び直されたら、このパネルの表示も更新する
  private readonly _offModelNames = subscribePanelAiModel(this);

  public dispose(): void {
    this._offModelNames();
    this._parent = null;
  }
}
