/**
 * TTWorkoutArea.ts
 * Phase 4: WorkoutPanelの1エリア管理ビューモデル。
 *
 * WorkoutPanelは最大2列×3行=6エリアを持つ。
 * 各エリアは独立したRibbon+Areaと表示形式（MediaType）を持つ。
 */

import { TTObject } from '../models/TTObject';
import type { MediaType } from '../types';

export class TTWorkoutArea extends TTObject {
  /** 表示形式 */
  public MediaType: MediaType = 'texteditor';

  /** 表示中のThinkデータID（空 = 未設定）*/
  public ResourceID: string = '';

  /** コンテンツロード中フラグ */
  public IsLoading: boolean = false;

  /** グリッド位置（0-indexed）*/
  public Position: { row: number; col: number } = { row: 0, col: 0 };

  /**
   * 行スパン。
   * - 1: 通常（1セル分）
   * - 2: 表形式・グラフ形式（1行全体 = 2列分）
   */
  public RowSpan: 1 | 2 = 1;

  /** Area表示タイトル */
  public Title: string = '';

  public override get ClassName(): string {
    return 'TTWorkoutArea';
  }

  constructor() {
    super();
    this.ID = this.getNowString();
    this.Name = 'WorkoutArea';
    this.Title = '';
  }

  /**
   * ThinkデータをこのAreaで開く。
   * @param resourceId ThinkのID
   * @param mediaType 表示形式
   * @param title 表示タイトル
   */
  public OpenThink(resourceId: string, mediaType: MediaType, title: string = ''): void {
    this.ResourceID = resourceId;
    this.MediaType = mediaType;
    this.Title = title;
    this.NotifyUpdated();
  }

  /** エリアをクリアする（未設定状態に戻す）*/
  public Clear(): void {
    this.ResourceID = '';
    this.Title = '';
    this.IsLoading = false;
    this.NotifyUpdated();
  }

  /** グリッド位置を更新する */
  public SetPosition(row: number, col: number): void {
    this.Position = { row, col };
    this.NotifyUpdated();
  }

  /** RowSpanを更新する（datagrid/graphは2、それ以外は1）*/
  public UpdateRowSpan(): void {
    this.RowSpan = (this.MediaType === 'datagrid' || this.MediaType === 'graph') ? 2 : 1;
  }
}
