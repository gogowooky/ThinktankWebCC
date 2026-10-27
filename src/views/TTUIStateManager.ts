import { PROP_SPECS } from './settings/propSpecs';
import type { ConfigKey, ConfigListener, PropDef } from './settings/types';
export type { ConfigKey, ConfigListener } from './settings/types';
export { focusSelector } from './settings/stateHelpers';
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
 * 領域別の設定定義を settings/propSpecs.ts で同じ順序の PROP_SPECS に集約する。
 * このクラスは永続化・移行・Undo/Redoと通知を担当する。
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
import { parseTableContent, TableSection } from '../utils/tableFormat';

import localStatusContent from '../../docs/Thinktank_Status-Action-Binding.md?raw';

import { AI_CHAT_PROVIDER_NAMES, applyAiModelCatalog, applySelection, getModelNames, type AiChatProviderName } from '../services/aiChatModelStatus';
import { loadAiModelSelection } from '../services/aiModels';

import { canonicalPanelName, canonicalPanelStatusKey, canonicalPanelStatusList } from '../utils/panelNames';

function canonicalStateKey(key: string): ConfigKey {
  return canonicalPanelStatusKey(key) as ConfigKey;
}

function canonicalStateValue(key: ConfigKey, value: string): string {
  if (key === 'Application.FocusedPanel.Name') return canonicalPanelName(value);
  if (key === 'ToolBar.StatusMode.Text') return canonicalPanelStatusList(value);
  if (key === 'DiscussSettingPanel.Mode.Name' && ['workout', 'develop', 'discuss'].includes(value.toLowerCase())) return 'Panes';
  if (key.endsWith('.Mode.Name') && value.toLowerCase() === 'abstract') return 'Project';
  if (key === 'ToolBar.Mode.Name' && value === 'Translate') return 'Search';
  return value;
}

// ── TTUIStateManager ──────────────────────────────────────────────────────────

export class TTUIStateManager {
  static readonly THINK_ID = '__tt_ui_state__';
  private static readonly LS_KEY = 'tt-ui-state-v4';
  private static _instance: TTUIStateManager | null = null;

  private _app: TTApplication | null = null;
  private _applying = false;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _undoStack: string[] = [];
  private _redoStack: string[] = [];
  private _listeners = new Map<ConfigKey, Set<ConfigListener>>();

  static get instance(): TTUIStateManager {
    if (!TTUIStateManager._instance) {
      TTUIStateManager._instance = new TTUIStateManager();
    }
    return TTUIStateManager._instance;
  }

  private constructor() { }

  /**
   * 初期化。TTApplication.Instance 生成後に呼ぶ。
   * localStorage から即時ロードし、アプリ変更を debounce 保存する。
   */
  init(app: TTApplication): void {
    if (this._app && this._app !== app) this.detach(this._app);
    else app.RemoveOnUpdate('TTUIStateManager');
    this._app = app;
    this._loadFromLocalStorage();
    app.AddOnUpdate('TTUIStateManager', () => {
      if (this._applying) return;
      this._scheduleSave();
    });
  }

  detach(app: TTApplication): void {
    app.RemoveOnUpdate('TTUIStateManager');
    if (this._app !== app) return;
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = null;
    this._app = null;
    this._undoStack = [];
    this._redoStack = [];
  }

  /**
   * Vault 読み込み完了後に呼ぶ。UIState Think を作成/同期する。
   */
  async ensureThinkExists(_vault: TTVault): Promise<void> {
    this._applyContent(localStatusContent);
    const stored = localStorage.getItem(TTUIStateManager.LS_KEY);
    if (stored) {
      this._applyContent(stored);
    }
    if (!stored?.includes('.AIChat.ModelName')) this._migrateLegacyAiModels();
    this.refreshAiModelCatalog();
  }

  /**
   * 各社の主要モデル（AI_MODEL_CATALOG）で AIChat.ModelNames.* を揃え直す。
   * 起動時の md・保存値の適用より後に呼ぶ（保存済みの選択を先頭に残すため）。
   */
  refreshAiModelCatalog(): void {
    applyAiModelCatalog();
    const app = this._app;
    if (!app) return;
    for (const name of AI_CHAT_PROVIDER_NAMES) this._emit(`AIChat.ModelNames.${name}`, getModelNames(name));
    app.NotifyUpdated(false);
  }

  /**
   * 旧版は AIChat のモデル選択をパネルごとに localStorage（tt-ai-model-*）へ {provider, model} で
   * 保存していた。UI状態にまだ AIChat の Status が無い初回だけ、それを引き継ぐ。
   */
  private _migrateLegacyAiModels(): void {
    const app = this._app;
    if (!app) return;
    const legacy: [string, (name: AiChatProviderName) => void][] = [
      ['tt-ai-model-thinktank', n => { app.ThinktankPanel.AIChatProviderName = n; }],
      ['tt-ai-model-seeds', n => { app.SeedsPanel.AIChatProviderName = n; }],
      ['tt-ai-model-harvest', n => { app.HarvestPanel.AIChatProviderName = n; }],
      // Discuss は旧版で Pane と設定パネルが1つの選択を共有していた（さらに古いパネル名のキーも見る）
      ['tt-ai-model-discuss|tt-ai-model-develop|tt-ai-model-workout',
        n => { app.DiscussPanel.AIChatProviderName = n; app.DiscussPanel.SettingAIChatProviderName = n; }],
    ];
    let migrated = false;
    for (const [keys, set] of legacy) {
      let key: string | undefined;
      try {
        key = keys.split('|').find(k => localStorage.getItem(k) !== null);
      } catch {
        return;
      }
      if (!key) continue;
      set(applySelection(loadAiModelSelection(key)));
      migrated = true;
    }
    if (!migrated) return;
    this._saveToLocalStorage();
    app.NotifyUpdated(false);
  }

  /** DataGrid/Card が UIState Think を保存したときのフック（DiscussArea から呼ぶ）*/
  onThinkSaved(thinkId: string, content: string): void {
    if (thinkId !== TTUIStateManager.THINK_ID) return;
    this._pushUndo();
    this._applyContent(content);
    this._saveToLocalStorage();
  }

  /** ショートカット等からの単一プロパティ変更 */
  applyProperty(key: ConfigKey, value: string): void {
    if (!this._app) return;
    key = canonicalStateKey(key);
    value = canonicalStateValue(key, value);
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
  }

  /**
   * 複数プロパティを1回のUndo単位・1回の保存でまとめて適用する
   * （Vaultメモからの一括読込・Defaultへの一括リセット等、多数のキーを1操作で変える場合向け）。
   *
   * `pushUndo=false` を渡すとUndoスタックへの記録自体を省略する。ColorBinding.Load/Reset のように
   * 単一キーずつ applyProperty() をループ呼びすると1回の操作でUndoスタックが数十〜百件超も
   * 消費されてしまう（Ctrl+Zで全体を一度に戻せなくなる）ケースを避けるために使う。
   */
  applyProperties(entries: [ConfigKey, string][], pushUndo: boolean = true): void {
    if (!this._app) return;
    if (pushUndo) this._pushUndo();
    this._applying = true;
    const updatedKeys = new Set<ConfigKey>();
    try {
      for (const [key, value] of entries) {
        const currentKey = canonicalStateKey(key);
        this._applyProp(currentKey, canonicalStateValue(currentKey, value));
        updatedKeys.add(currentKey);
      }
      // Thinktank.Theme.* 等のパネル配色は、AppLayout.tsx がキー別リスナー経由でのみ
      // CSS変数を再適用するため、変更したキーそれぞれで _emit() を呼ぶ必要がある。
      for (const key of updatedKeys) {
        const val = PROP_SPECS[key]?.get(this._app) ?? '';
        this._emit(key, val);
      }
      this._app.NotifyUpdated(false);
    } finally {
      this._applying = false;
    }
    this._saveToLocalStorage();
  }

  /** 指定したキーの現在値を文字列で取得する */
  getProperty(key: ConfigKey): string {
    if (!this._app) return '';
    key = canonicalStateKey(key);
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

  /** 現在のアプリ状態をシリアライズして返す（更新ボタン用） */
  getLatestContent(): string | null {
    if (!this._app) return null;
    return this.serialize(this._app);
  }

  undo(): boolean {
    if (this._undoStack.length === 0 || !this._app) return false;
    const current = this.serialize(this._app);
    this._redoStack.push(current);
    const prev = this._undoStack.pop()!;
    this._applyContent(prev);
    this._saveToLocalStorage();
    return true;
  }

  redo(): boolean {
    if (this._redoStack.length === 0 || !this._app) return false;
    const current = this.serialize(this._app);
    this._undoStack.push(current);
    const next = this._redoStack.pop()!;
    this._applyContent(next);
    this._saveToLocalStorage();
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
        default: spec.default,
        type: spec.type,
        candidates: spec.candidates,
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
      const finalValue = value;
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
        .replace(/\bSeedsPanel\.Mode\.IsOpen\b/g, 'SeedsPanel.Area.IsOpen')
        .replace(/\bSeedsPanel\.IsAreaOpen\b/g, 'SeedsPanel.Area.IsOpen')
        .replace(/\bDiscussSettingPanel\.Mode\.IsOpen\b/g, 'DiscussSettingPanel.Area.IsOpen')
        .replace(/\bDiscussPanel\.IsAreaOpen\b/g, 'DiscussSettingPanel.Area.IsOpen')
        .replace(/\bHarvestPanel\.Mode\.IsOpen\b/g, 'HarvestPanel.Area.IsOpen')
        .replace(/\bHarvestPanel\.IsAreaOpen\b/g, 'HarvestPanel.Area.IsOpen')
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
        // 選択・出現・折畳は背景色を BgColor から <ID>.Theme.Color へ移した（Color と BgColor の役割を入れ替え）
        .replace(/\bTextEditor\.(Selection|Occurrence|FoldingHeader)\.(Color|BgColor|Attrs)\b/g,
          (_m, id: string, prop: string) => `TextEditor.${id}.Theme.${prop === 'Color' ? 'BgColor' : prop === 'BgColor' ? 'Color' : prop}`)
        // ToolBar の Translate モードは Search（キーワード検索）モードに改めた
        .replace(/\bToolBar\.TranslateMode\.Text\b/g, 'ToolBar.SearchMode.Text')
        .replace(/\bDiscussPanel\.Pane\.Count\b/g, 'DiscussPanel.Panes.Count')
        .replace(/\bDiscussPanel\.Pane\.Layout\b/g, 'DiscussPanel.Panes.Layout')
        .replace(/\bDiscussPanel\.Pane\.Display\b/g, 'DiscussPanel.Panes.Display')
        // パネル色は <Panel>.Theme.Color（基礎色）へ集約。旧 Area.BgColor は基礎色からの
        // 派生になったので引き継がない（旧キーは spec が無いため読み飛ばされる）。
        .replace(/\bThinktank\.Ribbon\.BgColor\b/g, 'Thinktank.Theme.Color')
        .replace(/\bSeeds\.Ribbon\.BgColor\b/g, 'Seeds.Theme.Color')
        .replace(/\bSeeds\.Bundle\.Name\b/g, 'SeedsPanel.Project.ID')
        .replace(/\bSeedsPanel\.Bundle\.Name\b/g, 'SeedsPanel.Project.ID')
        .replace(/\bSeedsPanel\.Bundle\.ID\b/g, 'SeedsPanel.Project.ID')
        .replace(/\bDiscuss\.Ribbon\.BgColor\b/g, 'Discuss.Theme.Color')
        .replace(/\bHarvest\.Ribbon\.BgColor\b/g, 'Harvest.Theme.Color')
        .replace(/\bToolBar\.BgColor\b/g, 'ToolBar.Theme.Color')
        .replace(/\bToolBar\.Color\b/g, 'ToolBar.Theme.BgColor');
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
        const key = canonicalStateKey(row[keyIdx]?.trim() ?? '');
        const spec = PROP_SPECS[key];
        if (!spec?.isConst) continue;
        const defaultVal = defIdx >= 0 ? (row[defIdx] ?? spec.default) : spec.default;
        this._applyProp(key, canonicalStateValue(key, defaultVal));
        updatedKeys.add(key);
      }

      // 旧キーからのマイグレーション用集計バッファ
      const oldHighlighters: Record<number, { color?: string; bgColor?: string; attrs?: string; }> = {};
      const oldHeadings: Record<number, { color?: string; bgColor?: string; attrs?: string; }> = {};

      // 2nd pass: 通常エントリ → current 列の値を適用
      for (const row of section.rows) {
        const key = canonicalStateKey(row[keyIdx]?.trim() ?? '');
        const val = canonicalStateValue(key, row[applyIdx] ?? '');
        if (!key) continue;

        // Highlighter 古いキーの検出とバッファリング
        let match = key.match(/^TextEditor\.Highlighter(\d+)\.(Color|BgColor|Attrs)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          const prop = match[2];
          if (!oldHighlighters[num]) oldHighlighters[num] = {};
          if (prop === 'Color') oldHighlighters[num].color = val;
          if (prop === 'BgColor') oldHighlighters[num].bgColor = val;
          if (prop === 'Attrs') oldHighlighters[num].attrs = val;
          continue;
        }

        // Heading 古いキーの検出とバッファリング
        match = key.match(/^TextEditor\.Heading(\d+)\.(Color|BgColor|Attrs)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          const prop = match[2];
          if (!oldHeadings[num]) oldHeadings[num] = {};
          if (prop === 'Color') oldHeadings[num].color = val;
          if (prop === 'BgColor') oldHeadings[num].bgColor = val;
          if (prop === 'Attrs') oldHeadings[num].attrs = val;
          continue;
        }

        const spec = PROP_SPECS[key];
        if (spec?.isConst) continue;
        this._applyProp(key, val);
        updatedKeys.add(key);
      }

      // 集計した古いキーを統合したStyleとして適用
      for (const [numStr, s] of Object.entries(oldHighlighters)) {
        const num = parseInt(numStr, 10);
        const color = s.color || 'undefined';
        const bgColor = s.bgColor || 'undefined';
        const attrs = s.attrs || 'none';
        const newKey = `TextEditor.Highlighter.Style${num}`;
        this._applyProp(newKey, `${color}, ${bgColor}, ${attrs}`);
        updatedKeys.add(newKey);
      }
      for (const [numStr, s] of Object.entries(oldHeadings)) {
        const num = parseInt(numStr, 10);
        const color = s.color || 'undefined';
        const bgColor = s.bgColor || 'undefined';
        const attrs = s.attrs || 'none';
        const newKey = `TextEditor.Heading.Style${num}`;
        this._applyProp(newKey, `${color}, ${bgColor}, ${attrs}`);
        updatedKeys.add(newKey);
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
    for (let i = 1;i < parts.length;i++) {
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

function extractValuesFromPattern(pattern: string): string[] {
  const match = pattern.match(/\^?\(([^)]+)\)\$?/);
  if (!match) return [];
  return match[1].split('|').map(v => v.trim());
}

function csvEscape(v: string): string {
  return v.includes(',') || v.includes('"') || v.includes('\n')
    ? `"${v.replace(/"/g, '""')}"` : v;
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

