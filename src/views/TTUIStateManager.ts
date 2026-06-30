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
import { TTThink } from '../models/TTThink';
import { parseTableContent, tableSectionToContent, updateTableContent, TableSection } from '../utils/tableFormat';
import type { ThinktankViewMode } from './TTThinktankPanel';
import type { OverviewViewMode } from './TTOverviewPanel';
import type { WorkoutViewMode, SectionStyle } from './TTWorkoutPanel';
import { SECTION_STYLE_DEFAULTS, HIGHLIGHT_STYLE_DEFAULTS, collectAreaIds } from './TTWorkoutPanel';
import type { ReThinkViewMode } from './TTReThinkPanel';
import type { MediaType, ContentType } from '../types';
import { getFocusName } from '../utils/getFocusName';
import localStatusContent from '../../docs/Thinktank_Status-Action-Binding.md?raw';
import { TTShortcutManager } from './TTShortcutManager';
import { getHeadingAttributes } from './TTFocusedPanelActions';

const USE_LOCAL_FILES = true;

// ── ConfigKey / ConfigListener: 状態変数の型定義 ─────────────────────────────

export type ConfigKey =
  | 'ThinktankPanel.Area.IsOpen'
  | 'ThinktankPanel.Mode.Name'
  | 'OverviewPanel.Area.IsOpen'
  | 'OverviewPanel.Mode.Name'
  | 'Overview.Thought.Name'
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
  | 'TextEditor.Comment.StyleSet'
  | 'TextEditor.WordWrap.IsVisible'
  | 'TextEditor.Minimap.IsVisible'
  | 'TextEditor.FullWidthSpace.IsVisible'
  | 'TextEditor.UnicodeHighlight.IsVisible'
  | 'TextEditor.BracketPairColorization.IsVisible'
  | 'TextEditor.Text.BgColor'
  | 'TextEditor.Text.Color'
  | 'TextEditor.Selection.BgColor'
  | 'TextEditor.Occurrence.BgColor'
  | 'TextEditor.Heading1.Color'
  | 'TextEditor.Heading1.BgColor'
  | 'TextEditor.Heading1.Attrs'
  | 'TextEditor.Heading2.Color'
  | 'TextEditor.Heading2.BgColor'
  | 'TextEditor.Heading2.Attrs'
  | 'TextEditor.Heading3.Color'
  | 'TextEditor.Heading3.BgColor'
  | 'TextEditor.Heading3.Attrs'
  | 'TextEditor.Heading4.Color'
  | 'TextEditor.Heading4.BgColor'
  | 'TextEditor.Heading4.Attrs'
  | 'TextEditor.Heading5.Color'
  | 'TextEditor.Heading5.BgColor'
  | 'TextEditor.Heading5.Attrs'
  | 'TextEditor.Highlighter1.Color'
  | 'TextEditor.Highlighter1.BgColor'
  | 'TextEditor.Highlighter1.Attrs'
  | 'TextEditor.Highlighter2.Color'
  | 'TextEditor.Highlighter2.BgColor'
  | 'TextEditor.Highlighter2.Attrs'
  | 'TextEditor.Highlighter3.Color'
  | 'TextEditor.Highlighter3.BgColor'
  | 'TextEditor.Highlighter3.Attrs'
  | 'TextEditor.Highlighter4.Color'
  | 'TextEditor.Highlighter4.BgColor'
  | 'TextEditor.Highlighter4.Attrs'
  | 'TextEditor.Highlighter5.Color'
  | 'TextEditor.Highlighter5.BgColor'
  | 'TextEditor.Highlighter5.Attrs'
  | 'TextEditor.Highlighter6.Color'
  | 'TextEditor.Highlighter6.BgColor'
  | 'TextEditor.Highlighter6.Attrs'
  | 'ToolBar.Mode.Name'
  | 'ToolBar.StatusMode.Text'
  | 'Application.FocusedPanel.Name'
  | 'Application.FocusedArea.Name'
  | 'Application.Status.ExMode'
  | 'Application.Resource.LocalExporting'
  | 'TextEditor.CurrentEditor.CursorPos'
  | 'TextEditor.CurrentEditor.TextOnCursorPos'
  | 'WorkoutPanel.Panes.Count'
  | 'WorkoutPanel.Panes.IDs'
  | 'WorkoutPanel.FocusedPane.ID'
  | 'WorkoutPanel.FocusedPane.PaneNumber'
  | 'WorkoutPanel.FocusedPane.Mode'
  | 'TextEditor.CurrentFolding.HeadingOffset'
  | 'TextEditor.CurrentFolding.HeadingNumber'
  | string; // プリセットキーなどの動的拡張を許容

export type ConfigListener = (key: ConfigKey, value: string) => void;

// ── PropDef: serialize() が返すテーブル行の型 ────────────────────────────────

interface PropDef {
  key:         ConfigKey;
  current:     string;
  default:     string;
  type:        'boolean' | 'string' | 'color' | 'json';
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
    thought: ['texteditor', 'datagrid', 'markdown', 'card', 'graph'],
    table: ['texteditor', 'datagrid', 'card'],
    chat: ['texteditor', 'chat'],
    links: ['texteditor', 'markdown'],
  };
  const allowed = mapping[think.ContentType] || ['texteditor', 'markdown'];
  return allowed.map(m => capitalize(m));
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

  // ── OverviewPanel ────────────────────────────────────────────────────────
  'OverviewPanel.Area.IsOpen': {
    panel: 'OverviewPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '上部パネル表示',
    get: (app) => String(app.OverviewPanel.IsAreaOpen),
    set: (app, v) => { app.OverviewPanel.IsAreaOpen = parseBool(v, app.OverviewPanel.IsAreaOpen); },
  },
  'OverviewPanel.Mode.Name': {
    panel: 'OverviewPanel',
    default: 'Datagrid', type: 'string', candidates: '^(Datagrid|Graph|Chat|Settings)$',
    description: '上部パネル表示モード',
    get: (app) => capitalize(app.OverviewPanel.ViewMode),
    set: (app, v) => { app.OverviewPanel.SetViewMode(v.toLowerCase() as OverviewViewMode); },
  },
  'Overview.Thought.Name': {
    panel: 'OverviewPanel',
    default: 'none', type: 'string', candidates: '.*',
    description: 'OverviewパネルのthoughtファイルID',
    get: (app) => app.OverviewPanel.ThoughtID || 'none',
    set: (app, v) => {
      if (v === 'none') {
        app.OverviewPanel.ClearThought();
      } else {
        app.OverviewPanel.OpenThought(v);
      }
    },
  },

  // ── WorkoutPanel ─────────────────────────────────────────────────────
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

  // ── TextEditor（テキストエディタ設定）──────────────────────────────────────
  'TextEditor.LineNumbers.IsVisible': {
    panel: 'WorkoutPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '行番号表示',
    get: (app) => String(app.WorkoutPanel.TextEditor.LineNumbers.IsVisible),
    set: (app, v) => { app.WorkoutPanel.TextEditor.LineNumbers.IsVisible = parseBool(v, app.WorkoutPanel.TextEditor.LineNumbers.IsVisible); },
  },
  'TextEditor.Bullet.StyleSet': {
    panel: 'WorkoutPanel',
    default: '・,- ,* ,■ ,● ,= ,> ,# ,↓ ,→ ,[✓] ,', type: 'string', candidates: '.*',
    description: '行頭文字の文字セット（CSV形式）',
    get: (app) => app.WorkoutPanel.TextEditor.Bullet.StyleSet,
    set: (app, v) => { app.WorkoutPanel.TextEditor.Bullet.StyleSet = v; },
  },
  'TextEditor.Comment.StyleSet': {
    panel: 'WorkoutPanel',
    default: '> ,>> ,>>> ,; ,| ,# ,', type: 'string', candidates: '.*',
    description: 'コメントの文字セット（CSV形式）',
    get: (app) => app.WorkoutPanel.TextEditor.Comment.StyleSet,
    set: (app, v) => { app.WorkoutPanel.TextEditor.Comment.StyleSet = v; },
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
  'TextEditor.Text.BgColor': {
    panel: 'WorkoutPanel',
    default: '#f5f5f5', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: '背景色',
    get: (app) => app.WorkoutPanel.TextEditor.Color.Background,
    set: (app, v) => { app.WorkoutPanel.TextEditor.Color.Background = v; },
  },
  'TextEditor.Text.Color': {
    panel: 'WorkoutPanel',
    default: '#1e1e1e', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: '文字色',
    get: (app) => app.WorkoutPanel.TextEditor.Color.Text,
    set: (app, v) => { app.WorkoutPanel.TextEditor.Color.Text = v; },
  },
  'TextEditor.Selection.BgColor': {
    panel: 'WorkoutPanel',
    default: '#c6e6c6ff', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: '選択色',
    get: (app) => app.WorkoutPanel.TextEditor.Color.Selection,
    set: (app, v) => { app.WorkoutPanel.TextEditor.Color.Selection = v; },
  },
  'TextEditor.Occurrence.BgColor': {
    panel: 'WorkoutPanel',
    default: '#aac6aaff', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: '一致色',
    get: (app) => app.WorkoutPanel.TextEditor.Color.Occurrence,
    set: (app, v) => { app.WorkoutPanel.TextEditor.Color.Occurrence = v; },
  },

  ...Object.fromEntries(
    [1, 2, 3, 4, 5].flatMap(level => {
      const idx = level - 1;
      return [
        [`TextEditor.Heading${level}.Color`, {
          panel: 'WorkoutPanel',
          default: SECTION_STYLE_DEFAULTS[idx].color, type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
          description: `見出し行レベル${level}の文字色`,
          get: (app) => app.WorkoutPanel.TextEditor.HeadingStyles[idx]?.color ?? SECTION_STYLE_DEFAULTS[idx].color,
          set: (app, v) => { app.WorkoutPanel.SetTextEditorHeadingStyle(level, { color: v }); },
        }],
        [`TextEditor.Heading${level}.BgColor`, {
          panel: 'WorkoutPanel',
          default: 'undefined', type: 'string', candidates: '^(undefined|#[0-9a-fA-F]{6,8})$',
          description: `見出し行レベル${level}の背景色`,
          get: (app) => app.WorkoutPanel.TextEditor.HeadingStyles[idx]?.bgColor ?? 'undefined',
          set: (app, v) => { app.WorkoutPanel.SetTextEditorHeadingStyle(level, { bgColor: v }); },
        }],
        [`TextEditor.Heading${level}.Attrs`, {
          panel: 'WorkoutPanel',
          default: (SECTION_STYLE_DEFAULTS[idx].bold ? 'bold' : '') + (SECTION_STYLE_DEFAULTS[idx].underline ? '|underline' : '') || 'none',
          type: 'string', candidates: '.*',
          description: `見出し行レベル${level}の属性`,
          get: (app) => {
            const style = app.WorkoutPanel.TextEditor.HeadingStyles[idx];
            if (!style) return 'none';
            const attrs: string[] = [];
            if (style.bold) attrs.push('bold');
            if (style.underline) attrs.push('underline');
            return attrs.join('|') || 'none';
          },
          set: (app, v) => {
            const bold = v.includes('bold');
            const underline = v.includes('underline');
            app.WorkoutPanel.SetTextEditorHeadingStyle(level, { bold, underline });
          },
        }]
      ];
    })
  ),
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6].flatMap(group => {
      const idx = group - 1;
      return [
        [`TextEditor.Highlighter${group}.Color`, {
          panel: 'WorkoutPanel',
          default: HIGHLIGHT_STYLE_DEFAULTS[idx]?.color ?? 'undefined', type: 'string', candidates: '^(undefined|#[0-9a-fA-F]{6,8})$',
          description: `ハイライト${group}の文字色`,
          get: (app) => app.WorkoutPanel.TextEditor.HighlightStyles[idx]?.color ?? 'undefined',
          set: (app, v) => { app.WorkoutPanel.SetTextEditorHighlightStyle(idx, { color: v }); },
        }],
        [`TextEditor.Highlighter${group}.BgColor`, {
          panel: 'WorkoutPanel',
          default: HIGHLIGHT_STYLE_DEFAULTS[idx]?.backgroundColor ?? 'undefined', type: 'string', candidates: '^(undefined|#[0-9a-fA-F]{6,8})$',
          description: `ハイライト${group}の背景色`,
          get: (app) => app.WorkoutPanel.TextEditor.HighlightStyles[idx]?.backgroundColor ?? 'undefined',
          set: (app, v) => { app.WorkoutPanel.SetTextEditorHighlightStyle(idx, { backgroundColor: v }); },
        }],
        [`TextEditor.Highlighter${group}.Attrs`, {
          panel: 'WorkoutPanel',
          default: 'none', type: 'string', candidates: '.*',
          description: `ハイライト${group}の属性`,
          get: (app) => {
            const style = app.WorkoutPanel.TextEditor.HighlightStyles[idx];
            if (!style) return 'none';
            const attrs: string[] = [];
            if (style.bold) attrs.push('bold');
            if (style.underline) attrs.push('underline');
            return attrs.join('|') || 'none';
          },
          set: (app, v) => {
            const bold = v.includes('bold');
            const underline = v.includes('underline');
            app.WorkoutPanel.SetTextEditorHighlightStyle(idx, { bold, underline });
          },
        }]
      ];
    })
  ),


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

  // ── Theme Panel & ToolBar Colors ──────────────────────────────────────────
  'Thinktank.Ribbon.BgColor': {
    panel: 'ThinktankPanel',
    default: '#1d618f', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: 'Thinktank（左）パネルのリボン背景色',
    get: () => getCssVariable('--thinktank-ribbon-bg', '#1d618f'),
    set: (_app, v) => setCssVariable('--thinktank-ribbon-bg', v),
  },
  'Thinktank.Area.BgColor': {
    panel: 'ThinktankPanel',
    default: '#edf2f6', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: 'Thinktank（左）パネルのメインエリア背景色',
    get: () => getCssVariable('--thinktank-area-bg', '#edf2f6'),
    set: (_app, v) => setCssVariable('--thinktank-area-bg', v),
  },
  'Overview.Ribbon.BgColor': {
    panel: 'OverviewPanel',
    default: '#873960', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: 'Overview（上）パネルのリボン背景色',
    get: () => getCssVariable('--overview-ribbon-bg', '#873960'),
    set: (_app, v) => setCssVariable('--overview-ribbon-bg', v),
  },
  'Overview.Area.BgColor': {
    panel: 'OverviewPanel',
    default: '#f8f3f5', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: 'Overview（上）パネルのメインエリア背景色',
    get: () => getCssVariable('--overview-area-bg', '#f8f3f5'),
    set: (_app, v) => setCssVariable('--overview-area-bg', v),
  },
  'Workout.Ribbon.BgColor': {
    panel: 'WorkoutPanel',
    default: '#382830', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: 'Workout（中）パネルのリボン背景色',
    get: () => getCssVariable('--workout-ribbon-bg', '#382830'),
    set: (_app, v) => setCssVariable('--workout-ribbon-bg', v),
  },
  'Workout.Area.BgColor': {
    panel: 'WorkoutPanel',
    default: '#e3e1e2', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: 'Workout（中）パネルのメインエリア背景色',
    get: () => getCssVariable('--workout-area-bg', '#e3e1e2'),
    set: (_app, v) => setCssVariable('--workout-area-bg', v),
  },
  'ReThink.Ribbon.BgColor': {
    panel: 'ReThinkPanel',
    default: '#324f46', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: 'ReThink（右）パネルのリボン背景色',
    get: () => getCssVariable('--rethink-ribbon-bg', '#324f46'),
    set: (_app, v) => setCssVariable('--rethink-ribbon-bg', v),
  },
  'ReThink.Area.BgColor': {
    panel: 'ReThinkPanel',
    default: '#eff1f0', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: 'ReThink（右）パネルのメインエリア背景色',
    get: () => getCssVariable('--rethink-area-bg', '#eff1f0'),
    set: (_app, v) => setCssVariable('--rethink-area-bg', v),
  },
  'ToolBar.BgColor': {
    panel: 'WorkoutPanel',
    default: '#2d2d2d', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: 'ツールバー（ステータスバー）の背景色',
    get: () => getCssVariable('--toolbar-bg', '#2d2d2d'),
    set: (_app, v) => setCssVariable('--toolbar-bg', v),
  },
  'ToolBar.Color': {
    panel: 'WorkoutPanel',
    default: '#ffffff', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: 'ツールバー（ステータスバー）の文字色',
    get: () => getCssVariable('--toolbar-color', '#ffffff'),
    set: (_app, v) => setCssVariable('--toolbar-color', v),
  },

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
  'WorkoutPanel.Panes.IDs': {
    panel: 'WorkoutPanel',
    default: '', type: 'string', candidates: '.*',
    description: '表示されているPaneのID',
    get: (app) => app.WorkoutPanel.Areas
      .map(a => a.ResourceID ? `${a.ResourceID}:${a.MediaType}` : '')
      .filter(Boolean)
      .join(','),
    set: (app, v) => {
      if (!v || v === '""' || v === 'none') {
        app.WorkoutPanel.ClearAll();
        return;
      }
      const items = v.split(',').map(item => item.trim()).filter(Boolean);
      app.WorkoutPanel.ClearAll();
      items.forEach((item, idx) => {
        const parts = item.split(':');
        const id = parts[0];
        let mediaType = (parts[1] || '') as MediaType;

        const think = app.Models.Vault.GetThink(id);
        const title = think?.Title ?? '';

        if (!mediaType && think) {
          if (think.ContentType === 'table') mediaType = 'datagrid';
          else if (think.ContentType === 'chat') mediaType = 'chat';
          else mediaType = 'texteditor';
        }
        if (!mediaType) mediaType = 'texteditor';

        if (idx === 0) {
          app.WorkoutPanel.AddFirst(id, mediaType, title);
        } else {
          app.WorkoutPanel.AddRight(id, mediaType, title);
        }
      });
    },
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
};

// ── TTUIStateManager ──────────────────────────────────────────────────────────

export class TTUIStateManager {
  static readonly THINK_ID = '__tt_ui_state__';
  private static readonly LS_KEY = 'tt-ui-state-v1';
  private static _instance: TTUIStateManager | null = null;

  private _app: TTApplication | null = null;
  private _applying = false;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _undoStack: string[] = [];
  private _redoStack: string[] = [];
  private _vaultThink: TTThink | null = null;
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
  async ensureThinkExists(vault: TTVault): Promise<void> {
    if (USE_LOCAL_FILES) {
      console.log('[TTUIStateManager] Loading initial UI state from local docs/Thinktank_Status-Action-Binding.md');
      this._applyContent(localStatusContent);
      const stored = localStorage.getItem(TTUIStateManager.LS_KEY);
      if (stored) {
        this._applyContent(stored);
      }
      return;
    }
    if (!this._app) return;
    let think = vault.GetThink(TTUIStateManager.THINK_ID);
    if (!think) {
      think = await vault.AddThinkWithContent(
        TTUIStateManager.THINK_ID,
        'UI Settings',
        'table',
        'system,ui-state',
        localStatusContent,
      );
    } else {
      if (think.IsMetaOnly) await think.LoadContent();
      if (!localStorage.getItem(TTUIStateManager.LS_KEY)) {
        this.onThinkSaved(think.ID, localStatusContent);
      } else {
        this._vaultThink = think;
        think.setContentSilent(this._serializePreservingStructure(this._app));
      }
    }
    this._vaultThink = think;
  }

  /** DataGrid/Card が UIState Think を保存したときのフック（WorkoutArea から呼ぶ）*/
  onThinkSaved(thinkId: string, content: string): void {
    if (thinkId !== TTUIStateManager.THINK_ID) return;
    this._pushUndo();
    this._applyContent(content);
    this._saveToLocalStorage();
    if (this._app && this._vaultThink) {
      this._vaultThink.setContentSilent(this._serializePreservingStructure(this._app));
    }
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
    if (this._vaultThink) {
      this._vaultThink.setContentSilent(this._serializePreservingStructure(this._app));
    }
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

  /** 現在のアプリ状態を構造保持でシリアライズして返す（更新ボタン用） */
  getLatestContent(): string | null {
    if (!this._app) return null;
    return this._serializePreservingStructure(this._app);
  }

  undo(): boolean {
    if (this._undoStack.length === 0 || !this._app) return false;
    const current = this.serialize(this._app);
    this._redoStack.push(current);
    const prev = this._undoStack.pop()!;
    this._applyContent(prev);
    this._saveToLocalStorage();
    if (this._vaultThink) {
      this._vaultThink.setContentSilent(this._serializePreservingStructure(this._app));
    }
    return true;
  }

  redo(): boolean {
    if (this._redoStack.length === 0 || !this._app) return false;
    const current = this.serialize(this._app);
    this._undoStack.push(current);
    const next = this._redoStack.pop()!;
    this._applyContent(next);
    this._saveToLocalStorage();
    if (this._vaultThink) {
      this._vaultThink.setContentSilent(this._serializePreservingStructure(this._app));
    }
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
      if (key === 'TextEditor.Bullet.StyleSet') {
        const targetVal = '・,- ,* ,■ ,● ,= ,> ,# ,↓ ,→ ,[✓] ,';
        if (value !== targetVal && value.replace(/\s+/g, '') === targetVal.replace(/\s+/g, '')) {
          finalValue = targetVal;
        }
      }
      if (key === 'TextEditor.Comment.StyleSet') {
        const targetVal = '> ,>> ,>>> ,; ,| ,# ,';
        if (value !== targetVal && value.replace(/\s+/g, '') === targetVal.replace(/\s+/g, '')) {
          finalValue = targetVal;
        }
      }
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
        .replace(/\bWorkoutPanel\.Pane\.Count\b/g, 'WorkoutPanel.Panes.Count');
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

      // 2nd pass: 通常エントリ → current 列の値を適用
      for (const row of section.rows) {
        const key = row[keyIdx]?.trim() ?? '';
        const val = row[applyIdx] ?? '';
        if (!key) continue;
        const spec = PROP_SPECS[key];
        if (spec?.isConst) continue;
        this._applyProp(key, val);
        updatedKeys.add(key);
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

  /**
   * 現在の think 構造（コメント行・空行・rawLines）を維持しながら
   * current 列だけを現在のアプリ状態で更新してシリアライズ。
   * _vaultThink が未設定またはパース不能な場合は serialize() にフォールバック。
   */
  private _serializePreservingStructure(app: TTApplication): string {
    let savedContent = this._vaultThink?.Content;
    if (savedContent) {
      savedContent = savedContent
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
        .replace(/\bWorkoutPanel\.Pane\.Count\b/g, 'WorkoutPanel.Panes.Count');
      const updates: Record<string, Record<string, string>> = {};
      for (const [key, spec] of Object.entries(PROP_SPECS)) {
        if (!spec.isConst) {
          updates[key] = { current: spec.get(app) };
        }
      }
      return updateTableContent(
        savedContent,
        'key',
        updates,
        (key) => !!PROP_SPECS[key]?.isConst
      );
    }
    return this.serialize(app);
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
      if (this._app && this._vaultThink) {
        this._vaultThink.setContentSilent(this._serializePreservingStructure(this._app));
      }
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

function getCssVariable(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const val = document.documentElement.style.getPropertyValue(name);
  return val ? val.trim() : fallback;
}

function setCssVariable(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(name, value);
}
