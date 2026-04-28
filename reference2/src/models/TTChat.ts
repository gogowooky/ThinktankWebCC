/**
 * TTChat.ts
 * Phase 11 段119: AIチャットセッションモデル
 *
 * チャット履歴は BigQuery の files テーブルに category='Chat' で保存する。
 * Messages は JSON 文字列として content フィールドに格納する。
 */

import { TTObject } from './TTObject';

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

export class TTChat extends TTObject {
    public Title: string = '';
    public Messages: ChatMessage[] = [];
    public IsLoaded: boolean = false;
    public Category: string = 'Chat';

    public override get ClassName(): string {
        return 'TTChat';
    }

    constructor() {
        super();
        const chatId = this.getNowString();
        this.ID = chatId;
        this.Name = `[${chatId}] 新しいチャット`;
        this.UpdateDate = this.getNowString();
    }

    /**
     * BigQuery からメッセージをロードする
     * content フィールドに JSON 配列が格納されている
     */
    public async LoadMessages(): Promise<void> {
        if (this.IsLoaded) return;

        try {
            const response = await fetch(`/api/bq/files/${encodeURIComponent(this.ID)}`);
            if (response.ok) {
                const data = await response.json();
                const raw = data.file?.content || '[]';
                try {
                    this.Messages = JSON.parse(raw);
                } catch {
                    this.Messages = [];
                }
                this.Title = data.file?.title || this.Name;
                this.IsLoaded = true;
                this.NotifyUpdated(false);
            } else if (response.status === 404) {
                this.Messages = [];
                this.IsLoaded = true;
            }
        } catch (e) {
            console.warn(`[TTChat.LoadMessages] 失敗 (${this.ID}):`, e);
            this.Messages = [];
            this.IsLoaded = true;
        }
    }

    /**
     * メッセージを追加して BigQuery に保存する
     */
    public async AddMessage(role: 'user' | 'assistant', content: string): Promise<void> {
        const msg: ChatMessage = {
            role,
            content,
            timestamp: new Date().toISOString(),
        };
        this.Messages.push(msg);

        // タイトルが未設定なら最初のユーザーメッセージから生成
        if (role === 'user' && (this.Title === '' || this.Title === this.Name)) {
            this.Title = content.substring(0, 40) + (content.length > 40 ? '…' : '');
            this.Name = this.Title;
        }

        this.UpdateDate = this.getNowString();
        this.NotifyUpdated(false);

        await this._saveToServer();
    }

    private async _saveToServer(): Promise<void> {
        try {
            await fetch('/api/bq/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_id: this.ID,
                    title: this.Title || this.Name,
                    file_type: 'json',
                    category: 'Chat',
                    content: JSON.stringify(this.Messages),
                }),
            });
        } catch (e) {
            console.warn(`[TTChat._saveToServer] 保存失敗 (${this.ID}):`, e);
        }
    }
}
