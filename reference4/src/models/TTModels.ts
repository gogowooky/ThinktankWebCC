/**
 * TTModels.ts
 * アプリ全体のモデルルート（シングルトン）。
 * 全コレクションはここから参照する。
 *
 * Phase 3: Status / Actions / Events / Memos の骨格
 * Phase 17 以降: Knowledge（TTKnowledge）を追加
 * Phase 30 以降: InitializeDefaultStatus / InitializeDefaultActions / InitializeDefaultEvents を呼ぶ
 */

import { TTCollection } from './TTCollection';
import { TTStatus } from './TTStatus';
import { TTActions } from './TTAction';
import { TTEvents } from './TTEvent';
import { TTDataCollection } from './TTDataCollection';

export class TTModels extends TTCollection {
  /** アプリ状態集中管理 */
  public Status: TTStatus;
  /** アクション定義コレクション */
  public Actions: TTActions;
  /** イベント→アクション バインディングコレクション */
  public Events: TTEvents;
  /** メモコレクション（Phase 17 で TTKnowledge に統合） */
  public Memos: TTDataCollection;

  private static _instance: TTModels | null = null;

  public override get ClassName(): string {
    return 'TTModels';
  }

  private constructor() {
    super();
    this.ID = 'Thinktank';
    this.Name = 'Thinktank';
    this.Description = 'Root Model';
    this.ItemSaveProperties = 'ID,Name,Count,Description';

    // ── コレクションの初期化 ───────────────────────────────────────

    this.Status = new TTStatus();
    this.Status.ID = 'Status';
    this.Status.Name = 'ステータス';

    this.Actions = new TTActions();
    this.Actions.ID = 'Actions';
    this.Actions.Name = 'アクション';

    this.Events = new TTEvents();
    this.Events.ID = 'Events';
    this.Events.Name = 'イベント';

    this.Memos = new TTDataCollection();
    this.Memos.ID = 'Memos';
    this.Memos.Name = 'メモ';

    // ── TTModels 自身の子として登録（DataGrid 等で一覧表示用） ───────

    this.AddItem(this.Status);
    this.AddItem(this.Actions);
    this.AddItem(this.Events);
    this.AddItem(this.Memos);

    // ── Phase 30 以降でここに DefaultStatus / Actions / Events を登録 ──
    // InitializeDefaultStatus(this);
    // InitializeDefaultActions(this);
    // InitializeDefaultEvents(this);

    // ── ストレージからのロード（Phase 13 以降で実際に読み込まれる）──
    this.Status.LoadCache();
    this.Actions.LoadCache();
    this.Events.LoadCache();
    this.Memos.LoadCache();
    this.LoadCache();
  }

  /** シングルトンインスタンスを取得する */
  public static get Instance(): TTModels {
    if (!TTModels._instance) {
      TTModels._instance = new TTModels();
    }
    return TTModels._instance;
  }

  /**
   * テスト用：インスタンスをリセットする。
   * 本番コードでは使用しない。
   */
  public static resetInstance(): void {
    TTModels._instance = null;
  }

  public override async LoadCache(): Promise<void> {
    this.IsLoaded = true;
  }
}
