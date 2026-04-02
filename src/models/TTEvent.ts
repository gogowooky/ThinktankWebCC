import { TTObject } from './TTObject';
import { TTCollection } from './TTCollection';

/**
 * TTEvent - イベント定義
 *
 * Context + Mods + Key の組み合わせでイベントを識別し、
 * Name にアクションIDを格納する。
 */
export class TTEvent extends TTObject {
  /** コンテキスト（例: "Column-DataGrid-Main"） */
  public Context: string = '';

  /** 修飾キー（例: "Control+Shift"） */
  public Mods: string = '';

  /** キー（例: "A", "ENTER", "LEFT1"） */
  public Key: string = '';

  public override get ClassName(): string {
    return 'TTEvent';
  }

  constructor() {
    super();
    this.ID = '';
    this.Name = '';   // ActionID
    this.UpdateDate = 'init';
  }
}

/**
 * TTEvents - イベントコレクション
 */
export class TTEvents extends TTCollection {
  public override get ClassName(): string {
    return 'TTEvents';
  }

  constructor() {
    super();
    this.ItemSaveProperties = 'Context,Mods,Key,ID,Name,UpdateDate';
    this.ListPropertiesMin = 'ID,Name';
    this.ListProperties = 'Mods,Key,Name,Context';
    this.ColumnMapping = 'ID:イベントID,Context:コンテキスト,Mods:修飾キー,Key:キー,Name:アクション';
    this.ColumnMaxWidth = 'ID:20,Context:18,Mods:11,Key:10,Name:34';
  }

  public override async LoadCache(): Promise<void> {
    this.IsLoaded = true;
  }
}
