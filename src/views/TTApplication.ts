/**
 * TTApplication.ts
 * Phase 4: アプリケーションルートビューモデル（更新版）。
 *
 * 4パネル構成（ThinktankPanel / OverviewPanel / WorkoutPanel / ReThinkPanel）を統合管理。
 * TTModelsのデータ層と各パネルビューモデルを橋渡しする。
 */

import { TTUIItem } from '../models/TTUIItem';
import { TTModels } from '../models/TTModels';
import { TTThinktankPanel } from './TTThinktankPanel';
import { TTOverviewPanel } from './TTOverviewPanel';
import { TTWorkoutPanel } from './TTWorkoutPanel';
import { TTReThinkPanel } from './TTReThinkPanel';
import { TTApplicationStatus } from './TTApplicationStatus';
import type { MediaType } from '../types';

export class TTApplication extends TTUIItem {
  /** 4パネルのビューモデル */
  public ThinktankPanel: TTThinktankPanel;
  public OverviewPanel: TTOverviewPanel;
  public WorkoutPanel: TTWorkoutPanel;
  public ReThinkPanel: TTReThinkPanel;

  /** アプリケーション全体の特殊状態 */
  public readonly Status: TTApplicationStatus;

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
    this.OverviewPanel  = new TTOverviewPanel();
    this.WorkoutPanel   = new TTWorkoutPanel();
    this.ReThinkPanel   = new TTReThinkPanel();
    this.Status         = new TTApplicationStatus();

    // 子パネルの親を自身に設定（通知伝播用）
    this.ThinktankPanel._parent = this;
    this.OverviewPanel._parent  = this;
    this.WorkoutPanel._parent   = this;
    this.ReThinkPanel._parent   = this;
    this.Status._parent         = this;
  }

  public static get Instance(): TTApplication {
    if (!TTApplication._instance) {
      TTApplication._instance = new TTApplication();
    }
    return TTApplication._instance;
  }

  public static resetInstance(): void {
    TTApplication._instance = null;
  }

  // ── 主要操作 ──────────────────────────────────────────────────────────

  /**
   * ThoughtをOverviewPanelで開く。
   * 同時にThinktankPanelの選択状態とReThinkPanelのコンテキストも更新する。
   *
   * @param thoughtId ThoughtのID
   * @param mediaType 表示形式（省略時はmarkdown）
   */
  public OpenThought(thoughtId: string, mediaType: MediaType = 'markdown'): void {
    // ThinktankPanel: 選択状態を更新
    this.ThinktankPanel.SelectThought(thoughtId);

    // OverviewPanel: Thoughtを表示
    this.OverviewPanel.OpenThought(thoughtId, mediaType);

    // ReThinkPanel: コンテキストを連携
    this.ReThinkPanel.LinkThought(thoughtId);

    // WorkoutPanel: thoughtに含まれないThinkのペインを削除
    this._removeOutOfThoughtPanes(thoughtId);

    this.NotifyUpdated();
  }

  /** Thought に含まれない Think のペインを WorkoutPanel から削除する */
  private _removeOutOfThoughtPanes(thoughtId: string): void {
    if (!thoughtId) return; // 何も選択されていない時は削除しない
    const vault = this.Models.Vault;
    const thinks = vault.GetThinksForThought(thoughtId);
    const allowed = new Set(thinks.map(t => t.ID));
    allowed.add(thoughtId);
    const toRemove = this.WorkoutPanel.Areas
      .filter(a => !allowed.has(a.ResourceID))
      .map(a => a.ID);
    for (const areaId of toRemove) {
      this.WorkoutPanel.RemoveArea(areaId);
    }
  }

  /** 指定した ID の Think ペインを WorkoutPanel から削除する */
  public RemoveThinksFromWorkout(ids: string[]): void {
    const idSet = new Set(ids);
    const toRemove = this.WorkoutPanel.Areas
      .filter(a => idSet.has(a.ResourceID))
      .map(a => a.ID);
    for (const areaId of toRemove) {
      this.WorkoutPanel.RemoveArea(areaId);
    }
  }

  /**
   * ThinkをWorkoutAreaで開く。
   * 既存のAreaが満杯（6個）の場合はnullを返す。
   *
   * @param thinkId ThinkのID
   * @param mediaType 表示形式
   * @returns 開いたTTWorkoutArea（満杯の場合はnull）
   */
  public OpenThinkInWorkout(thinkId: string, mediaType: MediaType = 'texteditor') {
    const vault = this.Models.Vault;
    const think = vault.GetThink(thinkId);
    const title = think?.Name ?? thinkId;

    return this.WorkoutPanel.ReplaceFocused(thinkId, mediaType, title)
        ?? this.WorkoutPanel.AddFirst(thinkId, mediaType, title);
  }

  /**
   * ThinkをReThinkPanelのコンテキストとして連携する。
   */
  public LinkThinkToReThink(thinkId: string): void {
    this.ReThinkPanel.LinkThink(thinkId);
  }

  // ── パネル全体リセット ────────────────────────────────────────────────

  /**
   * 全データをストレージから再ロードして表示を更新する（表示更新ボタン用）。
   * 未保存のエディタ変更がある場合は確認ダイアログを出す。
   */
  public async RefreshAll(): Promise<void> {
    const dirtyArea = this.WorkoutPanel.Areas.find(a => a.IsDirty);
    if (dirtyArea) {
      const ok = window.confirm(
        `「${dirtyArea.Title || dirtyArea.ResourceID}」に未保存の変更があります。\n更新すると変更が失われます。続けますか？`,
      );
      if (!ok) return;
    }

    this.ThinktankPanel.ClearSelection();
    this.ThinktankPanel.ClearChecks();
    this.OverviewPanel.ClearThought();
    this.WorkoutPanel.ClearAll();
    this.ReThinkPanel.ClearLink();

    await this.Models.Vault.ReloadAll();
  }

  /** 全パネルの状態をリセットする */
  public Reset(): void {
    this.ThinktankPanel.ClearSelection();
    this.ThinktankPanel.ClearChecks();
    this.ThinktankPanel.ClearFilter();
    this.OverviewPanel.ClearThought();
    this.WorkoutPanel.ClearAll();
    this.ReThinkPanel.ClearLink();
    this.ReThinkPanel.ClearChat();
    this.NotifyUpdated();
  }
}
