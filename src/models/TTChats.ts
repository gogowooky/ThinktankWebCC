/**
 * TTChats.ts
 * Phase 11 段120: AIチャットセッション一覧コレクション
 *
 * BigQuery の files テーブルを category='Chat' でフィルタして使用する。
 */

import { TTCollection } from './TTCollection';
import { TTChat } from './TTChat';

export class TTChats extends TTCollection {
    public override get ClassName(): string {
        return 'TTChats';
    }

    constructor() {
        super();
        this.ItemSaveProperties = 'ID,Title,UpdateDate';
        this.ListProperties = 'ID,UpdateDate,Title';
        this.ColumnMapping = 'ID:チャットID,Title:タイトル,UpdateDate:更新日';
        this.ColumnMaxWidth = 'ID:18,Title:50,UpdateDate:18';
    }

    public AddNewChat(): TTChat {
        const chat = new TTChat();
        chat.IsLoaded = true;
        this.AddItem(chat);
        return chat;
    }

    protected CreateChildInstance(): TTChat {
        return new TTChat();
    }

    private formatDateString(dateVal: any): string {
        if (!dateVal) return '';
        const d = new Date(String(dateVal));
        if (!isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const MM = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const HH = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            const ss = String(d.getSeconds()).padStart(2, '0');
            return `${yyyy}-${MM}-${dd}-${HH}${mm}${ss}`;
        }
        return String(dateVal);
    }

    /**
     * BigQuery から category='Chat' のファイル一覧を取得してコレクションを同期する
     */
    public async SyncWithBigQuery(): Promise<boolean> {
        try {
            const response = await fetch('/api/bq/files?category=Chat');
            if (!response.ok) {
                console.error(`[TTChats] BigQuery API失敗: ${response.status}`);
                return false;
            }
            const data = await response.json();
            const files = data.files || [];

            let addedCount = 0;
            for (const file of files) {
                if (file.category !== 'Chat') continue;

                let chat = this.GetItem(file.file_id) as TTChat | undefined;
                if (!chat) {
                    chat = new TTChat();
                    chat.ID = file.file_id;
                    chat.Title = file.title || file.file_id;
                    chat.Name = chat.Title;
                    chat.UpdateDate = this.formatDateString(file.updated_at);
                    this.AddItem(chat);
                    addedCount++;
                }
            }

            console.log(`[TTChats] BigQuery同期完了: ${files.length}件 (新規:${addedCount})`);
            this.IsLoaded = true;
            if (addedCount > 0) this.NotifyUpdated();
            return true;
        } catch (e) {
            console.error('[TTChats] BigQuery同期失敗:', e);
            return false;
        }
    }

    public override async LoadCache(): Promise<void> {
        await this.SyncWithBigQuery();
        if (!this.IsLoaded) {
            await super.LoadCache();
            this.IsLoaded = true;
        }
    }
}
