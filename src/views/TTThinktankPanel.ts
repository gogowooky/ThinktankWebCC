/**
 * TTThinktankPanel.ts
 * ThinktankPanelのビューモデル。
 *
 * Think一覧の表示・選択・フィルタリングと
 * ThinktankAreaの開閉状態を管理する。
 */

import { TTUIItem } from '../models/TTUIItem';
import { TTProjectView } from './TTProjectView';
import type { ContentType } from '../types/index';
import type { TTThink } from '../models/TTThink';
import { selectionFor, type AiChatProviderName } from '../services/aiChatModelStatus';
import { setPanelCheckedIds, togglePanelChecks, setPanelAreaOpen, setPanelAiModel, subscribePanelAiModel } from './panelBehavior';
import type { AiModelSelection, AiProvider } from '../services/aiModels';
import { INIT_AREA_WIDTH, type AreaWidthMode } from '../utils/panelAreaWidth';


/** ThinktankArea の表示モード */
export type ThinktankViewMode =
  | 'filter'    // Think一覧（タイトル/日時/種別フィルター・全文/AI検索を統合）
  | 'chat'      // AI相談
  | 'project'   // プロジェクト
  | 'settings'; // 保管庫設定

export class TTThinktankPanel extends TTUIItem {
  /** ThinktankAreaの開閉状態（true=開いている）*/
  public IsAreaOpen: boolean = true;
  /** Area 表示幅のモード（init=起動時の値 / user=ユーザー設定値 / foredit=編集用の幅）。
   *  Status `ThinktankPanel.Area.OpenWidth` の実体。px は panelAreaWidth.ts が導出する。 */
  public AreaWidthMode: AreaWidthMode = 'init';

  /** ユーザーが Splitter で設定した幅(px)。AreaWidthMode='user' のときに使う。 */
  public AreaUserWidth: number = INIT_AREA_WIDTH.Thinktank;


  /** 現在選択中のProjectID（空 = 未選択）*/
  public SelectedProjectID: string = '';

  public get SelectedBundleID(): string { return this.SelectedProjectID; }
  public set SelectedBundleID(val: string) { this.SelectedProjectID = val; }

  /** 複数選択中の thinkid 一覧 */
  public SharedState = { checkedIds: [] as string[] };
  public get CheckedThoughtIDs(): string[] { return this.SharedState.checkedIds; }
  public set CheckedThoughtIDs(val: string[]) {
    setPanelCheckedIds(this, 'ThinktankPanel', val);
  }

  /** Think一覧の絞り込みテキスト（タイトル/キーワード欄） */
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

  /** 「プロジェクト」サブパネルで表示中のファイル */
  public ProjectView = new TTProjectView('ThinktankPanel');

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
    setPanelAreaOpen(this, !this.IsAreaOpen);
  }

  /** ThinktankAreaを開く */
  public OpenArea(): void {
    setPanelAreaOpen(this, true);
  }

  /** ThinktankAreaを閉じる */
  public CloseArea(): void {
    setPanelAreaOpen(this, false);
  }

  // ── Project選択 ───────────────────────────────────────────────────────

  /**
   * Projectを選択する。
   * @returns 選択したProjectID
   */
  public SelectProject(projectId: string): string {
    this.SelectedProjectID = projectId;
    this.NotifyUpdated();
    return projectId;
  }

  public SelectBundle(bundleId: string): string {
    return this.SelectProject(bundleId);
  }

  /** Project選択を解除する */
  public ClearSelection(): void {
    this.SelectedProjectID = '';
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
    togglePanelChecks(this, id, forceChecked);
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

  // プロバイダ（Status ThinktankPanel.AIChat.ModelName）はこのパネル専用、モデルはプロバイダ単位で
  // 全パネル共通（Status AIChat.ModelNames.*。services/aiChatModelStatus.ts）。

  /** Status ThinktankPanel.AIChat.ModelName の実体 */
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
