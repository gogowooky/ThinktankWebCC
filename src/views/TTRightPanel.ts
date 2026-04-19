/**
 * TTRightPanel.ts
 * 右パネルのビューモデル。
 * アウトライン / プロパティ / 関連 / チャット を切り替える。
 *
 * Phase 4: 状態管理（IsOpen / Width / PanelType / ChatMessages）
 * Phase 12 以降: OutlineView / PropertiesView / RelatedView / RightChatView と接続
 */

import { TTObject } from '../models/TTObject';
import type { RightPanelType, ChatMessage } from '../types';

export class TTRightPanel extends TTObject {
  /** パネルの開閉状態（デフォルト: 閉じている）*/
  public IsOpen: boolean = false;

  /** パネル幅（px）*/
  public Width: number = 240;

  /** 表示中のパネル種別 */
  public PanelType: RightPanelType = 'outline';

  /** 右パネルチャットのメッセージ履歴（RightChatView 用）*/
  public ChatMessages: ChatMessage[] = [];

  public override get ClassName(): string {
    return 'TTRightPanel';
  }

  constructor() {
    super();
    this.ID = 'RightPanel';
    this.Name = 'RightPanel';
  }

  // ── 操作 ──────────────────────────────────────────────────────────

  public Open(): void {
    if (this.IsOpen) return;
    this.IsOpen = true;
    this.NotifyUpdated();
  }

  public Close(): void {
    if (!this.IsOpen) return;
    this.IsOpen = false;
    this.NotifyUpdated();
  }

  public Toggle(): void {
    this.IsOpen ? this.Close() : this.Open();
  }

  /**
   * パネル種別を切り替える。
   * 同じ種別をクリックした場合は開閉トグル。
   */
  public SwitchTo(type: RightPanelType): void {
    if (this.PanelType === type && this.IsOpen) {
      this.Close();
      return;
    }
    this.PanelType = type;
    this.IsOpen = true;
    this.NotifyUpdated();
  }

  /** 幅を更新する（Splitter からドラッグ完了時に呼ぶ）*/
  public SetWidth(width: number): void {
    const clamped = Math.max(180, Math.min(500, width));
    if (this.Width === clamped) return;
    this.Width = clamped;
    this.NotifyUpdated();
  }

  /** チャットメッセージを追加する */
  public AddChatMessage(role: 'user' | 'assistant', content: string): void {
    const msg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    this.ChatMessages = [...this.ChatMessages, msg];
    // メッセージ追加時にパネルを自動的に開く
    if (!this.IsOpen) {
      this.IsOpen = true;
    }
    this.NotifyUpdated();
  }

  /** チャット履歴をクリアする */
  public ClearChat(): void {
    this.ChatMessages = [];
    this.NotifyUpdated();
  }
}
