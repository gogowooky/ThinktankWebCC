/**
 * TTShortcutManager.ts
 * グローバルキーボードショートカット管理。
 *
 * ③ __tt_shortcuts__ Think (ContentType='table') の設定に従い、
 *    「Panel.Property:value」形式のアクションを TTUIStateManager 経由で実行する。
 *
 * アクション書式:
 *   Panel.Property:value   例) WorkoutPanel.EditorWordWrap:toggle
 *   ui:undo / ui:redo      UI状態の Undo / Redo
 *
 * value 特殊値:
 *   toggle → boolean プロパティを反転
 *   true / false → 直接指定
 *   その他の文字列 → 文字列プロパティに代入
 *
 * キー書式例:
 *   Ctrl+Shift+Z  /  Ctrl+Alt+L  /  F5
 *   コード入力（2段）: Ctrl+K L  （スペース区切りで2打鍵）
 */

import type { TTApplication } from './TTApplication';
import type { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { parseTableContent } from '../utils/tableFormat';
import { TTUIStateManager } from './TTUIStateManager';

interface ShortcutEntry {
  key: string;
  action: string;
  description: string;
}

const DEFAULT_SHORTCUTS: ShortcutEntry[] = [
  { key: 'Ctrl+Shift+Z', action: 'ui:undo', description: 'UI設定を元に戻す' },
  { key: 'Ctrl+Shift+Y', action: 'ui:redo', description: 'UI設定をやり直す' },
  { key: 'Ctrl+Shift+L', action: 'WorkoutPanel.EditorLineNumbers:toggle', description: '行番号切り替え' },
  { key: 'Ctrl+Shift+W', action: 'WorkoutPanel.EditorWordWrap:toggle',    description: '折り返し切り替え' },
  { key: 'Ctrl+Shift+M', action: 'WorkoutPanel.EditorMinimap:toggle',     description: 'ミニマップ切り替え' },
];

export class TTShortcutManager {
  static readonly THINK_ID = '__tt_shortcuts__';
  private static _instance: TTShortcutManager | null = null;

  private _app: TTApplication | null = null;
  private _shortcuts: ShortcutEntry[] = [...DEFAULT_SHORTCUTS];
  private _chordFirst: string | null = null;
  private _chordTimer: ReturnType<typeof setTimeout> | null = null;
  private _vaultThink: TTThink | null = null;

  static get instance(): TTShortcutManager {
    if (!TTShortcutManager._instance) {
      TTShortcutManager._instance = new TTShortcutManager();
    }
    return TTShortcutManager._instance;
  }

  private constructor() {}

  init(app: TTApplication): void {
    this._app = app;
  }

  async ensureThinkExists(vault: TTVault): Promise<void> {
    let think = vault.GetThink(TTShortcutManager.THINK_ID);
    if (!think) {
      think = await vault.AddThinkWithContent(
        TTShortcutManager.THINK_ID,
        'Keyboard Shortcuts',
        'table',
        'system,shortcuts',
        this._defaultContent(),
      );
    } else {
      if (think.IsMetaOnly) await think.LoadContent();
      this._loadFromContent(think.Content);
    }
    this._vaultThink = think;
  }

  /** DataGrid がショートカット Think を保存したときのフック */
  onThinkSaved(thinkId: string, content: string): void {
    if (thinkId !== TTShortcutManager.THINK_ID) return;
    this._loadFromContent(content);
  }

  handleKeyDown(e: KeyboardEvent): void {
    if (!this._shouldHandle(e)) return;
    const keyStr = this._normalizeKey(e);
    if (!keyStr) return;

    // コード入力の2打鍵目
    if (this._chordFirst) {
      const chord = `${this._chordFirst} ${keyStr}`;
      const match = this._shortcuts.find(s => s.key === chord);
      if (match) {
        e.preventDefault();
        this._execute(match.action);
      }
      this._clearChord();
      return;
    }

    // コード入力の1打鍵目（後続キーがある定義が存在する場合）
    const chordStarters = this._shortcuts.filter(
      s => s.key.includes(' ') && s.key.startsWith(keyStr + ' ')
    );
    if (chordStarters.length > 0) {
      e.preventDefault();
      this._chordFirst = keyStr;
      this._chordTimer = setTimeout(() => this._clearChord(), 2000);
      return;
    }

    // 単打鍵
    const match = this._shortcuts.find(s => s.key === keyStr);
    if (match) {
      e.preventDefault();
      this._execute(match.action);
    }
  }

  // ── プライベート ──────────────────────────────────────────────────────

  private _defaultContent(): string {
    const lines = [
      'Keyboard Shortcuts',
      '# アクション書式: Panel.Property:value（value: true/false/toggle/文字列）',
      '# 特殊コマンド: ui:undo  /  ui:redo',
      '# コード入力（2段）: Ctrl+K L のようにスペース区切り',
      '',
      '> key,action,description',
      ...DEFAULT_SHORTCUTS.map(s => `${s.key},${s.action},${s.description}`),
    ];
    return lines.join('\n');
  }

  private _loadFromContent(content: string): void {
    const sections = parseTableContent(content);
    const section = sections[0];
    if (!section) { this._shortcuts = [...DEFAULT_SHORTCUTS]; return; }
    const keyIdx = section.columns.findIndex(c => c === 'key');
    const actIdx = section.columns.findIndex(c => c === 'action');
    const dscIdx = section.columns.findIndex(c => c === 'description');
    if (keyIdx < 0 || actIdx < 0) { this._shortcuts = [...DEFAULT_SHORTCUTS]; return; }
    this._shortcuts = section.rows
      .map(row => ({
        key: row[keyIdx]?.trim() ?? '',
        action: row[actIdx]?.trim() ?? '',
        description: dscIdx >= 0 ? (row[dscIdx] ?? '') : '',
      }))
      .filter(s => s.key && s.action);
  }

  private _clearChord(): void {
    if (this._chordTimer) clearTimeout(this._chordTimer);
    this._chordFirst = null;
    this._chordTimer = null;
  }

  private _shouldHandle(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null;
    if (!target) return false;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) return false;
    if (target.getAttribute('contenteditable') === 'true') return false;
    if (target.closest?.('.monaco-editor')) return false;
    return true;
  }

  private _normalizeKey(e: KeyboardEvent): string | null {
    const key = e.key;
    if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return null;
    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    parts.push(key.length === 1 ? key.toUpperCase() : key);
    return parts.join('+');
  }

  private _execute(action: string): void {
    const colonIdx = action.indexOf(':');
    if (colonIdx < 0) return;
    const target = action.slice(0, colonIdx).trim();
    const value  = action.slice(colonIdx + 1).trim();

    if (target === 'ui') {
      if (value === 'undo') TTUIStateManager.instance.undo();
      if (value === 'redo') TTUIStateManager.instance.redo();
      return;
    }

    // Panel.Property:value → TTUIStateManager 経由で適用（Undo スタックも管理）
    TTUIStateManager.instance.applyProperty(target, value);
  }
}
