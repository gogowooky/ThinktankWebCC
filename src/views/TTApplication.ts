/**
 * TTApplication.ts
 * Phase 4: アプリケーションルートビューモデル（更新版）。
 *
 * 4パネル構成（ThinktankPanel / OverviewPanel / WorkoutPanel / ToDoPanel）を統合管理。
 * TTModelsのデータ層と各パネルビューモデルを橋渡しする。
 */

import { TTObject } from '../models/TTObject';
import { TTModels } from '../models/TTModels';
import { TTThinktankPanel } from './TTThinktankPanel';
import { TTOverviewPanel } from './TTOverviewPanel';
import { TTWorkoutPanel } from './TTWorkoutPanel';
import { TTToDoPanel } from './TTToDoPanel';
import type { MediaType } from '../types';

export class TTApplication extends TTObject {
  /** 4パネルのビューモデル */
  public ThinktankPanel: TTThinktankPanel;
  public OverviewPanel: TTOverviewPanel;
  public WorkoutPanel: TTWorkoutPanel;
  public ToDoPanel: TTToDoPanel;

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
    this.ToDoPanel      = new TTToDoPanel();

    // 子パネルの親を自身に設定（通知伝播用）
    this.ThinktankPanel._parent = this;
    this.OverviewPanel._parent  = this;
    this.WorkoutPanel._parent   = this;
    this.ToDoPanel._parent      = this;
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
   * 同時にThinktankPanelの選択状態とToDoPanelのコンテキストも更新する。
   *
   * @param thoughtId ThoughtのID
   * @param mediaType 表示形式（省略時はmarkdown）
   */
  public OpenThought(thoughtId: string, mediaType: MediaType = 'markdown'): void {
    // ThinktankPanel: 選択状態を更新
    this.ThinktankPanel.SelectThought(thoughtId);

    // OverviewPanel: Thoughtを表示
    this.OverviewPanel.OpenThought(thoughtId, mediaType);

    // ToDoPanel: コンテキストを連携
    this.ToDoPanel.LinkThought(thoughtId);

    this.NotifyUpdated();
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
    return this.WorkoutPanel.AddArea(thinkId, mediaType, title);
  }

  /**
   * ThinkをToDoPanelのコンテキストとして連携する。
   */
  public LinkThinkToToDo(thinkId: string): void {
    this.ToDoPanel.LinkThink(thinkId);
  }

  // ── パネル全体リセット ────────────────────────────────────────────────

  /** 全パネルの状態をリセットする */
  public Reset(): void {
    this.ThinktankPanel.ClearSelection();
    this.ThinktankPanel.ClearChecks();
    this.ThinktankPanel.ClearFilter();
    this.OverviewPanel.ClearThought();
    this.WorkoutPanel.ClearAll();
    this.ToDoPanel.ClearLink();
    this.ToDoPanel.ClearChat();
    this.NotifyUpdated();
  }
}
