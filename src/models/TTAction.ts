import { TTObject } from './TTObject';
import { TTCollection } from './TTCollection';
import type { ActionContext, ActionScript } from '../types';

/**
 * TTAction - アクション定義
 *
 * ID（アクション名）とScript（実行関数）を持つ。
 * Invoke(context)で実行。
 */
export class TTAction extends TTObject {
  /** 実行スクリプト */
  private _script: ActionScript = () => {};

  public override get ClassName(): string {
    return 'TTAction';
  }

  constructor() {
    super();
    this.ID = '';
    this.Name = '';
  }

  public get Script(): ActionScript {
    return this._script;
  }

  public set Script(value: ActionScript) {
    this._script = value;
  }

  /** アクション実行時のグローバルフック（デバッグ・ログ用） */
  public static OnInvoke: ((action: TTAction) => void) | null = null;

  /**
   * アクションを実行する
   * @returns falseが返された場合のみfalse、それ以外はtrue
   */
  public Invoke(context: ActionContext = {}): boolean {
    if (TTAction.OnInvoke) {
      TTAction.OnInvoke(this);
    }

    try {
      const result = this._script(context);
      return result !== false;
    } catch (e) {
      console.error(`Action ${this.ID} failed:`, e);
      return false;
    }
  }
}

/**
 * TTActions - アクションコレクション
 *
 * 静的アクション + 動的アクション解決をサポート。
 */
export class TTActions extends TTCollection {
  /** 動的アクション解決関数 */
  private _dynamicResolver: ((id: string) => TTAction | undefined) | null = null;

  public override get ClassName(): string {
    return 'TTActions';
  }

  constructor() {
    super();
    this.ItemSaveProperties = 'ID,Name,UpdateDate';
    this.ListPropertiesMin = 'ID,Name';
    this.ListProperties = 'ID,Name';
    this.ColumnMapping = 'ID:アクションID,Name:簡易説明';
    this.ColumnMaxWidth = 'ID:30,Name:100';
  }

  /** 動的アクション解決用リゾルバを設定 */
  public SetDynamicResolver(resolver: (id: string) => TTAction | undefined): void {
    this._dynamicResolver = resolver;
  }

  /** IDでアクションを取得（静的→動的の順で検索） */
  public override GetItem(id: string): TTAction | undefined {
    const item = super.GetItem(id);
    if (item instanceof TTAction) {
      return item;
    }

    // 動的解決
    if (this._dynamicResolver) {
      const dynamicAction = this._dynamicResolver(id);
      if (dynamicAction) {
        this.AddItem(dynamicAction);
        return dynamicAction;
      }
    }

    return undefined;
  }

  public override async LoadCache(): Promise<void> {
    this.IsLoaded = true;
  }
}
