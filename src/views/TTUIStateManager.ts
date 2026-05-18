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
 * 列構成: key, current, default, type, candidates, description
 *   key:        変数名
 *   current:    現在値（編集→保存でUIに反映）
 *   default:    デフォルト値（参照用）
 *   type:       データ型 (boolean/string/color/json)
 *   candidates: 正規表現（値変更前の照合に使用）。特別な値: toggle, next, prev
 *   description:説明
 */

import type { TTApplication } from './TTApplication';
import type { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { parseTableContent, tableSectionToContent } from '../utils/tableFormat';
import type { ThinktankViewMode } from './TTThinktankPanel';
import type { OverviewViewMode } from './TTOverviewPanel';
import type { WorkoutViewMode, SectionStyle, HighlightStyle } from './TTWorkoutPanel';
import { SECTION_STYLE_DEFAULTS, HIGHLIGHT_STYLE_DEFAULTS } from './TTWorkoutPanel';
import type { ReThinkViewMode } from './TTReThinkPanel';
import type { MediaType } from '../types';

// ── PropDef: serialize() が返すテーブル行の型 ────────────────────────────────

interface PropDef {
  key:         string;
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

// プリセットデフォルト JSON（TTWorkoutPanel の定数から生成）
const SECTION_STYLE_DEFAULT_JSON   = JSON.stringify(SECTION_STYLE_DEFAULTS);
const HIGHLIGHT_STYLE_DEFAULT_JSON = JSON.stringify(HIGHLIGHT_STYLE_DEFAULTS);

function makeSectionPresetSpec(n: number): PropSpec {
  const key = `TextEditor.SectionStyle.Preset${n}`;
  return {
    panel: 'WorkoutPanel',
    isConst: true, default: SECTION_STYLE_DEFAULT_JSON, type: 'json', candidates: '.*',
    description: `セクションスタイルプリセット${n}`,
    get: (_app) => 'const',
    set: (app, v) => { try {
      const s = JSON.parse(v) as SectionStyle[];
      app.WorkoutPanel.TextEditor.SectionPresets[key] = s;
      if (app.WorkoutPanel.TextEditor.SectionStyleKey === key)
        app.WorkoutPanel.TextEditor.HeadingStyles = [...s];
    } catch { /* ignore */ } },
  };
}

function makeHighlightPresetSpec(n: number): PropSpec {
  const key = `WorkoutPanel.HighlightStyle.Preset${n}`;
  return {
    panel: 'WorkoutPanel',
    isConst: true, default: HIGHLIGHT_STYLE_DEFAULT_JSON, type: 'json', candidates: '.*',
    description: `ハイライトスタイルプリセット${n}`,
    get: (_app) => 'const',
    set: (app, v) => { try {
      const s = JSON.parse(v) as HighlightStyle[];
      app.WorkoutPanel.TextEditor.HighlightPresets[key] = s;
      if (app.WorkoutPanel.TextEditor.HighlightStyleKey === key)
        app.WorkoutPanel.TextEditor.HighlightStyles = [...s];
    } catch { /* ignore */ } },
  };
}

/**
 * PROP_SPECS
 * UI設定の全項目定義。新規項目の追加はここにオブジェクトを1つ追記するだけでよい。
 * _getProps() / _applyProp() はこの定義を参照するため個別修正不要。
 */
const PROP_SPECS: Record<string, PropSpec> = {

  // ── ThinktankPanel ──────────────────────────────────────────────────────
  'ThinktankPanel.IsAreaOpen': {
    panel: 'ThinktankPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: '左パネル表示',
    get: (app) => String(app.ThinktankPanel.IsAreaOpen),
    set: (app, v) => { app.ThinktankPanel.IsAreaOpen = parseBool(v, app.ThinktankPanel.IsAreaOpen); },
  },
  'ThinktankPanel.ViewMode': {
    panel: 'ThinktankPanel',
    default: 'thoughts', type: 'string', candidates: '^(filter|search|thoughts|chat|settings)$',
    description: '左パネルモード',
    get: (app) => app.ThinktankPanel.ViewMode,
    set: (app, v) => { app.ThinktankPanel.ViewMode = v as ThinktankViewMode; },
  },

  // ── OverviewPanel ────────────────────────────────────────────────────────
  'OverviewPanel.IsAreaOpen': {
    panel: 'OverviewPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '上部パネル表示',
    get: (app) => String(app.OverviewPanel.IsAreaOpen),
    set: (app, v) => { app.OverviewPanel.IsAreaOpen = parseBool(v, app.OverviewPanel.IsAreaOpen); },
  },
  'OverviewPanel.ViewMode': {
    panel: 'OverviewPanel',
    default: 'datagrid', type: 'string', candidates: '^(datagrid|graph|chat|settings)$',
    description: '上部パネル表示モード',
    get: (app) => app.OverviewPanel.ViewMode,
    set: (app, v) => { app.OverviewPanel.SetViewMode(v as OverviewViewMode); },
  },

  // ── WorkoutPanel ─────────────────────────────────────────────────────
  'WorkoutPanel.IsAreaOpen': {
    panel: 'WorkoutPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: 'ワークアウトパネル表示',
    get: (app) => String(app.WorkoutPanel.IsAreaOpen),
    set: (app, v) => { app.WorkoutPanel.IsAreaOpen = parseBool(v, app.WorkoutPanel.IsAreaOpen); },
  },
  'WorkoutPanel.ViewMode': {
    panel: 'WorkoutPanel',
    default: 'workout', type: 'string', candidates: '^(workout|texteditor|markdown|datagrid|card|graph)$',
    description: 'ワークアウト設定パネルモード',
    get: (app) => app.WorkoutPanel.ViewMode,
    set: (app, v) => { app.WorkoutPanel.SetViewMode(v as WorkoutViewMode); },
  },

  // ── TextEditor（テキストエディタ設定）──────────────────────────────────────
  'TextEditor.LineNumbers.IsVisible': {
    panel: 'WorkoutPanel',
    default: 'false', type: 'boolean', candidates: '^(true|false)$',
    description: '行番号表示',
    get: (app) => String(app.WorkoutPanel.TextEditor.LineNumbers.IsVisible),
    set: (app, v) => { app.WorkoutPanel.TextEditor.LineNumbers.IsVisible = parseBool(v, app.WorkoutPanel.TextEditor.LineNumbers.IsVisible); },
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
  'TextEditor.Color.Background': {
    panel: 'WorkoutPanel',
    default: '#f5f5f5', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: '背景色',
    get: (app) => app.WorkoutPanel.TextEditor.Color.Background,
    set: (app, v) => { app.WorkoutPanel.TextEditor.Color.Background = v; },
  },
  'TextEditor.Color.Text': {
    panel: 'WorkoutPanel',
    default: '#1e1e1e', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: '文字色',
    get: (app) => app.WorkoutPanel.TextEditor.Color.Text,
    set: (app, v) => { app.WorkoutPanel.TextEditor.Color.Text = v; },
  },
  'TextEditor.Color.Selection': {
    panel: 'WorkoutPanel',
    default: '#c6e6c6ff', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: '選択色',
    get: (app) => app.WorkoutPanel.TextEditor.Color.Selection,
    set: (app, v) => { app.WorkoutPanel.TextEditor.Color.Selection = v; },
  },
  'TextEditor.Color.Occurrence': {
    panel: 'WorkoutPanel',
    default: '#aac6aaff', type: 'color', candidates: '^#[0-9a-fA-F]{6,8}$',
    description: '一致色',
    get: (app) => app.WorkoutPanel.TextEditor.Color.Occurrence,
    set: (app, v) => { app.WorkoutPanel.TextEditor.Color.Occurrence = v; },
  },
  'TextEditor.Style.Section': {
    panel: 'WorkoutPanel',
    default: 'TextEditor.SectionStyle.Preset1', type: 'string',
    candidates: '^TextEditor\\.SectionStyle\\.Preset[1-5]$',
    description: 'セクションスタイル',
    get: (app) => app.WorkoutPanel.TextEditor.SectionStyleKey,
    set: (app, v) => {
      app.WorkoutPanel.TextEditor.SectionStyleKey = v;
      const preset = app.WorkoutPanel.TextEditor.SectionPresets[v];
      if (preset) app.WorkoutPanel.TextEditor.HeadingStyles = [...preset];
    },
  },
  ...Object.fromEntries([1, 2, 3, 4, 5].map(n => [`TextEditor.SectionStyle.Preset${n}`, makeSectionPresetSpec(n)])),

  'WorkoutPanel.Style.Highlight': {
    panel: 'WorkoutPanel',
    default: 'WorkoutPanel.HighlightStyle.Preset1', type: 'string',
    candidates: '^WorkoutPanel\\.HighlightStyle\\.Preset[1-5]$',
    description: 'ハイライトスタイル',
    get: (app) => app.WorkoutPanel.TextEditor.HighlightStyleKey,
    set: (app, v) => {
      app.WorkoutPanel.TextEditor.HighlightStyleKey = v;
      const preset = app.WorkoutPanel.TextEditor.HighlightPresets[v];
      if (preset) app.WorkoutPanel.TextEditor.HighlightStyles = [...preset];
    },
  },
  ...Object.fromEntries([1, 2, 3, 4, 5].map(n => [`WorkoutPanel.HighlightStyle.Preset${n}`, makeHighlightPresetSpec(n)])),

  // ── ToolBar 表示モード ────────────────────────────────────────────────
  'WorkoutPanel.ToolBarMode': {
    panel: 'WorkoutPanel',
    default: 'Copyright', type: 'string',
    candidates: '^(Status|Highlighter|KeyAction|Command|Translate|Reminder|Copyright)$',
    description: 'Toolバー表示モード',
    get: (app) => app.WorkoutPanel.ToolBarMode,
    set: (app, v) => { app.WorkoutPanel.ToolBarMode = v; },
  },

  // ── ハイライト設定（全Pane共通） ────────────────────────────────────────
  'WorkoutPanel.Highlight.KeyWord': {
    panel: 'WorkoutPanel',
    default: '', type: 'string', candidates: '.*',
    description: 'ハイライトキーワード',
    get: (app) => app.WorkoutPanel.HighlightWord,
    set: (app, v) => { app.WorkoutPanel.HighlightWord = v; },
  },

  // ── Application ──────────────────────────────────────────────────────────
  'Application.FocusedColumn': {
    panel: 'Application',
    default: 'Thinktank', type: 'string',
    candidates: '^(Thinktank|Overview|WorkoutSetting|ReThink)$',
    description: 'フォーカスカラム',
    getValues: (_app) => localStorage.getItem('tt-layout-mode') === 'simple'
      ? ['Thinktank', 'WorkoutSetting']
      : ['Thinktank', 'Overview', 'WorkoutSetting', 'ReThink'],
    get: (app) => app.FocusedColumn,
    set: (app, v) => {
      app.FocusedColumn = v;
      const SELECTORS: Record<string, string> = {
        'Thinktank':      '.thinktank-panel, .thinktank-area',
        'Overview':       '.overview-panel, .overview-area',
        'WorkoutSetting': '.workout-setting-panel',
        'Workout':        '.workout-area',
        'ReThink':        '.rethink-panel, .rethink-area',
      };
      const sel = SELECTORS[v];
      if (!sel) return;
      requestAnimationFrame(() => {
        const root = document.querySelector<HTMLElement>(sel);
        if (!root) return;
        const focusable = root.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [contenteditable], [tabindex]:not([tabindex="-1"])'
        );
        (focusable ?? root).focus({ preventScroll: true });
      });
    },
  },

  // ── ReThinkPanel ─────────────────────────────────────────────────────────
  'ReThinkPanel.IsAreaOpen': {
    panel: 'ReThinkPanel',
    default: 'true', type: 'boolean', candidates: '^(true|false)$',
    description: '右パネル表示',
    get: (app) => String(app.ReThinkPanel.IsAreaOpen),
    set: (app, v) => { app.ReThinkPanel.IsAreaOpen = parseBool(v, app.ReThinkPanel.IsAreaOpen); },
  },
  'ReThinkPanel.ViewMode': {
    panel: 'ReThinkPanel',
    default: 'chat', type: 'string', candidates: '^(chat|settings)$',
    description: '右パネル表示モード',
    get: (app) => app.ReThinkPanel.ViewMode,
    set: (app, v) => { app.ReThinkPanel.SetViewMode(v as ReThinkViewMode); },
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
    if (!this._app) return;
    let think = vault.GetThink(TTUIStateManager.THINK_ID);
    if (!think) {
      think = await vault.AddThinkWithContent(
        TTUIStateManager.THINK_ID,
        'UI Settings',
        'table',
        'system,ui-state',
        this.serialize(this._app),
      );
    } else {
      if (think.IsMetaOnly) await think.LoadContent();
      if (!localStorage.getItem(TTUIStateManager.LS_KEY)) {
        this.onThinkSaved(think.ID, think.Content);
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
  applyProperty(key: string, value: string): void {
    if (!this._app) return;
    this._pushUndo();
    this._applying = true;
    try {
      this._applyProp(key, value);
      const panel = PROP_SPECS[key]?.panel ?? (key.split('.')[0] as PanelKey);
      this._notifyPanel(this._app, panel);
      this._app.NotifyUpdated(false);
    } finally {
      this._applying = false;
    }
    this._saveToLocalStorage();
    if (this._vaultThink) {
      this._vaultThink.setContentSilent(this._serializePreservingStructure(this._app));
    }
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
  private _applyProp(key: string, value: string): void {
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
      spec.set(this._app, value);
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
      const sections = parseTableContent(content);
      const section = sections[0];
      if (!section) return;
      const keyIdx = section.columns.findIndex(c => c === 'key');
      const curIdx = section.columns.findIndex(c => c === 'current');
      const defIdx = section.columns.findIndex(c => c === 'default');
      const valIdx = section.columns.findIndex(c => c === 'value');
      const applyIdx = curIdx >= 0 ? curIdx : valIdx; // current 優先、旧 value にフォールバック
      if (keyIdx < 0 || applyIdx < 0) return;

      const dirtyPanels = new Set<PanelKey>();

      // 1st pass: const エントリ → default 列の値を適用（ファイルで編集可能なプリセットデータを読み込む）
      for (const row of section.rows) {
        const key  = row[keyIdx]?.trim() ?? '';
        const spec = PROP_SPECS[key];
        if (!spec?.isConst) continue;
        const defaultVal = defIdx >= 0 ? (row[defIdx] ?? spec.default) : spec.default;
        this._applyProp(key, defaultVal);
        dirtyPanels.add(spec.panel);
      }

      // 2nd pass: 通常エントリ → current 列の値を適用
      for (const row of section.rows) {
        const key = row[keyIdx]?.trim() ?? '';
        const val = row[applyIdx] ?? '';
        if (!key) continue;
        const spec = PROP_SPECS[key];
        if (spec?.isConst) continue;
        this._applyProp(key, val);
        if (spec?.panel) dirtyPanels.add(spec.panel);
      }

      const app = this._app;
      dirtyPanels.forEach(panel => this._notifyPanel(app, panel));
      if (dirtyPanels.size > 0) app.NotifyUpdated(false);
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
    const savedContent = this._vaultThink?.Content;
    if (savedContent) {
      const sections = parseTableContent(savedContent);
      const section = sections[0];
      if (section) {
        const keyIdx = section.columns.findIndex(c => c === 'key');
        const curIdx = section.columns.findIndex(c => c === 'current');
        const valIdx = section.columns.findIndex(c => c === 'value'); // 旧列フォールバック
        const writeIdx = curIdx >= 0 ? curIdx : valIdx;
        if (keyIdx >= 0 && writeIdx >= 0) {
          const newRows = section.rows.map(row => {
            const key  = row[keyIdx]?.trim() ?? '';
            const spec = PROP_SPECS[key];
            if (!spec) return row;
            if (spec.isConst) return row; // const エントリ: current 列を "const" のまま維持
            const newVal = spec.get(app);
            const newRow = [...row];
            newRow[writeIdx] = newVal;
            return newRow;
          });
          return tableSectionToContent(section.title, { ...section, rows: newRows });
        }
      }
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
      '> key,current,default,type,candidates,description',
      ...props.map(p =>
        [
          p.key,
          csvEscape(p.current),
          csvEscape(p.default),
          p.type,
          csvEscape(p.candidates),
          csvEscape(p.description),
        ].join(',')
      ),
    ];
    return lines.join('\n');
  }

  /** パネル識別子に対応する NotifyUpdated() を呼ぶ */
  private _notifyPanel(app: TTApplication, panel: PanelKey): void {
    switch (panel) {
      case 'ThinktankPanel': app.ThinktankPanel.NotifyUpdated(); break;
      case 'OverviewPanel':  app.OverviewPanel.NotifyUpdated();  break;
      case 'WorkoutPanel':   app.WorkoutPanel.NotifyUpdated();   break;
      case 'ReThinkPanel':   app.ReThinkPanel.NotifyUpdated();   break;
      case 'Application':    /* app.NotifyUpdated(false) is called by applyProperty */ break;
    }
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
    if (stored) this._applyContent(stored);
  }
}

// ── ユーティリティ ────────────────────────────────────────────────────────────

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
