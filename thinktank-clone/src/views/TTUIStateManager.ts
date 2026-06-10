// UI設定（__tt_ui_state__）の管理、状態変更通知、Undo/Redo（仕様書04 §1）

import type { TTApplication } from './TTApplication';

export interface PropSpec {
  panel: string;
  default: string;
  type: 'boolean' | 'string' | 'color' | 'json';
  candidates?: string;
  description: string;
  get: (app: TTApplication) => string;
  set: (app: TTApplication, value: string) => void;
}

type Listener = (key: string, value: string) => void;

const BOOL = '^(true|false)$';

/** 設定項目定義の一元集約（仕様書04 §1.1） */
export function buildPropSpecs(): Map<string, PropSpec> {
  const specs = new Map<string, PropSpec>();

  const boolProp = (
    key: string, panel: string, def: string, description: string,
    get: (app: TTApplication) => boolean,
    set: (app: TTApplication, v: boolean) => void,
  ) => {
    specs.set(key, {
      panel, default: def, type: 'boolean', candidates: BOOL, description,
      get: (app) => String(get(app)),
      set: (app, v) => set(app, v === 'true'),
    });
  };

  boolProp('ThinktankPanel.Open', 'ThinktankPanel', 'true', '左パネル表示',
    (a) => a.ThinktankOpen, (a, v) => { a.ThinktankOpen = v; });
  boolProp('OverviewPanel.Open', 'OverviewPanel', 'true', 'Overviewパネル表示',
    (a) => a.OverviewOpen, (a, v) => { a.OverviewOpen = v; });
  boolProp('ReThinkPanel.Open', 'ReThinkPanel', 'true', 'ReThinkパネル表示',
    (a) => a.ReThinkOpen, (a, v) => { a.ReThinkOpen = v; });
  boolProp('WorkoutPanel.SettingOpen', 'WorkoutPanel', 'false', 'Workout設定トレイ表示',
    (a) => a.WorkoutSettingOpen, (a, v) => { a.WorkoutSettingOpen = v; });
  boolProp('Application.CloudSyncEnabled', 'Application', 'true', 'クラウド同期の有効化',
    (a) => a.CloudSyncEnabled, (a, v) => { a.CloudSyncEnabled = v; });

  specs.set('Application.LayoutMode', {
    panel: 'Application', default: 'standard', type: 'string',
    candidates: '^(standard|compact)$', description: 'レイアウトモード',
    get: (a) => a.LayoutMode,
    set: (a, v) => { a.LayoutMode = v === 'compact' ? 'compact' : 'standard'; },
  });

  specs.set('ThinktankPanel.Width', {
    panel: 'ThinktankPanel', default: '240', type: 'string',
    candidates: '^\\d+$', description: '左パネル幅',
    get: (a) => String(a.ThinktankWidth),
    set: (a, v) => { a.ThinktankWidth = parseInt(v, 10) || 240; },
  });
  specs.set('OverviewPanel.Width', {
    panel: 'OverviewPanel', default: '260', type: 'string',
    candidates: '^\\d+$', description: 'Overviewパネル幅',
    get: (a) => String(a.OverviewWidth),
    set: (a, v) => { a.OverviewWidth = parseInt(v, 10) || 260; },
  });
  specs.set('ReThinkPanel.Width', {
    panel: 'ReThinkPanel', default: '260', type: 'string',
    candidates: '^\\d+$', description: 'ReThinkパネル幅',
    get: (a) => String(a.ReThinkWidth),
    set: (a, v) => { a.ReThinkWidth = parseInt(v, 10) || 260; },
  });

  return specs;
}

export class TTUIStateManager {
  private _app: TTApplication;
  private _specs: Map<string, PropSpec>;
  private _listeners = new Map<string, Set<Listener>>();
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _undoStack: string[] = [];
  private _redoStack: string[] = [];

  constructor(app: TTApplication) {
    this._app = app;
    this._specs = buildPropSpecs();
  }

  get Specs(): Map<string, PropSpec> {
    return this._specs;
  }

  GetProperty(key: string): string {
    const spec = this._specs.get(key);
    if (!spec) return '';
    return spec.get(this._app);
  }

  /** 値の適用＋通知＋デバウンス保存（仕様書04 §1.3） */
  ApplyProperty(key: string, value: string, recordHistory = true): boolean {
    const spec = this._specs.get(key);
    if (!spec) return false;
    if (spec.candidates && !new RegExp(spec.candidates).test(value)) return false;
    if (recordHistory) {
      this._undoStack.push(this.Serialize());
      if (this._undoStack.length > 50) this._undoStack.shift();
      this._redoStack = [];
    }
    spec.set(this._app, value);
    this._dispatch(key, value);
    this._scheduleSave();
    this._app.NotifyUpdated(false);
    return true;
  }

  Undo(): void {
    const prev = this._undoStack.pop();
    if (prev === undefined) return;
    this._redoStack.push(this.Serialize());
    this.DeserializeAndApply(prev);
  }

  Redo(): void {
    const next = this._redoStack.pop();
    if (next === undefined) return;
    this._undoStack.push(this.Serialize());
    this.DeserializeAndApply(next);
  }

  /** Pub/Sub: ワイルドカード（`Panel.*`, `*`）対応（仕様書04 §1.2） */
  AddListener(key: string, listener: Listener): () => void {
    if (!this._listeners.has(key)) this._listeners.set(key, new Set());
    this._listeners.get(key)!.add(listener);
    return () => this._listeners.get(key)?.delete(listener);
  }

  private _dispatch(key: string, value: string): void {
    this._listeners.get(key)?.forEach((l) => l(key, value));
    const panel = key.split('.')[0];
    this._listeners.get(`${panel}.*`)?.forEach((l) => l(key, value));
    this._listeners.get('*')?.forEach((l) => l(key, value));
  }

  /** key,current,default,type,description のテーブル形式でシリアライズ */
  Serialize(): string {
    const lines = ['__tt_ui_state__', '# UI状態（自動生成）', '> key,current,default,type,description'];
    for (const [key, spec] of this._specs) {
      const cur = spec.get(this._app);
      lines.push(`${key},${cur},${spec.default},${spec.type},${spec.description}`);
    }
    return lines.join('\n');
  }

  DeserializeAndApply(content: string): void {
    const lines = content.split('\n');
    let headerSeen = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!headerSeen) {
        if (trimmed.startsWith('>')) headerSeen = true;
        continue;
      }
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
      const cells = trimmed.split(',');
      if (cells.length >= 2) {
        this.ApplyProperty(cells[0].trim(), cells[1].trim(), false);
      }
    }
  }

  LoadFromLocalStorage(): void {
    try {
      const saved = localStorage.getItem('__tt_ui_state__');
      if (saved) this.DeserializeAndApply(saved);
      const layoutMode = localStorage.getItem('tt-layout-mode');
      if (layoutMode) this.ApplyProperty('Application.LayoutMode', layoutMode, false);
    } catch {
      // localStorage 不可の環境では無視
    }
  }

  private _scheduleSave(): void {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try {
        localStorage.setItem('__tt_ui_state__', this.Serialize());
        localStorage.setItem('tt-layout-mode', this._app.LayoutMode);
      } catch {
        // 無視
      }
      void this._app.SaveUIStateThink();
    }, 500);
  }
}
