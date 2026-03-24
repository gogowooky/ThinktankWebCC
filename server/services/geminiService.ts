/**
 * geminiService.ts
 * Phase 11 段121: Gemini API (および Claude API) を使用したAIチャットサービス
 *
 * 環境変数:
 *   GEMINI_API_KEY      - Gemini API キー（必須）
 *   ANTHROPIC_API_KEY   - Anthropic API キー（オプション: Claudeを使う場合）
 *   AI_PROVIDER         - 使用するプロバイダ ('gemini' | 'claude')、デフォルト: 'gemini'
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

export interface ChatTurn {
    role: 'user' | 'assistant';
    content: string;
}

export interface AIResponse {
    reply: string;
    provider: string;
}

// Gemini API 実装
async function sendWithGemini(
    messages: ChatTurn[],
    systemPrompt?: string
): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY が設定されていません');

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';
    const model = genAI.getGenerativeModel({
        model: modelName,
        ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    });

    // 最後のメッセージを除いた履歴
    const history = messages.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1];
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content);
    return result.response.text();
}

// Claude API 実装
async function sendWithClaude(
    messages: ChatTurn[],
    systemPrompt?: string
): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: messages.map(m => ({
            role: m.role,
            content: m.content,
        })),
    });

    const block = response.content[0];
    if (block.type === 'text') return block.text;
    throw new Error('Claude APIから予期しないレスポンス形式');
}

export const geminiService = {
    /**
     * AIにメッセージを送信して返答を取得する
     * @param messages チャット履歴（最後の要素が今回のユーザーメッセージ）
     * @param systemPrompt システムプロンプト（オプション）
     */
    async sendMessage(
        messages: ChatTurn[],
        systemPrompt?: string
    ): Promise<AIResponse> {
        if (messages.length === 0) {
            throw new Error('メッセージが空です');
        }

        const provider = process.env.AI_PROVIDER || 'gemini';

        if (provider === 'claude') {
            const reply = await sendWithClaude(messages, systemPrompt);
            return { reply, provider: 'claude' };
        } else {
            const reply = await sendWithGemini(messages, systemPrompt);
            return { reply, provider: 'gemini' };
        }
    },
};
