/**
 * TTWorkoutPanel.ts
 * Phase 4: WorkoutArea群を管理するビューモデル。
 *
 * 最大2列×3行=6エリアを動的に管理する。
 * ドラッグ移動・グリッドレイアウト再計算を担当。
 */

import { TTObject } from '../models/TTObject';
import { TTWorkoutArea } from './TTWorkoutArea';
import type { MediaType } from '../types';

const MAX_AREAS = 6;

export class TTWorkoutPanel extends TTObject {
  /** WorkoutArea一覧（最大6個）*/
  public Areas: TTWorkoutArea[] = [];

  public override get ClassName(): string {
    return 'TTWorkoutPanel';
  }

  constructor() {
    super();
    this.ID = 'WorkoutPanel';
    this.Name = 'WorkoutPanel';
  }

  // ── Area CRUD ─────────────────────────────────────────────────────────

  /**
   * 新しいWorkoutAreaを追加して開く。
   * @returns 追加された TTWorkoutArea（満杯の場合は null）
   */
  public AddArea(resourceId: string, mediaType: MediaType, title: string = ''): TTWorkoutArea | null {
    if (this.Areas.length >= MAX_AREAS) return null;

    const area = new TTWorkoutArea();
    area._parent = this;
    area.OpenThink(resourceId, mediaType, title);
    this.Areas.push(area);
    this.ReorderAreas();
    this.NotifyUpdated();
    return area;
  }

  /**
   * 指定IDのAreaを削除する。
   */
  public RemoveArea(areaId: string): void {
    this.Areas = this.Areas.filter(a => a.ID !== areaId);
    this.ReorderAreas();
    this.NotifyUpdated();
  }

  /**
   * AreaをIDで取得する。
   */
  public GetArea(areaId: string): TTWorkoutArea | undefined {
    return this.Areas.find(a => a.ID === areaId);
  }

  // ── ドラッグ移動 ──────────────────────────────────────────────────────

  /**
   * 2つのAreaの位置を入れ替える（ドラッグ&ドロップ完了時に呼ぶ）。
   * @param fromId ドラッグ元のAreaID
   * @param toId ドロップ先のAreaID
   */
  public MoveArea(fromId: string, toId: string): void {
    const fromIdx = this.Areas.findIndex(a => a.ID === fromId);
    const toIdx = this.Areas.findIndex(a => a.ID === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

    // 配列内の位置を入れ替え
    const temp = this.Areas[fromIdx];
    this.Areas[fromIdx] = this.Areas[toIdx];
    this.Areas[toIdx] = temp;

    this.ReorderAreas();
    this.NotifyUpdated();
  }

  // ── グリッドレイアウト再計算 ──────────────────────────────────────────

  /**
   * Areas配列の順番をもとにグリッド位置（row/col）とRowSpanを再計算する。
   *
   * RowSpan=2のエリアは1行全体（col:0固定）を占有する。
   * それ以外は左→右→次の行の順で詰める。
   */
  public ReorderAreas(): void {
    let row = 0;
    let col = 0;

    for (const area of this.Areas) {
      area.UpdateRowSpan();

      if (area.RowSpan === 2) {
        // 行全体を占有 → colが1の場合は次行に送る
        if (col === 1) {
          row++;
          col = 0;
        }
        area.SetPosition(row, 0);
        row++;
        col = 0;
      } else {
        area.SetPosition(row, col);
        col++;
        if (col >= 2) {
          col = 0;
          row++;
        }
      }
    }
  }

  /** 現在のArea数が上限に達しているか */
  public get IsFull(): boolean {
    return this.Areas.length >= MAX_AREAS;
  }

  /** 全Areaをクリアする */
  public ClearAll(): void {
    this.Areas = [];
    this.NotifyUpdated();
  }
}
