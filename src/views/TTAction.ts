/**
 * TTAction.ts
 * アクション定義の型とアクション実行コンテキスト。
 */

export type ActionID =
  | 'FocusedPanel.Area.IsOpen:Toggle'
  | 'FocusedPanel.Mode.Name:Prev'
  | 'FocusedPanel.Mode.Name:Next'
  | 'Application.FocusedPanel.Name:Next'
  | 'Application.FocusedPanel.Name:Prev'
  | 'WorkoutPanel.FocusedPane.PaneNumber:Next'
  | 'WorkoutPanel.FocusedPane.PaneNumber:Prev'
  | 'WorkoutPanel.FocusedPane.Mode:Next'
  | 'WorkoutPanel.FocusedPane.Mode:Prev'
  | 'TextEditor.EditText.Undo'
  | 'TextEditor.EditText.Redo'
  | 'TextEditor.CurrentFolding.Heading:VisibleForward'
  | 'TextEditor.CurrentFolding.Heading:VisibleBackward'
  | 'TextEditor.CurrentFolding.Heading:Open'
  | 'TextEditor.CurrentFolding.Heading:OpenStepwise'
  | 'TextEditor.CurrentFolding.Heading:CloseStepwise'
  | 'TextEditor.CurrentFolding.Heading:SiblingForward'
  | 'TextEditor.CurrentFolding.Heading:SiblingBackward'
  | 'TextEditor.LineNumbers.IsVisible:Toggle'
  | 'TextEditor.WordWrap.IsVisible:Toggle'
  | 'TextEditor.Minimap.IsVisible:Toggle'
  | 'TextEditor.FullWidthSpace.IsVisible:Toggle'
  | 'TextEditor.UnicodeHighlight.IsVisible:Toggle'
  | 'TextEditor.BracketPairColorization.IsVisible:Toggle'
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
