/**
 * ChatService.ts
 * 複数の AI プロバイダー (Anthropic Claude, OpenAI, Google Gemini) をサポートする
 * SSE ストリーミングチャット。
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { Response } from 'express';
import { bigqueryService } from './BigQueryService.js';

export interface ChatRequestMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function streamChatResponse(
  messages: ChatRequestMessage[],
  systemPrompt: string,
  res: Response,
  provider?: string,
  model?: string,
): Promise<void> {
  // SSE ヘッダーの送信
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const writeSSE = (payload: object): boolean => {
    if (res.writableEnded) return false;
    return res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // デフォルトプロバイダーの判定
  let activeProvider = provider || process.env['AI_PROVIDER'] || 'anthropic';
  if (activeProvider === 'claude') {
    activeProvider = 'anthropic';
  }

  try {
    if (activeProvider === 'anthropic') {
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }
      const client = new Anthropic({ apiKey });
      const activeModel = model || process.env['ANTHROPIC_MODEL'] || 'claude-3-5-sonnet-20241022';

      const stream = client.messages.stream({
        model: activeModel,
        max_tokens: 4096,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });

      stream.on('text', (textDelta) => {
        writeSSE({ type: 'delta', text: textDelta });
      });

      await stream.finalMessage();
      writeSSE({ type: 'done' });

    } else if (activeProvider === 'openai') {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured');
      }
      const client = new OpenAI({
        apiKey,
        baseURL: process.env['OPENAI_BASE_URL'] || undefined,
      });
      const activeModel = model || process.env['OPENAI_MODEL'] || 'gpt-4o';

      const stream = await client.chat.completions.create({
        model: activeModel,
        messages: [
          ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
          ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ],
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          writeSSE({ type: 'delta', text: delta });
        }
      }
      writeSSE({ type: 'done' });

    } else if (activeProvider === 'gemini') {
      const apiKey = process.env['GEMINI_API_KEY'];
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not configured');
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const activeModel = model || process.env['GEMINI_MODEL'] || 'gemini-2.5-flash';

      const genModel = genAI.getGenerativeModel({
        model: activeModel,
        ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
        tools: [
          {
            functionDeclarations: [
              {
                name: 'saveThink',
                description: '個別データアイテム（memo や links など）を作成・更新する。AI自身が1秒ずらしで作成したユニークIDを指定する。',
                parameters: {
                  type: SchemaType.OBJECT,
                  properties: {
                    id: {
                      type: SchemaType.STRING,
                      description: '自分で生成した一意なID（形式: yyyy-MM-dd-HHmmss-memo または yyyy-MM-dd-HHmmss-links）'
                    },
                    category: {
                      type: SchemaType.STRING,
                      description: 'コンテンツ種別（"memo" または "links"）'
                    },
                    title: {
                      type: SchemaType.STRING,
                      description: 'ファイルのタイトル（簡潔な名前、最大30文字程度）'
                    },
                    content: {
                      type: SchemaType.STRING,
                      description: 'ファイルの中身のテキスト（Markdown形式。見出し記号を含めて構成テンプレートやリンク集を記述する）'
                    }
                  },
                  required: ['id', 'category', 'title', 'content']
                }
              },
              {
                name: 'saveThought',
                description: 'Thought（特定の主題を束ねる階層フォルダ相当）を作成・更新する。AI自身が1秒ずらしで作成したユニークIDを指定する。',
                parameters: {
                  type: SchemaType.OBJECT,
                  properties: {
                    id: {
                      type: SchemaType.STRING,
                      description: '自分で生成した一意なID（形式: yyyy-MM-dd-HHmmss-thought）'
                    },
                    title: {
                      type: SchemaType.STRING,
                      description: 'Thoughtのタイトル（主題名、例：「妻の誕生日プレゼント企画」）'
                    },
                    content: {
                      type: SchemaType.STRING,
                      description: 'Thoughtの本文（形式: [Title]\\n* [think-id-1]\\n* [think-id-2] のように内包するThink/LinksのIDリストを箇条書きで並べる）'
                    }
                  },
                  required: ['id', 'title', 'content']
                }
              }
            ]
          }
        ]
      });

      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const result = await genModel.generateContentStream({
        contents,
      });

      let functionCalls: any[] = [];
 
       for await (const chunk of result.stream) {
         const calls = chunk.functionCalls();
         if (calls && calls.length > 0) {
           functionCalls.push(...calls);
         }
 
         const text = chunk.text();
         if (text) {
           writeSSE({ type: 'delta', text: text });
         }
       }

       if (functionCalls.length > 0) {
         await handleToolCalls(functionCalls, writeSSE);
       } else {
         writeSSE({ type: 'done' });
       }

     } else {
       throw new Error(`Unsupported AI provider: ${activeProvider}`);
     }

   } catch (err) {
     const message = err instanceof Error ? err.message : 'Unknown error';
     console.error(`[ChatService] [${activeProvider}] stream error:`, message);
     writeSSE({ type: 'error', message });
   } finally {
     res.end();
   }
}

async function handleToolCalls(calls: any[], writeSSE: (payload: object) => boolean): Promise<void> {
  const now = new Date();
  const nowStr = now.toISOString();

  let createdThoughtId: string | null = null;
  let lastCreatedId: string | null = null;
  let lastCategory = 'thought';

  try {
    for (const call of calls) {
      const { name, args } = call;

      if (name === 'saveThink') {
        const id = args.id;
        const category = args.category || 'memo';
        const title = args.title || '無題';
        const content = args.content || '';

        const record = {
          file_id:     id,
          file_type:   'md',
          category,
          title,
          content,
          keywords:    null,
          related_ids: null,
          size_bytes:  Buffer.byteLength(content, 'utf8'),
          is_deleted:  false,
          created_at:  nowStr,
          updated_at:  nowStr,
          metadata:    null,
        };

        const res = await bigqueryService.save(record);
        if (!res.success) {
          throw new Error(`Think [${title}] の保存に失敗しました: ${res.error}`);
        }

        const catJa = category === 'links' ? 'Links' : 'Think';
        writeSSE({ 
          type: 'delta', 
          text: `\n\n*システム: [${catJa}ファイル「${title}」を自動登録しました。]*` 
        });
        
        lastCreatedId = id;
        lastCategory = category;

      } else if (name === 'saveThought') {
        const id = args.id;
        const title = args.title || '無題のThought';
        const content = args.content || '';

        const record = {
          file_id:     id,
          file_type:   'md',
          category:    'thought',
          title,
          content,
          keywords:    null,
          related_ids: null,
          size_bytes:  Buffer.byteLength(content, 'utf8'),
          is_deleted:  false,
          created_at:  nowStr,
          updated_at:  nowStr,
          metadata:    null,
        };

        const res = await bigqueryService.save(record);
        if (!res.success) {
          throw new Error(`Thought [${title}] の保存に失敗しました: ${res.error}`);
        }

        writeSSE({ 
          type: 'delta', 
          text: `\n\n*システム: [Thought「${title}」を自動登録しました。]*` 
        });

        createdThoughtId = id;
        lastCreatedId = id;
        lastCategory = 'thought';
      } else {
        throw new Error(`Unknown tool name: ${name}`);
      }
    }

    const finalId = createdThoughtId || lastCreatedId;
    if (finalId) {
      writeSSE({ type: 'done', createdFileId: finalId, category: lastCategory });
    } else {
      writeSSE({ type: 'done' });
    }

  } catch (err: any) {
    writeSSE({ type: 'error', message: `自動登録プロセスでエラーが発生しました: ${err.message}` });
  }
}
