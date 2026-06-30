/**
 * TTWorkoutArea.ts
 * WorkoutPanel の 1エリア管理ビューモデル。
 *
 * 位置情報は BSP ツリーが管理するため、このクラスは持たない。
 */

import { TTUIItem } from '../models/TTUIItem';
import type { MediaType } from '../types';

export class TTWorkoutArea extends TTUIItem {
  private static _areaCounter = 0;

  /** 表示形式 */
  public MediaType: MediaType = 'texteditor';

  /** 表示中のThinkデータID（空 = 未設定）*/
  public ResourceID: string = '';

  /** コンテンツロード中フラグ */
  public IsLoading: boolean = false;

  /** エディタに未保存変更があるフラグ（WorkoutArea.tsx が同期する）*/
  public IsDirty: boolean = false;

  /** Area 表示タイトル */
  public Title: string = '';

  public override get ClassName(): string {
    return 'TTWorkoutArea';
  }

  constructor() {
    super();
    this.ID    = `${this.getNowString()}-${++TTWorkoutArea._areaCounter}`;
    this.Name  = 'WorkoutArea';
    this.Title = '';
  }

  // ── 操作 ────────────────────────────────────────────────────────────

  /** Think データをこの Area で開く */
  public OpenThink(resourceId: string, mediaType: MediaType, title: string = ''): void {
    this.ResourceID = resourceId;
    this.MediaType  = mediaType;
    this.Title      = title;
    this.NotifyUpdated();
  }

  /** エリアをクリアする（未設定状態に戻す）*/
  public Clear(): void {
    this.ResourceID = '';
    this.Title      = '';
    this.IsLoading  = false;
    this.NotifyUpdated();
  }
}
