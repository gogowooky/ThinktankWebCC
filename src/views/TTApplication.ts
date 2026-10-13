/**
 * TTApplication.ts
 * Phase 4: アプリケーションルートビューモデル（更新版）。
 *
 * 4パネル構成（ThinktankPanel / SeedsPanel / DiscussPanel / HarvestPanel）を統合管理。
 * TTModelsのデータ層と各パネルビューモデルを橋渡しする。
 */

import { TTUIItem } from '../models/TTUIItem';
import { TTModels } from '../models/TTModels';
import { TTThinktankPanel } from './TTThinktankPanel';
import { TTSeedsPanel } from './TTSeedsPanel';
import { TTDiscussPanel } from './TTDiscussPanel';
import { TTHarvestPanel } from './TTHarvestPanel';
import { TTApplicationStatus } from './TTApplicationStatus';
import { TTUIStateManager, type ConfigKey, type ConfigListener } from './TTUIStateManager';
import type { MediaType } from '../types';
import { disposeVaultDrafts } from '../services/draftStore';
import type { TTVault } from '../models/TTVault';
import { TTShortcutManager } from './TTShortcutManager';

export class TTApplication extends TTUIItem {
  /** 4パネルのビューモデル */
  public ThinktankPanel: TTThinktankPanel;
  public SeedsPanel: TTSeedsPanel;
  public DiscussPanel: TTDiscussPanel;
  public HarvestPanel: TTHarvestPanel;

  /** アプリケーション全体の特殊状態 */
  public readonly Status: TTApplicationStatus;

  /** フォーカス中のカラム名 */
  public FocusedColumn: string = 'Thinktank';

  /** データ層（シングルトン参照）*/
  public get Models(): TTModels {
    const models = TTModels.Instance;
    if (!this._disposed && this._ownedVault !== models.Vault) {
      if (this._ownedVault) disposeVaultDrafts(this._ownedVault);
      this._ownedVault = models.Vault;
    }
    return models;
  }

  private static _instance: TTApplication | null = null;
  private readonly _offStateListeners: Array<() => void> = [];
  private _disposed = false;
  // 新しいrootを遅延生成せず、生成済みrootだけを初期所有する。
  private _ownedVault: TTVault | null = TTModels.currentInstance?.Vault ?? null;

  public override get ClassName(): string {
    return 'TTApplication';
  }

  private constructor() {
    super();
    this.ID = 'Application';
    this.Name = 'Thinktank';

    this.ThinktankPanel = new TTThinktankPanel();
    this.SeedsPanel  = new TTSeedsPanel();
    this.DiscussPanel   = new TTDiscussPanel();
    this.HarvestPanel   = new TTHarvestPanel();
    this.Status         = new TTApplicationStatus();

    // 子パネルの親を自身に設定（通知伝播用）
    this.ThinktankPanel._parent = this;
    this.SeedsPanel._parent  = this;
    this.DiscussPanel._parent   = this;
    this.HarvestPanel._parent   = this;
    this.Status._parent         = this;

    // チェック選択の共有ステートを同期（Think一覧とAI相談のchat選択欄で共通。4パネルすべてで共有）
    const sharedCheckedState = { checkedIds: [] as string[] };
    this.ThinktankPanel.SharedState = sharedCheckedState;
    this.SeedsPanel.SharedState = sharedCheckedState;
    this.DiscussPanel.SharedState = sharedCheckedState;
    this.HarvestPanel.SharedState = sharedCheckedState;

    // TTUIStateManager からのプロパティ更新を購読して、対象パネルを更新する
    const stateManager = TTUIStateManager.instance;
    const listen = (key: ConfigKey, listener: ConfigListener) => {
      stateManager.addListener(key, listener);
      this._offStateListeners.push(() => stateManager.removeListener(key, listener));
    };
    listen('ThinktankPanel.*', () => this.ThinktankPanel.NotifyUpdated());
    listen('SeedsPanel.*', () => this.SeedsPanel.NotifyUpdated());
    listen('DiscussPanel.*', () => this.DiscussPanel.NotifyUpdated());
    listen('DiscussSettingPanel.*', () => this.DiscussPanel.NotifyUpdated());
    listen('HarvestPanel.*', () => this.HarvestPanel.NotifyUpdated());
    listen('Application.*', () => this.NotifyUpdated(false));
    listen('TextEditor.*', () => this.DiscussPanel.NotifyUpdated());
    listen('ToolBar.*', () => this.DiscussPanel.NotifyUpdated());
    listen('Thinktank.*', () => this.ThinktankPanel.NotifyUpdated());
    listen('Seeds.*', () => this.SeedsPanel.NotifyUpdated());
    listen('Discuss.*', () => this.DiscussPanel.NotifyUpdated());
    listen('Harvest.*', () => this.HarvestPanel.NotifyUpdated());
  }

  public static get Instance(): TTApplication {
    if (!TTApplication._instance || TTApplication._instance._disposed) {
      TTApplication._instance = new TTApplication();
      (window as any).ttApp = TTApplication._instance;
    }
    return TTApplication._instance;
  }

  public static resetInstance(): void {
    TTApplication._instance?.dispose();
    TTApplication._instance = null;
  }

  public dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const off of this._offStateListeners.splice(0)) off();
    this.ThinktankPanel.dispose();
    this.SeedsPanel.dispose();
    this.DiscussPanel.dispose();
    this.HarvestPanel.dispose();
    this.Status._parent = null;
    TTUIStateManager.instance.detach(this);
    TTShortcutManager.detachApplication(this);
    if (this._ownedVault) disposeVaultDrafts(this._ownedVault);
    this._ownedVault = null;
    const target = window as Window & { ttApp?: TTApplication };
    if (target.ttApp === this) delete target.ttApp;
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

    // DiscussPanel: bundleに含まれないThinkのペインを削除
    this._removeOutOfBundlePanes(bundleId);

    this.NotifyUpdated();
  }

  /** Bundle に含まれない Think のペインを DiscussPanel から削除する */
  private _removeOutOfBundlePanes(bundleId: string): void {
    if (!bundleId) return; // 何も選択されていない時は削除しない
    const vault = this.Models.Vault;
    const thinks = vault.GetThinksForBundle(bundleId);
    const allowed = new Set(thinks.map(t => t.ID));
    allowed.add(bundleId);
    const toRemove = this.DiscussPanel.Areas
      .filter(a => !allowed.has(a.ResourceID))
      .map(a => a.ID);
    for (const areaId of toRemove) {
      this.DiscussPanel.RemoveArea(areaId);
    }
  }

  /** 指定した ID の Think ペインを DiscussPanel から削除する */
  public RemoveThinksFromDiscuss(ids: string[]): void {
    const idSet = new Set(ids);
    const toRemove = this.DiscussPanel.Areas
      .filter(a => idSet.has(a.ResourceID))
      .map(a => a.ID);
    for (const areaId of toRemove) {
      this.DiscussPanel.RemoveArea(areaId);
    }
  }

  /**
   * ThinkをDiscussAreaで開く。
   * 既存のAreaが満杯（6個）の場合はnullを返す。
   *
   * @param thinkId ThinkのID
   * @param mediaType 表示形式
   * @returns 開いたTTDiscussArea（満杯の場合はnull）
   */
  public OpenThinkInDiscuss(thinkId: string, mediaType?: MediaType) {
    const vault = this.Models.Vault;
    const think = vault.GetThink(thinkId);
    const title = think?.Name ?? thinkId;
    mediaType ??= think?.ContentType === 'html' ? 'html' : 'texteditor';

    return this.DiscussPanel.ReplaceFocused(thinkId, mediaType, title)
        ?? this.DiscussPanel.AddFirst(thinkId, mediaType, title);
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
    const dirtyArea = this.DiscussPanel.Areas.find(a => a.IsDirty);
    if (dirtyArea) {
      const ok = window.confirm(
        `「${dirtyArea.Title || dirtyArea.ResourceID}」に未保存の変更があります。\n更新すると変更が失われます。続けますか？`,
      );
      if (!ok) return;
    }

    this.ThinktankPanel.ClearSelection();
    this.ThinktankPanel.ClearChecks();
    this.SeedsPanel.ClearBundle();
    this.DiscussPanel.ClearAll();
    this.HarvestPanel.ClearLink();

    await this.Models.Vault.ReloadAll();
  }

  /** 全パネルの状態をリセットする */
  public Reset(): void {
    this.ThinktankPanel.ClearSelection();
    this.ThinktankPanel.ClearChecks();
    this.ThinktankPanel.ClearFilter();
    this.SeedsPanel.ClearBundle();
    this.DiscussPanel.ClearAll();
    this.HarvestPanel.ClearLink();
    this.HarvestPanel.ClearChat();
    this.NotifyUpdated();
  }
}
