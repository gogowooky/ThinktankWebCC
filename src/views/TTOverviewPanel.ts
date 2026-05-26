/**
 * TTOverviewPanel.ts
 * Phase 4: OverviewPanelのビューモデル。
 *
 * 選択されたThoughtの内容表示・分析モードと
 * OverviewAreaの開閉状態を管理する。
 */

import { TTUIItem } from '../models/TTUIItem';
import type { MediaType } from '../types';

export type OverviewViewMode = 'datagrid' | 'graph' | 'chat' | 'settings' | 'timeline';

export class TTOverviewPanel extends TTUIItem {
  /** OverviewAreaの開閉状態（true=開いている）*/
  public IsAreaOpen: boolean = true;

  /** 表示中のThoughtID（空 = 未選択）*/
  public ThoughtID: string = '';

  /** 表示モード（datagrid/graph/chat/settings/timeline）*/
  public ViewMode: OverviewViewMode = 'datagrid';

  /** MediaTypeの後方互換ゲッター（ViewModeから導出）*/
  public get MediaType(): MediaType {
    if (this.ViewMode === 'settings' || this.ViewMode === 'timeline') {
      return 'datagrid';
    }
    return this.ViewMode as MediaType;
  }

  /** 全文検索テキスト */
  public SearchQuery: string = '';

  public override get ClassName(): string {
    return 'TTOverviewPanel';
  }

  constructor() {
    super();
    this.ID = 'OverviewPanel';
    this.Name = 'OverviewPanel';
  }

  // ── Area開閉 ──────────────────────────────────────────────────────────

  /** OverviewAreaの開閉を切り替える */
  public ToggleArea(): void {
    this.IsAreaOpen = !this.IsAreaOpen;
    this.NotifyUpdated();
  }

  /** OverviewAreaを開く */
  public OpenArea(): void {
    if (!this.IsAreaOpen) {
      this.IsAreaOpen = true;
      this.NotifyUpdated();
    }
  }

  /** OverviewAreaを閉じる */
  public CloseArea(): void {
    if (this.IsAreaOpen) {
      this.IsAreaOpen = false;
      this.NotifyUpdated();
    }
  }

  // ── Thought表示 ───────────────────────────────────────────────────────

  /**
   * ThoughtをOverviewAreaで開く。
   * Areaが閉じていれば自動的に開く。
   */
  public OpenThought(thoughtId: string, mediaType: MediaType = 'datagrid'): void {
    this.ThoughtID = thoughtId;
    if (mediaType !== 'settings' as string) {
      this.ViewMode = mediaType as OverviewViewMode;
    }
    if (!this.IsAreaOpen) {
      this.IsAreaOpen = true;
    }
    this.NotifyUpdated();
  }

  /** Thought表示をクリアする */
  public ClearThought(): void {
    this.ThoughtID = '';
    this.NotifyUpdated();
  }

  // ── 表示モード ────────────────────────────────────────────────────────

  /** 表示モードを切り替える */
  public SetViewMode(mode: OverviewViewMode): void {
    this.ViewMode = mode;
    this.NotifyUpdated();
  }

  /** 後方互換：MediaTypeで表示モードを設定（settingsモード以外） */
  public SetMediaType(mediaType: MediaType): void {
    this.ViewMode = mediaType as OverviewViewMode;
    this.NotifyUpdated();
  }

  // ── 全文検索 ──────────────────────────────────────────────────────────

  /** 全文検索クエリを更新する */
  public SetSearchQuery(query: string): void {
    this.SearchQuery = query;
    this.NotifyUpdated();
  }

  /** 全文検索をクリアする */
  public ClearSearch(): void {
    this.SearchQuery = '';
    this.NotifyUpdated();
  }
}
