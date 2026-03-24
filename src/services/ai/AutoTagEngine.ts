/**
 * AutoTagEngine.ts
 * Phase 12 段264: 自動タグエンジン（AI活用）
 *
 * メモの内容からAIを使ってタグを自動生成し、TTMemo.Keywords に保存する。
 * オフライン時やAPIエラー時はスキップしてエラーにしない。
 */

import { AIApiService } from './AIApiService';
import type { TTMemo } from '../../models/TTMemo';

export class AutoTagEngine {
    private _aiApi: AIApiService;

    constructor(aiApi?: AIApiService) {
        this._aiApi = aiApi ?? new AIApiService();
    }

    /**
     * メモの内容からタグを自動生成する
     * @returns 生成されたタグの配列（空の場合はAI失敗またはコンテンツ不足）
     */
    public async generateTags(content: string): Promise<string[]> {
        if (!content || content.length < 50) return [];

        const response = await this._aiApi.complete({
            system: `あなたはメモの分類を行うアシスタントです。
以下のメモに適切なタグを3〜5個付けてください。
ルール:
- タグは日本語で、簡潔に（1〜4単語）
- カテゴリとして機能するもの（例: 研究, ペプチド, 日記, アイデア, TODO）
- JSON配列形式で返してください: ["タグ1", "タグ2", ...]`,
            user: content.substring(0, 1500),
        });

        if (!response) return [];

        return this._parseTags(response);
    }

    /**
     * メモ保存時に自動タグを付与し、Keywords プロパティに保存する
     */
    public async tagOnSave(memo: TTMemo): Promise<void> {
        if (memo.Keywords) return; // 既にタグがあるメモはスキップ
        if (!memo.Content || memo.Content.length < 50) return;

        const tags = await this.generateTags(memo.Content);
        if (tags.length > 0) {
            memo.Keywords = tags.join(',');
            memo.NotifyUpdated();
        }
    }

    private _parseTags(response: string): string[] {
        try {
            const match = response.match(/\[.*?\]/s);
            if (match) {
                const arr = JSON.parse(match[0]);
                if (Array.isArray(arr)) {
                    return arr
                        .map((t: unknown) => String(t).trim())
                        .filter(t => t.length > 0 && t.length <= 20)
                        .slice(0, 5);
                }
            }
        } catch {
            // パース失敗時はカンマ区切りで試みる
            const lines = response.split(/[,\n"[\]]/).map(t => t.trim()).filter(t => t.length > 0);
            if (lines.length > 0) return lines.slice(0, 5);
        }
        return [];
    }
}
