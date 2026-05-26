/**
 * TTAction.ts
 * アクション定義の型とアクション実行コンテキスト。
 */

/** アクション実行コンテキスト。Completion 関数が Result / Allow を書き込む。 */
export interface TTActionItem {
  /** アクション ID */
  ActionID: string;
  /** 実行結果（Completion が設定） */
  Result: string;
  /**
   * 後続アクションを許容するか。
   * false（既定）= このアクションでショートカット処理を終了。
   * true  = 同一イベントで後続の一致ショートカットも実行を継続。
   */
  Allow: boolean;
}

/** アクション定義 */
export interface TTAction {
  ActionID:   string;
  Completion: (item: TTActionItem) => void | Promise<void>;
}
