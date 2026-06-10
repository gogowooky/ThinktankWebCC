// キー・マウス・ホイールの解釈、ExMode、ディスパッチ、競合回避（仕様書04 §3）

import { normalizeKeyEvent, splitKeyDefs } from '../utils/keyboardUtils';
import { getFocusName, isEditableElement } from '../utils/getFocusName';
import type { TTActions } from './TTActions';

export interface ShortcutDef {
  key: string;       // `ctrl+z|ctrl+y` 形式（複数定義可）
  focus: string;     // `*` / `Workout.TextEditor` / `Thinktank*` 等
  actionId: string;
  description: string;
}

export interface ShortcutStatus {
  Focus: string;
  LastKey: string;
  LastAction: string;
  ExMode: string;       // '' = 通常
  ExModeModKey: string; // ExMode 中に付加されるモディファイア（例: 'ctrl+alt'）
}

export class TTShortcutManager {
  private _defs: ShortcutDef[] = [];
  private _actions: TTActions;
  private _activeTable = new Map<string, ShortcutDef[]>();
  Status: ShortcutStatus = { Focus: '', LastKey: '', LastAction: '', ExMode: '', ExModeModKey: '' };
  OnStatusChanged: () => void = () => {};

  constructor(actions: TTActions) {
    this._actions = actions;
  }

  SetDefinitions(defs: ShortcutDef[]): void {
    this._defs = defs;
    this._rebuildActiveTable();
  }

  get Definitions(): ShortcutDef[] {
    return this._defs;
  }

  Attach(): void {
    document.addEventListener('keydown', this._onKeyDown, { capture: true });
    document.addEventListener('focusin', this._onFocusIn);
  }

  Detach(): void {
    document.removeEventListener('keydown', this._onKeyDown, { capture: true });
    document.removeEventListener('focusin', this._onFocusIn);
  }

  SetExMode(mode: string, modKey: string): void {
    this.Status.ExMode = mode;
    this.Status.ExModeModKey = modKey;
    this._rebuildActiveTable();
    this.OnStatusChanged();
  }

  private _focusRaf = 0;
  private _onFocusIn = (): void => {
    cancelAnimationFrame(this._focusRaf);
    this._focusRaf = requestAnimationFrame(() => {
      const name = getFocusName(document.activeElement);
      if (name !== this.Status.Focus) {
        this.Status.Focus = name;
        document.body.setAttribute('data-focus-column', name.split('.')[0] ?? '');
        this._rebuildActiveTable();
        this.OnStatusChanged();
      }
    });
  };

  /** focus 列が現在フォーカスに一致するか（前方/後方一致・ワイルドカード対応） */
  private _focusMatches(pattern: string, focus: string): boolean {
    if (pattern === '*') return false; // グローバルは別経路で判定
    if (pattern.endsWith('*')) return focus.startsWith(pattern.slice(0, -1));
    if (pattern.startsWith('*')) return focus.endsWith(pattern.slice(1));
    return focus === pattern || focus.startsWith(pattern + '.') || focus.endsWith('.' + pattern);
  }

  /** 状態変化時にフィルタ済み一致候補をキャッシュ（仕様書04 §3.2） */
  private _rebuildActiveTable(): void {
    this._activeTable.clear();
    const add = (key: string, def: ShortcutDef) => {
      if (!this._activeTable.has(key)) this._activeTable.set(key, []);
      this._activeTable.get(key)!.push(def);
    };
    for (const def of this._defs) {
      for (const key of splitKeyDefs(def.key)) {
        add(key.toLowerCase(), def);
        // ExMode 中はモディファイアを付加したキーでも合致させる
        if (this.Status.ExMode && this.Status.ExModeModKey) {
          const merged = `${this.Status.ExModeModKey}+${key}`.toLowerCase();
          add(merged, def);
        }
      }
    }
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    const key = normalizeKeyEvent(e);
    if (!key) return;
    this.Status.LastKey = key;
    this.OnStatusChanged();

    // ExMode 中の単独キーはモディファイアをマージして判定
    const lookupKeys = [key];
    if (this.Status.ExMode && this.Status.ExModeModKey && !key.includes('+')) {
      lookupKeys.unshift(`${this.Status.ExModeModKey}+${key}`);
    }

    const focus = this.Status.Focus;
    const editable = isEditableElement(document.activeElement);

    for (const lk of lookupKeys) {
      const defs = this._activeTable.get(lk);
      if (!defs) continue;

      // 1. フォーカス固有ショートカット
      for (const def of defs) {
        if (def.focus !== '*' && this._focusMatches(def.focus, focus)) {
          this._fire(def, e);
          return;
        }
      }
      // 2. ExMode グローバル / 3. 通常グローバル
      for (const def of defs) {
        if (def.focus !== '*') continue;
        const isExModeAction = def.actionId.startsWith('ExMode.');
        if (this.Status.ExMode || isExModeAction) {
          this._fire(def, e);
          return;
        }
        if (!editable) {
          this._fire(def, e);
          return;
        }
        // 入力フォーム内では TextEditor 用アクションのみバイパス
        if (def.actionId.startsWith('TextEditor.') && document.activeElement?.closest('.monaco-editor')) {
          this._fire(def, e);
          return;
        }
      }
    }
  };

  private _fire(def: ShortcutDef, e: KeyboardEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.Status.LastAction = def.actionId;
    this._actions.Execute(def.actionId);
    this.OnStatusChanged();
  }
}

/** デフォルトショートカット定義（__tt_shortcuts__ の初期値） */
export const DEFAULT_SHORTCUTS: ShortcutDef[] = [
  // ── パネル開閉 ──
  { key: 'ctrl+alt+1', focus: '*', actionId: 'Panel.Thinktank.Toggle', description: 'Thinktankパネル開閉' },
  { key: 'ctrl+alt+2', focus: '*', actionId: 'Panel.Overview.Toggle', description: 'Overviewパネル開閉' },
  { key: 'ctrl+alt+3', focus: '*', actionId: 'Panel.WorkoutSetting.Toggle', description: 'Workout設定トレイ開閉' },
  { key: 'ctrl+alt+4', focus: '*', actionId: 'Panel.ReThink.Toggle', description: 'ReThinkパネル開閉' },
  { key: 'ctrl+alt+l', focus: '*', actionId: 'Application.LayoutMode.Toggle', description: 'レイアウトモード切替' },
  // ── 保存 ──
  { key: 'ctrl+s', focus: 'Workout', actionId: 'Workout.SaveFocused', description: 'フォーカス中ペインを保存' },
  // ── ペイン操作 ──
  { key: 'ctrl+alt+w', focus: 'Workout', actionId: 'Workout.CloseFocused', description: 'フォーカス中ペインを閉じる' },
  { key: 'ctrl+alt+e', focus: '*', actionId: 'Workout.Equalize', description: 'ペイン幅の均等化' },
  // ── TextEditor: 見出し開閉制御 ──
  { key: 'ctrl+alt+[', focus: 'Workout.TextEditor', actionId: 'TextEditor.Folding.CloseEachLevel', description: '見出しの段階的折りたたみ' },
  { key: 'ctrl+alt+]', focus: 'Workout.TextEditor', actionId: 'TextEditor.Folding.OpenEachLevel', description: '見出しの段階的展開' },
  { key: 'ctrl+alt+arrowup', focus: 'Workout.TextEditor', actionId: 'TextEditor.Heading.Previous', description: '前の表示見出しへ移動' },
  { key: 'ctrl+alt+arrowdown', focus: 'Workout.TextEditor', actionId: 'TextEditor.Heading.Next', description: '次の表示見出しへ移動' },
  { key: 'ctrl+alt+arrowleft', focus: 'Workout.TextEditor', actionId: 'TextEditor.Heading.Parent', description: '親見出しへ移動' },
  // ── DataGrid ──
  { key: 'enter|f2', focus: 'Workout.DataGrid', actionId: 'DataGrid.EditCell', description: 'セルの編集' },
  { key: 'ctrl+enter', focus: 'Workout.DataGrid', actionId: 'DataGrid.AddRow', description: '行を追加' },
  { key: 'ctrl+shift+enter', focus: 'Workout.DataGrid', actionId: 'DataGrid.AddColumn', description: '列を追加' },
  { key: 'ctrl+delete', focus: 'Workout.DataGrid', actionId: 'DataGrid.DeleteRow', description: '行を削除' },
  // ── UI状態 Undo/Redo ──
  { key: 'ctrl+alt+z', focus: '*', actionId: 'UIState.Undo', description: 'UI状態を元に戻す' },
  { key: 'ctrl+alt+y', focus: '*', actionId: 'UIState.Redo', description: 'UI状態をやり直す' },
];

/** ショートカット定義を __tt_shortcuts__ テーブル形式にシリアライズ */
export function serializeShortcuts(defs: ShortcutDef[]): string {
  const esc = (s: string) => (s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ['__tt_shortcuts__', '# ショートカット定義', '> key,focus,action,description'];
  for (const d of defs) lines.push([d.key, d.focus, d.actionId, d.description].map(esc).join(','));
  return lines.join('\n');
}

export function parseShortcuts(content: string): ShortcutDef[] {
  const defs: ShortcutDef[] = [];
  const lines = content.split('\n');
  let headerSeen = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!headerSeen) {
      if (trimmed.startsWith('>')) headerSeen = true;
      continue;
    }
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    // RFC4180 互換の簡易split
    const cells: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < trimmed.length; i++) {
      const c = trimmed[i];
      if (q) {
        if (c === '"') {
          if (trimmed[i + 1] === '"') { cur += '"'; i++; } else q = false;
        } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { cells.push(cur); cur = ''; }
      else cur += c;
    }
    cells.push(cur);
    if (cells.length >= 3) {
      defs.push({
        key: cells[0].trim(),
        focus: cells[1].trim(),
        actionId: cells[2].trim(),
        description: cells[3]?.trim() ?? '',
      });
    }
  }
  return defs;
}
