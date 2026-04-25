/**
 * TTSuggestion.ts
 * Phase 12 段261: AI Facilitator提案モデル
 *
 * TTSuggestion    - 1件の提案（リコール・自動タグ・関連メモ・記念日・インサイト）
 * TTSuggestions   - 提案のコレクション
 */

import { TTObject } from './TTObject';
import { TTCollection } from './TTCollection';

export class TTSuggestion extends TTObject {
    public Type: string = 'recall';    // 'recall' | 'auto_tag' | 'related' | 'anniversary' | 'insight'
    public Title: string = '';
    public Body: string = '';
    public RelatedMemoIds: string = ''; // カンマ区切りメモID
    public Priority: number = 50;
    public Dismissed: boolean = false;
    public ActedOn: boolean = false;

    public override get ClassName(): string {
        return 'TTSuggestion';
    }

    constructor() {
        super();
        const id = `S${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        this.ID = id;
        this.Name = id;
        this.UpdateDate = this.getNowString();
    }
}

export class TTSuggestions extends TTCollection {
    public override get ClassName(): string {
        return 'TTSuggestions';
    }

    constructor() {
        super();
        this.ItemSaveProperties = 'ID,Type,Title,Priority,Dismissed,ActedOn,UpdateDate';
        this.ListProperties = 'Type,Priority,Title,UpdateDate';
        this.ColumnMapping = 'Type:種別,Priority:優先度,Title:提案内容,UpdateDate:日時';
        this.ColumnMaxWidth = 'Type:10,Priority:7,Title:60,UpdateDate:18';
    }

    /** 未却下・未対応の提案のみを優先度降順で返す */
    public getActiveSuggestions(): TTSuggestion[] {
        return (this.GetItems() as TTSuggestion[])
            .filter(s => !s.Dismissed && !s.ActedOn)
            .sort((a, b) => b.Priority - a.Priority);
    }

    protected CreateChildInstance(): TTSuggestion {
        return new TTSuggestion();
    }

    /** IndexedDBへの永続化はしない（セッション内のみ保持） */
    public override async LoadCache(): Promise<void> {
        this.IsLoaded = true;
    }
}
