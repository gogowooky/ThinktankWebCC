/**
 * TTApplicationStatus.ts
 * アプリケーション全体の特殊状態を管理するビューモデル。
 *
 * ExMode: モディファイアキーを保持している間だけ有効な一時モード。
 *   - _exMode    : 現在の ExMode 名（空文字 = 非アクティブ）
 *   - _exModeModKey : ExMode 設定時に押下されていたモディファイアキー文字列
 *   - SetExMode(name, modKey) : ExMode を開始する
 *   - ClearExMode()           : ExMode を終了する
 */

import { TTNotifyBase } from '../models/TTNotifyBase';
import { TTUIStateManager } from './TTUIStateManager';

export class TTApplicationStatus extends TTNotifyBase {
  private _exMode:            string = '';
  private _exModeModKey:      string = '';
  private _lastActionDisplay: string = '';
  private _localExporting:    string = '0%';

  private _syncState:         string = 'synced';

  get ExMode():            string { return this._exMode; }
  get ExModeModKey():      string { return this._exModeModKey; }
  get LastActionDisplay(): string { return this._lastActionDisplay; }
  get LocalExporting():    string { return this._localExporting; }
  get SyncState():         string { return this._syncState; }

  SetLocalExporting(v: string): void {
    this._localExporting = v;
    this.NotifyUpdated();
    TTUIStateManager.instance.notifyConstPropertyChanged('Application.Resource.LocalExporting');
  }

  SetSyncState(v: string): void {
    this._syncState = v;
    this.NotifyUpdated();
    TTUIStateManager.instance.notifyConstPropertyChanged('Application.Synchronization.Status');
  }

  /** ExMode を開始する。modKey には設定時点で押下中のモディファイア文字列を渡す。 */
  SetExMode(name: string, modKey: string): void {
    this._exMode       = name;
    this._exModeModKey = modKey;
    this.NotifyUpdated();
    TTUIStateManager.instance.notifyConstPropertyChanged('Application.Status.ExMode');
  }

  /** ExMode を終了してクリアする。すでに非アクティブな場合は何もしない。 */
  ClearExMode(): void {
    if (!this._exMode) return;
    this._exMode       = '';
    this._exModeModKey = '';
    this.NotifyUpdated();
    TTUIStateManager.instance.notifyConstPropertyChanged('Application.Status.ExMode');
  }

  /** 直近のアクション表示文字列を更新する（KeyAction パネルにリアルタイム表示）。 */
  SetLastActionDisplay(v: string): void {
    this._lastActionDisplay = v;
    this.NotifyUpdated();
  }
}
