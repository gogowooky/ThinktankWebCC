/**
 * TTKnowledge - 統合ナレッジコレクション
 *
 * メモ・チャット等、複数カテゴリのデータを1つのコレクションに統合する。
 * DataGridは TTKnowledge を参照し、種別(ContentType)でフィルタ可能。
 *
 * 各アイテムの CollectionID に元カテゴリを保持するため、
 * TTDataItem.SaveContent() は正しいカテゴリへ保存される。
 */

import { TTDataCollection } from './TTDataCollection';
import { storageManager } from '../services/storage/StorageManager';

export interface KnowledgeCategory {
  /** IndexedDB側のカテゴリ名（例: 'memos'） */
  localCategory: string;
  /** BQ側のカテゴリ名（例: 'Memo'）。省略時はlocalCategoryと同じ */
  remoteCategory?: string;
  /**
   * true のとき BQ→local の取得のみ行い、local→BQ のプッシュは行わない。
   * 旧カテゴリ名との互換読み込みなど、移行専用の同期に使用する。
   */
  readOnly?: boolean;
}

export class TTKnowledge extends TTDataCollection {
  /** 統合対象カテゴリ一覧 */
  public SyncCategories: KnowledgeCategory[] = [];

  public override get ClassName(): string {
    return 'TTKnowledge';
  }

  constructor() {
    super();
    // TTKnowledgeは自身でアイテムのCSV保存を行わない
    // （各TTDataItemがSaveContent()で個別に保存する）
    this.ItemSaveProperties = '';
  }

  /** このコレクションが扱うすべてのローカルカテゴリ */
  public override get HandledCategories(): string[] {
    return this.SyncCategories.map(c => c.localCategory);
  }

  /**
   * 全カテゴリのBQ↔IndexedDB差分同期を行い、統合コレクションに反映
   */
  public override async LoadCache(): Promise<void> {
    if (!storageManager.isInitialized) {
      this.IsLoaded = true;
      return;
    }

    try {
      let totalLoaded = 0;

      for (const { localCategory, remoteCategory, readOnly } of this.SyncCategories) {
        const bqCategory = remoteCategory || localCategory;

        const records = storageManager.isRemoteAvailable
          ? await storageManager.syncCategory(localCategory, bqCategory, { pushToRemote: !readOnly })
          : await storageManager.listFiles(localCategory);

        for (const record of records) {
          let item = this.GetItem(record.file_id);
          if (!item) {
            item = this.CreateChildInstance();
            item.ID = record.file_id;
            item._parent = this;
            this._children.set(item.ID, item);
          }
          // recordToItem が CollectionID に元カテゴリをセットする
          this.recordToItem(record, item);
        }

        totalLoaded += records.length;
        console.log(`[TTKnowledge] ${localCategory}←${bqCategory}: ${records.length} items`);
      }

      this.Count = this._children.size;
      this.IsLoaded = true;
      this._suppressSave = true;
      this.NotifyUpdated(false, true);
      this._suppressSave = false;
      console.log(`[TTKnowledge] Total loaded: ${totalLoaded} items across ${this.SyncCategories.length} categories`);
    } catch (error) {
      console.error('[TTKnowledge] LoadCache failed:', error);
      this.IsLoaded = true;
    }
  }
}
