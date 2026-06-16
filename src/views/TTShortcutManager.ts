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
import localShortcutContent from '../../docs/Shortcut.md?raw';

const USE_LOCAL_FILES = true;
import {
  parseMultiKey,
  keyEventToStr,
  mouseEventToStr,
  wheelEventToStr,
  currentModStr,
  MOD_ORDER,
} from '../utils/keyboardUtils';

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
  { focus: '*', exmode: 'ExPanel', key: 'o', action: 'FocusedPanel.ToggleAreaVisibility', description: 'フォーカスパネル開閉' },
  { focus: '*', exmode: 'ExPanel', key: 'p', action: 'FocusedPanel.SetViewModePrev',      description: 'フォーカスパネルモード前' },
  { focus: '*', exmode: 'ExPanel', key: 'n', action: 'FocusedPanel.SetViewModeNext',      description: 'フォーカスパネルモード次' },
  { focus: '*TextEditor', exmode: '', key: 'alt+arrowup',    action: 'TextEditor.Folding.ForwardVisible',       description: '現表示範囲の折畳タイトル行を前方向に探索してカーソル移動' },
  { focus: '*TextEditor', exmode: '', key: 'alt+arrowdown',  action: 'TextEditor.Folding.BackwardVisible',      description: '現表示範囲の折畳タイトル行を後方向に探索してカーソル移動' },
  { focus: '*TextEditor', exmode: '', key: 'alt+arrowright', action: 'TextEditor.Folding.OpenEachLevel', description: 'カーソル位置が折畳タイトル行の場合、自Folding→子Folding→孫Foldingと順にOpen状態にしてゆく' },
  { focus: '*TextEditor', exmode: '', key: 'alt+arrowleft',  action: 'TextEditor.Folding.CloseEachLevel',description: 'カーソル位置が折畳タイトル行の場合、表示されている子孫Folding→→→子Folding→自Foldingと順にClose状態にしてゆく' },
];

// ── フォーカスパターンマッチング ──────────────────────────────────────────

function matchesFocus(pattern: string, current: string): boolean {
  if (!pattern || pattern === '*') return true;
  const p = pattern.toLowerCase();
  const c = current.toLowerCase();
  if (p.endsWith('*'))       return c.startsWith(p.slice(0, -1));
  if (p.startsWith('*'))     return c.endsWith(p.slice(1));
  return p === c || c.endsWith('.' + p);
}

// ── TTShortcutManager ─────────────────────────────────────────────────────

export class TTShortcutManager {
  static readonly THINK_ID = '__tt_shortcuts__';
  private static _instance: TTShortcutManager | null = null;

  private _app:        TTApplication | null = null;
  private _shortcuts:  ShortcutEntry[]      = [...DEFAULT_SHORTCUTS];
  private _activeEditor: any = null;

  get activeEditor(): any { return this._activeEditor; }
  setActiveEditor(editor: any): void {
    this._activeEditor = editor;
  }

  // ── インデックス ──────────────────────────────────────────────────────
  /** 全件キーインデックス（ショートカット更新時に構築） */
  private _keyIndex:            Map<string, ShortcutEntry[]> = new Map();
  /** 現在の focus+exmode でフィルタ済みアクティブテーブル（状態変化時に再構築） */
  private _activeTable: Map<string, ShortcutEntry[]> = new Map();

  // ── 現在状態 ──────────────────────────────────────────────────────────
  private _currentFocus:  string = 'None';
  private _currentExMode: string = '';

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
    if (USE_LOCAL_FILES) {
      console.log('[TTShortcutManager] Loading shortcuts from local docs/Shortcut.md');
      this._loadFromContent(localShortcutContent);
      return;
    }
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
    if (e.defaultPrevented) return;
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
    const exMode     = this._currentExMode.toLowerCase();
    const exModeMods = exMode ? (this._app?.Status.ExModeModKey ?? '') : '';

    this._activeTable = new Map();

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

      if (!this._activeTable.has(effectiveKey)) this._activeTable.set(effectiveKey, []);
      this._activeTable.get(effectiveKey)!.push(...matched);
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
   */
  private _processEvent(keyStr: string, e: Event, mods: string): void {
    const candidates = this._activeTable.get(keyStr) ?? [];

    // ① フォーカス固有（TextEditor.で始まるアクションはエディタ内で例外的に実行可能にする）
    for (const s of candidates) {
      const isEditorAction = s.action.startsWith('TextEditor.');
      if ((s.focus || '*') === '*' && !isEditorAction) continue;
      e.preventDefault();
      e.stopPropagation();
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
      e.stopPropagation();
      const allow = this._executeAction(s.action, mods);
      if (!allow) return;
    }

    // ③ 通常グローバル（入力系コントロール内では無効）
    if (!this._shouldHandle(e)) return;

    // グローバル単打鍵（ExMode 関連ショートカットは ② で処理済みなのでスキップ）
    for (const s of candidates) {
      if ((s.focus || '*') !== '*') continue;
      if (s.exmode || this._isExModeAction(s.action)) continue;
      e.preventDefault();
      e.stopPropagation();
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
    return true;
  }

  private _executeAction(action: string, mods: string): boolean {
    const status = this._app?.Status;

    if (!action.includes(':')) {
      const res = TTActions.Execute(action);
      if (res instanceof Promise) {
        status?.SetLastActionDisplay(`${action}: [実行中...]`);
        res.then(item => {
          status?.SetLastActionDisplay(`${action}: ${item.Result || '✓'}`);
        }).catch(err => {
          status?.SetLastActionDisplay(`${action}: [エラー] ${err.message}`);
        });
        return false;
      } else {
        status?.SetLastActionDisplay(`${action}: ${res.Result || '✓'}`);
        return res.Allow;
      }
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

    const tableShortcuts = section.rows.flatMap(row => {
      const focus       = focIdx >= 0 ? (row[focIdx]?.trim() ?? '*') : '*';
      const exmode      = emIdx  >= 0 ? (row[emIdx]?.trim().toLowerCase() ?? '') : '';
      const action      = row[actIdx]?.trim() ?? '';
      const description = dscIdx >= 0 ? (row[dscIdx]?.trim() ?? '') : '';
      const keys        = parseMultiKey(row[keyIdx]?.trim() ?? '');
      return keys
        .filter(k => k && action)
        .map(key => ({ focus, exmode, key, action, description }));
    });

    // テーブルで定義されていない DEFAULT_SHORTCUTS のエントリを補完する。
    // key が同一のエントリはテーブル側を優先（ユーザーが意図的に上書きした場合を尊重）。
    const tableKeys = new Set(tableShortcuts.map(s => s.key));
    const defaults  = DEFAULT_SHORTCUTS.filter(s => !tableKeys.has(s.key));
    this._shortcuts = [...defaults, ...tableShortcuts];

    this._buildKeyIndex();
  }
}
