/**
 * TTWorkoutArea.ts
 * WorkoutPanel の 1エリア管理ビューモデル。
 *
 * 位置情報は BSP ツリーが管理するため、このクラスは持たない。
 */

import { TTUIItem } from '../models/TTUIItem';
import type { MediaType } from '../types';

/** Loadファイル履歴の1エントリ。IDに加え、Load時点の表示形式・タイトルも復元できるよう保持する */
export interface FileHistoryEntry {
  id:        string;
  mediaType: MediaType;
  title:     string;
}

/** Pane毎に保持するLoadファイル履歴の最大件数 */
export const FILE_HISTORY_MAX = 30;

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

  /** このPaneでLoadしたファイルの履歴（古い順・最大 FILE_HISTORY_MAX 件） */
  public FileHistory: FileHistoryEntry[] = [];

  /** 履歴内の現在位置（1始まり。0 = 履歴なし） */
  public HistoryPos: number = 0;

  /** 履歴の件数（= 最終位置） */
  public get HistoryMax(): number { return this.FileHistory.length; }

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

  /**
   * Think データをこの Area で開く。
   *
   * @param recordHistory false の場合はファイル履歴に記録しない
   *                      （履歴移動そのものによる Load で履歴が増えるのを防ぐ）
   */
  public OpenThink(resourceId: string, mediaType: MediaType, title: string = '', recordHistory: boolean = true): void {
    this.ResourceID = resourceId;
    this.MediaType  = mediaType;
    this.Title      = title;
    if (recordHistory) this._pushHistory(resourceId, mediaType, title);
    this.NotifyUpdated();
  }

  /** 履歴の指定位置（1始まり）のファイルをLoadする。位置が範囲外なら何もしない */
  public LoadHistoryAt(pos: number): FileHistoryEntry | null {
    const entry = this.FileHistory[pos - 1];
    if (!entry) return null;
    this.HistoryPos = pos;
    this.OpenThink(entry.id, entry.mediaType, entry.title, false);
    return entry;
  }

  /** Loadされたファイルを履歴末尾に追加し、HistoryPos を末尾に合わせる */
  private _pushHistory(resourceId: string, mediaType: MediaType, title: string): void {
    if (!resourceId) return;

    // 同一ファイルの再Loadでは履歴を増やさず、表示形式・タイトルのみ最新化する
    const current = this.FileHistory[this.HistoryPos - 1];
    if (current && current.id === resourceId) {
      current.mediaType = mediaType;
      current.title     = title;
      return;
    }

    this.FileHistory = [...this.FileHistory, { id: resourceId, mediaType, title }];
    // 上限超過時は先頭を捨てて末尾に詰める（HistoryPos/HistoryMax は上限値のまま）
    if (this.FileHistory.length > FILE_HISTORY_MAX) {
      this.FileHistory = this.FileHistory.slice(this.FileHistory.length - FILE_HISTORY_MAX);
    }
    this.HistoryPos = this.FileHistory.length;
  }

  /** エリアをクリアする（未設定状態に戻す）*/
  public Clear(): void {
    this.ResourceID = '';
    this.Title      = '';
    this.IsLoading  = false;
    this.NotifyUpdated();
  }
}
