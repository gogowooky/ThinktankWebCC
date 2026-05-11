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
 * 列構成: key, current, default, type, candidates, restore, description
 *   key:        変数名
 *   current:    現在値（編集→保存でUIに反映）
 *   default:    デフォルト値（参照用）
 *   type:       データ型 (boolean/string/color/json)
 *   candidates: 設定可能な値・範囲
 *   restore:    保存値（currentと常に同期、起動時の復元に使用）
 *   description:説明
 */

import type { TTApplication } from './TTApplication';
import type { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { parseTableContent, tableSectionToContent } from '../utils/tableFormat';
import type { ThinktankViewMode } from './TTThinktankPanel';
import type { MediaType } from '../types';

interface PropDef {
  key:         string;
  current:     string;
  default:     string;
  type:        'boolean' | 'string' | 'color' | 'json';
  candidates:  string;
  restore:     string;
  description: string;
}

const DEFAULT_HEADING_STYLES = JSON.stringify([
  { color: '#569cd6', bold: true,  underline: false },
  { color: '#4ec9b0', bold: true,  underline: false },
  { color: '#ce9178', bold: true,  underline: false },
  { color: '#dcdcaa', bold: true,  underline: false },
  { color: '#c586c0', bold: true,  underline: false },
]);

const DEFAULT_HIGHLIGHT_STYLES = JSON.stringify([
  { backgroundColor: '#ffff00', color: '#000000' },
  { backgroundColor: '#ff0000', color: '#ffffff' },
  { backgroundColor: '#0000ff', color: '#ffffff' },
  { backgroundColor: '#008000', color: '#ffffff' },
  { backgroundColor: '#800080', color: '#ffffff' },
]);

const PROP_META: Record<string, { defaultVal: string; candidates: string }> = {
  'ThinktankPanel.IsAreaOpen':              { defaultVal: 'true',                    candidates: 'true,false,toggle' },
  'ThinktankPanel.ViewMode':                { defaultVal: 'thoughts',                candidates: 'thoughts,filter,search,ai,settings' },
  'OverviewPanel.IsAreaOpen':               { defaultVal: 'false',                   candidates: 'true,false,toggle' },
  'OverviewPanel.MediaType':                { defaultVal: 'datagrid',                candidates: 'datagrid,markdown,graph' },
  'WorkoutPanel.EditorLineNumbers':         { defaultVal: 'false',                   candidates: 'true,false,toggle' },
  'WorkoutPanel.EditorWordWrap':            { defaultVal: 'true',                    candidates: 'true,false,toggle' },
  'WorkoutPanel.EditorMinimap':             { defaultVal: 'false',                   candidates: 'true,false,toggle' },
  'WorkoutPanel.EditorShowFullWidthSpace':  { defaultVal: 'false',                   candidates: 'true,false,toggle' },
  'WorkoutPanel.EditorUnicodeHighlight':    { defaultVal: 'false',                   candidates: 'true,false,toggle' },
  'WorkoutPanel.EditorBracketPairColorization': { defaultVal: 'true',               candidates: 'true,false,toggle' },
  'WorkoutPanel.EditorHighlightWord':       { defaultVal: '',                        candidates: 'スペース区切りで複数単語,グループはカンマ区切り' },
  'WorkoutPanel.EditorBackground':          { defaultVal: '#f5f5f5',                 candidates: '#rrggbb (16進カラー)' },
  'WorkoutPanel.EditorForeground':          { defaultVal: '#1e1e1e',                 candidates: '#rrggbb (16進カラー)' },
  'WorkoutPanel.EditorHeadingStyles':       { defaultVal: DEFAULT_HEADING_STYLES,    candidates: 'JSON array [{color,bold,underline}×5]' },
  'WorkoutPanel.EditorHighlightStyles':     { defaultVal: DEFAULT_HIGHLIGHT_STYLES,  candidates: 'JSON array [{backgroundColor,color}×5]' },
  'ReThinkPanel.IsAreaOpen':                { defaultVal: 'true',                    candidates: 'true,false,toggle' },
};

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
        // localStorage が空なら保存済み Think から復元
        this.onThinkSaved(think.ID, think.Content);
      } else {
        // localStorage 側が優先 → Think 内容を現状に合わせる（構造保持）
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
  }

  /** ショートカット等からの単一プロパティ変更 */
  applyProperty(key: string, value: string): void {
    if (!this._app) return;
    this._pushUndo();
    this._applying = true;
    try {
      this._applyProp(key, value);
      const panel = key.split('.')[0];
      const app = this._app;
      if (panel === 'ThinktankPanel') app.ThinktankPanel.NotifyUpdated();
      else if (panel === 'OverviewPanel') app.OverviewPanel.NotifyUpdated();
      else if (panel === 'WorkoutPanel') app.WorkoutPanel.NotifyUpdated();
      else if (panel === 'ReThinkPanel') app.ReThinkPanel.NotifyUpdated();
      app.NotifyUpdated(false);
    } finally {
      this._applying = false;
    }
    this._saveToLocalStorage();
    if (this._app && this._vaultThink) {
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
    if (this._vaultThink && this._app) {
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
    if (this._vaultThink && this._app) {
      this._vaultThink.setContentSilent(this._serializePreservingStructure(this._app));
    }
    return true;
  }

  /**
   * 現在の think 構造（コメント行・空行・rawLines）を維持しながら
   * current・restore 列だけを現在のアプリ状態で更新してシリアライズ。
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
        const resIdx = section.columns.findIndex(c => c === 'restore');
        // 旧 value 列との互換
        const valIdx = section.columns.findIndex(c => c === 'value');

        const writeIdx = curIdx >= 0 ? curIdx : valIdx;
        if (keyIdx >= 0 && writeIdx >= 0) {
          const props = this._getProps(app);
          const propMap = new Map(props.map(p => [p.key, p]));
          const newRows = section.rows.map(row => {
            const key = row[keyIdx]?.trim() ?? '';
            const prop = propMap.get(key);
            if (!prop) return row;
            const newRow = [...row];
            newRow[writeIdx] = prop.current;
            if (resIdx >= 0) newRow[resIdx] = prop.current;
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
      '> key,current,default,type,candidates,restore,description',
      ...props.map(p =>
        [
          p.key,
          csvEscape(p.current),
          csvEscape(p.default),
          p.type,
          csvEscape(p.candidates),
          csvEscape(p.restore),
          csvEscape(p.description),
        ].join(',')
      ),
    ];
    return lines.join('\n');
  }

  // ── プライベート ──────────────────────────────────────────────────────

  private _getProps(app: TTApplication): PropDef[] {
    const wp = app.WorkoutPanel;
    const tp = app.ThinktankPanel;
    const op = app.OverviewPanel;
    const rp = app.ReThinkPanel;

    const make = (
      key: string,
      current: string,
      type: PropDef['type'],
      description: string,
    ): PropDef => {
      const meta = PROP_META[key] ?? { defaultVal: '', candidates: '' };
      return {
        key,
        current,
        default:     meta.defaultVal,
        type,
        candidates:  meta.candidates,
        restore:     current,
        description,
      };
    };

    return [
      make('ThinktankPanel.IsAreaOpen',              String(tp.IsAreaOpen),                  'boolean', '左パネル表示'),
      make('ThinktankPanel.ViewMode',                tp.ViewMode,                            'string',  '左パネルモード'),
      make('OverviewPanel.IsAreaOpen',               String(op.IsAreaOpen),                  'boolean', '上部パネル表示'),
      make('OverviewPanel.MediaType',                op.MediaType,                           'string',  '上部パネルメディア'),
      make('WorkoutPanel.EditorLineNumbers',         String(wp.EditorLineNumbers),           'boolean', '行番号表示'),
      make('WorkoutPanel.EditorWordWrap',            String(wp.EditorWordWrap),              'boolean', '折り返し'),
      make('WorkoutPanel.EditorMinimap',             String(wp.EditorMinimap),               'boolean', 'ミニマップ'),
      make('WorkoutPanel.EditorShowFullWidthSpace',  String(wp.EditorShowFullWidthSpace),    'boolean', '全角スペース表示'),
      make('WorkoutPanel.EditorUnicodeHighlight',    String(wp.EditorUnicodeHighlight),      'boolean', 'Unicode強調'),
      make('WorkoutPanel.EditorBracketPairColorization', String(wp.EditorBracketPairColorization), 'boolean', '括弧ペア色分け'),
      make('WorkoutPanel.EditorHighlightWord',       wp.EditorHighlightWord,                 'string',  'ハイライトキーワード'),
      make('WorkoutPanel.EditorBackground',          wp.EditorBackground,                    'color',   '背景色'),
      make('WorkoutPanel.EditorForeground',          wp.EditorForeground,                    'color',   '前景色'),
      make('WorkoutPanel.EditorHeadingStyles',       JSON.stringify(wp.EditorHeadingStyles), 'json',    '見出しスタイル'),
      make('WorkoutPanel.EditorHighlightStyles',     JSON.stringify(wp.EditorHighlightStyles), 'json',  'ハイライトスタイル'),
      make('ReThinkPanel.IsAreaOpen',                String(rp.IsAreaOpen),                  'boolean', '右パネル表示'),
    ];
  }

  private _applyContent(content: string): void {
    if (!this._app) return;
    this._applying = true;
    try {
      const sections = parseTableContent(content);
      const section = sections[0];
      if (!section) return;
      const keyIdx = section.columns.findIndex(c => c === 'key');
      // current 列優先、なければ旧 value 列にフォールバック
      const curIdx = section.columns.findIndex(c => c === 'current');
      const valIdx = section.columns.findIndex(c => c === 'value');
      const applyIdx = curIdx >= 0 ? curIdx : valIdx;
      if (keyIdx < 0 || applyIdx < 0) return;

      const dirtyPanels = new Set<string>();
      for (const row of section.rows) {
        const key = row[keyIdx]?.trim() ?? '';
        const val = row[applyIdx] ?? '';
        if (!key) continue;
        this._applyProp(key, val);
        dirtyPanels.add(key.split('.')[0]);
      }

      const app = this._app;
      if (dirtyPanels.has('ThinktankPanel')) app.ThinktankPanel.NotifyUpdated();
      if (dirtyPanels.has('OverviewPanel'))  app.OverviewPanel.NotifyUpdated();
      if (dirtyPanels.has('WorkoutPanel'))   app.WorkoutPanel.NotifyUpdated();
      if (dirtyPanels.has('ReThinkPanel'))   app.ReThinkPanel.NotifyUpdated();
      if (dirtyPanels.size > 0) app.NotifyUpdated(false);
    } finally {
      this._applying = false;
    }
  }

  private _applyProp(key: string, value: string): void {
    if (!this._app) return;
    const app = this._app;
    switch (key) {
      case 'ThinktankPanel.IsAreaOpen':
        app.ThinktankPanel.IsAreaOpen = parseBool(value, app.ThinktankPanel.IsAreaOpen); break;
      case 'ThinktankPanel.ViewMode':
        app.ThinktankPanel.ViewMode = value as ThinktankViewMode; break;
      case 'OverviewPanel.IsAreaOpen':
        app.OverviewPanel.IsAreaOpen = parseBool(value, app.OverviewPanel.IsAreaOpen); break;
      case 'OverviewPanel.MediaType':
        app.OverviewPanel.MediaType = value as MediaType; break;
      case 'WorkoutPanel.EditorLineNumbers':
        app.WorkoutPanel.EditorLineNumbers = parseBool(value, app.WorkoutPanel.EditorLineNumbers); break;
      case 'WorkoutPanel.EditorWordWrap':
        app.WorkoutPanel.EditorWordWrap = parseBool(value, app.WorkoutPanel.EditorWordWrap); break;
      case 'WorkoutPanel.EditorMinimap':
        app.WorkoutPanel.EditorMinimap = parseBool(value, app.WorkoutPanel.EditorMinimap); break;
      case 'WorkoutPanel.EditorShowFullWidthSpace':
        app.WorkoutPanel.EditorShowFullWidthSpace = parseBool(value, app.WorkoutPanel.EditorShowFullWidthSpace); break;
      case 'WorkoutPanel.EditorUnicodeHighlight':
        app.WorkoutPanel.EditorUnicodeHighlight = parseBool(value, app.WorkoutPanel.EditorUnicodeHighlight); break;
      case 'WorkoutPanel.EditorBracketPairColorization':
        app.WorkoutPanel.EditorBracketPairColorization = parseBool(value, app.WorkoutPanel.EditorBracketPairColorization); break;
      case 'WorkoutPanel.EditorHighlightWord':
        app.WorkoutPanel.EditorHighlightWord = value; break;
      case 'WorkoutPanel.EditorBackground':
        app.WorkoutPanel.EditorBackground = value; break;
      case 'WorkoutPanel.EditorForeground':
        app.WorkoutPanel.EditorForeground = value; break;
      case 'WorkoutPanel.EditorHeadingStyles':
        try { app.WorkoutPanel.EditorHeadingStyles = JSON.parse(value); } catch { /* ignore */ } break;
      case 'WorkoutPanel.EditorHighlightStyles':
        try { app.WorkoutPanel.EditorHighlightStyles = JSON.parse(value); } catch { /* ignore */ } break;
      case 'ReThinkPanel.IsAreaOpen':
        app.ReThinkPanel.IsAreaOpen = parseBool(value, app.ReThinkPanel.IsAreaOpen); break;
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
