/**
 * ChatService.ts
 * 複数の AI プロバイダー (Anthropic Claude, OpenAI, Google Gemini) をサポートする
 * SSE ストリーミングチャット。Gemini は多段ツール呼び出し (multi-turn tool calling) に対応。
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { FunctionDeclaration } from '@google/generative-ai';
import type { Response } from 'express';
import { bigqueryService } from './BigQueryService.js';
import { assertPublicHttpUrl } from './ssrfGuard.js';
import { normalizeThinkId, stripBracketedIdsInBundleContent } from './vaultKey.js';

export interface ChatRequestMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Gemini ツール宣言 ─────────────────────────────────────────────────────

const GEMINI_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'saveThink',
    description: '個別データアイテム（memo や links）を作成・更新する。AI自身が1秒ずらしで生成したユニークIDを指定する。',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        id:       { type: SchemaType.STRING, description: '一意ID（形式: yyyy-MM-dd-HHmmss-memo / yyyy-MM-dd-HHmmss-links）' },
        category: { type: SchemaType.STRING, description: '"memo" または "links"' },
        title:    { type: SchemaType.STRING, description: 'タイトル（最大30文字程度）' },
        content:  { type: SchemaType.STRING, description: 'Markdown 本文' },
      },
      required: ['id', 'category', 'title', 'content'],
    },
  },
  {
    name: 'saveBundle',
    description: 'Bundle（主題を束ねる親エントリ）を新規作成する。AI自身が1秒ずらしで生成したユニークIDを指定する。',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        id:      { type: SchemaType.STRING, description: '一意ID（形式: yyyy-MM-dd-HHmmss-bundle）' },
        title:   { type: SchemaType.STRING, description: '主題名（例: 「妻の誕生日プレゼント企画」）' },
        content: { type: SchemaType.STRING, description: '本文（形式: 1行目にタイトル、2行目以降に "* <think-id>" を1行ずつ。角括弧は付けない）' },
      },
      required: ['id', 'title', 'content'],
    },
  },
  {
    name: 'saveTable',
    description: 'Markdown テーブル形式のデータ（比較表・一覧表）を category=table として保存する。',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        id:      { type: SchemaType.STRING, description: '一意ID（形式: yyyy-MM-dd-HHmmss-table）' },
        title:   { type: SchemaType.STRING, description: 'テーブルのタイトル' },
        content: { type: SchemaType.STRING, description: 'Markdown テーブル本文' },
      },
      required: ['id', 'title', 'content'],
    },
  },
  {
    name: 'updateBundle',
    description: '既存 Bundle の末尾に Think / Links / Table の ID を追記して紐付けを更新する。事前に getThink で内容を確認してから呼ぶこと。',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        id:        { type: SchemaType.STRING, description: '更新対象の Bundle ID' },
        appendIds: {
          type:  SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: '追記する Think / Links / Table の ID リスト',
        },
      },
      required: ['id', 'appendIds'],
    },
  },
  {
    name: 'searchVault',
    description: 'Vault を全文検索して既存の Think / Bundle を見つける。類似データの検索（Step 4）に使う。',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        keyword:  { type: SchemaType.STRING, description: '検索キーワード' },
        category: { type: SchemaType.STRING, description: '絞り込むカテゴリ（memo/bundle/links/table/chat/nettext）省略可' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'getThink',
    description: '指定 ID の Think または Bundle のタイトル・カテゴリ・本文を取得する。updateBundle 前の内容確認や既存データの参照に使う。',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        id: { type: SchemaType.STRING, description: '取得する Think / Bundle の ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'fetchUrlContent',
    description: 'URL にアクセスしてページタイトルと説明文を取得する。Links ファイル作成前に URL を確認するために使う。',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        url: { type: SchemaType.STRING, description: '取得する URL（https://...）' },
      },
      required: ['url'],
    },
  },
];

// ── URL メタデータ取得 ─────────────────────────────────────────────────────

async function fetchUrlMeta(url: string): Promise<{ title: string; description: string }> {
  const ac    = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    // SSRF 対策（PROJECT_REVIEW_REPORT.md D-4）: 宛先 IP を検証し、リダイレクトは
    // manual で辿ってホップごとに再検証する。
    let currentUrl = url;
    // 注: このファイルの Response は express の型なので、fetch の戻り値は推論に任せる
    let resp: Awaited<ReturnType<typeof fetch>> | undefined;
    for (let hop = 0; hop < 4; hop++) {
      await assertPublicHttpUrl(currentUrl);
      resp = await fetch(currentUrl, {
        signal: ac.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'Thinktank/1.0' },
      });
      if (resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get('location');
        if (!loc) break;
        currentUrl = new URL(loc, currentUrl).toString();
        continue;
      }
      break;
    }
    clearTimeout(timer);
    if (!resp) throw new Error('リダイレクトが多すぎます');
    const html = await resp.text();
    const title = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() ?? url;
    const desc  = (
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i) ??
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,300})["']/i)
    )?.[1]?.trim() ?? '';
    return { title, description: desc };
  } catch {
    clearTimeout(timer);
    return { title: url, description: '取得失敗またはタイムアウト' };
  }
}

// ── Gemini ツール実行（1 ツール単位） ─────────────────────────────────────

async function executeGeminiTool(
  name: string,
  args: Record<string, unknown>,
  writeSSE: (payload: object) => boolean,
  nowStr: string,
  createdIds: Array<{ id: string; category: string }>,
): Promise<string> {
  switch (name) {

    case 'saveThink': {
      const id       = normalizeThinkId(args['id']);
      const category = String(args['category'] ?? 'memo');
      const title    = String(args['title']    ?? '無題');
      const content  = String(args['content']  ?? '');
      const res = await bigqueryService.save({
        file_id: id, file_type: 'md', category, title, content,
        keywords: null, related_ids: null, size_bytes: Buffer.byteLength(content, 'utf8'),
        is_deleted: false, created_at: nowStr, updated_at: nowStr, metadata: null,
      });
      if (!res.success) throw new Error(res.error);
      const label = category === 'links' ? 'Links' : 'Think';
      writeSSE({ type: 'delta', text: `\n\n*システム: [${label}ファイル「${title}」を自動登録しました。]*` });
      createdIds.push({ id, category });
      return `保存完了: id=${id}`;
    }

    case 'saveBundle': {
      const id      = normalizeThinkId(args['id']);
      const title   = String(args['title']   ?? '無題のBundle');
      // AI が `* [<id>]` と角括弧付きで書きがちなので外す（parseBundle は素の ID を期待）
      const content = stripBracketedIdsInBundleContent(String(args['content'] ?? ''));
      const res = await bigqueryService.save({
        file_id: id, file_type: 'md', category: 'bundle', title, content,
        keywords: null, related_ids: null, size_bytes: Buffer.byteLength(content, 'utf8'),
        is_deleted: false, created_at: nowStr, updated_at: nowStr, metadata: null,
      });
      if (!res.success) throw new Error(res.error);
      writeSSE({ type: 'delta', text: `\n\n*システム: [Bundle「${title}」を自動登録しました。]*` });
      createdIds.push({ id, category: 'bundle' });
      return `保存完了: id=${id}`;
    }

    case 'saveTable': {
      const id      = normalizeThinkId(args['id']);
      const title   = String(args['title']   ?? '無題のTable');
      const content = String(args['content'] ?? '');
      const res = await bigqueryService.save({
        file_id: id, file_type: 'md', category: 'table', title, content,
        keywords: null, related_ids: null, size_bytes: Buffer.byteLength(content, 'utf8'),
        is_deleted: false, created_at: nowStr, updated_at: nowStr, metadata: null,
      });
      if (!res.success) throw new Error(res.error);
      writeSSE({ type: 'delta', text: `\n\n*システム: [Tableファイル「${title}」を自動登録しました。]*` });
      createdIds.push({ id, category: 'table' });
      return `保存完了: id=${id}`;
    }

    case 'updateBundle': {
      const id        = normalizeThinkId(args['id']);
      const appendIds = Array.isArray(args['appendIds'])
        ? (args['appendIds'] as unknown[]).map(normalizeThinkId).filter(Boolean)
        : [];
      const existing = await bigqueryService.getRecord(id);
      if (!existing.success || !existing.data) throw new Error(`Bundle [${id}] が見つかりません`);
      const rec      = existing.data;
      const appended = `${rec.content ?? ''}\n${appendIds.map(a => `* ${a}`).join('\n')}`.trim();
      const res = await bigqueryService.save({
        ...rec,
        content:    appended,
        size_bytes: Buffer.byteLength(appended, 'utf8'),
        updated_at: nowStr,
      });
      if (!res.success) throw new Error(res.error);
      writeSSE({ type: 'delta', text: `\n\n*システム: [Bundle「${rec.title}」に${appendIds.length}件を追記しました。]*` });
      createdIds.push({ id, category: 'bundle' });
      return `更新完了: id=${id}, 追記=${appendIds.join(', ')}`;
    }

    case 'searchVault': {
      const keyword  = String(args['keyword']  ?? '');
      const category = args['category'] ? String(args['category']) : undefined;
      const result   = await bigqueryService.search(keyword);
      if (!result.success) throw new Error(result.error);
      const rows    = category ? result.data.filter(r => r.category === category) : result.data;
      const summary = rows.slice(0, 20).map(r => ({ id: r.file_id, category: r.category, title: r.title ?? '' }));
      return `検索結果 ${rows.length}件（先頭20件表示）:\n${JSON.stringify(summary, null, 2)}`;
    }

    case 'getThink': {
      const id     = String(args['id'] ?? '');
      const result = await bigqueryService.getRecord(id);
      if (!result.success) throw new Error(result.error);
      if (!result.data)    return `ID [${id}] は見つかりませんでした`;
      const r = result.data;
      return JSON.stringify({ id: r.file_id, category: r.category, title: r.title, content: r.content });
    }

    case 'fetchUrlContent': {
      const url  = String(args['url'] ?? '');
      const meta = await fetchUrlMeta(url);
      return JSON.stringify({ url, ...meta });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── メインのストリーミング関数 ─────────────────────────────────────────────

export async function streamChatResponse(
  messages: ChatRequestMessage[],
  systemPrompt: string,
  res: Response,
  provider?: string,
  model?: string,
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const writeSSE = (payload: object): boolean => {
    if (res.writableEnded) return false;
    return res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  let activeProvider = provider || process.env['AI_PROVIDER'] || 'anthropic';
  if (activeProvider === 'claude') activeProvider = 'anthropic';

  try {
    if (activeProvider === 'anthropic') {
      const apiKey = process.env['ANTHROPIC_API_KEY'];
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
      const client      = new Anthropic({ apiKey });
      // フォールバック値は必ず提供中のモデルにすること。
      // 提供終了モデルを指定すると 404 not_found_error になる
      const activeModel = model || process.env['ANTHROPIC_MODEL'] || 'claude-sonnet-5';

      const stream = client.messages.stream({
        model: activeModel,
        max_tokens: 4096,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });

      stream.on('text', (textDelta) => { writeSSE({ type: 'delta', text: textDelta }); });
      await stream.finalMessage();
      writeSSE({ type: 'done' });

    } else if (activeProvider === 'openai') {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
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
        if (delta) writeSSE({ type: 'delta', text: delta });
      }
      writeSSE({ type: 'done' });

    } else if (activeProvider === 'gemini') {
      const apiKey = process.env['GEMINI_API_KEY'];
      if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

      const genAI       = new GoogleGenerativeAI(apiKey);
      const activeModel = model || process.env['GEMINI_MODEL'] || 'gemini-2.5-flash';

      const genModel = genAI.getGenerativeModel({
        model: activeModel,
        ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
        tools: [{ functionDeclarations: GEMINI_TOOL_DECLARATIONS }],
      });

      const nowStr     = new Date().toISOString();
      const createdIds: Array<{ id: string; category: string }> = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let contents: any[] = messages.map(m => ({
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      // 多段ツール呼び出しループ（最大5ターン）
      for (let turn = 0; turn < 5; turn++) {
        const streamResult = await genModel.generateContentStream({ contents });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const modelParts: any[] = [];
        const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

        for await (const chunk of streamResult.stream) {
          const text = chunk.text();
          if (text) {
            writeSSE({ type: 'delta', text });
            modelParts.push({ text });
          }
          const calls = chunk.functionCalls();
          if (calls && calls.length > 0) {
            for (const call of calls) {
              functionCalls.push(call as { name: string; args: Record<string, unknown> });
              modelParts.push({ functionCall: call });
            }
          }
        }

        if (functionCalls.length === 0) break; // ツール呼び出しがなければ終了

        // ツールを実行し、結果を収集
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const functionResponses: any[] = [];
        for (const call of functionCalls) {
          try {
            const result = await executeGeminiTool(call.name, call.args, writeSSE, nowStr, createdIds);
            functionResponses.push({ functionResponse: { name: call.name, response: { result } } });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            functionResponses.push({ functionResponse: { name: call.name, response: { error: msg } } });
            writeSSE({ type: 'delta', text: `\n\n*システム: [エラー: ${msg}]*` });
          }
        }

        // 次のターンに向けてコンテキストを更新
        contents = [
          ...contents,
          { role: 'model', parts: modelParts },
          { role: 'user',  parts: functionResponses },
        ];
      }

      // done イベント（最後に作成した Bundle を優先して返す）
      const lastBundle  = [...createdIds].reverse().find(x => x.category === 'bundle');
      const last        = createdIds[createdIds.length - 1];
      const final       = lastBundle ?? last;
      if (final) {
        writeSSE({ type: 'done', createdFileId: final.id, category: final.category });
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
