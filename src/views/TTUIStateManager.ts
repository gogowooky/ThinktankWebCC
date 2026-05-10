/**
 * TTUIStateManager.ts
 * UIアイテム状態の永続化・Undo/Redo管理。
 *
 * ① localStorageへの高速起動時ロード/保存
 * ② __tt_ui_state__ Think (ContentType='table') との同期
 *    → DataGrid で value 列を編集→Ctrl+S 保存で即 UI に反映
 * ③ Undo/Redo（メモリ内スタック、最大50件）
 */

import type { TTApplication } from './TTApplication';
import type { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { parseTableContent } from '../utils/tableFormat';
import type { ThinktankViewMode } from './TTThinktankPanel';
import type { MediaType } from '../types';

interface PropDef {
  key: string;
  value: string;
  type: 'boolean' | 'string' | 'color' | 'json';
  description: string;
}

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
        // localStorage 側が優先 → Think 内容を現状に合わせる
        think.setContentSilent(this.serialize(this._app));
      }
    }
    this._vaultThink = think;
  }

  /** DataGrid が UIState Think を保存したときのフック（WorkoutArea から呼ぶ）*/
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
      this._vaultThink.setContentSilent(this.serialize(this._app));
    }
  }

  undo(): boolean {
    if (this._undoStack.length === 0 || !this._app) return false;
    const current = this.serialize(this._app);
    this._redoStack.push(current);
    const prev = this._undoStack.pop()!;
    this._applyContent(prev);
    this._saveToLocalStorage();
    if (this._vaultThink && this._app) {
      this._vaultThink.setContentSilent(this.serialize(this._app));
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
      this._vaultThink.setContentSilent(this.serialize(this._app));
    }
    return true;
  }

  /** TTApplication 状態をテーブル形式にシリアライズ */
  serialize(app: TTApplication): string {
    const props = this._getProps(app);
    const lines = [
      'UI Settings',
      '# DataGridで value 列を編集 → Ctrl+S 保存でUIに即反映',
      '# Undo: Ctrl+Shift+Z  /  Redo: Ctrl+Shift+Y',
      '',
      '> key,value,type,description',
      ...props.map(p =>
        `${p.key},${csvEscape(p.value)},${p.type},${csvEscape(p.description)}`
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
    return [
      { key: 'ThinktankPanel.IsAreaOpen',  value: String(tp.IsAreaOpen), type: 'boolean', description: '左パネル表示' },
      { key: 'ThinktankPanel.ViewMode',    value: tp.ViewMode,           type: 'string',  description: '左パネルモード(thoughts/filter/search/ai/settings)' },
      { key: 'OverviewPanel.IsAreaOpen',   value: String(op.IsAreaOpen), type: 'boolean', description: '上部パネル表示' },
      { key: 'OverviewPanel.MediaType',    value: op.MediaType,          type: 'string',  description: '上部パネルメディア(datagrid/markdown/graph)' },
      { key: 'WorkoutPanel.EditorLineNumbers',             value: String(wp.EditorLineNumbers),             type: 'boolean', description: '行番号表示' },
      { key: 'WorkoutPanel.EditorWordWrap',                value: String(wp.EditorWordWrap),                type: 'boolean', description: '折り返し' },
      { key: 'WorkoutPanel.EditorMinimap',                 value: String(wp.EditorMinimap),                 type: 'boolean', description: 'ミニマップ' },
      { key: 'WorkoutPanel.EditorShowFullWidthSpace',      value: String(wp.EditorShowFullWidthSpace),      type: 'boolean', description: '全角スペース表示' },
      { key: 'WorkoutPanel.EditorUnicodeHighlight',        value: String(wp.EditorUnicodeHighlight),        type: 'boolean', description: 'Unicode強調' },
      { key: 'WorkoutPanel.EditorBracketPairColorization', value: String(wp.EditorBracketPairColorization), type: 'boolean', description: '括弧ペア色分け' },
      { key: 'WorkoutPanel.EditorHighlightWord',           value: wp.EditorHighlightWord,                   type: 'string',  description: 'ハイライトキーワード' },
      { key: 'WorkoutPanel.EditorBackground',              value: wp.EditorBackground,                      type: 'color',   description: '背景色' },
      { key: 'WorkoutPanel.EditorForeground',              value: wp.EditorForeground,                      type: 'color',   description: '前景色' },
      { key: 'WorkoutPanel.EditorHeadingStyles',           value: JSON.stringify(wp.EditorHeadingStyles),   type: 'json',    description: '見出しスタイル(JSON)' },
      { key: 'WorkoutPanel.EditorHighlightStyles',         value: JSON.stringify(wp.EditorHighlightStyles), type: 'json',    description: 'ハイライトスタイル(JSON)' },
      { key: 'ReThinkPanel.IsAreaOpen',    value: String(rp.IsAreaOpen), type: 'boolean', description: '右パネル表示' },
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
      const valIdx = section.columns.findIndex(c => c === 'value');
      if (keyIdx < 0 || valIdx < 0) return;

      const dirtyPanels = new Set<string>();
      for (const row of section.rows) {
        const key = row[keyIdx]?.trim() ?? '';
        const val = row[valIdx] ?? '';
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
        this._vaultThink.setContentSilent(this.serialize(this._app));
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
