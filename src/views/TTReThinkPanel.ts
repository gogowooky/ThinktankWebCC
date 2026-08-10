/**
 * TTReThinkPanel.ts
 * Phase 4: ReThinkPanelのビューモデル。
 *
 * Think/Bundlesの次の展開についてAIと相談するパネル。
 * ReThinkAreaの開閉状態とAI会話履歴を管理する。
 */

import { TTUIItem } from '../models/TTUIItem';
import { loadAiModelSelection, saveAiModelSelection } from '../services/aiModels';
import type { AiModelSelection, AiProvider } from '../services/aiModels';

const AI_MODEL_STORAGE_KEY = 'tt-ai-model-rethink';

export type ReThinkViewMode = 'chat' | 'settings';

/** AIチャットのメッセージ */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export class TTReThinkPanel extends TTUIItem {
  /** ReThinkAreaの開閉状態（true=開いている）*/
  public IsAreaOpen: boolean = true;

  /** 表示モード */
  public ViewMode: ReThinkViewMode = 'chat';

  /** 連携中のBundleID（空 = 未設定）*/
  public LinkedBundleID: string = '';

  /** 連携中のThinkID（空 = 未設定）*/
  public LinkedThinkID: string = '';

  /** AIとの会話履歴 */
  public ChatMessages: ChatMessage[] = [];

  /** AIがストリーミング応答中かどうか */
  public IsStreaming: boolean = false;

  public override get ClassName(): string {
    return 'TTReThinkPanel';
  }

  constructor() {
    super();
    this.ID = 'ReThinkPanel';
    this.Name = 'ReThinkPanel';
  }

  // ── Area開閉 ──────────────────────────────────────────────────────────

  /** ReThinkAreaの開閉を切り替える */
  public ToggleArea(): void {
    this.IsAreaOpen = !this.IsAreaOpen;
    this.NotifyUpdated();
  }

  /** ReThinkAreaを開く */
  public OpenArea(): void {
    if (!this.IsAreaOpen) {
      this.IsAreaOpen = true;
      this.NotifyUpdated();
    }
  }

  /** ReThinkAreaを閉じる */
  public CloseArea(): void {
    if (this.IsAreaOpen) {
      this.IsAreaOpen = false;
      this.NotifyUpdated();
    }
  }

  /** 表示モードを切り替える */
  public SetViewMode(mode: ReThinkViewMode): void {
    this.ViewMode = mode;
    this.NotifyUpdated();
  }

  // ── コンテキスト連携 ──────────────────────────────────────────────────

  /**
   * BundleをReThinkPanelのコンテキストとして連携する。
   * Areaが閉じていれば自動的に開く。
   */
  public LinkBundle(bundleId: string): void {
    this.LinkedBundleID = bundleId;
    this.LinkedThinkID = '';
    if (!this.IsAreaOpen) {
      this.IsAreaOpen = true;
    }
    this.NotifyUpdated();
  }

  /**
   * ThinkをReThinkPanelのコンテキストとして連携する。
   */
  public LinkThink(thinkId: string): void {
    this.LinkedThinkID = thinkId;
    this.NotifyUpdated();
  }

  /** コンテキスト連携をクリアする */
  public ClearLink(): void {
    this.LinkedBundleID = '';
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

  /** 会話履歴を指定したメッセージ配列で置き換える（TODOメモ読み込み用）*/
  public LoadChat(messages: ChatMessage[]): void {
    this.ChatMessages = messages;
    this.IsStreaming = false;
    this.NotifyUpdated();
  }

  /** ストリーミング状態を更新する */
  public SetStreaming(isStreaming: boolean): void {
    this.IsStreaming = isStreaming;
    this.NotifyUpdated();
  }

  // ── AI Chat モデル選択 ────────────────────────────────────────────────

  /** AI Chat のホストプロバイダ（このパネル専用。ブラウザ再起動後も localStorage から復元） */
  public AIChatProvider: AiProvider = loadAiModelSelection(AI_MODEL_STORAGE_KEY).provider;
  /** AI Chat のホストモデルID */
  public AIChatModel: string = loadAiModelSelection(AI_MODEL_STORAGE_KEY).model;

  public SetAIChatModel(selection: AiModelSelection): void {
    this.AIChatProvider = selection.provider;
    this.AIChatModel = selection.model;
    saveAiModelSelection(AI_MODEL_STORAGE_KEY, selection);
    this.NotifyUpdated();
  }
}
