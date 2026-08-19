/**
 * TTUIStateManager.ts
 * UIアイテム状態の永続化・Undo/Redo管理。
 *
 * ① localStorageへの高速起動時ロード/保存
 * ② __tt_ui_state__ Think (ContentType='table') との同期
 *    → DataGrid/Card で current 列を編集→Ctrl+S 保存で即 UI に反映
 *    → 更新ボタンで UI の現在値をファイルに反映
 * ③ Undo/Redo（メモリ内スタック、最大50件）
 *
 * 【設計】
 * キーごとの全情報（読み取り・書き込み・メタデータ）を PROP_SPECS に一元集約。
 * 新しいUI設定項目を追加する場合は PROP_SPECS にオブジェクトを1つ追加するだけでよい。
 *
 * 列構成: description, key, current, default, type, candidates
 *   description:説明
 *   key:        変数名
 *   current:    現在値（編集→保存でUIに反映）
 *   default:    デフォルト値（参照用）
 *   type:       データ型 (boolean/string/color/json)
 *   candidates: 正規表現（値変更前の照合に使用）。特別な値: toggle, next, prev
 */

import type { TTApplication } from './TTApplication';
import type { TTVault } from '../models/TTVault';
import { parseTableContent, tableSectionToContent, TableSection } from '../utils/tableFormat';
import type { ThinktankViewMode } from './TTThinktankPanel';
import type { OverviewViewMode } from './TTOverviewPanel';
import type { WorkoutViewMode } from './TTWorkoutPanel';
import { collectAreaIds } from './TTWorkoutPanel';
import { TTWorkoutArea } from './TTWorkoutArea';
import type { ReThinkViewMode } from './TTReThinkPanel';
import type { MediaType, ContentType } from '../types';
import { getFocusName } from '../utils/getFocusName';
import { COLOR_PROPS, DEFAULT_COLOR_ENTRIES, DEFAULT_MARKS, isUnset, parseMarks } from '../utils/defaultColor';
import type { ColorProp } from '../utils/defaultColor';
import localStatusContent from '../../docs/Thinktank_Status-Action-Binding.md?raw';
import { TTShortcutManager } from './TTShortcutManager';
import { StorageManager } from '../services/storage/StorageManager';

// ── ConfigKey / ConfigListener: 状態変数の型定義 ─────────────────────────────

export type ConfigKey =
  | 'ThinktankPanel.Area.IsOpen'
  | 'ThinktankPanel.Mode.Name'
  | 'OverviewPanel.Area.IsOpen'
  | 'OverviewPanel.Mode.Name'
  | 'Overview.Bundle.Name'
  | 'WorkoutSettingPanel.Area.IsOpen'
  | 'WorkoutSettingPanel.Mode.Name'
  | 'ReThinkPanel.Area.IsOpen'
  | 'ReThinkPanel.Mode.Name'
  | 'Thinktank.Ribbon.BgColor'
  | 'Thinktank.Area.BgColor'
  | 'Overview.Ribbon.BgColor'
  | 'Overview.Area.BgColor'
  | 'Workout.Ribbon.BgColor'
  | 'Workout.Area.BgColor'
  | 'ReThink.Ribbon.BgColor'
  | 'ReThink.Area.BgColor'
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
  | 'Application.Resource.LocalExporting'
  | 'TextEditor.CurrentEditor.CursorPos'
  | 'TextEditor.CurrentEditor.TextOnCursorPos'
  | 'WorkoutPanel.Panes.Count'
  | 'WorkoutPanel.FocusedPane.ID'
  | 'WorkoutPanel.FocusedPane.PaneNumber'
  | 'WorkoutPanel.FocusedPane.Mode'
  | 'WorkoutPanel.FocusedPane.FileHistory'
  | 'WorkoutPanel.FocusedPane.FileHistoryPos'
  | 'WorkoutPanel.FocusedPane.FileHistoryMax'
  | 'WorkoutPanel.DroppedFile.ID'
  | 'WorkoutPanel.Pane.Layout'
  | 'WorkoutPanel.Pane.Display'
  | 'TextEditor.CurrentFolding.HeadingOffset'
  | 'TextEditor.CurrentFolding.HeadingNumber'
  | 'Application.PanelDisplay.Mode'
  | 'Application.Execution.Status'
  | 'Application.Synchronization.Status'
  | 'Application.CheckedItem.IDs'
  | 'ThinktankPanel.Filter.CursorPos'
  | 'ThinktankPanel.Filter.CursorPosID'
  | 'OverviewPanel.Filter.CursorPos'
  | 'OverviewPanel.Filter.CursorPosID'
  | string; // プリセットキーなどの動的拡張を許容

export type ConfigListener = (key: ConfigKey, value: string) => void;

// ── PropDef: serialize() が返すテーブル行の型 ────────────────────────────────

interface PropDef {
  key:         ConfigKey;
  current:     string;
  default:     string;
  type:        'boolean' | 'string' | 'color' | 'json' | 'integer';
  candidates:  string;
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

type PanelKey = 'ThinktankPanel' | 'OverviewPanel' | 'WorkoutPanel' | 'ReThinkPanel' | 'Application';

interface PropSpec {
  panel:       PanelKey;
  default:     string;
  type:        PropDef['type'];
  candidates:  string;
  description: string;
  isConst?:    boolean;
  get: (app: TTApplication) => string;
  set: (app: TTApplication, value: string) => void;
  /** next/prev で循環する値リストを動的に返す（省略時は candidates から抽出） */
  getValues?: (app: TTApplication) => string[];
}



/**
 * PROP_SPECS
 * UI設定の全項目定義。新規項目の追加はここにオブジェクトを1つ追記するだけでよい。
 * _getProps() / _applyProp() はこの定義を参照するため個別修正不要。
 */
function getFocusedPaneAllowedModes(app: TTApplication): string[] {
  const area = app.WorkoutPanel.FocusedAreaId ? app.WorkoutPanel.GetArea(app.WorkoutPanel.FocusedAreaId) : null;
  if (!area || !area.ResourceID) {
    return ['Workout', 'Texteditor', 'Markdown', 'Datagrid', 'Card', 'Graph', 'Chat'];
  }
  const think = app.Models.Vault.GetThink(area.ResourceID);
  if (!think) {
    return ['Workout', 'Texteditor', 'Markdown', 'Datagrid', 'Card', 'Graph', 'Chat'];
  }
  const mapping: Record<ContentType, MediaType[]> = {
    memo: ['texteditor', 'markdown'],
    nettext: ['texteditor', 'markdown'],
    bundle: ['texteditor', 'datagrid', 'markdown', 'card', 'graph'],
    table: ['texteditor', 'datagrid', 'card'],
    chat: ['texteditor', 'chat'],
    links: ['texteditor', 'markdown'],
  };
  const allowed = mapping[think.ContentType] || ['texteditor', 'markdown'];
  return allowed.map(m => capitalize(m));
}

/** フォーカスされているPane（WorkoutArea）を返す */
function getFocusedArea(app: TTApplication): TTWorkoutArea | null {
  const id = app.WorkoutPanel.FocusedAreaId;
  return id ? (app.WorkoutPanel.GetArea(id) ?? null) : null;
}

const PROP_SPECS: Record<ConfigKey, PropSpec> = {

  // ── ThinktankPanel ──────────────────────────────────────────────────────
  'ThinktankPanel.Area.IsOpen': {
    panel: 'ThinktankPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: '左パネル表示',
    get: (app) => String(app.ThinktankPanel.IsAreaOpen),
    set: (app, v) => { app.ThinktankPanel.IsAreaOpen = parseBool(v, app.ThinktankPanel.IsAreaOpen); },
  },
  'ThinktankPanel.Mode.Name': {
    panel: 'ThinktankPanel',
    default: 'Filter', type: 'string', candidates: '^(Filter|Chat|Settings)$',
    description: '左パネルモード',
    get: (app) => capitalize(app.ThinktankPanel.ViewMode),
    set: (app, v) => { app.ThinktankPanel.ViewMode = v.toLowerCase() as ThinktankViewMode; },
  },
  'ThinktankPanel.CurrentItem.ID': {
    panel: 'ThinktankPanel',
    default: '', type: 'string', candidates: '^(\\d{4}\\-\\d{2}\\-\\d{2}\\-\\d{6})?$',
    description: '左パネル現在フォーカス項目ID',
    get: (app) => app.ThinktankPanel.CurrentItemID || '',
    set: (app, v) => { app.ThinktankPanel.CurrentItemID = v; },
  },
  'Application.CheckedItem.IDs': {
    panel: 'Application',
    default: '', type: 'string', candidates: '^(\\d{4}\\-\\d{2}\\-\\d{2}\\-\\d{6},)*\\d{4}\\-\\d{2}\\-\\d{2}\\-\\d{6}$|^$',
    description: 'チェックされたアイテムID群',
    get: (app) => app.ThinktankPanel.CheckedThoughtIDs.join(','),
    set: (app, v) => {
      const ids = v ? v.split(',').map(id => id.trim()).filter(Boolean) : [];
      const cur = app.ThinktankPanel.CheckedThoughtIDs;
      if (cur.length !== ids.length || !cur.every((id, idx) => id === ids[idx])) {
        app.ThinktankPanel.CheckedThoughtIDs = ids;
        app.OverviewPanel.CheckedThoughtIDs = ids;
      }
    },
  },

  // ── OverviewPanel ────────────────────────────────────────────────────────────────
  'OverviewPanel.CurrentItem.ID': {
    panel: 'OverviewPanel',
    default: '', type: 'string', candidates: '^(\\d{4}\\-\\d{2}\\-\\d{2}\\-\\d{6})?$',
    description: '上部パネル現在フォーカス項目ID',
    get: (app) => app.OverviewPanel.CurrentItemID || '',
    set: (app, v) => { app.OverviewPanel.CurrentItemID = v; },
  },
  'OverviewPanel.Area.IsOpen': {
    panel: 'OverviewPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '上部パネル表示',
    get: (app) => String(app.OverviewPanel.IsAreaOpen),
    set: (app, v) => { app.OverviewPanel.IsAreaOpen = parseBool(v, app.OverviewPanel.IsAreaOpen); },
  },
  'OverviewPanel.Mode.Name': {
    panel: 'OverviewPanel',
    default: 'Filter', type: 'string', candidates: '^(Filter|Graph|Chat|Settings)$',
    description: '上部パネル表示モード',
    get: (app) => capitalize(app.OverviewPanel.ViewMode),
    set: (app, v) => { app.OverviewPanel.SetViewMode(v.toLowerCase() as OverviewViewMode); },
  },
  'Overview.Bundle.Name': {
    panel: 'OverviewPanel',
    default: 'none', type: 'string', candidates: '.*',
    description: 'OverviewパネルのbundleファイルID',
    get: (app) => app.OverviewPanel.BundleID || 'none',
    set: (app, v) => {
      if (v === 'none') {
        app.OverviewPanel.ClearBundle();
      } else {
        app.OverviewPanel.OpenBundle(v);
      }
    },
  },

  // ── Filter CursorPos ─────────────────────────────────────────────────────────────
  'ThinktankPanel.Filter.CursorPos': {
    panel: 'ThinktankPanel',
    default: '0', type: 'string', candidates: '.*',
    description: 'Thinktank>Think一覧のカーソル位置',
    isConst: true,
    get: (app) => {
      const list = app.ThinktankPanel.FilteredThoughts;
      const curId = app.ThinktankPanel.CurrentItemID;
      if (!curId || list.length === 0) return '0';
      const idx = list.findIndex(t => t.ID === curId);
      return idx >= 0 ? String(idx + 1) : '0';
    },
    set: (app, v) => {
      const pos = parseInt(v, 10);
      if (isNaN(pos) || pos <= 0) {
        app.ThinktankPanel.CurrentItemID = '';
        return;
      }
      const list = app.ThinktankPanel.FilteredThoughts;
      const idx = pos - 1;
      if (idx < list.length) {
        app.ThinktankPanel.CurrentItemID = list[idx].ID;
      }
    },
  },
  'OverviewPanel.Filter.CursorPos': {
    panel: 'OverviewPanel',
    default: '0', type: 'string', candidates: '.*',
    description: 'Overview>Think一覧のカーソル位置',
    isConst: true,
    get: (app) => {
      const list = app.OverviewPanel.FilteredThoughts;
      const curId = app.OverviewPanel.CurrentItemID;
      if (!curId || list.length === 0) return '0';
      const idx = list.findIndex(t => t.ID === curId);
      return idx >= 0 ? String(idx + 1) : '0';
    },
    set: (app, v) => {
      const pos = parseInt(v, 10);
      if (isNaN(pos) || pos <= 0) {
        app.OverviewPanel.CurrentItemID = '';
        return;
      }
      const list = app.OverviewPanel.FilteredThoughts;
      const idx = pos - 1;
      if (idx < list.length) {
        app.OverviewPanel.CurrentItemID = list[idx].ID;
      }
    },
  },
  'ThinktankPanel.Filter.CursorPosID': {
    panel: 'ThinktankPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'Thinktank>Think一覧のカーソル位置のID',
    isConst: true,
    get: (app) => {
      const curId = app.ThinktankPanel.CurrentItemID;
      // 一覧に存在しないID（フィルタ変更で消えた等）はカーソルなしとみなす
      return app.ThinktankPanel.FilteredThoughts.some(t => t.ID === curId) ? curId : '';
    },
    set: (app, v) => {
      if (!v || app.ThinktankPanel.FilteredThoughts.some(t => t.ID === v)) {
        app.ThinktankPanel.CurrentItemID = v;
      }
    },
  },
  'OverviewPanel.Filter.CursorPosID': {
    panel: 'OverviewPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'Overview>Think一覧のカーソル位置のID',
    isConst: true,
    get: (app) => {
      const curId = app.OverviewPanel.CurrentItemID;
      return app.OverviewPanel.FilteredThoughts.some(t => t.ID === curId) ? curId : '';
    },
    set: (app, v) => {
      if (!v || app.OverviewPanel.FilteredThoughts.some(t => t.ID === v)) {
        app.OverviewPanel.CurrentItemID = v;
      }
    },
  },

  // ── WorkoutPanel ───────────────────────────────────────────────────────────────
  'WorkoutSettingPanel.Area.IsOpen': {
    panel: 'WorkoutPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: 'ワークアウトパネル表示',
    get: (app) => String(app.WorkoutPanel.IsAreaOpen),
    set: (app, v) => { app.WorkoutPanel.IsAreaOpen = parseBool(v, app.WorkoutPanel.IsAreaOpen); },
  },
  'WorkoutSettingPanel.Mode.Name': {
    panel: 'WorkoutPanel',
    default: 'Workout', type: 'string', candidates: '^(Workout|Texteditor|Markdown|Datagrid|Card|Graph)$',
    description: 'ワークアウト設定パネルモード',
    get: (app) => capitalize(app.WorkoutPanel.ViewMode),
    set: (app, v) => { app.WorkoutPanel.SetViewMode(v.toLowerCase() as WorkoutViewMode); },
  },

  // ── TextEditor 検索・置換オプション ────────────────────────────────────────
  'TextEditor.FindOption.MatchCase': {
    panel: 'WorkoutPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '検索オプション：大文字小文字を区別',
    get: (app) => String(app.WorkoutPanel.TextEditor.FindOption.MatchCase),
    set: (app, v) => { app.WorkoutPanel.TextEditor.FindOption.MatchCase = parseBool(v, app.WorkoutPanel.TextEditor.FindOption.MatchCase); },
  },
  'TextEditor.FindOption.MatchWholeWord': {
    panel: 'WorkoutPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '検索オプション：単語単位で検索',
    get: (app) => String(app.WorkoutPanel.TextEditor.FindOption.MatchWholeWord),
    set: (app, v) => { app.WorkoutPanel.TextEditor.FindOption.MatchWholeWord = parseBool(v, app.WorkoutPanel.TextEditor.FindOption.MatchWholeWord); },
  },
  'TextEditor.FindOption.UseRexp': {
    panel: 'WorkoutPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '検索オプション：正規表現を使用',
    get: (app) => String(app.WorkoutPanel.TextEditor.FindOption.UseRexp),
    set: (app, v) => { app.WorkoutPanel.TextEditor.FindOption.UseRexp = parseBool(v, app.WorkoutPanel.TextEditor.FindOption.UseRexp); },
  },
  'TextEditor.ReplaceOption.PreserveCase': {
    panel: 'WorkoutPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '置換オプション：大文字小文字を保持',
    get: (app) => String(app.WorkoutPanel.TextEditor.ReplaceOption.PreserveCase),
    set: (app, v) => { app.WorkoutPanel.TextEditor.ReplaceOption.PreserveCase = parseBool(v, app.WorkoutPanel.TextEditor.ReplaceOption.PreserveCase); },
  },

  // ── TextEditor（テキストエディタ設定）──────────────────────────────────────
  'TextEditor.LineNumbers.IsVisible': {
    panel: 'WorkoutPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '行番号表示',
    get: (app) => String(app.WorkoutPanel.TextEditor.LineNumbers.IsVisible),
    set: (app, v) => { app.WorkoutPanel.TextEditor.LineNumbers.IsVisible = parseBool(v, app.WorkoutPanel.TextEditor.LineNumbers.IsVisible); },
  },
  'TextEditor.Bullet.Marks': {
    panel: 'WorkoutPanel',
    default: DEFAULT_MARKS.Bullet, type: 'string', candidates: '.*',
    description: '箇条書きの行頭記号（CSV。n番目が TextEditor.Bullet.StyleN に対応）',
    get: (app) => app.WorkoutPanel.TextEditor.Bullet.Marks,
    set: (app, v) => { app.WorkoutPanel.TextEditor.Bullet.Marks = v; },
  },
  'TextEditor.Bullet.StyleNum': {
    panel: 'WorkoutPanel',
    default: String(parseMarks(DEFAULT_MARKS.Bullet).length),
    type: 'integer', candidates: '^[0-9]+$',
    // Marks のアイテム数そのものなので直接は書き換えられない（登録数を変えるには Marks を編集する）
    description: '箇条書きスタイルの登録数（TextEditor.Bullet.Marks のアイテム数）',
    get: (app) => String(parseMarks(app.WorkoutPanel.TextEditor.Bullet.Marks).length),
    set: () => {},
  },
  'TextEditor.Comment.Marks': {
    panel: 'WorkoutPanel',
    default: DEFAULT_MARKS.Comment, type: 'string', candidates: '.*',
    description: 'コメントの行頭記号（CSV。n番目が TextEditor.Comment.StyleN に対応）',
    get: (app) => app.WorkoutPanel.TextEditor.Comment.Marks,
    set: (app, v) => { app.WorkoutPanel.TextEditor.Comment.Marks = v; },
  },
  'TextEditor.Comment.StyleNum': {
    panel: 'WorkoutPanel',
    default: String(parseMarks(DEFAULT_MARKS.Comment).length),
    type: 'integer', candidates: '^[0-9]+$',
    // Bullet.StyleNum と同じく Marks のアイテム数そのもの（直接は書き換えられない）
    description: 'コメントスタイルの登録数（TextEditor.Comment.Marks のアイテム数）',
    get: (app) => String(parseMarks(app.WorkoutPanel.TextEditor.Comment.Marks).length),
    set: () => {},
  },
  'TextEditor.WordWrap.IsVisible': {
    panel: 'WorkoutPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: '折り返し',
    get: (app) => String(app.WorkoutPanel.TextEditor.WordWrap.IsVisible),
    set: (app, v) => { app.WorkoutPanel.TextEditor.WordWrap.IsVisible = parseBool(v, app.WorkoutPanel.TextEditor.WordWrap.IsVisible); },
  },
  'TextEditor.Minimap.IsVisible': {
    panel: 'WorkoutPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: 'ミニマップ',
    get: (app) => String(app.WorkoutPanel.TextEditor.Minimap.IsVisible),
    set: (app, v) => { app.WorkoutPanel.TextEditor.Minimap.IsVisible = parseBool(v, app.WorkoutPanel.TextEditor.Minimap.IsVisible); },
  },
  'TextEditor.FullWidthSpace.IsVisible': {
    panel: 'WorkoutPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '全角スペース表示',
    get: (app) => String(app.WorkoutPanel.TextEditor.FullWidthSpace.IsVisible),
    set: (app, v) => { app.WorkoutPanel.TextEditor.FullWidthSpace.IsVisible = parseBool(v, app.WorkoutPanel.TextEditor.FullWidthSpace.IsVisible); },
  },
  'TextEditor.UnicodeHighlight.IsVisible': {
    panel: 'WorkoutPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: 'Unicode強調',
    get: (app) => String(app.WorkoutPanel.TextEditor.UnicodeHighlight.IsVisible),
    set: (app, v) => { app.WorkoutPanel.TextEditor.UnicodeHighlight.IsVisible = parseBool(v, app.WorkoutPanel.TextEditor.UnicodeHighlight.IsVisible); },
  },
  'TextEditor.BracketPairColorization.IsVisible': {
    panel: 'WorkoutPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: '括弧ペア色分け',
    get: (app) => String(app.WorkoutPanel.TextEditor.BracketPairColorization.IsVisible),
    set: (app, v) => { app.WorkoutPanel.TextEditor.BracketPairColorization.IsVisible = parseBool(v, app.WorkoutPanel.TextEditor.BracketPairColorization.IsVisible); },
  },
  // TextEditor.Text / .Selection / .Occurrence / .FoldingHeader の色は専用の定義を持たず、
  // 下の DEFAULT_COLOR_ENTRIES ループが docs/DefaultColor.md から登録する（実体は ColorStatus）。

  // ── ToolBar 表示モード ────────────────────────────────────────────────
  'ToolBar.Mode.Name': {
    panel: 'WorkoutPanel',
    default: 'Copyright', type: 'string',
    candidates: '^(Status|Highlighter|KeyAction|Command|Translate|Reminder|Copyright)$',
    description: 'Toolバー表示モード',
    get: (app) => app.WorkoutPanel.ToolBarMode,
    set: (app, v) => { app.WorkoutPanel.ToolBarMode = v; },
  },
  'ToolBar.StatusMode.Text': {
    panel: 'WorkoutPanel',
    default: 'ThinktankPanel.Mode.Name,OverviewPanel.Mode.Name,WorkoutSettingPanel.Mode.Name',
    type: 'string',
    candidates: '.*',
    description: 'ステータスバー表示項目 (CSV)',
    get: (app) => app.WorkoutPanel.StatusModeText,
    set: (app, v) => { app.WorkoutPanel.StatusModeText = v; },
  },
  'ToolBar.HighlighterMode.Text': {
    panel: 'WorkoutPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'ハイライターの入力テキスト',
    get: (app) => app.WorkoutPanel.HighlightWord || '',
    set: (app, v) => { app.WorkoutPanel.HighlightWord = v; },
  },
  'ToolBar.HighlighterMode.Text:AddContentSearchKeywordFlag': {
    panel: 'WorkoutPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: 'コンテンツで絞込みのキーワードをハイライトする',
    get: (app) => String(app.WorkoutPanel.AddContentSearchKeywordFlag),
    set: (app, v) => { app.WorkoutPanel.AddContentSearchKeywordFlag = parseBool(v, app.WorkoutPanel.AddContentSearchKeywordFlag); },
  },
  'ToolBar.HighlighterMode.Text:AddTitleSearchKeywordFlag': {
    panel: 'WorkoutPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: 'タイトルで絞込みのキーワードをハイライトする',
    get: (app) => String(app.WorkoutPanel.AddTitleSearchKeywordFlag),
    set: (app, v) => { app.WorkoutPanel.AddTitleSearchKeywordFlag = parseBool(v, app.WorkoutPanel.AddTitleSearchKeywordFlag); },
  },
  'ToolBar.CommandMode.Text': {
    panel: 'WorkoutPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'コマンドラインの入力テキスト',
    get: (app) => app.WorkoutPanel.CommandText || '',
    set: (app, v) => { app.WorkoutPanel.CommandText = v; },
  },
  'ToolBar.TranslateMode.Text': {
    panel: 'WorkoutPanel',
    default: '', type: 'string', candidates: '.*',
    description: '翻訳の入力テキスト',
    get: (app) => app.WorkoutPanel.TranslateText || '',
    set: (app, v) => { app.WorkoutPanel.TranslateText = v; },
  },
  'ToolBar.ReminderMode.Text': {
    panel: 'WorkoutPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'リマインダーの入力テキスト',
    get: (app) => app.WorkoutPanel.ReminderText || '',
    set: (app, v) => { app.WorkoutPanel.ReminderText = v; },
  },

  // ── Application ──────────────────────────────────────────────────────────
  'Application.FocusedPanel.Name': {
    panel: 'Application',
    default: 'Thinktank', type: 'string',
    candidates: '^(Thinktank|Overview|WorkoutSetting|Workout|ReThink)$',
    description: 'フォーカスカラム',
    getValues: (_app) => localStorage.getItem('tt-layout-mode') === 'simple'
      ? ['Thinktank', 'WorkoutSetting', 'Workout']
      : ['Thinktank', 'Overview', 'WorkoutSetting', 'Workout', 'ReThink'],
    get: (app) => app.FocusedColumn,
    set: (app, v) => {
      app.FocusedColumn = v;
      const SELECTORS: Record<string, string> = {
        'Thinktank':      '.thinktank-panel, .thinktank-area',
        'Overview':       '.overview-panel, .overview-area',
        'WorkoutSetting': '.workout-setting-area',
        'Workout':        '.workout-area',
        'ReThink':        '.rethink-panel, .rethink-area',
      };
      const effectiveSel = (v === 'WorkoutSetting' && !app.WorkoutPanel.IsAreaOpen)
        ? '.vertical-tab-bar--workout .vertical-tab-bar__toggle'
        : SELECTORS[v];
      if (effectiveSel) {
        focusSelector(effectiveSel);
      }
    },
  },

  // ── ReThinkPanel ─────────────────────────────────────────────────────────
  'ReThinkPanel.Area.IsOpen': {
    panel: 'ReThinkPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: '右パネル表示',
    get: (app) => String(app.ReThinkPanel.IsAreaOpen),
    set: (app, v) => { app.ReThinkPanel.IsAreaOpen = parseBool(v, app.ReThinkPanel.IsAreaOpen); },
  },
  'ReThinkPanel.Mode.Name': {
    panel: 'ReThinkPanel',
    default: 'Chat', type: 'string', candidates: '^(Chat|Settings)$',
    description: '右パネル表示モード',
    get: (app) => capitalize(app.ReThinkPanel.ViewMode),
    set: (app, v) => { app.ReThinkPanel.SetViewMode(v.toLowerCase() as ReThinkViewMode); },
  },

  // パネル・ツールバーのテーマ色は docs/DefaultColor.md の <Panel>.Theme.* が定義元。
  // 下の DEFAULT_COLOR_ENTRIES ループが登録し、CSS変数への展開は utils/panelTheme.ts が行う。

  // ── KeyboardFocus & Pane Info ──────────────────────────────────────────────
  'Application.FocusedArea.Name': {
    panel: 'Application',
    default: 'None', type: 'string', candidates: '.*',
    description: 'キーボードフォーカスエリア名',
    isConst: true,
    getValues: (app) => {
      const list: string[] = [];
      const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      const isSimple = localStorage.getItem('tt-layout-mode') === 'simple';

      if (app.ThinktankPanel.IsAreaOpen) {
        list.push(`Thinktank.${capitalize(app.ThinktankPanel.ViewMode)}`);
      }
      if (!isSimple && app.OverviewPanel.IsAreaOpen) {
        list.push(`Overview.${capitalize(app.OverviewPanel.ViewMode)}`);
      }
      if (app.WorkoutPanel.IsAreaOpen) {
        list.push(`WorkoutSetting.${capitalize(app.WorkoutPanel.ViewMode)}`);
      }
      if (app.WorkoutPanel.Areas.length > 0) {
        for (const area of app.WorkoutPanel.Areas) {
          list.push(`Workout.${capitalize(area.MediaType)}`);
        }
      }
      if (!isSimple && app.ReThinkPanel.IsAreaOpen) {
        list.push(`ReThink.${capitalize(app.ReThinkPanel.ViewMode)}`);
      }
      list.push(`ToolBar.${capitalize(app.WorkoutPanel.ToolBarMode)}`);

      return Array.from(new Set(list));
    },
    get: (_app) => getFocusName(document.activeElement),
    set: (app, value) => {
      if (!value || value === 'None') {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return;
      }
      if (value === 'Application.StatusBarArea') {
        focusSelector('.ApplicationStatusBarArea');
        return;
      }

      const parts = value.split('.');
      const panelName = parts[0];
      const subName = parts[1] || '';

      const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      const subNameCap = capitalize(subName);

      if (panelName === 'Thinktank') {
        app.ThinktankPanel.IsAreaOpen = true;
        if (subName) {
          app.ThinktankPanel.ViewMode = subName.toLowerCase() as any;
        }
        focusSelector('.thinktank-panel, .thinktank-area');
      } else if (panelName === 'Overview') {
        app.OverviewPanel.IsAreaOpen = true;
        if (subName) {
          app.OverviewPanel.SetViewMode(subName.toLowerCase() as any);
        }
        focusSelector('.overview-panel, .overview-area');
      } else if (panelName === 'WorkoutSetting') {
        app.WorkoutPanel.IsAreaOpen = true;
        if (subName) {
          app.WorkoutPanel.SetViewMode(subName.toLowerCase() as any);
        }
        focusSelector('.workout-setting-area');
      } else if (panelName === 'ReThink') {
        app.ReThinkPanel.IsAreaOpen = true;
        if (subName) {
          app.ReThinkPanel.SetViewMode(subName.toLowerCase() as any);
        }
        focusSelector('.rethink-panel, .rethink-area');
      } else if (panelName === 'ToolBar') {
        if (subName) {
          const modeMap: Record<string, string> = {
            'keyaction': 'KeyAction',
          };
          const toolbarMode = modeMap[subName.toLowerCase()] || subNameCap;
          app.WorkoutPanel.ToolBarMode = toolbarMode;
        }
        focusSelector('.workout-toolbar');
      } else if (panelName === 'Workout') {
        if (subName && subName.toLowerCase() !== 'none') {
          const typeLower = subName.toLowerCase();
          setTimeout(() => {
            const areas = Array.from(document.querySelectorAll<HTMLElement>('.workout-area'));
            const targetArea = areas.find(area => {
              const content = area.querySelector<HTMLElement>('.workout-area__content');
              return content?.dataset.mediaType?.toLowerCase() === typeLower;
            }) || areas[0];
            
            if (targetArea) {
              const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [contenteditable], [tabindex]:not([tabindex="-1"])';
              if (targetArea.matches(FOCUSABLE) && !targetArea.closest('[inert]')) {
                targetArea.focus({ preventScroll: true });
                return;
              }
              const focusable = Array.from(targetArea.querySelectorAll<HTMLElement>(FOCUSABLE))
                .find(el => !el.closest('[inert]'));
              if (focusable) focusable.focus({ preventScroll: true });
              else if (!targetArea.closest('[inert]')) targetArea.focus({ preventScroll: true });
            }
          }, 50);
        } else {
          focusSelector('.workout-area');
        }
      }
    },
  },
  'Application.PanelDisplay.Mode': {
    panel: 'Application',
    default: 'Normal', type: 'string', candidates: '^(Normal|Simple)$',
    description: 'パネル表示モード（Normal=全表示, Simple=簡易表示）',
    get: () => localStorage.getItem('tt-layout-mode') === 'simple' ? 'Simple' : 'Normal',
    set: (_app, v) => { localStorage.setItem('tt-layout-mode', v === 'Simple' ? 'simple' : 'sipoc'); },
  },
  'Application.Execution.Status': {
    panel: 'Application',
    default: 'PWA', type: 'string', candidates: '^(PWA|Local|Electron)$',
    description: 'アプリケーションの起動モード',
    isConst: true,
    get: () => {
      const mode = StorageManager.instance.mode;
      if (mode === 'electron') return 'Electron';
      if (mode === 'local') return 'Local';
      return 'PWA';
    },
    set: () => {},
  },
  'Application.Synchronization.Status': {
    panel: 'Application',
    default: 'synced', type: 'string', candidates: '^(synced|syncing|pending|error|offline)$',
    description: 'アプリケーションの同期状態',
    isConst: true,
    get: (app) => app.Status.SyncState || 'synced',
    set: () => {},
  },
  'Application.Status.ExMode': {
    panel: 'Application',
    default: 'None', type: 'string', candidates: '.*',
    description: '一時拡張ショートカットモード',
    isConst: true,
    get: (app) => app.Status.ExMode || 'None',
    set: () => {},
  },
  'Application.Resource.LocalExporting': {
    panel: 'Application',
    default: '0%', type: 'string', candidates: '.*',
    description: 'エクスポート進捗率',
    isConst: true,
    get: (app) => app.Status.LocalExporting || '0%',
    set: () => {},
  },
  'WorkoutPanel.Panes.Count': {
    panel: 'WorkoutPanel',
    default: '0', type: 'string', candidates: '^[0-9]+$',
    description: '表示されているペインの数',
    isConst: true,
    get: (app) => String(app.WorkoutPanel.Areas.length),
    set: () => {},
  },
  'WorkoutPanel.FocusedPane.ID': {
    panel: 'WorkoutPanel',
    default: 'None', type: 'string', candidates: '.*',
    description: 'フォーカスがあるペインのID',
    isConst: true,
    get: (app) => app.WorkoutPanel.FocusedAreaId ?? 'None',
    set: () => {},
  },
  'WorkoutPanel.FocusedPane.PaneNumber': {
    panel: 'WorkoutPanel',
    default: '0', type: 'string', candidates: '^[0-9]+$',
    description: 'フォーカスがあるペインの番号（1始まり）',
    isConst: true,
    get: (app) => {
      const layout = app.WorkoutPanel.Layout;
      if (!layout || !app.WorkoutPanel.FocusedAreaId) return '0';
      const order = collectAreaIds(layout);
      const idx = order.indexOf(app.WorkoutPanel.FocusedAreaId);
      return idx >= 0 ? String(idx + 1) : '0';
    },
    set: () => {},
  },
  'WorkoutPanel.FocusedPane.Mode': {
    panel: 'WorkoutPanel',
    default: 'Workout', type: 'string',
    candidates: '^(Workout|Texteditor|Markdown|Datagrid|Card|Graph|Chat)$',
    description: 'フォーカスがあるペインの表示モード',
    getValues: (app) => getFocusedPaneAllowedModes(app),
    get: (app) => {
      const area = app.WorkoutPanel.FocusedAreaId ? app.WorkoutPanel.GetArea(app.WorkoutPanel.FocusedAreaId) : null;
      return capitalize(area?.MediaType ?? 'None');
    },
    set: (app, v) => {
      if (app.WorkoutPanel.FocusedAreaId) {
        const allowed = getFocusedPaneAllowedModes(app).map(x => x.toLowerCase());
        if (allowed.includes(v.toLowerCase())) {
          app.WorkoutPanel.SetMediaType(app.WorkoutPanel.FocusedAreaId, v.toLowerCase() as MediaType);
        }
      }
    },
  },
  'WorkoutPanel.FocusedPane.FileHistory': {
    panel: 'WorkoutPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'フォーカスがあるペインのLoadファイル履歴（古い順・最大30件のCSV）',
    isConst: true,
    get: (app) => getFocusedArea(app)?.FileHistory.map(h => h.id).join(',') ?? '',
    set: () => {},
  },
  'WorkoutPanel.FocusedPane.FileHistoryPos': {
    panel: 'WorkoutPanel',
    default: '0', type: 'string', candidates: '^[0-9]+$',
    description: 'フォーカスがあるペインのファイル履歴の現在位置（1始まり。0=履歴なし）',
    isConst: true,
    get: (app) => String(getFocusedArea(app)?.HistoryPos ?? 0),
    set: () => {},
  },
  'WorkoutPanel.FocusedPane.FileHistoryMax': {
    panel: 'WorkoutPanel',
    default: '0', type: 'string', candidates: '^[0-9]+$',
    description: 'フォーカスがあるペインのファイル履歴の件数（最大30）',
    isConst: true,
    get: (app) => String(getFocusedArea(app)?.HistoryMax ?? 0),
    set: () => {},
  },
  'WorkoutPanel.DroppedFile.ID': {
    panel: 'WorkoutPanel',
    default: '', type: 'string', candidates: '.*',
    description: '各パネルのThink一覧のThinkファイルがWorkoutパネル内にDropされた際に設定されるファイルID',
    isConst: true,
    get: (app) => app.WorkoutPanel.DroppedFileID || '',
    set: () => {},
  },
  'TextEditor.CurrentFolding.HeadingOffset': {
    panel: 'WorkoutPanel',
    default: '0', type: 'string', candidates: '.*',
    description: 'カーソル位置が属する見出し行の開始位置（先頭文字位置）',
    isConst: true,
    get: (app) => app.WorkoutPanel.TextEditor.CurrentFoldingHeadingOffset ?? '0',
    set: (app, v) => { app.WorkoutPanel.TextEditor.CurrentFoldingHeadingOffset = v; },
  },
  'TextEditor.CurrentFolding.HeadingNumber': {
    panel: 'WorkoutPanel',
    default: 'None', type: 'string', candidates: '.*',
    description: 'カーソル位置が属する見出し行の番号(例: 1.3.4)',
    isConst: true,
    get: (app) => app.WorkoutPanel.TextEditor.CurrentFoldingHeadingNumber ?? 'None',
    set: (app, v) => { app.WorkoutPanel.TextEditor.CurrentFoldingHeadingNumber = v; },
  },
  'TextEditor.CurrentEditor.CursorPos': {
    panel: 'WorkoutPanel',
    default: '0', type: 'string', candidates: '.*',
    description: '現在のエディタのカーソル位置',
    isConst: true,
    get: (app) => app.WorkoutPanel.TextEditor.CurrentEditorCursorPos ?? '0',
    set: (app, v) => {
      app.WorkoutPanel.TextEditor.CurrentEditorCursorPos = v;
      const offset = parseInt(v, 10);
      if (!isNaN(offset)) {
        const editor = TTShortcutManager.instance.activeEditor;
        if (editor) {
          const model = editor.getModel();
          if (model) {
            const pos = model.getPositionAt(offset);
            const curPos = editor.getPosition();
            if (curPos && (curPos.lineNumber !== pos.lineNumber || curPos.column !== pos.column)) {
              editor.setPosition(pos);
              editor.revealPositionInCenterIfOutsideViewport(pos);
            }
          }
        }
      }
    },
  },
  'TextEditor.CurrentEditor.TextOnCursorPos': {
    panel: 'WorkoutPanel',
    default: '', type: 'string', candidates: '.*',
    description: '現在のエディタのカーソル位置のテキスト',
    isConst: true,
    get: (app) => app.WorkoutPanel.TextEditor.CurrentEditorTextOnCursorPos ?? '',
    set: (app, v) => { app.WorkoutPanel.TextEditor.CurrentEditorTextOnCursorPos = v; },
  },
  'WorkoutPanel.Pane.Layout': {
    panel: 'WorkoutPanel',
    default: 'null', type: 'string', candidates: '.*',
    description: 'Paneレイアウト構造(JSON)',
    get: (app) => app.WorkoutPanel.Layout ? JSON.stringify(app.WorkoutPanel.Layout) : 'null',
    set: (app, v) => {
      try {
        app.WorkoutPanel.Layout = (v && v !== 'null') ? JSON.parse(v) : null;
      } catch (e) {
        console.error('Failed to parse WorkoutPanel.Pane.Layout', e);
      }
    },
  },
  'WorkoutPanel.Pane.Display': {
    panel: 'WorkoutPanel',
    default: '[]', type: 'string', candidates: '.*',
    description: '各Paneのロード状態(JSON)',
    get: (app) => {
      const list = app.WorkoutPanel.Areas.map(a => ({
        id: a.ID,
        resourceId: a.ResourceID,
        mediaType: a.MediaType,
        title: a.Title
      }));
      return JSON.stringify(list);
    },
    set: (app, v) => {
      try {
        const list = v ? JSON.parse(v) : [];
        if (!Array.isArray(list)) return;
        
        // 既存の Areas を一度クリアし、ID情報を保持したまま再構築
        app.WorkoutPanel.Areas = [];
        for (const item of list) {
          const area = new TTWorkoutArea();
          area.ID = item.id;
          area._parent = app.WorkoutPanel;
          area.OpenThink(item.resourceId, item.mediaType, item.title);
          app.WorkoutPanel.Areas = [...app.WorkoutPanel.Areas, area];
        }
      } catch (e) {
        console.error('Failed to parse WorkoutPanel.Pane.Display', e);
      }
    },
  },
};

// Bullet / Comment の Style1..20（記号,色,属性 の結合値）は廃止した。
// 行頭記号は TextEditor.<種別>.Marks、色・表示属性は docs/DefaultColor.md の
// TextEditor.<種別>.Style(1..N).* に分かれ、後者は下の DEFAULT_COLOR_ENTRIES ループが登録する。

// ── docs/DefaultColor.md 由来の StatusID変数 ──────────────────────────────────
//
// 1行（StatusID名, Color, BgColor, Attrs）から
// `<StatusID>.Color` / `<StatusID>.BgColor` / `<StatusID>.Attrs` の3変数を登録し、
// CSVの各値をその既定値にする。
// 既存キーと重なる場合は get/set を既存定義のまま残し、既定値だけをファイル側で上書きする
// （色の既定値の定義元を DefaultColor.md に一本化するため）。
// `undefined` は無設定値なので、既存キーの既定値は上書きしない。

const COLOR_PROP_TYPE: Record<ColorProp, PropDef['type']> = {
  Color:   'color',
  BgColor: 'color',
  Attrs:   'string',
};

const COLOR_VALUE_PATTERN = '^(#[0-9a-fA-F]{3,8}|undefined|none)$';
const ATTR_NAMES = 'bold|italic|underline|strikethrough';

const COLOR_PROP_CANDIDATES: Record<ColorProp, string> = {
  Color:   COLOR_VALUE_PATTERN,
  BgColor: COLOR_VALUE_PATTERN,
  Attrs:   `^(undefined|none|(${ATTR_NAMES})(\\|(${ATTR_NAMES}))*)$`,
};

const COLOR_PROP_LABEL: Record<ColorProp, string> = {
  Color:   '文字色',
  BgColor: '背景色',
  Attrs:   `表示属性 (${ATTR_NAMES})`,
};

function colorStatusPanel(statusId: string): PanelKey {
  const prefix = statusId.split('.')[0];
  if (prefix === 'Thinktank') return 'ThinktankPanel';
  if (prefix === 'Overview')  return 'OverviewPanel';
  if (prefix === 'ReThink')   return 'ReThinkPanel';
  if (prefix === 'Application')    return 'Application';
  if (prefix === 'FocusingBorder') return 'Application';
  return 'WorkoutPanel';
}

for (const entry of DEFAULT_COLOR_ENTRIES) {
  for (const prop of COLOR_PROPS) {
    const key      = `${entry.statusId}.${prop}`;
    const defValue = entry.style[prop];
    const existing = (PROP_SPECS as Record<string, PropSpec | undefined>)[key];

    if (existing) {
      if (!isUnset(defValue)) existing.default = defValue;
      continue;
    }

    (PROP_SPECS as Record<string, PropSpec>)[key] = {
      panel: colorStatusPanel(entry.statusId),
      default: defValue,
      type: COLOR_PROP_TYPE[prop],
      candidates: COLOR_PROP_CANDIDATES[prop],
      description: `${entry.statusId} の${COLOR_PROP_LABEL[prop]}`,
      get: (app: TTApplication) => app.WorkoutPanel.GetColorStatus(entry.statusId)[prop],
      set: (app: TTApplication, v: string) => { app.WorkoutPanel.SetColorStatus(entry.statusId, prop, v, false); },
    };
  }
}

// ── TTUIStateManager ──────────────────────────────────────────────────────────

export class TTUIStateManager {
  static readonly THINK_ID = '__tt_ui_state__';
  private static readonly LS_KEY = 'tt-ui-state-v4';
  private static _instance: TTUIStateManager | null = null;

  private _app: TTApplication | null = null;
  private _applying = false;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _undoStack: string[] = [];
  private _redoStack: string[] = [];
  private _listeners = new Map<ConfigKey, Set<ConfigListener>>();

  static get instance(): TTUIStateManager {
    if (!TTUIStateManager._instance) {
      TTUIStateManager._instance = new TTUIStateManager();
    }
    return TTUIStateManager._instance;
  }

  private constructor() {}

  /**
   * 初期化。TTApplication.Instance 生成後に呼ぶ。
   * localStorage から即時ロードし、アプリ変更を debounce 保存する。
   */
  init(app: TTApplication): void {
    this._app = app;
    this._loadFromLocalStorage();
    app.AddOnUpdate('TTUIStateManager', () => {
      if (this._applying) return;
      this._scheduleSave();
    });
  }

  /**
   * Vault 読み込み完了後に呼ぶ。UIState Think を作成/同期する。
   */
  async ensureThinkExists(_vault: TTVault): Promise<void> {
    this._applyContent(localStatusContent);
    const stored = localStorage.getItem(TTUIStateManager.LS_KEY);
    if (stored) {
      this._applyContent(stored);
    }
  }

  /** DataGrid/Card が UIState Think を保存したときのフック（WorkoutArea から呼ぶ）*/
  onThinkSaved(thinkId: string, content: string): void {
    if (thinkId !== TTUIStateManager.THINK_ID) return;
    this._pushUndo();
    this._applyContent(content);
    this._saveToLocalStorage();
  }

  /** ショートカット等からの単一プロパティ変更 */
  applyProperty(key: ConfigKey, value: string): void {
    if (!this._app) return;
    this._pushUndo();
    this._applying = true;
    try {
      this._applyProp(key, value);
      const newVal = PROP_SPECS[key]?.get(this._app) ?? value;
      this._emit(key, newVal);
      this._app.NotifyUpdated(false);
    } finally {
      this._applying = false;
    }
    this._saveToLocalStorage();
  }

  /** 指定したキーの現在値を文字列で取得する */
  getProperty(key: ConfigKey): string {
    if (!this._app) return '';
    const spec = PROP_SPECS[key];
    if (!spec) return '';
    return spec.get(this._app);
  }

  /** 読み取り専用プロパティ（フォーカス等）の値変更を軽量に通知する */
  notifyConstPropertyChanged(key: ConfigKey): void {
    if (!this._app) return;
    const spec = PROP_SPECS[key];
    if (!spec || !spec.isConst) return;
    const val = spec.get(this._app);
    this._emit(key, val);
    this._app.NotifyUpdated(false);
  }

  /** 指定したキーのプロパティ変更イベントとアプリ更新を通知する */
  notifyPropertyChanged(key: ConfigKey): void {
    if (!this._app) return;
    const spec = PROP_SPECS[key];
    if (!spec) return;
    const val = spec.get(this._app);
    this._emit(key, val);
    this._app.NotifyUpdated(false);
  }

  /** 現在のアプリ状態をシリアライズして返す（更新ボタン用） */
  getLatestContent(): string | null {
    if (!this._app) return null;
    return this.serialize(this._app);
  }

  undo(): boolean {
    if (this._undoStack.length === 0 || !this._app) return false;
    const current = this.serialize(this._app);
    this._redoStack.push(current);
    const prev = this._undoStack.pop()!;
    this._applyContent(prev);
    this._saveToLocalStorage();
    return true;
  }

  redo(): boolean {
    if (this._redoStack.length === 0 || !this._app) return false;
    const current = this.serialize(this._app);
    this._undoStack.push(current);
    const next = this._redoStack.pop()!;
    this._applyContent(next);
    this._saveToLocalStorage();
    return true;
  }

  // ── プライベート ──────────────────────────────────────────────────────────

  /**
   * PROP_SPECS から PropDef 配列を生成する。
   * 新規項目は PROP_SPECS への追加のみで自動反映される。
   */
  private _getProps(app: TTApplication): PropDef[] {
    return Object.entries(PROP_SPECS).map(([key, spec]) => {
      const current = spec.get(app);
      return {
        key,
        current,
        default:     spec.default,
        type:        spec.type,
        candidates:  spec.candidates,
        description: spec.description,
      };
    });
  }

  /**
   * 文字列キーと値をパネルプロパティに書き込む。
   * candidates 正規表現で値を検証し、toggle/next/prev の特別コマンドを処理する。
   * NotifyUpdated() は呼ばない（_applyContent がまとめて呼ぶ）。
   */
  private _applyProp(key: ConfigKey, value: string): void {
    if (!this._app) return;
    const spec = PROP_SPECS[key];
    if (!spec) return;

    const current = spec.get(this._app);
    const pattern = new RegExp(spec.candidates);

    // toggle/next/prev コマンド処理
    if (value === 'toggle') {
      if (spec.type === 'boolean') {
        const newVal = current === 'true' ? 'false' : 'true';
        spec.set(this._app, newVal);
      }
      return;
    }

    const candidates = spec.getValues ? spec.getValues(this._app) : extractValuesFromPattern(spec.candidates);
    if (value === 'next' && candidates.length > 0) {
      const idx = candidates.indexOf(current);
      const nextIdx = (idx + 1) % candidates.length;
      spec.set(this._app, candidates[nextIdx]);
      return;
    }

    if (value === 'prev' && candidates.length > 0) {
      const idx = candidates.indexOf(current);
      const prevIdx = (idx - 1 + candidates.length) % candidates.length;
      spec.set(this._app, candidates[prevIdx]);
      return;
    }

    // 通常の値変更：正規表現で検証
    if (pattern.test(value)) {
      let finalValue = value;
      spec.set(this._app, finalValue);
    }
  }

  /**
   * テーブル形式のコンテンツを解析して全プロパティを適用する。
   * current 列を優先し、旧 value 列にフォールバック（後方互換）。
   * 影響パネルをまとめて NotifyUpdated() することで無駄な再レンダリングを防ぐ。
   */
  private _applyContent(content: string): void {
    if (!this._app) return;
    this._applying = true;
    try {
      content = content
        .replace(/\bApplication\.KeyboardFocused\.AreaName\b/g, 'Application.FocusedArea.Name')
        .replace(/\bApplication\.Focused\.ColumnName\b/g, 'Application.FocusedPanel.Name')
        .replace(/\bApplication\.FocusedColumn\b/g, 'Application.FocusedPanel.Name')
        .replace(/\bThinktankPanel\.Mode\.IsOpen\b/g, 'ThinktankPanel.Area.IsOpen')
        .replace(/\bThinktankPanel\.IsAreaOpen\b/g, 'ThinktankPanel.Area.IsOpen')
        .replace(/\bOverviewPanel\.Mode\.IsOpen\b/g, 'OverviewPanel.Area.IsOpen')
        .replace(/\bOverviewPanel\.IsAreaOpen\b/g, 'OverviewPanel.Area.IsOpen')
        .replace(/\bWorkoutSettingPanel\.Mode\.IsOpen\b/g, 'WorkoutSettingPanel.Area.IsOpen')
        .replace(/\bWorkoutPanel\.IsAreaOpen\b/g, 'WorkoutSettingPanel.Area.IsOpen')
        .replace(/\bReThinkPanel\.Mode\.IsOpen\b/g, 'ReThinkPanel.Area.IsOpen')
        .replace(/\bReThinkPanel\.IsAreaOpen\b/g, 'ReThinkPanel.Area.IsOpen')
        .replace(/\bTextEditor\.Color\.Background\b/g, 'TextEditor.Text.BgColor')
        .replace(/\bTextEditor\.Color\.Text\b/g, 'TextEditor.Text.Color')
        .replace(/\bTextEditor\.Color\.Selection\b/g, 'TextEditor.Selection.BgColor')
        .replace(/\bTextEditor\.Color\.Occurrence\b/g, 'TextEditor.Occurrence.BgColor')
        .replace(/\bDefault\.TextEditor\.Text\.Selection\.BgColor\b/g, 'TextEditor.Selection.BgColor')
        .replace(/\bDefault\.TextEditor\.Text\.Occurrence\.BgColor\b/g, 'TextEditor.Occurrence.BgColor')
        .replace(/\bDefault\.TextEditor\.Text\.BgColor\b/g, 'TextEditor.Text.BgColor')
        .replace(/\bDefault\.TextEditor\.Text\.Color\b/g, 'TextEditor.Text.Color')
        .replace(/\bDefault\.TextEditor\.Selection\.BgColor\b/g, 'TextEditor.Selection.BgColor')
        .replace(/\bDefault\.TextEditor\.Occurrence\.BgColor\b/g, 'TextEditor.Occurrence.BgColor')
        .replace(/\bWorkoutPanel\.Pane\.Count\b/g, 'WorkoutPanel.Panes.Count')
        // パネル色は <Panel>.Theme.Color（基礎色）へ集約。旧 Area.BgColor は基礎色からの
        // 派生になったので引き継がない（旧キーは spec が無いため読み飛ばされる）。
        .replace(/\bThinktank\.Ribbon\.BgColor\b/g, 'Thinktank.Theme.Color')
        .replace(/\bOverview\.Ribbon\.BgColor\b/g,  'Overview.Theme.Color')
        .replace(/\bWorkout\.Ribbon\.BgColor\b/g,   'Workout.Theme.Color')
        .replace(/\bReThink\.Ribbon\.BgColor\b/g,   'ReThink.Theme.Color')
        .replace(/\bToolBar\.BgColor\b/g,           'ToolBar.Theme.Color')
        .replace(/\bToolBar\.Color\b/g,             'ToolBar.Theme.BgColor');
      let sections = parseTableContent(content);
      let section = sections[0];

      // CSVとしてパースできない場合（Markdown形式の場合）、Markdownとしてパースを試みる
      if (!section || section.columns.length === 0) {
        sections = [parseMarkdownStatus(content)];
        section = sections[0];
      }

      if (!section) return;
      const keyIdx = section.columns.findIndex(c => c === 'key');
      const curIdx = section.columns.findIndex(c => c === 'current');
      const defIdx = section.columns.findIndex(c => c === 'default');
      const valIdx = section.columns.findIndex(c => c === 'value');
      const applyIdx = curIdx >= 0 ? curIdx : valIdx; // current 優先、旧 value にフォールバック
      if (keyIdx < 0 || applyIdx < 0) return;

      const updatedKeys = new Set<ConfigKey>();

      // 1st pass: const エントリ → default 列の値を適用（ファイルで編集可能なプリセットデータを読み込む）
      for (const row of section.rows) {
        const key  = row[keyIdx]?.trim() ?? '';
        const spec = PROP_SPECS[key];
        if (!spec?.isConst) continue;
        const defaultVal = defIdx >= 0 ? (row[defIdx] ?? spec.default) : spec.default;
        this._applyProp(key, defaultVal);
        updatedKeys.add(key);
      }

      // 旧キーからのマイグレーション用集計バッファ
      const oldHighlighters: Record<number, { color?: string; bgColor?: string; attrs?: string }> = {};
      const oldHeadings: Record<number, { color?: string; bgColor?: string; attrs?: string }> = {};

      // 2nd pass: 通常エントリ → current 列の値を適用
      for (const row of section.rows) {
        const key = row[keyIdx]?.trim() ?? '';
        const val = row[applyIdx] ?? '';
        if (!key) continue;

        // Highlighter 古いキーの検出とバッファリング
        let match = key.match(/^TextEditor\.Highlighter(\d+)\.(Color|BgColor|Attrs)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          const prop = match[2];
          if (!oldHighlighters[num]) oldHighlighters[num] = {};
          if (prop === 'Color') oldHighlighters[num].color = val;
          if (prop === 'BgColor') oldHighlighters[num].bgColor = val;
          if (prop === 'Attrs') oldHighlighters[num].attrs = val;
          continue;
        }

        // Heading 古いキーの検出とバッファリング
        match = key.match(/^TextEditor\.Heading(\d+)\.(Color|BgColor|Attrs)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          const prop = match[2];
          if (!oldHeadings[num]) oldHeadings[num] = {};
          if (prop === 'Color') oldHeadings[num].color = val;
          if (prop === 'BgColor') oldHeadings[num].bgColor = val;
          if (prop === 'Attrs') oldHeadings[num].attrs = val;
          continue;
        }

        const spec = PROP_SPECS[key];
        if (spec?.isConst) continue;
        this._applyProp(key, val);
        updatedKeys.add(key);
      }

      // 集計した古いキーを統合したStyleとして適用
      for (const [numStr, s] of Object.entries(oldHighlighters)) {
        const num = parseInt(numStr, 10);
        const color = s.color || 'undefined';
        const bgColor = s.bgColor || 'undefined';
        const attrs = s.attrs || 'none';
        const newKey = `TextEditor.Highlighter.Style${num}`;
        this._applyProp(newKey, `${color}, ${bgColor}, ${attrs}`);
        updatedKeys.add(newKey);
      }
      for (const [numStr, s] of Object.entries(oldHeadings)) {
        const num = parseInt(numStr, 10);
        const color = s.color || 'undefined';
        const bgColor = s.bgColor || 'undefined';
        const attrs = s.attrs || 'none';
        const newKey = `TextEditor.Heading.Style${num}`;
        this._applyProp(newKey, `${color}, ${bgColor}, ${attrs}`);
        updatedKeys.add(newKey);
      }

      // 変更イベントを発火
      for (const key of updatedKeys) {
        const val = PROP_SPECS[key]?.get(this._app) ?? '';
        this._emit(key, val);
      }
      this._app.NotifyUpdated(false);
    } finally {
      this._applying = false;
    }
  }

  /** TTApplication 状態をテーブル形式にシリアライズ（新列構成）*/
  serialize(app: TTApplication): string {
    const props = this._getProps(app);
    const lines = [
      'UI Settings',
      '# current列を編集 → Ctrl+S 保存でUIに反映 / 更新ボタンでUIからファイルに反映',
      '# Undo: Ctrl+Shift+Z  /  Redo: Ctrl+Shift+Y',
      '',
      '> description,key,current,default,type,candidates',
      ...props.map(p =>
        [
          csvEscape(p.description),
          p.key,
          csvEscape(p.current),
          csvEscape(p.default),
          p.type,
          csvEscape(p.candidates),
        ].join(',')
      ),
    ];
    return lines.join('\n');
  }

  /** 指定したキーに対するプロパティ変更イベントを購読する */
  addListener(key: ConfigKey, listener: ConfigListener): void {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key)!.add(listener);
  }

  /** 指定したキーに対するプロパティ変更イベントの購読を解除する */
  removeListener(key: ConfigKey, listener: ConfigListener): void {
    this._listeners.get(key)?.delete(listener);
  }

  /** イベントをディスパッチする */
  private _emit(key: ConfigKey, value: string): void {
    // 特定キーのリスナー
    this._listeners.get(key)?.forEach(listener => listener(key, value));

    // ドット区切りの各階層でのワイルドカード通知（例: "Column.Thinktank.IsOpen" -> "Column.Thinktank.*", "Column.*"）
    const parts = key.split('.');
    for (let i = 1; i < parts.length; i++) {
      const subCat = parts.slice(0, i).join('.') + '.*';
      this._listeners.get(subCat)?.forEach(listener => listener(key, value));
    }

    // グローバルリスナー
    this._listeners.get('*')?.forEach(listener => listener(key, value));
  }

  private _pushUndo(): void {
    if (!this._app) return;
    const state = this.serialize(this._app);
    if (this._undoStack[this._undoStack.length - 1] === state) return;
    this._undoStack.push(state);
    if (this._undoStack.length > 50) this._undoStack.shift();
    this._redoStack = [];
  }

  private _scheduleSave(): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._saveToLocalStorage();
    }, 500);
  }

  private _saveToLocalStorage(): void {
    if (!this._app) return;
    localStorage.setItem(TTUIStateManager.LS_KEY, this.serialize(this._app));
  }

  private _loadFromLocalStorage(): void {
    const stored = localStorage.getItem(TTUIStateManager.LS_KEY);
    if (stored) {
      this._applyContent(stored);
    } else {
      this._applyContent(localStatusContent);
    }
  }
}

// ── ユーティリティ ────────────────────────────────────────────────────────────
function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}


function extractValuesFromPattern(pattern: string): string[] {
  const match = pattern.match(/\^?\(([^)]+)\)\$?/);
  if (!match) return [];
  return match[1].split('|').map(v => v.trim());
}

function parseBool(value: string, current: boolean): boolean {
  if (value === 'toggle') return !current;
  if (value === 'true')   return true;
  if (value === 'false')  return false;
  return current;
}

function csvEscape(v: string): string {
  return v.includes(',') || v.includes('"') || v.includes('\n')
    ? `"${v.replace(/"/g, '""')}"` : v;
}

export function focusSelector(selector: string, fallbackSelector?: string): void {
  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [contenteditable], [tabindex]:not([tabindex="-1"])';
  setTimeout(() => {
    let root = document.querySelector<HTMLElement>(selector);
    if (!root && fallbackSelector) {
      root = document.querySelector<HTMLElement>(fallbackSelector);
    }
    if (!root) return;

    if (root.matches(FOCUSABLE) && !root.closest('[inert]')) {
      root.focus({ preventScroll: true });
      return;
    }
    const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
      .find(el => !el.closest('[inert]'));
    if (focusable) {
      focusable.focus({ preventScroll: true });
    } else if (!root.closest('[inert]')) {
      root.focus({ preventScroll: true });
    }
  }, 50);
}

/**
 * Markdownから「## Status」で始まるセクションを抽出し、TableSection互換の構造に変換する
 */
export function parseMarkdownStatus(content: string): TableSection {
  const lines = content.split('\n');
  const items: Record<string, string>[] = [];
  let currentItem: Record<string, string> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // 見出し (## または #) が来たら、前のブロックに key があれば保存し、常に新しいブロックを開始する
    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      if (currentItem && currentItem.key) {
        items.push(currentItem);
      }
      currentItem = {};
      continue;
    }

    // ブロック内でのプロパティ (key: value) の抽出
    if (currentItem) {
      const match = trimmed.match(/^(description|key|current|default|type|candidates)\s*[:：]\s*(.*)$/i);
      if (match) {
        const propName = match[1].toLowerCase();
        let propValue = match[2].trim();
        
        // クォーテーションで囲まれている場合は解除
        if ((propValue.startsWith("'") && propValue.endsWith("'")) ||
            (propValue.startsWith('"') && propValue.endsWith('"'))) {
          propValue = propValue.slice(1, -1);
        }
        currentItem[propName] = propValue;
      }
    }
  }

  // 最後の要素をプッシュ
  if (currentItem && currentItem.key) {
    items.push(currentItem);
  }

  const columns = ['description', 'key', 'current', 'default', 'type', 'candidates'];
  const rows = items.map(item => [
    item.description || '',
    item.key || '',
    item.current || '',
    item.default || '',
    item.type || '',
    item.candidates || ''
  ]);

  return {
    title: 'UI Settings',
    columns,
    rows,
    rawLines: []
  };
}

