/**
 * TTToDoPanel.ts
 * Phase 4: ToDoPanelのビューモデル。
 *
 * Think/Thoughtsの次の展開についてAIと相談するパネル。
 * ToDoAreaの開閉状態とAI会話履歴を管理する。
 */

import { TTObject } from '../models/TTObject';

/** AIチャットのメッセージ */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export class TTToDoPanel extends TTObject {
  /** ToDoAreaの開閉状態（true=開いている）*/
  public IsAreaOpen: boolean = true;

  /** 連携中のThoughtID（空 = 未設定）*/
  public LinkedThoughtID: string = '';

  /** 連携中のThinkID（空 = 未設定）*/
  public LinkedThinkID: string = '';

  /** AIとの会話履歴 */
  public ChatMessages: ChatMessage[] = [];

  /** AIがストリーミング応答中かどうか */
  public IsStreaming: boolean = false;

  public override get ClassName(): string {
    return 'TTToDoPanel';
  }

  constructor() {
    super();
    this.ID = 'ToDoPanel';
    this.Name = 'ToDoPanel';
  }

  // ── Area開閉 ──────────────────────────────────────────────────────────

  /** ToDoAreaの開閉を切り替える */
  public ToggleArea(): void {
    this.IsAreaOpen = !this.IsAreaOpen;
    this.NotifyUpdated();
  }

  /** ToDoAreaを開く */
  public OpenArea(): void {
    if (!this.IsAreaOpen) {
      this.IsAreaOpen = true;
      this.NotifyUpdated();
    }
  }

  /** ToDoAreaを閉じる */
  public CloseArea(): void {
    if (this.IsAreaOpen) {
      this.IsAreaOpen = false;
      this.NotifyUpdated();
    }
  }

  // ── コンテキスト連携 ──────────────────────────────────────────────────

  /**
   * ThoughtをToDoPanelのコンテキストとして連携する。
   * Areaが閉じていれば自動的に開く。
   */
  public LinkThought(thoughtId: string): void {
    this.LinkedThoughtID = thoughtId;
    this.LinkedThinkID = '';
    if (!this.IsAreaOpen) {
      this.IsAreaOpen = true;
    }
    this.NotifyUpdated();
  }

  /**
   * ThinkをToDoPanelのコンテキストとして連携する。
   */
  public LinkThink(thinkId: string): void {
    this.LinkedThinkID = thinkId;
    this.NotifyUpdated();
  }

  /** コンテキスト連携をクリアする */
  public ClearLink(): void {
    this.LinkedThoughtID = '';
    this.LinkedThinkID = '';
    this.NotifyUpdated();
  }

  // ── チャット操作 ──────────────────────────────────────────────────────

  /**
   * ユーザーメッセージを追加する。
   * @returns 追加したメッセージのID
   */
  public AddUserMessage(content: string): string {
    const msg: ChatMessage = {
      id: this.getNowString(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    this.ChatMessages = [...this.ChatMessages, msg];
    this.NotifyUpdated();
    return msg.id;
  }

  /**
   * AIメッセージを追加する（ストリーミング開始前に空メッセージで呼ぶ）。
   * @returns 追加したメッセージのID
   */
  public AddAssistantMessage(content: string = ''): string {
    const msg: ChatMessage = {
      id: this.getNowString(),
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
    };
    this.ChatMessages = [...this.ChatMessages, msg];
    this.NotifyUpdated();
    return msg.id;
  }

  /**
   * 既存メッセージの内容を更新する（SSEストリーミング中に呼ぶ）。
   */
  public UpdateMessage(messageId: string, content: string): void {
    this.ChatMessages = this.ChatMessages.map(m =>
      m.id === messageId ? { ...m, content } : m
    );
    this.NotifyUpdated();
  }

  /** 会話履歴をクリアする */
  public ClearChat(): void {
    this.ChatMessages = [];
    this.IsStreaming = false;
    this.NotifyUpdated();
  }

  /** ストリーミング状態を更新する */
  public SetStreaming(isStreaming: boolean): void {
    this.IsStreaming = isStreaming;
    this.NotifyUpdated();
  }
}
