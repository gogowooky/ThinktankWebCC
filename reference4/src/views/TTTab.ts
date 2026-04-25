/**
 * TTTab.ts
 * メインパネルの1タブを表すビューモデル。
 * 各タブは1つの pickup データ（ContentType=pickup）を持ち、
 * その中のアイテムを1件ずつ表示する。
 *
 * Phase 4: 基本フィールドと表示タイトル
 * Phase 9Ex1: GroupID / CurrentItemID / NavigationHistory を追加
 * Phase 7 以降: TextEditorView / MarkdownView 等のコンテンツビューと接続
 */

import { TTObject } from '../models/TTObject';
import type { ViewType } from '../types';

export class TTTab extends TTObject {
  /** ビュー種別（ContentType に対応した表示メディアを選択）*/
  public ViewType: ViewType = 'datagrid';

  /**
   * グループ（pickup）データの ID。
   * このタブが表示するアイテム集合を定義する pickup ファイルの ID。
   * 空文字の場合は「全データ対象」（空のpickup相当）。
   */
  public GroupID: string = '';

  /**
   * 現在表示中のアイテム ID（TTDataItem.ID）。
   * グループ内の1件を選択して表示する。
   * 空文字の場合はグループのリスト表示（DataGrid 等）。
   */
  public CurrentItemID: string = '';

  /**
   * 表示アイテムの履歴スタック（← → ナビゲーション用）。
   * CurrentItemID が変わるたびに追記する。
   * 最大 100 件（古いものから削除）。
   */
  private _navHistory: string[] = [];
  private _navIndex: number = -1;

  /**
   * @deprecated GroupID に移行。後方互換のため残す。
   * ResourceID と GroupID は同期される。
   */
  public get ResourceID(): string { return this.GroupID; }
  public set ResourceID(v: string) { this.GroupID = v; }

  /** コンテンツのオンデマンドロード中フラグ */
  public IsLoading: boolean = false;

  /** 未保存変更フラグ */
  public IsDirty: boolean = false;

  public override get ClassName(): string {
    return 'TTTab';
  }

  constructor(groupId: string = '', viewType: ViewType = 'datagrid') {
    super();
    this.ID = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.GroupID = groupId;
    this.ViewType = viewType;
    this.Name = '新規タブ';
  }

  /** タブバーに表示するラベル（IsDirty=true のとき先頭に ● を付ける）*/
  public get DisplayTitle(): string {
    return this.IsDirty ? `● ${this.Name}` : this.Name;
  }

  // ── ナビゲーション履歴 ────────────────────────────────────────────

  /** 現在の履歴スタック（読み取り専用）*/
  public get NavigationHistory(): ReadonlyArray<string> {
    return this._navHistory;
  }

  /** ← で戻れるか */
  public get CanGoBack(): boolean {
    return this._navIndex > 0;
  }

  /** → で進めるか */
  public get CanGoForward(): boolean {
    return this._navIndex < this._navHistory.length - 1;
  }

  /**
   * アイテムを表示する（履歴に追加）。
   * 現在位置より先の履歴は削除される（ブラウザの戻る/進むと同じ挙動）。
   */
  public NavigateTo(itemId: string): void {
    // 同一アイテムなら何もしない
    if (this.CurrentItemID === itemId) return;

    // 現在位置より先の履歴を切り捨て
    this._navHistory.splice(this._navIndex + 1);

    this._navHistory.push(itemId);
    if (this._navHistory.length > 100) this._navHistory.shift();
    this._navIndex = this._navHistory.length - 1;

    this.CurrentItemID = itemId;
    this.NotifyUpdated();
  }

  /** ← 戻る */
  public GoBack(): void {
    if (!this.CanGoBack) return;
    this._navIndex--;
    this.CurrentItemID = this._navHistory[this._navIndex];
    this.NotifyUpdated();
  }

  /** → 進む */
  public GoForward(): void {
    if (!this.CanGoForward) return;
    this._navIndex++;
    this.CurrentItemID = this._navHistory[this._navIndex];
    this.NotifyUpdated();
  }
}
