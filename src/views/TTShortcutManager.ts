/**
 * TTShortcutManager.ts
 * グローバルキーボード / マウスショートカット管理。
 *
 * 「Keyboard Shortcuts」テーブル Think (ContentType='table') の設定に従い、
 * フォーカス・ExMode・キー/マウスが一致したときにアクションを起動する。
 *
 * ── テーブル列 ────────────────────────────────────────────────────────────
 *   focus       フォーカス名パターン（*=すべて、Workout*=Workout内すべて）
 *   exmode      ExMode 名（空文字 = ExMode なし）
 *   key         キー/マウス指定（例: ctrl+shift+z, left1, ctrl+wheelup）
 *   action      ActionID または {状態変数}:{設定値} または ExMode:{name}
 *   description 説明
 *
 * ── インデックス構造 ──────────────────────────────────────────────────────
 *   _keyIndex         : Map<keyStr, ShortcutEntry[]>  全件インデックス（ショートカット更新時に構築）
 *   _activeTable      : Map<keyStr, ShortcutEntry[]>  現在の focus+exmode でフィルタ済み（状態変化時に再構築）
 *   _activeChordStarters: Map<firstStroke, ShortcutEntry[]>  コード入力用インデックス
 *
 * ── action 書式 ───────────────────────────────────────────────────────────
 *   ActionID                    コロンなし → TTActions.Execute()
 *   Panel.Property:value        → TTUIStateManager.applyProperty()
 *   ui:undo / ui:redo           → UI状態 Undo/Redo
 *   ExMode:{name}               → Application.Status.SetExMode()
 *
 * ── key 書式 ─────────────────────────────────────────────────────────────
 *   キーボード: {ctrl|alt|shift|meta}+{key}  ※ 順不同・小文字
 *   マウス:     left1 / left2 / right1 / wheelup / wheeldown（修飾付き可）
 *   コード入力: Ctrl+K Z のようにスペース区切り2打鍵（* フォーカスのみ）
 *   複数指定:   | 区切りで複数キーを同一アクションに割り当て可能
 *               | 自体を指定したい場合は "" でくくる（例: "ctrl+|"）
 */

import type { TTApplication } from './TTApplication';
import type { TTVault } from '../models/TTVault';
import { TTThink } from '../models/TTThink';
import { parseTableContent } from '../utils/tableFormat';
import { TTUIStateManager } from './TTUIStateManager';
import { TTActions } from './TTActions';
import { getFocusName } from '../utils/getFocusName';

interface ShortcutEntry {
  focus:       string;   // '' → '*'
  exmode:      string;   // '' = ExMode なし必須
  key:         string;   // 正規化済み小文字
  action:      string;
  description: string;
}

// ── デフォルトショートカット ──────────────────────────────────────────────

const DEFAULT_SHORTCUTS: ShortcutEntry[] = [
  { focus: '*', exmode: '', key: 'ctrl+shift+z', action: 'ui:undo',                                    description: 'UI設定を元に戻す' },
  { focus: '*', exmode: '', key: 'ctrl+shift+y', action: 'ui:redo',                                    description: 'UI設定をやり直す' },
  { focus: '*', exmode: '', key: 'ctrl+shift+l', action: 'TextEditor.LineNumbers.IsVisible:toggle',    description: '行番号切り替え' },
  { focus: '*', exmode: '', key: 'ctrl+shift+w', action: 'TextEditor.WordWrap.IsVisible:toggle',       description: '折り返し切り替え' },
  { focus: '*', exmode: '', key: 'ctrl+shift+m', action: 'TextEditor.Minimap.IsVisible:toggle',        description: 'ミニマップ切り替え' },
];

// ── キー複数指定パーサー ──────────────────────────────────────────────────

/**
 * key フィールドの複数値を | で分割して返す。
 * ダブルクォートで囲まれた部分の | はリテラルとして扱う。
 * 例: 'ctrl+z|"ctrl+|"' → ['ctrl+z', 'ctrl+|']
 */
function parseMultiKey(raw: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuote = false;
  for (const ch of raw) {
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === '|' && !inQuote) {
      const k = normalizeKeyStr(current);
      if (k) result.push(k);
      current = '';
    } else {
      current += ch;
    }
  }
  const k = normalizeKeyStr(current);
  if (k) result.push(k);
  return result;
}

// ── キー正規化ユーティリティ ──────────────────────────────────────────────

const MOD_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const;

function normalizeKeyStr(raw: string): string {
  const parts = raw.toLowerCase().trim().split('+').map(p => p.trim()).filter(Boolean);
  const mods   = MOD_ORDER.filter(m => parts.includes(m));
  const nonMod = parts.filter(p => !(MOD_ORDER as readonly string[]).includes(p));
  return [...mods, ...nonMod].join('+');
}

function keyEventToStr(e: KeyboardEvent): string | null {
  const key = e.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null;
  const mods = MOD_ORDER.filter(m => {
    if (m === 'ctrl')  return e.ctrlKey;
    if (m === 'alt')   return e.altKey;
    if (m === 'shift') return e.shiftKey;
    if (m === 'meta')  return e.metaKey;
    return false;
  });
  const keyStr = key.length === 1 ? key.toLowerCase() : key.toLowerCase();
  return [...mods, keyStr].join('+') || keyStr;
}

function mouseEventToStr(type: 'click' | 'dblclick' | 'contextmenu', e: MouseEvent): string {
  const keyPart = type === 'dblclick' ? 'left2' : type === 'contextmenu' ? 'right1' : 'left1';
  const mods = MOD_ORDER.filter(m => {
    if (m === 'ctrl')  return e.ctrlKey;
    if (m === 'alt')   return e.altKey;
    if (m === 'shift') return e.shiftKey;
    if (m === 'meta')  return e.metaKey;
    return false;
  });
  return [...mods, keyPart].join('+') || keyPart;
}

function wheelEventToStr(e: WheelEvent): string {
  const keyPart = e.deltaY < 0 ? 'wheelup' : 'wheeldown';
  const mods = MOD_ORDER.filter(m => {
    if (m === 'ctrl')  return e.ctrlKey;
    if (m === 'alt')   return e.altKey;
    if (m === 'shift') return e.shiftKey;
    if (m === 'meta')  return e.metaKey;
    return false;
  });
  return [...mods, keyPart].join('+') || keyPart;
}

function currentModStr(e: Event): string {
  const ev = e as KeyboardEvent | MouseEvent | WheelEvent;
  const mods = MOD_ORDER.filter(m => {
    if (m === 'ctrl')  return ev.ctrlKey;
    if (m === 'alt')   return ev.altKey;
    if (m === 'shift') return ev.shiftKey;
    if (m === 'meta')  return ev.metaKey;
    return false;
  });
  return mods.join('+') || '-';
}

// ── フォーカスパターンマッチング ──────────────────────────────────────────

function matchesFocus(pattern: string, current: string): boolean {
  if (!pattern || pattern === '*') return true;
  if (pattern.endsWith('*'))       return current.startsWith(pattern.slice(0, -1));
  return pattern === current;
}

// ── TTShortcutManager ─────────────────────────────────────────────────────

export class TTShortcutManager {
  static readonly THINK_ID = '__tt_shortcuts__';
  private static _instance: TTShortcutManager | null = null;

  private _app:        TTApplication | null = null;
  private _shortcuts:  ShortcutEntry[]      = [...DEFAULT_SHORTCUTS];

  // ── インデックス ──────────────────────────────────────────────────────
  /** 全件キーインデックス（ショートカット更新時に構築） */
  private _keyIndex:            Map<string, ShortcutEntry[]> = new Map();
  /** 現在の focus+exmode でフィルタ済みアクティブテーブル（状態変化時に再構築） */
  private _activeTable:         Map<string, ShortcutEntry[]> = new Map();
  /** アクティブテーブル内のコード入力先頭ストロークインデックス */
  private _activeChordStarters: Map<string, ShortcutEntry[]> = new Map();

  // ── 現在状態 ──────────────────────────────────────────────────────────
  private _currentFocus:  string = 'None';
  private _currentExMode: string = '';

  // ── コード入力 ────────────────────────────────────────────────────────
  private _chordFirst: string | null                        = null;
  private _chordTimer: ReturnType<typeof setTimeout> | null = null;

  private _vaultThink: TTThink | null = null;

  static get instance(): TTShortcutManager {
    if (!TTShortcutManager._instance) TTShortcutManager._instance = new TTShortcutManager();
    return TTShortcutManager._instance;
  }

  private constructor() {}

  init(app: TTApplication): void {
    this._app = app;
    // ExMode 変化時にアクティブテーブルを再構築
    app.Status.AddOnUpdate('TTShortcutManager-exmode', () => {
      this.onExModeChange(app.Status.ExMode);
    });
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

  onThinkSaved(thinkId: string, content: string): void {
    if (thinkId !== TTShortcutManager.THINK_ID) return;
    this._loadFromContent(content);
  }

  GetShortcuts(): ShortcutEntry[] { return [...this._shortcuts]; }

  // ── 状態変化ハンドラー（App.tsx / useShortcuts から呼び出す）─────────

  /** フォーカス変化時に呼び出す（rAF 後の focusin ハンドラーから）*/
  onFocusChange(focus: string): void {
    if (this._currentFocus === focus) return;
    this._currentFocus = focus;
    this._rebuildActiveTable();
  }

  /** ExMode 変化時に呼び出す（Status.AddOnUpdate から）*/
  onExModeChange(exMode: string): void {
    if (this._currentExMode === exMode) return;
    this._currentExMode = exMode;
    this._rebuildActiveTable();
  }

  // ── イベントハンドラー ─────────────────────────────────────────────────

  handleKeyDown(e: KeyboardEvent): void {
    const keyStr = keyEventToStr(e);
    if (!keyStr) return;
    this._processEvent(keyStr, e, currentModStr(e));
  }

  handleMouseEvent(type: 'click' | 'dblclick' | 'contextmenu', e: MouseEvent): void {
    this._processEvent(mouseEventToStr(type, e), e, currentModStr(e));
  }

  handleWheelEvent(e: WheelEvent): void {
    this._processEvent(wheelEventToStr(e), e, currentModStr(e));
  }

  // ── プライベート: インデックス構築 ─────────────────────────────────────

  /** ショートカット更新時: 全件キーインデックスを構築し、アクティブテーブルも再構築 */
  private _buildKeyIndex(): void {
    this._keyIndex = new Map();
    for (const s of this._shortcuts) {
      const k = s.key;
      if (!this._keyIndex.has(k)) this._keyIndex.set(k, []);
      this._keyIndex.get(k)!.push(s);
    }
    this._rebuildActiveTable();
  }

  /**
   * 現在の focus + exmode でフィルタしたアクティブテーブルを再構築。
   * focus 変化・ExMode 変化・ショートカット更新のたびに呼ぶ。
   *
   * ExMode が有効なショートカットは、設定 key に ExModeModKey のモディファイアが
   * 未記載でも自動的に付加して登録する（ExMode 中は常にそのモディファイアが押下中）。
   */
  private _rebuildActiveTable(): void {
    const focus      = this._currentFocus;
    const exMode     = this._currentExMode;
    const exModeMods = exMode ? (this._app?.Status.ExModeModKey ?? '') : '';

    this._activeTable         = new Map();
    this._activeChordStarters = new Map();

    for (const [key, entries] of this._keyIndex) {
      const matched = entries.filter(s =>
        matchesFocus(s.focus || '*', focus) &&
        s.exmode === exMode
      );
      if (matched.length === 0) continue;

      // ExMode 指定ショートカット: ExModeModKey のモディファイアをキーに付加
      const effectiveKey = (exMode && exModeMods && exModeMods !== '-')
        ? this._mergeExModeKey(key, exModeMods)
        : key;

      if (effectiveKey.includes(' ')) {
        const firstStroke = effectiveKey.split(' ')[0];
        if (!this._activeChordStarters.has(firstStroke)) this._activeChordStarters.set(firstStroke, []);
        this._activeChordStarters.get(firstStroke)!.push(...matched);
      } else {
        if (!this._activeTable.has(effectiveKey)) this._activeTable.set(effectiveKey, []);
        this._activeTable.get(effectiveKey)!.push(...matched);
      }
    }
  }

  /**
   * shortcutKey のモディファイア部分に exModeMods のモディファイアをマージして返す。
   * 例: shortcutKey="shift+z", exModeMods="ctrl+alt" → "ctrl+alt+shift+z"
   */
  private _mergeExModeKey(shortcutKey: string, exModeMods: string): string {
    const parts   = shortcutKey.split('+');
    const addMods = exModeMods.split('+').filter(p => (MOD_ORDER as readonly string[]).includes(p));
    const allMods = MOD_ORDER.filter(m => parts.includes(m) || addMods.includes(m));
    const nonMods = parts.filter(p => !(MOD_ORDER as readonly string[]).includes(p));
    return [...allMods, ...nonMods].join('+');
  }

  // ── プライベート: イベント処理 ─────────────────────────────────────────

  /**
   * 処理順序:
   *  ① フォーカス固有ショートカット（focus ≠ '*'）: _shouldHandle をバイパス
   *  ② ExMode グローバルショートカット: _shouldHandle をバイパス（どこからでも有効）
   *  ③ 通常グローバルショートカット（focus = '*'）: 入力系コントロール内では無効
   *     ※ コード入力（2打鍵）は グローバルのみ対応
   */
  private _processEvent(keyStr: string, e: Event, mods: string): void {
    const candidates = this._activeTable.get(keyStr) ?? [];

    // ① フォーカス固有
    for (const s of candidates) {
      if ((s.focus || '*') === '*') continue;
      e.preventDefault();
      const allow = this._executeAction(s.action, mods);
      if (!allow) return;
    }

    // ② ExMode 関連グローバル（入力系コントロール内でも常に有効）
    // ・exmode 指定ショートカット: ユーザーが明示的にモードに入っているため常に有効
    // ・ExMode 設定アクション (exmode=''): どこからでも ExMode に入れる必要があるため常に有効
    for (const s of candidates) {
      if ((s.focus || '*') !== '*') continue;
      if (!s.exmode && !this._isExModeAction(s.action)) continue;
      e.preventDefault();
      const allow = this._executeAction(s.action, mods);
      if (!allow) return;
    }

    // ③ 通常グローバル（入力系コントロール内では無効）
    if (!this._shouldHandle(e)) return;

    // コード入力: 2打鍵目
    if (this._chordFirst) {
      const chordKey    = `${this._chordFirst} ${keyStr}`;
      const chordCands  = this._keyIndex.get(chordKey) ?? [];
      const match = chordCands.find(s =>
        (s.focus || '*') === '*' && s.exmode === this._currentExMode
      );
      if (match) {
        e.preventDefault();
        this._executeAction(match.action, mods);
      }
      this._clearChord();
      return;
    }

    // コード入力: 1打鍵目
    const chordStarters = this._activeChordStarters.get(keyStr) ?? [];
    if (chordStarters.some(s => (s.focus || '*') === '*')) {
      e.preventDefault();
      this._chordFirst = keyStr;
      this._chordTimer = setTimeout(() => this._clearChord(), 2000);
      return;
    }

    // 単打鍵グローバル（ExMode 関連ショートカットは ② で処理済みなのでスキップ）
    for (const s of candidates) {
      if ((s.focus || '*') !== '*') continue;
      if (s.exmode || this._isExModeAction(s.action)) continue;
      e.preventDefault();
      const allow = this._executeAction(s.action, mods);
      if (!allow) return;
    }
  }

  private _isExModeAction(action: string): boolean {
    if (!action.includes(':')) return false;
    const target = action.slice(0, action.indexOf(':')).trim();
    return target === 'ExMode' || target === 'Application.Status.ExMode';
  }

  private _shouldHandle(e: Event): boolean {
    const target = e.target as HTMLElement | null;
    if (!target) return false;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) return false;
    if (target.getAttribute?.('contenteditable') === 'true') return false;
    if (target.closest?.('.monaco-editor')) return false;
    return true;
  }

  private _clearChord(): void {
    if (this._chordTimer) clearTimeout(this._chordTimer);
    this._chordFirst = null;
    this._chordTimer = null;
  }

  private _executeAction(action: string, mods: string): boolean {
    const status = this._app?.Status;

    if (!action.includes(':')) {
      const item = TTActions.Execute(action);
      status?.SetLastActionDisplay(`${action}: ${item.Result || '✓'}`);
      return item.Allow;
    }

    const colonIdx = action.indexOf(':');
    const target   = action.slice(0, colonIdx).trim();
    const value    = action.slice(colonIdx + 1).trim();

    if (target === 'ExMode' || target === 'Application.Status.ExMode') {
      this._app?.Status.SetExMode(value, mods);
      status?.SetLastActionDisplay(`ExMode→${value} [${mods}]`);
      return false;
    }
    if (target === 'ui') {
      if (value === 'undo') TTUIStateManager.instance.undo();
      if (value === 'redo') TTUIStateManager.instance.redo();
      status?.SetLastActionDisplay(action);
      return false;
    }

    TTUIStateManager.instance.applyProperty(target, value);
    status?.SetLastActionDisplay(action);
    return false;
  }

  // ── コンテンツ管理 ─────────────────────────────────────────────────────

  private _defaultContent(): string {
    const header = [
      'Keyboard Shortcuts',
      '# focus: フォーカス名（*=すべて、Workout*=Workout内すべて）',
      '# exmode: ExMode名（空=ExModeなし）',
      '# key: {ctrl|alt|shift|meta}+{key}  マウス: left1/left2/right1/wheelup/wheeldown  複数: | 区切り（| 自体は ""でくくる）',
      '# action: ActionID または {状態変数}:{設定値} または ExMode:{name}',
      '',
      '> focus,exmode,key,action,description',
    ];
    const rows = DEFAULT_SHORTCUTS.map(
      s => `${s.focus},${s.exmode},${s.key},${s.action},${s.description}`
    );
    return [...header, ...rows].join('\n');
  }

  private _loadFromContent(content: string): void {
    const sections = parseTableContent(content);
    const section  = sections[0];
    if (!section) { this._shortcuts = [...DEFAULT_SHORTCUTS]; this._buildKeyIndex(); return; }

    // 列名のスペース・大文字を正規化してインデックス検索
    const col = (name: string) =>
      section.columns.findIndex(c => c.trim().toLowerCase() === name);

    const focIdx = col('focus');
    const emIdx  = col('exmode');
    const keyIdx = col('key');
    const actIdx = col('action');
    const dscIdx = col('description');

    if (keyIdx < 0 || actIdx < 0) {
      this._shortcuts = [...DEFAULT_SHORTCUTS];
      this._buildKeyIndex();
      return;
    }

    this._shortcuts = section.rows.flatMap(row => {
      const focus       = focIdx >= 0 ? (row[focIdx]?.trim() ?? '*') : '*';
      const exmode      = emIdx  >= 0 ? (row[emIdx]?.trim()  ?? '') : '';
      const action      = row[actIdx]?.trim() ?? '';
      const description = dscIdx >= 0 ? (row[dscIdx]?.trim() ?? '') : '';
      const keys        = parseMultiKey(row[keyIdx]?.trim() ?? '');
      return keys
        .filter(k => k && action)
        .map(key => ({ focus, exmode, key, action, description }));
    });

    this._buildKeyIndex();
  }
}
