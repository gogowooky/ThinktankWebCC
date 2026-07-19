/**
 * TTAction.ts
 * アクション定義の型とアクション実行コンテキスト。
 */

/**
 * アクションID。'Category.Property:Value' 形式の文字列（動的・外部定義のアクションを含む）。
 * リテラルの列挙は行わない — `| string` を伴う和集合は string に潰れて型安全性を持たず、
 * 実際に登録されるアクション数に対して追従できず乖離するため（TTFocusedPanelActions.ts 側で
 * 随時アクションを追加登録できることを優先する）。
 */
export type ActionID = string;

/** アクション実行コンテキスト。Completion 関数が Result / Allow を書き込む。 */
export interface TTActionItem {
  /** アクション ID */
  ActionID: ActionID;
  /** 実行結果（Completion が設定） */
  Result: string;
  /**
   * 後続アクションを許容するか。
   * false（既定）= このアクションでショートカット処理を終了。
   * true  = 同一イベントで後続の一致ショートカットも実行を継続。
   */
  Allow: boolean;
  /** 修飾キー情報 (ExMode適用などのために伝搬) */
  Mods?: string;
}

/** アクション定義 */
export interface TTAction {
  ActionID:    ActionID;
  Description?: string;
  Category?:    string;
  Completion:  (item: TTActionItem) => void | Promise<void>;
}
