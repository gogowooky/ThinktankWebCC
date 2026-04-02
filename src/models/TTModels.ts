import { TTCollection } from './TTCollection';
import { TTStatus } from './TTStatus';
import { TTActions } from './TTAction';
import { TTEvents } from './TTEvent';
import { TTDataCollection } from './TTDataCollection';

/**
 * TTModels - アプリケーション全体のモデルルート（シングルトン）
 *
 * 全コレクションを保持し、アプリのデータレイヤーを統括する。
 * Phase 15で TTChatCollection を追加予定。
 */
export class TTModels extends TTCollection {
  /** UI状態 */
  public Status: TTStatus;

  /** アクション定義 */
  public Actions: TTActions;

  /** イベントバインディング */
  public Events: TTEvents;

  /** メモコレクション */
  public Memos: TTDataCollection;

  /** シングルトンインスタンス */
  private static _instance: TTModels;

  public override get ClassName(): string {
    return 'TTModels';
  }

  private constructor() {
    super();
    this.ID = 'Thinktank';
    this.Name = 'Thinktank';
    this.Description = 'Collection List';

    this.ItemSaveProperties = 'ID,Name,Count,Description';
    this.ListPropertiesMin = 'ID,Count,Name';
    this.ListProperties = 'ID,Name,Count,Description';
    this.ColumnMapping = 'ID:コレクションID,Name:コレクション名,Count:アイテム数,Description:説明';
    this.ColumnMaxWidth = 'ID:11,Count:7,Name:40,Description:100';

    // ─── コレクション初期化 ───

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
    this.Memos.DatabaseID = 'memos';
    this.Memos.Description = 'メモコレクション';

    // コレクションを登録
    this.AddItem(this.Status);
    this.AddItem(this.Actions);
    this.AddItem(this.Events);
    this.AddItem(this.Memos);

    // ─── 初期化処理 ───
    // Phase 21でDefaultStatus/DefaultActions/DefaultEventsの初期化を追加

    // キャッシュロード
    this.Status.LoadCache();
    this.Actions.LoadCache();
    this.Events.LoadCache();
    this.Memos.LoadCache();
    this.LoadCache();
  }

  /** シングルトンインスタンスを取得 */
  public static get Instance(): TTModels {
    if (!TTModels._instance) {
      TTModels._instance = new TTModels();
    }
    return TTModels._instance;
  }

  /** テスト用：インスタンスをリセット */
  public static resetInstance(): void {
    TTModels._instance = undefined as unknown as TTModels;
  }

  public override async LoadCache(): Promise<void> {
    this.IsLoaded = true;
  }
}
