/**
 * AIFacilitatorService.ts
 * Phase 12 段260: AI Facilitatorサービスの基盤
 *
 * AIFacilitatorの各エンジン（AnniversaryRecall, RelatedRecall, AutoTag）を
 * 統合して管理するファサードクラス。
 */

import { AIApiService } from './AIApiService';

export interface Suggestion {
    id: string;
    type: 'recall' | 'auto_tag' | 'related' | 'anniversary' | 'insight';
    title: string;         // 提案のタイトル（例: "1年前のメモ"）
    body: string;          // 提案の本文（AI生成テキスト）
    relatedMemoIds: string[]; // 関連メモのID群
    priority: number;      // 0-100 の優先度
    createdAt: string;     // 提案生成日時
    dismissed: boolean;    // ユーザーが却下したか
    actedOn: boolean;      // ユーザーがアクションを取ったか
}

export class AIFacilitatorService {
    private _apiService: AIApiService;

    constructor() {
        this._apiService = new AIApiService();
    }

    public get ApiService(): AIApiService {
        return this._apiService;
    }

    /**
     * メモの内容に基づいて関連する過去メモを検索・提案
     * 実装は RelatedRecallEngine に委譲
     */
    public async getRelatedRecall(_currentMemoId: string): Promise<Suggestion[]> {
        // RelatedRecallEngine から呼び出す
        return [];
    }

    /**
     * 記念日リコール（N日前、N月前、N年前のメモ）
     * 実装は AnniversaryRecallEngine に委譲
     */
    public async getAnniversaryRecall(): Promise<Suggestion[]> {
        // AnniversaryRecallEngine から呼び出す
        return [];
    }

    /**
     * 自動タグ生成
     * 実装は AutoTagEngine に委譲
     */
    public async generateAutoTags(_memoId: string, content: string): Promise<string[]> {
        if (!content || content.length < 50) return [];
        const reply = await this._apiService.complete({
            system: `あなたはメモの分類を行うアシスタントです。以下のメモに適切なタグを3〜5個付けてください。
ルール:
- タグは日本語で、簡潔に（1〜4単語）
- カテゴリとして機能するもの（例: 研究, ペプチド, 日記, アイデア, TODO）
- JSON配列形式で返してください: ["タグ1", "タグ2", ...]`,
            user: content.substring(0, 1500),
        });
        if (!reply) return [];
        try {
            const match = reply.match(/\[.*?\]/s);
            if (match) return JSON.parse(match[0]) as string[];
        } catch {
            // パース失敗時は空配列
        }
        return [];
    }

    /**
     * 最近のメモ群からのインサイト（パターンの兆候）
     */
    public async getQuickInsight(_recentMemoIds: string[]): Promise<Suggestion | null> {
        return null;
    }
}
