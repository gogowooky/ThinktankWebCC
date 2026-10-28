import type { TTApplication } from '../TTApplication';
export type ConfigKey =
  | 'ThinktankPanel.Area.IsOpen'
  | 'ThinktankPanel.Area.OpenWidth'
  | 'ThinktankPanel.Mode.Name'
  | 'SeedsPanel.Area.IsOpen'
  | 'SeedsPanel.Area.OpenWidth'
  | 'SeedsPanel.Mode.Name'
  | 'SeedsPanel.Project.ID'
  | 'WorkingSettingPanel.Area.IsOpen'
  | 'WorkingSettingPanel.Area.OpenWidth'
  | 'WorkingSettingPanel.Mode.Name'
  | 'HarvestPanel.Area.IsOpen'
  | 'HarvestPanel.Area.OpenWidth'
  | 'HarvestPanel.Mode.Name'
  | 'Thinktank.Ribbon.BgColor'
  | 'Thinktank.Area.BgColor'
  | 'Seeds.Ribbon.BgColor'
  | 'Seeds.Area.BgColor'
  | 'Working.Ribbon.BgColor'
  | 'Working.Area.BgColor'
  | 'Harvest.Ribbon.BgColor'
  | 'Harvest.Area.BgColor'
  | 'ToolBar.BgColor'
  | 'ToolBar.Color'
  | 'TextEditor.LineNumbers.IsVisible'
  | 'TextEditor.Bullet.StyleSet'
  | 'TextEditor.Bullet.ColorSet'
  | 'TextEditor.Bullet.AttrSet'
  | 'TextEditor.Comment.StyleSet'
  | 'TextEditor.Comment.ColorSet'
  | 'TextEditor.WordWrap.IsVisible'
  | 'TextEditor.Minimap.IsVisible'
  | 'TextEditor.FullWidthSpace.IsVisible'
  | 'TextEditor.UnicodeHighlight.IsVisible'
  | 'TextEditor.BracketPairColorization.IsVisible'
  | 'TextEditor.FindOption.MatchCase'
  | 'TextEditor.FindOption.MatchWholeWord'
  | 'TextEditor.FindOption.UseRexp'
  | 'TextEditor.ReplaceOption.PreserveCase'
  | 'TextEditor.Heading.Style1'
  | 'TextEditor.Heading.Style2'
  | 'TextEditor.Heading.Style3'
  | 'TextEditor.Heading.Style4'
  | 'TextEditor.Heading.Style5'
  | 'TextEditor.Highlighter.Style1'
  | 'TextEditor.Highlighter.Style2'
  | 'TextEditor.Highlighter.Style3'
  | 'TextEditor.Highlighter.Style4'
  | 'TextEditor.Highlighter.Style5'
  | 'TextEditor.Highlighter.Style6'
  | 'TextEditor.Url.Style'
  | 'TextEditor.Filepath.Style'
  | 'TextEditor.Tag.Style'
  | 'ToolBar.Mode.Name'
  | 'ToolBar.StatusMode.Text'
  | 'Application.FocusedPanel.Name'
  | 'Application.FocusedArea.Name'
  | 'Application.Status.ExMode'
  | 'TextEditor.CurrentEditor.CursorPos'
  | 'TextEditor.CurrentEditor.TextOnCursorPos'
  | 'WorkingPanel.Panes.Count'
  | 'WorkingPanel.FocusedPane.ID'
  | 'WorkingPanel.FocusedPane.PaneNumber'
  | 'WorkingPanel.FocusedPane.Mode'
  | 'WorkingPanel.FocusedPane.FileHistory'
  | 'WorkingPanel.FocusedPane.FileHistoryPos'
  | 'WorkingPanel.FocusedPane.FileHistoryMax'
  | 'WorkingPanel.DroppedFile.ID'
  | 'WorkingPanel.Panes.Layout'
  | 'WorkingPanel.Panes.Display'
  | 'TextEditor.CurrentFolding.HeadingOffset'
  | 'TextEditor.CurrentFolding.HeadingNumber'
  | 'Application.PanelDisplay.Mode'
  | 'Application.Display.Zoom'
  | 'Application.Execution.Status'
  | 'Application.Synchronization.Status'
  | 'Application.CheckedItem.IDs'
  | 'ThinktankPanel.Filter.CursorPos'
  | 'ThinktankPanel.Filter.CursorPosID'
  | 'SeedsPanel.Filter.CursorPos'
  | 'SeedsPanel.Filter.CursorPosID'
  | 'Table.CellContent.Display'
  | 'Table.CellContent.Position'
  // `| string` だと上記リテラルが string に潰れて補完が一切効かなくなる。
  // `(string & {})` なら「既知キーの補完を出しつつ任意の文字列も受ける」
  // （色設定・プリセット等の動的キーのため任意文字列は引き続き許容）。
  // 注: これは補完のための緩和であり、typo の型レベル検出はしない。
  // 完全な typo 検出には PROP_SPECS を単一の真実として再構成する必要がある（D-8）。
  | (string & {});

export type ConfigListener = (key: ConfigKey, value: string) => void;

// ── PropDef: serialize() が返すテーブル行の型 ────────────────────────────────

export interface PropDef {
  key: ConfigKey;
  current: string;
  default: string;
  type: 'boolean' | 'string' | 'color' | 'json' | 'integer';
  candidates: string;
  description: string;
}

// ── PropSpec: キーごとの定義を一元管理するオブジェクト ──────────────────────
//
// 各エントリに以下をすべて記述する：
//   panel       : 変更通知先のパネル識別子
//   default     : デフォルト値（文字列）
//   type        : データ型
//   candidates  : 値変更前の照合に使う正規表現。値を抽出して next/prev で循環
//   description : 説明
//   get(app)    : TTApplication から現在値を文字列で読み取る
//   set(app, v) : 文字列値 v を TTApplication のプロパティに書き込む
//
// 特別な値: toggle (boolean のみ), next (列挙型), prev (列挙型)
// ※ set() 内で NotifyUpdated() は呼ばない。_applyContent() がまとめて呼ぶ。

export type PanelKey = 'ThinktankPanel' | 'SeedsPanel' | 'WorkingPanel' | 'HarvestPanel' | 'Application';

export interface PropSpec {
  panel: PanelKey;
  default: string;
  type: PropDef['type'];
  candidates: string;
  description: string;
  isConst?: boolean;
  get: (app: TTApplication) => string;
  set: (app: TTApplication, value: string) => void;
  /** next/prev で循環する値リストを動的に返す（省略時は candidates から抽出） */
  getValues?: (app: TTApplication) => string[];
}
