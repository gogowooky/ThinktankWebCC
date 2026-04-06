import { TTCollection } from './TTCollection';
import { TTStatus } from './TTStatus';
import { TTActions } from './TTAction';
import { TTEvents } from './TTEvent';
import { TTKnowledge } from './TTKnowledge';

/**
 * TTModels - アプリケーション全体のモデルルート（シングルトン）
 *
 * 全コレクションを保持し、アプリのデータレイヤーを統括する。
 */
export class TTModels extends TTCollection {
  /** UI状態 */
  public Status: TTStatus;

  /** アクション定義 */
  public Actions: TTActions;

  /** イベントバインディング */
  public Events: TTEvents;

  /** 統合ナレッジコレクション（メモ・チャット等を統合） */
  public Knowledge: TTKnowledge;

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

    this.Knowledge = new TTKnowledge();
    this.Knowledge.ID = 'Knowledge';
    this.Knowledge.Name = 'ナレッジ';
    this.Knowledge.DatabaseID = 'Knowledge';
    this.Knowledge.Description = 'メモ・チャットを統合した知識ベース';
    this.Knowledge.ListPropertiesMin = 'ID,ContentType,Name';
    this.Knowledge.ListProperties = 'ID,Name,ContentType,UpdateDate';
    this.Knowledge.ColumnMapping = 'ID:ID,Name:タイトル,ContentType:種別,UpdateDate:更新日時';
    this.Knowledge.ColumnMaxWidth = 'ID:18,Name:50,ContentType:6,UpdateDate:18';
    // 統合対象カテゴリ:
    //   memos  ← BQ:'Memo'  （旧アプリ互換）
    //   chats  ← BQ:'Chats' （移行期: 旧カテゴリ名で保存されたBQデータを吸収）
    //   chats  ← BQ:'chats' （新カテゴリ名、新規保存分）
    this.Knowledge.SyncCategories = [
      { localCategory: 'memos', remoteCategory: 'Memo' },
      { localCategory: 'chats', remoteCategory: 'Chats' },
      { localCategory: 'chats', remoteCategory: 'chats' },
    ];

    // コレクションを登録
    this.AddItem(this.Status);
    this.AddItem(this.Actions);
    this.AddItem(this.Events);
    this.AddItem(this.Knowledge);

    // ─── 初期化処理 ───
    // Phase 21でDefaultStatus/DefaultActions/DefaultEventsの初期化を追加

    // キャッシュロード
    this.Status.LoadCache();
    this.Actions.LoadCache();
    this.Events.LoadCache();
    this.Knowledge.LoadCache();
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
