/**
 * TTAction.ts
 * アクション定義の型とアクション実行コンテキスト。
 */

export type ActionID =
  | 'FocusedPanel.ToggleAreaVisibility'
  | 'FocusedPanel.SetViewModePrev'
  | 'FocusedPanel.SetViewModeNext'
  | 'TextEditor.Folding.ForwardVisible'
  | 'TextEditor.Folding.BackwardVisible'
  | 'TextEditor.Folding.OpenEachLevel'
  | 'TextEditor.Folding.CloseEachLevel'
  | string; // 動的・外部定義のアクションを許容

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
}

/** アクション定義 */
export interface TTAction {
  ActionID:    ActionID;
  Description?: string;
  Category?:    string;
  Completion:  (item: TTActionItem) => void | Promise<void>;
}
