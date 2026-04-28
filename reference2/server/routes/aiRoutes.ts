/**
 * aiRoutes.ts
 * Phase 12 段260: AI汎用補完エンドポイント
 *
 * エンドポイント:
 *   POST /api/ai/complete
 *     body: { system?: string, user: string }
 *     → Gemini/Claude API に1回のプロンプトを送信して返答を取得
 *     → { reply: string, provider: string } を返す
 *
 * チャット履歴を保存しない軽量な補完API。
 * Facilitator機能（自動タグ生成・関連メモ検索等）で使用する。
 */

import { Router, Request, Response } from 'express';
import { geminiService } from '../services/geminiService.js';

export function createAIRoutes(): Router {
    const router = Router();

    /**
     * POST /api/ai/complete
     * 1ターンのAI補完を実行する（チャット履歴保存なし）
     */
    router.post('/complete', async (req: Request, res: Response) => {
        try {
            const { system, user } = req.body;

            if (!user || typeof user !== 'string') {
                return res.status(400).json({ error: 'user フィールドは必須です' });
            }

            const messages = [{ role: 'user' as const, content: user }];
            const aiResponse = await geminiService.sendMessage(messages, system);

            res.json({
                reply: aiResponse.reply,
                provider: aiResponse.provider,
            });
        } catch (error: any) {
            console.error('[AIRoutes] POST /complete error:', error);
            const status = error.status || 500;
            let message = 'AI補完に失敗しました';
            if (status === 429) message = 'APIのクォータ制限に達しました。';
            else if (status === 401 || status === 403) message = 'APIキーが無効です。';
            else if (error.message?.includes('API_KEY') || error.message?.includes('設定されていません')) message = error.message;
            res.status(status < 600 ? status : 500).json({ error: message });
        }
    });

    return router;
}
