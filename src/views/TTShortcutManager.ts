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
 *   TextEditor.EditText.Undo / Redo  → UI状態 Undo/Redo
 *   ExMode:{name}               → Application.Status.SetExMode()
 *
 * ── key 書式 ─────────────────────────────────────────────────────────────
 *   キーボード: {ctrl|alt|shift|meta}+{key}  ※ 順不同・小文字
 *   マウス:     left1 / left2 / right1 / wheelup / wheeldown（修飾付き可）
 *   D&D:        ThinkFileDrag / LocalFileDrag / LocalDirDrag 等の疑似キー名（修飾付き可）
 *               ※ D&Dは preventDefault のタイミングがドロップ先DOM要素ごとに異なるため、
 *                 resolveDragAction() でActionIDの解決のみを行い、preventDefault と
 *                 TTActions.Execute() の呼び出しは各Dropハンドラー側が担う。ドラッグの
 *                 ペイロード（ThinkID・配置先情報）はキーボードイベントに乗せられないため、
 *                 setPendingThinkDrop() で明示的にセットしてから Execute() を呼ぶこと
 *                 （Completion側は consumePendingThinkDrop() で読み取る）。
 *                 LocalFileDrag / LocalDirDrag / Alt+LocalFileDrag / Alt+LocalDirDrag
 *                 （OSファイルシステムからのFile/Dirドロップ、docs/DefaultShortcut.md参照）は、
 *                 対応する4箇所の呼び出し元（WorkoutMenuRibbon/WorkoutArea/WorkoutPanel/
 *                 TextEditorMedia）が既に同期的にLoad/Insert相当の処理を持っているため
 *                 TTActions.Execute() は経由せず、resolveDragAction() の戻り値を
 *                 shouldAllowLocalDrop() / shouldInsertLocalDrop()（WorkoutMenuRibbon.tsx）
 *                 でActionID文字列の一致判定
 *                 のみに使う。Shortcutテーブルの行を書き換える／削除するとDropを抑止できる。
 *   複数指定:   | 区切りで複数キーを同一アクションに割り当て可能
 *               | 自体を指定したい場合は "" でくくる（例: "ctrl+|"）
 */

import type { TTApplication } from './TTApplication';
import type { TTVault } from '../models/TTVault';
import { parseTableContent } from '../utils/tableFormat';
import { TTUIStateManager } from './TTUIStateManager';
import { TTActions } from './TTActions';
import { getFocusName } from '../utils/getFocusName';
import localShortcutContent from '../../docs/DefaultShortcut.md?raw';
import {
  parseMultiKey,
  keyEventToStr,
  mouseEventToStr,
  wheelEventToStr,
  dragEventToStr,
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

/** 未マッチ時に使い回す空配列（毎キーストロークでの `?? []` 割り当てを避ける） */
const NO_CANDIDATES: readonly ShortcutEntry[] = [];

/**
 * ThinkFileDrag（D&D）用のペイロード。resolveDragAction() でActionIDを解決した
 * 呼び出し側が setPendingThinkDrop() でセットし、WorkoutPanel.DroppedFile.ID:Load /
 * WorkoutPanel.DroppedFile.ID:Insert の Completion が consumePendingThinkDrop() で読み取る。
 *
 *   'insert'      : WorkoutPanel.DroppedFile.ID:Insert 用。thinkIdのみ必要
 *                   （挿入先エディタは事前に setActiveEditor() で指定しておく）。
 *   'load-replace': WorkoutPanel.DroppedFile.ID:Load 用。指定Areaを丸ごとドロップされた
 *                   Thinkに差し替える（タイトルバードロップ）。
 *   'load-place'  : WorkoutPanel.DroppedFile.ID:Load 用。ドロップ位置に応じて新規Paneを
 *                   追加する（コンテンツ領域の余白/端へのドロップ。WorkoutPanel側で
 *                   計算済みのオーバーレイ情報をそのまま渡す）。
 */
export type ThinkDropContext =
  | { thinkId: string; kind: 'insert' }
  | { thinkId: string; kind: 'load-replace'; areaId: string }
  | { thinkId: string; kind: 'load-place'; overlayType: 'add' | 'split'; dir: 'left' | 'right' | 'up' | 'down'; areaId?: string };

// ── デフォルトショートカット ──────────────────────────────────────────────

const DEFAULT_SHORTCUTS: ShortcutEntry[] = [
  { focus: '*', exmode: '', key: 'ctrl+z', action: 'TextEditor.EditText.Undo',                                    description: '編集を元に戻す' },
  { focus: '*', exmode: '', key: 'ctrl+y', action: 'TextEditor.EditText.Redo',                                    description: '編集をやり直す' },
  { focus: '*', exmode: '', key: 'ctrl+shift+l', action: 'TextEditor.LineNumbers.IsVisible:toggle',    description: '行番号切り替え' },
  { focus: '*', exmode: '', key: 'ctrl+shift+w', action: 'TextEditor.WordWrap.IsVisible:toggle',       description: '折り返し切り替え' },
  { focus: '*', exmode: '', key: 'ctrl+shift+m', action: 'TextEditor.Minimap.IsVisible:toggle',        description: 'ミニマップ切り替え' },
  { focus: '*', exmode: 'ExPanel', key: 'o', action: 'FocusedPanel.Area.IsOpen:Toggle', description: 'フォーカスパネル開閉' },
  { focus: '*', exmode: 'ExPanel', key: 'p', action: 'FocusedPanel.Mode.Name:Prev',      description: 'フォーカスパネルモード前' },
  { focus: '*', exmode: 'ExPanel', key: 'n', action: 'FocusedPanel.Mode.Name:Next',      description: 'フォーカスパネルモード次' },
  { focus: '*TextEditor', exmode: '', key: 'alt+arrowup',    action: 'TextEditor.CurrentFolding.Heading:VisibleNext',          description: '現表示範囲の折畳タイトル行を前方向に探索してカーソル移動' },
  { focus: '*TextEditor', exmode: '', key: 'alt+arrowdown',  action: 'TextEditor.CurrentFolding.Heading:VisiblePrev',          description: '現表示範囲の折畳タイトル行を後方向に探索してカーソル移動' },
  { focus: '*TextEditor', exmode: '', key: 'alt+arrowright', action: 'TextEditor.CurrentFolding.Heading:OpenStepwise', description: 'カーソル位置が折畳タイトル行の場合、自Folding→子Folding→孫Foldingと順にOpen状態にしてゆく' },
  { focus: '*TextEditor', exmode: '', key: 'alt+arrowleft',  action: 'TextEditor.CurrentFolding.Heading:CloseStepwise',description: 'カーソル位置が折畳タイトル行の場合、表示されている子孫Folding→→→子Folding→自Foldingと順にClose状態にしてゆく' },
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
  private _pendingThinkDrop: ThinkDropContext | null = null;
  /** WorkoutArea.ID → 生Monacoエディタインスタンス。D&D時にペイン単位でエディタを引くために使う */
  private _areaEditors: Map<string, any> = new Map();

  get activeEditor(): any { return this._activeEditor; }
  setActiveEditor(editor: any): void {
    this._activeEditor = editor;
  }

  /** WorkoutPanel.DroppedFile.ID:Insert用: 特定Paneのエディタインスタンスをマウント時に登録する */
  registerAreaEditor(areaId: string, editor: any): void {
    this._areaEditors.set(areaId, editor);
  }
  /** アンマウント時に登録解除する（登録済みインスタンスと一致する場合のみ、後勝ちの取り違えを防ぐ） */
  unregisterAreaEditor(areaId: string, editor: any): void {
    if (this._areaEditors.get(areaId) === editor) this._areaEditors.delete(areaId);
  }
  /** 指定PaneのエディタインスタンスをareaIdから取得する（未登録/非テキストエディタ系Paneはnull） */
  getAreaEditor(areaId: string): any {
    return this._areaEditors.get(areaId) ?? null;
  }

  /**
   * D&D用: WorkoutPanel.DroppedFile.ID:Load / WorkoutPanel.DroppedFile.ID:Insert の
   * Completion が参照するペイロード（ThinkID・配置先情報）をセットする。
   * Drop ハンドラーが resolveDragAction() で ActionID を解決した直後、
   * TTActions.Execute() を呼ぶ前に必ずセットすること。
   */
  setPendingThinkDrop(ctx: ThinkDropContext): void {
    this._pendingThinkDrop = ctx;
  }

  /**
   * D&D中のAlt押下判定（カーソル/ゴースト表示用）。イベント自身のaltKeyと
   * グローバル追跡値のORを取る（resolveDragAction()と同じ実効値の考え方）。
   */
  isDragAltHeld(e: { altKey: boolean }): boolean {
    return e.altKey || this._heldMods.alt;
  }

  /** ペイロードを取得し、同時にクリアする（Completion からの一度きりの消費を想定） */
  consumePendingThinkDrop(): ThinkDropContext | null {
    const ctx = this._pendingThinkDrop;
    this._pendingThinkDrop = null;
    return ctx;
  }

  // ── インデックス ──────────────────────────────────────────────────────
  /** 全件キーインデックス（ショートカット更新時に構築） */
  private _keyIndex:            Map<string, ShortcutEntry[]> = new Map();
  /** 現在の focus+exmode でフィルタ済みアクティブテーブル（状態変化時に再構築） */
  private _activeTable: Map<string, ShortcutEntry[]> = new Map();

  // ── 現在状態 ──────────────────────────────────────────────────────────
  private _currentFocus:  string = 'None';
  private _currentExMode: string = '';

  /**
   * グローバルに追跡している修飾キーの押下状態。
   * ネイティブDragEventのaltKey等はドラッグ中の値更新がブラウザ・OS依存で不安定なことがある
   * （特にドラッグ開始前から押下していた修飾キーが、dragover/drop時点まで正しく反映されない
   * ケースがある）ため、window全体のkeydown/keyupで独自に追跡した値をresolveDragAction()で
   * OR演算のフォールバックとして用いる。
   */
  private _heldMods = { ctrl: false, alt: false, shift: false, meta: false };

  static get instance(): TTShortcutManager {
    if (!TTShortcutManager._instance) TTShortcutManager._instance = new TTShortcutManager();
    return TTShortcutManager._instance;
  }

  private constructor() {
    if (typeof window !== 'undefined') {
      const sync = (e: KeyboardEvent) => {
        this._heldMods = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
      };
      window.addEventListener('keydown', sync, { capture: true });
      window.addEventListener('keyup', sync, { capture: true });
      // ウィンドウがフォーカスを失うと以降keyupが来ない可能性があるため、その時点で全解除する
      window.addEventListener('blur', () => {
        this._heldMods = { ctrl: false, alt: false, shift: false, meta: false };
      });
    }
  }

  init(app: TTApplication): void {
    this._app = app;
    // ExMode 変化時にアクティブテーブルを再構築
    app.Status.AddOnUpdate('TTShortcutManager-exmode', () => {
      this.onExModeChange(app.Status.ExMode);
    });
  }

  async ensureThinkExists(_vault: TTVault): Promise<void> {
    this._loadFromContent(localShortcutContent);
  }

  onThinkSaved(thinkId: string, content: string): void {
    if (thinkId !== TTShortcutManager.THINK_ID) return;
    this._loadFromContent(content);
  }

  GetShortcuts(): ShortcutEntry[] { return [...this._shortcuts]; }

  /** 任意のテーブル形式コンテンツ（Vaultメモ等）でショートカット設定を上書きする */
  applyContent(content: string): void {
    this._loadFromContent(content);
  }

  /** ショートカット設定を DefaultShortcut.md の内容にリセットする */
  resetToDefault(): void {
    this._loadFromContent(localShortcutContent);
  }

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

  /**
   * D&D用: 疑似キー名（ThinkFileDrag / UrlDrag / FilePathDrag 等）と修飾キーから
   * 一致するActionIDを解決する。キーボード/マウス用の _processEvent とは異なり、
   * preventDefault や TTActions.Execute は行わない（実行・ペイロード受け渡しは
   * 呼び出し側のDropハンドラーが担う）。
   * 一致するテーブル行が無い場合は null を返す（呼び出し側で既定動作にフォールバック）。
   *
   * ネイティブDragEventのaltKey等は、ドラッグ開始前から押していた修飾キーがdrop時点まで
   * 正しく反映されないなど、ブラウザ・OS依存で更新が不安定なことがあるため、window全体の
   * keydown/keyupで独自追跡している _heldMods とOR演算した実効値で判定する。
   */
  resolveDragAction(dragType: string, e: DragEvent | MouseEvent): string | null {
    const effective = {
      ctrlKey:  e.ctrlKey  || this._heldMods.ctrl,
      altKey:   e.altKey   || this._heldMods.alt,
      shiftKey: e.shiftKey || this._heldMods.shift,
      metaKey:  e.metaKey  || this._heldMods.meta,
    };
    const keyStr = dragEventToStr(dragType, effective);
    const candidates = this._activeTable.get(keyStr) ?? NO_CANDIDATES;
    if (candidates.length === 0) return null;
    // フォーカス固有指定（focus ≠ '*'）を優先し、なければ最初の一致（通常は focus='*'）を採る
    const specific = candidates.find(s => (s.focus || '*') !== '*');
    return (specific ?? candidates[0]).action;
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
    const candidates = this._activeTable.get(keyStr) ?? NO_CANDIDATES;

    // マッチしたショートカットを実行する。preventDefault/stopPropagation の発火と
    // Allow による継続判定は3フェーズ共通のため、フェーズごとの絞り込み述語だけを渡す。
    const tryExecute = (s: ShortcutEntry): boolean => {
      e.preventDefault();
      e.stopPropagation();
      return this._executeAction(s.action, mods);
    };

    // ① フォーカス固有（TextEditor.で始まるアクションはエディタ内で例外的に実行可能にする）
    for (const s of candidates) {
      const isEditorAction = s.action.startsWith('TextEditor.');
      if ((s.focus || '*') === '*' && !isEditorAction) continue;
      if (!tryExecute(s)) return;
    }

    // ② ExMode 関連グローバル（入力系コントロール内でも常に有効）
    // ・exmode 指定ショートカット: ユーザーが明示的にモードに入っているため常に有効
    // ・ExMode 設定アクション (exmode=''): どこからでも ExMode に入れる必要があるため常に有効
    for (const s of candidates) {
      if ((s.focus || '*') !== '*') continue;
      if (!s.exmode && !this._isExModeAction(s.action)) continue;
      if (!tryExecute(s)) return;
    }

    // ③ 通常グローバル（入力系コントロール内では無効）
    if (!this._shouldHandle(e)) return;

    // グローバル単打鍵（ExMode 関連ショートカットは ② で処理済みなのでスキップ）
    for (const s of candidates) {
      if ((s.focus || '*') !== '*') continue;
      if (s.exmode || this._isExModeAction(s.action)) continue;
      if (!tryExecute(s)) return;
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

    if (TTActions.Has(action)) {
      const res = TTActions.Execute(action, mods);
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
    } else {
      status?.SetLastActionDisplay(`${action}: [未定義]`);
    }

    return false;
  }

  /** アクションを直接実行し、結果をステータスバーに反映する */
  executeActionDirect(action: string, mods: string = ''): boolean {
    return this._executeAction(action, mods);
  }

  // ── コンテンツ管理 ─────────────────────────────────────────────────────


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
