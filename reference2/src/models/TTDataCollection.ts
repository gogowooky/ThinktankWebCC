import { TTCollection } from './TTCollection';
import { TTObject } from './TTObject';
import { TTDataItem } from './TTDataItem';

/**
 * TTDataCollection - TTDataItemを保持するコレクション
 *
 * メモコレクション等のデータ管理に使用。
 * CreateChildInstance()でTTDataItemを生成する。
 */
export class TTDataCollection extends TTCollection {

  public override get ClassName(): string {
    return 'TTDataCollection';
  }

  constructor() {
    super();
    this.ItemSaveProperties = 'ID,Name,ContentType,Keywords,UpdateDate';
    this.ListPropertiesMin = 'ID,ContentType,Name';
    this.ListProperties = 'ID,Name,ContentType,Keywords,UpdateDate';
    this.ColumnMapping = 'ID:ID,Name:タイトル,ContentType:種別,Keywords:キーワード,UpdateDate:更新日時';
    this.ColumnMaxWidth = 'ID:18,Name:40,ContentType:6,Keywords:20,UpdateDate:18';
  }

  /** IDでTTDataItemを取得（型付き） */
  public GetDataItem(id: string): TTDataItem | undefined {
    const item = this.GetItem(id);
    return item instanceof TTDataItem ? item : undefined;
  }

  /** 全TTDataItemを配列で取得（型付き） */
  public GetDataItems(): TTDataItem[] {
    return this.GetItems().filter((item): item is TTDataItem => item instanceof TTDataItem);
  }

  protected override CreateChildInstance(): TTObject {
    return new TTDataItem();
  }
}
