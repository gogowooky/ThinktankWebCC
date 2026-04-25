/**
 * TTEvent.ts
 * キーボード・マウス等のイベントと TTAction のバインディング定義。
 *
 * Phase 3: TTEvent / TTEvents の骨格
 * Phase 31 以降: DefaultEvents（Ctrl+S → Editor.Save 等）を登録
 */

import { TTObject } from './TTObject';
import { TTCollection } from './TTCollection';

// ── TTEvent ──────────────────────────────────────────────────────────────

export class TTEvent extends TTObject {
  /** コンテキスト識別子（例: '*-TextEditor-*' / '*-*-*'） */
  public Context: string = '';
  /** 修飾キー（例: 'Control', 'Control|Shift'） */
  public Mods: string = '';
  /** キー（例: 'S', 'N', 'ENTER'） */
  public Key: string = '';
  // Name は対応する ActionID として使用する

  public override get ClassName(): string {
    return 'TTEvent';
  }

  constructor() {
    super();
    this.ID = '';   // Context|Mods|Key で一意に識別
    this.Name = ''; // ActionID
  }
}

// ── TTEvents ─────────────────────────────────────────────────────────────

export class TTEvents extends TTCollection {
  public override get ClassName(): string {
    return 'TTEvents';
  }

  constructor() {
    super();
    this.ItemSaveProperties = 'Context,Mods,Key,ID,Name,UpdateDate';
    this.ListPropertiesMin = 'ID,Name';
    this.ListProperties = 'Mods,Key,Name,Context';
  }

  /**
   * イベントバインディングを登録する（簡易ヘルパー）。
   * @param context   コンテキスト（'*-*-*' = 全コンテキスト）
   * @param mods      修飾キー（'Control' 等、なければ空文字）
   * @param key       キー（'S' 等）
   * @param actionId  対応アクションID
   */
  public Register(
    context: string,
    mods: string,
    key: string,
    actionId: string
  ): TTEvent {
    const ev = new TTEvent();
    ev.Context = context;
    ev.Mods = mods;
    ev.Key = key;
    ev.ID = `${context}|${mods}|${key}`;
    ev.Name = actionId;
    this.AddItem(ev);
    return ev;
  }

  /**
   * イベントに対応するアクションIDを返す。
   * Phase 31 以降: TTApplication のキーハンドラから呼ばれる。
   */
  public ResolveActionId(context: string, mods: string, key: string): string {
    const id = `${context}|${mods}|${key}`;
    const ev = this.GetItem(id);
    if (ev instanceof TTEvent) return ev.Name;

    // ワイルドカードコンテキスト（'*-*-*'）を検索
    const wildId = `*-*-*|${mods}|${key}`;
    const wild = this.GetItem(wildId);
    return wild instanceof TTEvent ? wild.Name : '';
  }

  public override async LoadCache(): Promise<void> {
    this.IsLoaded = true; // イベントはキャッシュ不要（Phase 31 で DefaultEvents が登録）
  }

  protected override CreateChildInstance(): TTObject {
    return new TTEvent();
  }
}
