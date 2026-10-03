/**
 * TTApplication.ts
 * Phase 4: アプリケーションルートビューモデル（更新版）。
 *
 * 4パネル構成（ThinktankPanel / SeedsPanel / DevelopPanel / HarvestPanel）を統合管理。
 * TTModelsのデータ層と各パネルビューモデルを橋渡しする。
 */

import { TTUIItem } from '../models/TTUIItem';
import { TTModels } from '../models/TTModels';
import { TTThinktankPanel } from './TTThinktankPanel';
import { TTSeedsPanel } from './TTSeedsPanel';
import { TTDevelopPanel } from './TTDevelopPanel';
import { TTHarvestPanel } from './TTHarvestPanel';
import { TTApplicationStatus } from './TTApplicationStatus';
import { TTUIStateManager } from './TTUIStateManager';
import type { MediaType } from '../types';

export class TTApplication extends TTUIItem {
  /** 4パネルのビューモデル */
  public ThinktankPanel: TTThinktankPanel;
  public SeedsPanel: TTSeedsPanel;
  public DevelopPanel: TTDevelopPanel;
  public HarvestPanel: TTHarvestPanel;

  /** アプリケーション全体の特殊状態 */
  public readonly Status: TTApplicationStatus;

  /** フォーカス中のカラム名 */
  public FocusedColumn: string = 'Thinktank';

  /** データ層（シングルトン参照）*/
  public get Models(): TTModels {
    return TTModels.Instance;
  }

  private static _instance: TTApplication | null = null;

  public override get ClassName(): string {
    return 'TTApplication';
  }

  private constructor() {
    super();
    this.ID = 'Application';
    this.Name = 'Thinktank';

    this.ThinktankPanel = new TTThinktankPanel();
    this.SeedsPanel  = new TTSeedsPanel();
    this.DevelopPanel   = new TTDevelopPanel();
    this.HarvestPanel   = new TTHarvestPanel();
    this.Status         = new TTApplicationStatus();

    // 子パネルの親を自身に設定（通知伝播用）
    this.ThinktankPanel._parent = this;
    this.SeedsPanel._parent  = this;
    this.DevelopPanel._parent   = this;
    this.HarvestPanel._parent   = this;
    this.Status._parent         = this;

    // チェック選択の共有ステートを同期（Think一覧とAI相談のchat選択欄で共通。4パネルすべてで共有）
    const sharedCheckedState = { checkedIds: [] as string[] };
    this.ThinktankPanel.SharedState = sharedCheckedState;
    this.SeedsPanel.SharedState = sharedCheckedState;
    this.DevelopPanel.SharedState = sharedCheckedState;
    this.HarvestPanel.SharedState = sharedCheckedState;

    // TTUIStateManager からのプロパティ更新を購読して、対象パネルを更新する
    const stateManager = TTUIStateManager.instance;
    stateManager.addListener('ThinktankPanel.*', () => this.ThinktankPanel.NotifyUpdated());
    stateManager.addListener('SeedsPanel.*', () => this.SeedsPanel.NotifyUpdated());
    stateManager.addListener('DevelopPanel.*', () => this.DevelopPanel.NotifyUpdated());
    stateManager.addListener('DevelopSettingPanel.*', () => this.DevelopPanel.NotifyUpdated());
    stateManager.addListener('HarvestPanel.*', () => this.HarvestPanel.NotifyUpdated());
    stateManager.addListener('Application.*', () => this.NotifyUpdated(false));
    stateManager.addListener('TextEditor.*', () => this.DevelopPanel.NotifyUpdated());
    stateManager.addListener('ToolBar.*', () => this.DevelopPanel.NotifyUpdated());
    stateManager.addListener('Thinktank.*', () => this.ThinktankPanel.NotifyUpdated());
    stateManager.addListener('Seeds.*', () => this.SeedsPanel.NotifyUpdated());
    stateManager.addListener('Develop.*', () => this.DevelopPanel.NotifyUpdated());
    stateManager.addListener('Harvest.*', () => this.HarvestPanel.NotifyUpdated());
  }

  public static get Instance(): TTApplication {
    if (!TTApplication._instance) {
      TTApplication._instance = new TTApplication();
      (window as any).ttApp = TTApplication._instance;
    }
    return TTApplication._instance;
  }

  public static resetInstance(): void {
    TTApplication._instance = null;
  }

  // ── 主要操作 ──────────────────────────────────────────────────────────

  /**
   * BundleをSeedsPanelで開く。
   * 同時にThinktankPanelの選択状態とHarvestPanelのコンテキストも更新する。
   *
   * @param bundleId BundleのID
   * @param mediaType 表示形式（省略時はmarkdown）
   */
  public OpenBundle(bundleId: string, mediaType: MediaType = 'markdown'): void {
    // ThinktankPanel: 選択状態を更新
    this.ThinktankPanel.SelectBundle(bundleId);

    // SeedsPanel: Bundleを表示
    this.SeedsPanel.OpenBundle(bundleId, mediaType);

    // HarvestPanel: コンテキストを連携
    this.HarvestPanel.LinkBundle(bundleId);

    // DevelopPanel: bundleに含まれないThinkのペインを削除
    this._removeOutOfBundlePanes(bundleId);

    this.NotifyUpdated();
  }

  /** Bundle に含まれない Think のペインを DevelopPanel から削除する */
  private _removeOutOfBundlePanes(bundleId: string): void {
    if (!bundleId) return; // 何も選択されていない時は削除しない
    const vault = this.Models.Vault;
    const thinks = vault.GetThinksForBundle(bundleId);
    const allowed = new Set(thinks.map(t => t.ID));
    allowed.add(bundleId);
    const toRemove = this.DevelopPanel.Areas
      .filter(a => !allowed.has(a.ResourceID))
      .map(a => a.ID);
    for (const areaId of toRemove) {
      this.DevelopPanel.RemoveArea(areaId);
    }
  }

  /** 指定した ID の Think ペインを DevelopPanel から削除する */
  public RemoveThinksFromDevelop(ids: string[]): void {
    const idSet = new Set(ids);
    const toRemove = this.DevelopPanel.Areas
      .filter(a => idSet.has(a.ResourceID))
      .map(a => a.ID);
    for (const areaId of toRemove) {
      this.DevelopPanel.RemoveArea(areaId);
    }
  }

  /**
   * ThinkをDevelopAreaで開く。
   * 既存のAreaが満杯（6個）の場合はnullを返す。
   *
   * @param thinkId ThinkのID
   * @param mediaType 表示形式
   * @returns 開いたTTDevelopArea（満杯の場合はnull）
   */
  public OpenThinkInDevelop(thinkId: string, mediaType?: MediaType) {
    const vault = this.Models.Vault;
    const think = vault.GetThink(thinkId);
    const title = think?.Name ?? thinkId;
    mediaType ??= think?.ContentType === 'html' ? 'html' : 'texteditor';

    return this.DevelopPanel.ReplaceFocused(thinkId, mediaType, title)
        ?? this.DevelopPanel.AddFirst(thinkId, mediaType, title);
  }

  /**
   * ThinkをHarvestPanelのコンテキストとして連携する。
   */
  public LinkThinkToHarvest(thinkId: string): void {
    this.HarvestPanel.LinkThink(thinkId);
  }

  // ── パネル全体リセット ────────────────────────────────────────────────

  /**
   * 全データをストレージから再ロードして表示を更新する（表示更新ボタン用）。
   * 未保存のエディタ変更がある場合は確認ダイアログを出す。
   */
  public async RefreshAll(): Promise<void> {
    const dirtyArea = this.DevelopPanel.Areas.find(a => a.IsDirty);
    if (dirtyArea) {
      const ok = window.confirm(
        `「${dirtyArea.Title || dirtyArea.ResourceID}」に未保存の変更があります。\n更新すると変更が失われます。続けますか？`,
      );
      if (!ok) return;
    }

    this.ThinktankPanel.ClearSelection();
    this.ThinktankPanel.ClearChecks();
    this.SeedsPanel.ClearBundle();
    this.DevelopPanel.ClearAll();
    this.HarvestPanel.ClearLink();

    await this.Models.Vault.ReloadAll();
  }

  /** 全パネルの状態をリセットする */
  public Reset(): void {
    this.ThinktankPanel.ClearSelection();
    this.ThinktankPanel.ClearChecks();
    this.ThinktankPanel.ClearFilter();
    this.SeedsPanel.ClearBundle();
    this.DevelopPanel.ClearAll();
    this.HarvestPanel.ClearLink();
    this.HarvestPanel.ClearChat();
    this.NotifyUpdated();
  }
}
