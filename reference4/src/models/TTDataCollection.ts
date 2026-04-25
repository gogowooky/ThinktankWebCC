/**
 * TTDataCollection.ts
 * TTDataItem を保持するコレクション。
 * Memos / Chats 等の具体的なコレクションの基底クラスとして使用する。
 *
 * Phase 3: 型付き CRUD（GetDataItem / GetDataItems）
 * Phase 13 以降: LoadCache を StorageManager に接続
 * Phase 17 以降: TTKnowledge が複数カテゴリを統合する際の基底にもなる
 */

import { TTObject } from './TTObject';
import { TTCollection } from './TTCollection';
import { TTDataItem } from './TTDataItem';

export class TTDataCollection extends TTCollection {
  public override get ClassName(): string {
    return 'TTDataCollection';
  }

  constructor() {
    super();
    this.ItemSaveProperties = 'ID,Name,ContentType,Keywords,UpdateDate';
    this.ListPropertiesMin = 'ID,ContentType,Name';
    this.ListProperties = 'ID,Name,ContentType,Keywords,UpdateDate';
  }

  /** ID で TTDataItem を取得する（型付き）*/
  public GetDataItem(id: string): TTDataItem | undefined {
    const item = this.GetItem(id);
    return item instanceof TTDataItem ? item : undefined;
  }

  /** 全 TTDataItem を配列で取得する（型付き）*/
  public GetDataItems(): TTDataItem[] {
    return this.GetItems().filter((item): item is TTDataItem => item instanceof TTDataItem);
  }

  protected override CreateChildInstance(): TTObject {
    return new TTDataItem();
  }
}
