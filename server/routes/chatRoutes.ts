/**
 * chatRoutes.ts
 * Phase 11 段122: AIチャット API ルート
 *
 * エンドポイント:
 *   POST /api/chats/:id/messages
 *     body: { message: string, systemPrompt?: string }
 *     → Gemini/Claude API にメッセージを送信
 *     → 返答と共にチャット履歴を BQ に保存
 *     → { reply: string, provider: string } を返す
 *
 *   GET  /api/chats/:id
 *     → BQ から該当チャットのメッセージ履歴を取得
 *
 * ※チャットデータは既存の /api/bq/files エンドポイント経由で保存される。
 *   category='Chat' で識別する。
 */

import { Router, Request, Response } from 'express';
import { geminiService, ChatTurn } from '../services/geminiService.js';
import { bigqueryService } from '../services/BigQueryService.js';

export function createChatRoutes(): Router {
    const router = Router();

    /**
     * GET /api/chats/:id
     * 指定IDのチャット履歴を取得する
     */
    router.get('/:id', async (req: Request, res: Response) => {
        try {
            const chatId = req.params.id;
            const result = await bigqueryService.getFile(chatId);

            if (!result.success) {
                return res.status(500).json({ error: result.error });
            }
            if (!result.data || result.data.length === 0) {
                return res.json({ chatId, messages: [] });
            }

            const file = result.data[0];
            let messages: ChatTurn[] = [];
            try {
                messages = JSON.parse(file.content || '[]');
            } catch {
                messages = [];
            }

            res.json({ chatId, title: file.title, messages });
        } catch (error) {
            console.error('[ChatRoutes] GET /:id error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    /**
     * POST /api/chats/:id/messages
     * メッセージを送信してAIの返答を取得・保存する
     */
    router.post('/:id/messages', async (req: Request, res: Response) => {
        try {
            const chatId = req.params.id;
            const { message, systemPrompt } = req.body;

            if (!message || typeof message !== 'string') {
                return res.status(400).json({ error: 'message は必須です' });
            }

            // 1. 既存のチャット履歴を取得
            let existingMessages: ChatTurn[] = [];
            const existing = await bigqueryService.getFile(chatId);
            if (existing.success && existing.data && existing.data.length > 0) {
                try {
                    existingMessages = JSON.parse(existing.data[0].content || '[]');
                } catch {
                    existingMessages = [];
                }
            }

            // 2. ユーザーメッセージを追加
            const userMsg: ChatTurn = { role: 'user', content: message };
            const allMessages: ChatTurn[] = [...existingMessages, userMsg];

            // 3. AI API に送信
            const aiResponse = await geminiService.sendMessage(allMessages, systemPrompt);

            // 4. AI返答を追加
            const assistantMsg: ChatTurn = { role: 'assistant', content: aiResponse.reply };
            const updatedMessages = [...allMessages, assistantMsg];

            // 5. BigQuery に保存（既存 /api/bq/files の保存ロジックを直接呼ぶ）
            const title = existingMessages.length === 0
                ? message.substring(0, 40) + (message.length > 40 ? '…' : '')
                : (existing.data?.[0]?.title || chatId);

            await bigqueryService.saveFile({
                file_id: chatId,
                title,
                file_type: 'json',
                category: 'Chat',
                content: JSON.stringify(updatedMessages),
                metadata: null,
                size_bytes: null,
                created_at: new Date(),
                updated_at: new Date(),
            });

            res.json({
                reply: aiResponse.reply,
                provider: aiResponse.provider,
                messageId: `${chatId}_${Date.now()}`,
            });
        } catch (error: any) {
            console.error('[ChatRoutes] POST /:id/messages error:', error);
            res.status(500).json({ error: error.message || 'Internal Server Error' });
        }
    });

    return router;
}
