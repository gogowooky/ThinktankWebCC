/**
 * TTSeedsPanel.ts
 * SeedsPanelのビューモデル。
 *
 * 選択されたBundleの内容表示モードと
 * SeedsAreaの開閉状態を管理する。
 */

import { TTUIItem } from '../models/TTUIItem';
import { TTProjectView } from './TTProjectView';
import type { MediaType } from '../types';
import type { TTThink } from '../models/TTThink';
import { TTUIStateManager } from './TTUIStateManager';
import { TTModels } from '../models/TTModels';
import { isRootProjectTitle } from '../utils/thinkFormat';
import { selectionFor, type AiChatProviderName } from '../services/aiChatModelStatus';
import { setPanelCheckedIds, togglePanelChecks, setPanelAreaOpen, setPanelAiModel, subscribePanelAiModel } from './panelBehavior';
import type { AiModelSelection, AiProvider } from '../services/aiModels';
import { INIT_AREA_WIDTH, type AreaWidthMode } from '../utils/panelAreaWidth';


/** 'chat' は旧「対話」。AIChat に置き換えたため受け取ったら aichat で開く */
export type SeedsViewMode = 'filter' | 'chat' | 'project' | 'aiview' | 'aichat' | 'settings';

/** 開くときの表示指定。MediaType のほか、「プロジェクト」サブパネルで開く 'project' を受ける */
type SeedsOpenMode = MediaType | 'project';

// datagrid メディアは Think一覧（filter）モードにマップする
function viewModeOfMedia(mediaType: SeedsOpenMode): SeedsViewMode {
  if (mediaType === 'datagrid') return 'filter';
  if (mediaType === 'chat') return 'aichat';
  return mediaType as SeedsViewMode;
}

export class TTSeedsPanel extends TTUIItem {
  /** SeedsAreaの開閉状態（true=開いている）*/
  public IsAreaOpen: boolean = true;
  /** Area 表示幅のモード（init=起動時の値 / user=ユーザー設定値 / foredit=編集用の幅）。
   *  Status `SeedsPanel.Area.OpenWidth` の実体。px は panelAreaWidth.ts が導出する。 */
  public AreaWidthMode: AreaWidthMode = 'init';

  /** ユーザーが Splitter で設定した幅(px)。AreaWidthMode='user' のときに使う。 */
  public AreaUserWidth: number = INIT_AREA_WIDTH.Seeds;


  /** 表示中のProjectID（空 = 未選択）*/
  public ProjectID: string = '';

  public get BundleID(): string { return this.ProjectID; }
  public set BundleID(val: string) { this.ProjectID = val; }

  /** チェックされているThink IDリスト（Thinktank/Seeds/Working/Harvest で共通） */
  public SharedState = { checkedIds: [] as string[] };
  public get CheckedThoughtIDs(): string[] { return this.SharedState.checkedIds; }
  public set CheckedThoughtIDs(val: string[]) {
    setPanelCheckedIds(this, 'SeedsPanel', val);
  }

  /** 表示モード（filter/chat/project/settings）*/
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

  /** 「プロジェクト」サブパネルで表示中のファイル */
  public ProjectView = new TTProjectView('SeedsPanel');

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

  // ── Project表示 ───────────────────────────────────────────────────────

  /**
   * ProjectをSeedsAreaで開く。
   * Areaが閉じていれば自動的に開く。
   * root（タイトル「Thinktank」）の projectファイルは Thinktank パネル専用なので、Seeds には設定しない。
   */
  public OpenProject(projectId: string, mediaType: SeedsOpenMode = 'datagrid'): void {
    const target = TTModels.currentInstance?.Vault.GetThink(projectId);
    if (target?.ContentType === 'project' && isRootProjectTitle(target.Name)) return;
    this.ProjectView.Open(projectId);
    this.ProjectID = projectId;
    this.CheckedThoughtIDs = []; // チェッククリア
    if (mediaType !== 'settings' as string) {
      this.ViewMode = viewModeOfMedia(mediaType);
    }
    if (!this.IsAreaOpen) {
      this.IsAreaOpen = true;
    }
    this.NotifyUpdated();
    TTUIStateManager.instance.notifyPropertyChanged('SeedsPanel.Project.ID');
  }

  public OpenBundle(bundleId: string, mediaType: MediaType = 'datagrid'): void {
    this.OpenProject(bundleId, mediaType);
  }

  /** Project表示をクリアする */
  public ClearProject(): void {
    this.ProjectView.Close();
    this.ProjectID = '';
    this.CheckedThoughtIDs = []; // チェッククリア
    this.NotifyUpdated();
    TTUIStateManager.instance.notifyPropertyChanged('SeedsPanel.Project.ID');
  }

  public ClearBundle(): void {
    this.ClearProject();
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
    this.ViewMode = mode === 'chat' ? 'aichat' : mode;
    this.NotifyUpdated();
  }

  /** 後方互換：MediaTypeで表示モードを設定（settingsモード以外） */
  public SetMediaType(mediaType: MediaType): void {
    this.ViewMode = viewModeOfMedia(mediaType);
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
