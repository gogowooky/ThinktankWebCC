/**
 * TTMainPanel.ts
 * メインパネルのビューモデル。タブの開閉・切り替えを管理する。
 *
 * Phase 4: OpenTab / CloseTab / SwitchTab / NewTab
 * Phase 7 以降: コンテンツビュー（TextEditorView 等）と接続
 */

import { TTObject } from '../models/TTObject';
import { TTTab } from './TTTab';
import type { ViewType } from '../types';

export class TTMainPanel extends TTObject {
  private _tabs: TTTab[] = [];
  private _activeTabId: string = '';

  public override get ClassName(): string {
    return 'TTMainPanel';
  }

  constructor() {
    super();
    this.ID = 'MainPanel';
    this.Name = 'MainPanel';
  }

  // ── 読み取りプロパティ ─────────────────────────────────────────────

  /** タブ一覧（読み取り専用コピー）*/
  public get Tabs(): ReadonlyArray<TTTab> {
    return this._tabs;
  }

  /** アクティブタブ（なければ null）*/
  public get ActiveTab(): TTTab | null {
    return this._tabs.find(t => t.ID === this._activeTabId) ?? null;
  }

  /** アクティブタブのインデックス */
  public get ActiveTabIndex(): number {
    return this._tabs.findIndex(t => t.ID === this._activeTabId);
  }

  // ── タブ操作 ───────────────────────────────────────────────────────

  /**
   * 新規空タブを開く（全データ対象pickup タブ）。
   * @returns 作成した TTTab
   */
  public NewTab(viewType: ViewType = 'datagrid'): TTTab {
    const tab = new TTTab('', viewType);
    tab.Name = '新規タブ';
    this._tabs.push(tab);
    this._activeTabId = tab.ID;
    this.NotifyUpdated();
    return tab;
  }

  /**
   * pickup データを指定してタブを開く（pickup タブの主要な生成手段）。
   * - 既に同じ GroupID のタブがあれば、そちらにスイッチする（重複防止）。
   * @param groupId   pickup データの ID（空文字 = 全データ対象）
   * @param title     タブタイトル
   * @param viewType  初期ビュー種別（デフォルト: datagrid）
   */
  public OpenPickupTab(
    groupId: string,
    title: string = '',
    viewType: ViewType = 'datagrid'
  ): TTTab {
    const existing = this._tabs.find(t => t.GroupID === groupId);
    if (existing) {
      this._activeTabId = existing.ID;
      this.NotifyUpdated();
      return existing;
    }
    const tab = new TTTab(groupId, viewType);
    tab.Name = title || (groupId ? groupId : '全データ');
    this._tabs.push(tab);
    this._activeTabId = tab.ID;
    this.NotifyUpdated();
    return tab;
  }

  /**
   * 指定リソース ID のタブを開く。
   * - 既に同じ ResourceID のタブがあれば、そちらにスイッチする（重複防止）。
   * - なければ新しいタブを作成する。
   * @param resourceId  TTDataItem.ID
   * @param title       タブタイトル（省略時は resourceId）
   * @param viewType    ビュー種別（デフォルト: texteditor）
   * @returns 開いた TTTab
   */
  public OpenTab(
    resourceId: string,
    title: string = '',
    viewType: ViewType = 'texteditor'
  ): TTTab {
    // 既存タブを検索（同じ ResourceID + 同じ ViewType）
    const existing = this._tabs.find(
      t => t.ResourceID === resourceId && t.ViewType === viewType
    );
    if (existing) {
      this._activeTabId = existing.ID;
      this.NotifyUpdated();
      return existing;
    }

    // 新規タブ作成
    const tab = new TTTab(resourceId, viewType);
    tab.Name = title || resourceId || '新規タブ';
    this._tabs.push(tab);
    this._activeTabId = tab.ID;
    this.NotifyUpdated();
    return tab;
  }

  /**
   * 指定 ID のタブをアクティブにする。
   */
  public SwitchTab(tabId: string): void {
    if (!this._tabs.find(t => t.ID === tabId)) return;
    this._activeTabId = tabId;
    this.NotifyUpdated();
  }

  /**
   * 指定 ID のタブを閉じる。
   * - アクティブタブを閉じる場合は隣のタブに切り替える。
   * - タブが 0 になった場合は _activeTabId を空にする。
   */
  public CloseTab(tabId: string): void {
    const idx = this._tabs.findIndex(t => t.ID === tabId);
    if (idx === -1) return;

    const wasActive = this._activeTabId === tabId;
    this._tabs.splice(idx, 1);

    if (wasActive) {
      if (this._tabs.length === 0) {
        this._activeTabId = '';
      } else {
        // 閉じたタブの直前、なければ先頭に移動
        const nextIdx = Math.min(idx, this._tabs.length - 1);
        this._activeTabId = this._tabs[nextIdx].ID;
      }
    }

    this.NotifyUpdated();
  }

  /**
   * アクティブタブを閉じる。
   */
  public CloseActiveTab(): void {
    if (this._activeTabId) this.CloseTab(this._activeTabId);
  }

  /**
   * 全タブを閉じる。
   */
  public CloseAllTabs(): void {
    this._tabs = [];
    this._activeTabId = '';
    this.NotifyUpdated();
  }

  /**
   * アクティブタブの IsDirty フラグを更新する（TextEditor から呼ぶ）。
   */
  public SetActiveTabDirty(dirty: boolean): void {
    const tab = this.ActiveTab;
    if (!tab || tab.IsDirty === dirty) return;
    tab.IsDirty = dirty;
    this.NotifyUpdated();
  }

  /**
   * アクティブタブのビュー種別を切り替える（Editor ↔ Markdown トグル用）。
   */
  public SetActiveTabViewType(viewType: ViewType): void {
    const tab = this.ActiveTab;
    if (!tab || tab.ViewType === viewType) return;
    tab.ViewType = viewType;
    this.NotifyUpdated();
  }
}
