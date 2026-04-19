/**
 * TTApplication.ts
 * アプリケーション最上位コントローラ（シングルトン）。
 *
 * - AppMode（pwa / local）を window 変数から検出する
 * - TTModels・TTMainPanel・TTLeftPanel・TTRightPanel を保持する
 * - OpenItem() でアイテムをメインパネルに開く
 *
 * Phase 4: 骨格実装
 * Phase 13 以降: OpenItem() が StorageManager 経由でコンテンツをロードする
 * Phase 30 以降: DispatchAction() / GetContext() を追加
 */

import { TTObject } from '../models/TTObject';
import { TTModels } from '../models/TTModels';
import { TTMainPanel } from './TTMainPanel';
import { TTLeftPanel } from './TTLeftPanel';
import { TTRightPanel } from './TTRightPanel';
import type { AppMode, ViewType } from '../types';

export class TTApplication extends TTObject {
  private static _instance: TTApplication | null = null;

  /** 動作モード（window.__THINKTANK_MODE__ から取得）*/
  public readonly AppMode: AppMode;

  /** ローカル API の URL（Local モード時のみ設定）*/
  public readonly LocalApiUrl: string | null;

  /** データモデルルート */
  public readonly Models: TTModels;

  /** メインパネルビューモデル */
  public readonly MainPanel: TTMainPanel;

  /** 左パネルビューモデル */
  public readonly LeftPanel: TTLeftPanel;

  /** 右パネルビューモデル */
  public readonly RightPanel: TTRightPanel;

  public override get ClassName(): string {
    return 'TTApplication';
  }

  private constructor() {
    super();
    this.ID = 'Application';
    this.Name = 'Thinktank';

    // モード検出
    this.AppMode    = (window as Window).__THINKTANK_MODE__ ?? 'pwa';
    this.LocalApiUrl = (window as Window).__THINKTANK_LOCAL_API__ ?? null;

    // モデル・パネル初期化
    this.Models     = TTModels.Instance;
    this.MainPanel  = new TTMainPanel();
    this.LeftPanel  = new TTLeftPanel();
    this.RightPanel = new TTRightPanel();

    // 子パネルの更新が TTApplication にも伝播するよう親を設定
    this.MainPanel._parent = this;
    this.LeftPanel._parent = this;
    this.RightPanel._parent = this;

    console.log(`[TTApplication] initialized: mode=${this.AppMode}${this.LocalApiUrl ? `, api=${this.LocalApiUrl}` : ''}`);
  }

  /** シングルトンインスタンスを取得する */
  public static get Instance(): TTApplication {
    if (!TTApplication._instance) {
      TTApplication._instance = new TTApplication();
    }
    return TTApplication._instance;
  }

  /** テスト用: インスタンスをリセットする */
  public static resetInstance(): void {
    TTApplication._instance = null;
    TTModels.resetInstance();
  }

  // ── アイテム操作 ─────────────────────────────────────────────────

  /**
   * 指定 ID のアイテムをメインパネルで開く。
   * - 対応する TTDataItem を Models.Memos から検索する。
   * - Phase 13 以降: IsMetaOnly=true の場合は LoadContent() を呼ぶ。
   *
   * @param resourceId  TTDataItem.ID
   * @param viewType    ビュー種別（省略時: texteditor）
   */
  public OpenItem(resourceId: string, viewType: ViewType = 'texteditor'): void {
    const item = this.Models.Memos.GetDataItem(resourceId);
    const title = item?.Name ?? resourceId;
    const tab = this.MainPanel.OpenTab(resourceId, title, viewType);

    // Phase 13 以降: コンテンツ未ロードなら非同期でフェッチ
    if (item?.IsMetaOnly && !tab.IsLoading) {
      tab.IsLoading = true;
      tab.Name = title;
      this.MainPanel.NotifyUpdated();
      item.LoadContent().then(() => {
        tab.IsLoading = false;
        tab.Name = item.Name;
        this.MainPanel.NotifyUpdated();
      });
    }

    // 左パネルの選択アイテムも更新
    this.LeftPanel.SelectItem(resourceId);
  }

  /**
   * DataGrid ビューをメインパネルで開く。
   * 既に DataGrid タブが開いていればそちらにスイッチする。
   */
  public OpenDataGrid(): void {
    this.MainPanel.OpenTab('__datagrid__', 'データグリッド', 'datagrid');
  }

  /**
   * アクティブタブのアイテムを取得する。
   * メインパネルにタブが開いていなければ null を返す。
   */
  public get ActiveItem() {
    const tab = this.MainPanel.ActiveTab;
    if (!tab?.ResourceID) return null;
    return this.Models.Memos.GetDataItem(tab.ResourceID) ?? null;
  }
}
