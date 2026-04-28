/**
 * TTOverviewPanel.ts
 * Phase 4: OverviewPanelのビューモデル。
 *
 * 選択されたThoughtの内容表示・分析モードと
 * OverviewAreaの開閉状態を管理する。
 */

import { TTObject } from '../models/TTObject';
import type { MediaType } from '../types';

export class TTOverviewPanel extends TTObject {
  /** OverviewAreaの開閉状態（true=開いている）*/
  public IsAreaOpen: boolean = true;

  /** 表示中のThoughtID（空 = 未選択）*/
  public ThoughtID: string = '';

  /**
   * 表示形式。
   * OverviewPanelで使用可能なMediaType:
   * - 'texteditor': テキスト編集
   * - 'markdown': Markdownレンダリング
   * - 'datagrid': Think一覧（表形式）
   * - 'graph': Thinkの関係グラフ
   */
  public MediaType: MediaType = 'markdown';

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
  public OpenThought(thoughtId: string, mediaType: MediaType = 'markdown'): void {
    this.ThoughtID = thoughtId;
    this.MediaType = mediaType;
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

  // ── 表示形式 ──────────────────────────────────────────────────────────

  /** 表示形式を切り替える */
  public SetMediaType(mediaType: MediaType): void {
    this.MediaType = mediaType;
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
