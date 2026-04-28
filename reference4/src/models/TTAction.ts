/**
 * TTAction.ts
 * アクション定義クラスとアクションコレクション。
 *
 * Phase 3: TTAction / TTActions の骨格
 * Phase 30 以降: DefaultActions（Editor.Save 等）を登録
 * Phase 31 以降: TTEvents と連携してキーバインドを実現
 */

import { TTObject } from './TTObject';
import { TTCollection } from './TTCollection';
import type { ActionContext, ActionScript } from '../types';

// ── TTAction ─────────────────────────────────────────────────────────────

export class TTAction extends TTObject {
  private _script: ActionScript = () => {};

  public override get ClassName(): string {
    return 'TTAction';
  }

  constructor() {
    super();
    this.ID = '';
    this.Name = '';
  }

  public set Script(value: ActionScript) {
    this._script = value;
  }
  public get Script(): ActionScript {
    return this._script;
  }

  /**
   * アクション実行前フック（デバッグ・ログ用に外部から設定可能）。
   * Phase 30 以降: ログ出力や UI フィードバックに使用。
   */
  public static OnInvoke: ((action: TTAction) => void) | null = null;

  /**
   * アクションを実行する。
   * @returns スクリプトが明示的に false を返した場合のみ false、それ以外は true。
   */
  public Invoke(context: ActionContext = {}): boolean {
    if (TTAction.OnInvoke) TTAction.OnInvoke(this);
    try {
      const result = this._script(context);
      return result !== false;
    } catch (e) {
      console.error(`[TTAction] ${this.ID} failed:`, e);
      return false;
    }
  }
}

// ── TTActions ─────────────────────────────────────────────────────────────

export class TTActions extends TTCollection {
  /** 動的アクション解決用リゾルバ（Phase 30 で DefaultActions から注入） */
  private _dynamicResolver: ((id: string) => TTAction | undefined) | null = null;

  public override get ClassName(): string {
    return 'TTActions';
  }

  constructor() {
    super();
    this.ItemSaveProperties = 'ID,Name,UpdateDate';
    this.ListPropertiesMin = 'ID,Name';
    this.ListProperties = 'ID,Name';
  }

  /**
   * 動的アクション解決リゾルバを設定する。
   * Phase 30 以降: DefaultActions.ts で定義した関数を注入する。
   */
  public SetDynamicResolver(resolver: (id: string) => TTAction | undefined): void {
    this._dynamicResolver = resolver;
  }

  /**
   * アクションを ID で取得する。
   * 静的登録 → 動的リゾルバ の順で検索する。
   */
  public override GetItem(id: string): TTAction | undefined {
    const item = super.GetItem(id);
    if (item instanceof TTAction) return item;

    if (this._dynamicResolver) {
      const dynamic = this._dynamicResolver(id);
      if (dynamic) {
        this.AddItem(dynamic); // キャッシュ
        return dynamic;
      }
    }
    return undefined;
  }

  /**
   * アクションを登録する（簡易ヘルパー）。
   * @param id     アクションID（例: 'Editor.Save'）
   * @param name   表示名
   * @param script 実行スクリプト
   */
  public Register(id: string, name: string, script: ActionScript): TTAction {
    const action = new TTAction();
    action.ID = id;
    action.Name = name;
    action.Script = script;
    this.AddItem(action);
    return action;
  }

  public override async LoadCache(): Promise<void> {
    this.IsLoaded = true; // アクションはキャッシュ不要
  }

  protected override CreateChildInstance(): TTObject {
    return new TTAction();
  }
}
