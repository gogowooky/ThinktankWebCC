/**
 * RelatedRecallEngine.ts
 * Phase 12 段263: 関連メモリコールエンジン（AI活用）
 *
 * 現在表示中のメモの内容から、AIを使って関連する過去メモを提案する。
 * オフライン時やAPI失敗時はスキップしてエラーにしない。
 */

import { AIApiService } from './AIApiService';
import type { Suggestion } from './AIFacilitatorService';
import type { TTMemo } from '../../models/TTMemo';

export class RelatedRecallEngine {
    private _aiApi: AIApiService;

    constructor(aiApi?: AIApiService) {
        this._aiApi = aiApi ?? new AIApiService();
    }

    /**
     * 現在表示中のメモの内容から、関連する過去メモを提案する
     * 1. 現在のメモの要約キーワードをAIで生成
     * 2. キーワードで全メモをローカル検索
     * 3. 上位候補をAIに渡して関連度ランキングを取得
     * 4. 上位3件をSuggestionとして返す
     */
    public async findRelatedMemos(
        currentContent: string,
        allMemos: TTMemo[],
        currentMemoId?: string
    ): Promise<Suggestion[]> {
        if (!currentContent || currentContent.length < 50) return [];

        // 1. キーワード抽出
        const summary = await this._aiApi.complete({
            system: 'あなたはメモの要約を行うアシスタントです。以下のメモから主要な概念・キーワードを5個抽出し、カンマ区切りで返してください。JSON不要、キーワードのみを返してください。',
            user: currentContent.substring(0, 2000),
        });
        if (!summary) return [];

        const keywords = summary.split(/[,、\n]/).map(k => k.trim()).filter(k => k.length > 0).slice(0, 5);
        if (keywords.length === 0) return [];

        // 2. キーワードで候補を絞る（タイトル・キーワードフィールドを対象）
        const candidates = allMemos.filter(m => {
            if (m.ID === currentMemoId) return false;
            const searchTarget = `${m.Name} ${m.Keywords}`.toLowerCase();
            return keywords.some(kw => searchTarget.includes(kw.toLowerCase()));
        }).slice(0, 20); // 最大20件を候補に

        if (candidates.length === 0) return [];

        // 3. AIに関連度判定を依頼
        const rankingReply = await this._aiApi.complete({
            system: '以下のメモタイトル群から、指定されたキーワードに最も関連の深いものを上位3件選んでください。IDのJSON配列だけを返してください: ["id1","id2","id3"]',
            user: JSON.stringify({
                keywords,
                candidates: candidates.map(m => ({ id: m.ID, title: m.Name })),
            }),
        });

        if (!rankingReply) {
            // AIが使えない場合は上位3件をそのまま返す
            return candidates.slice(0, 3).map(m => this._toSuggestion(m, keywords));
        }

        // 4. 返答をパースしてSuggestionに変換
        const rankedIds = this._parseIdArray(rankingReply);
        const result: Suggestion[] = [];
        for (const id of rankedIds.slice(0, 3)) {
            const memo = candidates.find(m => m.ID === id);
            if (memo) result.push(this._toSuggestion(memo, keywords));
        }

        // パース失敗時のフォールバック
        if (result.length === 0) {
            return candidates.slice(0, 3).map(m => this._toSuggestion(m, keywords));
        }

        return result;
    }

    private _toSuggestion(memo: TTMemo, keywords: string[]): Suggestion {
        return {
            id: `related_${memo.ID}_${Date.now()}`,
            type: 'related',
            title: `関連メモ: ${memo.Name}`,
            body: `キーワード「${keywords.slice(0, 3).join('・')}」で関連するメモが見つかりました。`,
            relatedMemoIds: [memo.ID],
            priority: 60,
            createdAt: new Date().toISOString(),
            dismissed: false,
            actedOn: false,
        };
    }

    private _parseIdArray(reply: string): string[] {
        try {
            const match = reply.match(/\[.*?\]/s);
            if (match) {
                const arr = JSON.parse(match[0]);
                if (Array.isArray(arr)) return arr.map(String);
            }
        } catch {
            // パース失敗時は空配列
        }
        return [];
    }
}
