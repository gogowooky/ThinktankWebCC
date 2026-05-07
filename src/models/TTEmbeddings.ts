/**
 * TTEmbeddings.ts
 * Phase 15: Embedding メタデータ管理モデル。
 * 実際の embedding ベクトルは BigQuery の tt_embeddings テーブルで管理する。
 * このモデルはエントリーの Embedding 状態（生成済み/未生成・モデル名）を追跡する。
 */

import { TTObject } from './TTObject';
import { TTCollection } from './TTCollection';

export class TTEmbedding extends TTObject {
  public EntryId: string = '';
  public ModelName: string = '';
  public Dimensions: number = 0;

  public override get ClassName(): string { return 'TTEmbedding'; }
}

export class TTEmbeddings extends TTCollection {
  constructor() {
    super();
    this.ItemSaveProperties = 'ID,EntryId,ModelName,Dimensions,UpdateDate';
    this.ListPropertiesMin  = 'ID,EntryId';
    this.ListProperties     = 'ID,EntryId,ModelName,Dimensions,UpdateDate';
    this.Description        = 'Embedding メタデータ';
  }

  public override get ClassName(): string { return 'TTEmbeddings'; }

  protected CreateChildInstance(): TTEmbedding { return new TTEmbedding(); }

  /** EntryId でメタを取得 */
  public GetByEntryId(entryId: string): TTEmbedding | undefined {
    return this.GetItems().find(
      (item): item is TTEmbedding =>
        item instanceof TTEmbedding && item.EntryId === entryId,
    );
  }

  /** Embedding 済み EntryId セット */
  public GetEmbeddedIds(): Set<string> {
    return new Set(
      this.GetItems()
        .filter((item): item is TTEmbedding => item instanceof TTEmbedding)
        .map(item => item.EntryId),
    );
  }

  /** 未 Embedding の EntryId 一覧を返す */
  public GetUnembeddedIds(allEntryIds: string[]): string[] {
    const embedded = this.GetEmbeddedIds();
    return allEntryIds.filter(id => !embedded.has(id));
  }
}
