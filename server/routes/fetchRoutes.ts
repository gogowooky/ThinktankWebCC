/**
 * fetchRoutes.ts
 * URL内容取得API - チャットコンテキスト用
 *
 * POST /api/fetch-urls
 *   リクエスト: { urls: string[] }
 *   レスポンス: { results: { url, text?, error? }[] }
 */

import { Router, Request, Response } from 'express';

export function createFetchRoutes(): Router {
  const router = Router();

  // POST /api/fetch-urls - 複数URLのテキスト内容を取得
  router.post('/fetch-urls', async (req: Request, res: Response) => {
    const { urls } = req.body as { urls?: string[] };

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      res.status(400).json({ error: 'urls array is required' });
      return;
    }

    // 最大10URLに制限
    const limitedUrls = urls.slice(0, 10);

    const results = await Promise.all(
      limitedUrls.map(async (url: string) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Thinktank/1.0' },
          });
          clearTimeout(timeout);

          if (!response.ok) {
            return { url, error: `HTTP ${response.status}` };
          }

          const contentType = response.headers.get('content-type') || '';

          // テキスト系のみ対応
          if (contentType.includes('text/') || contentType.includes('json') || contentType.includes('xml')) {
            let text = await response.text();
            // HTMLの場合はタグを除去して本文を抽出
            if (contentType.includes('html')) {
              text = extractTextFromHtml(text);
            }
            // 最大10000文字に制限
            if (text.length > 10000) {
              text = text.substring(0, 10000) + '\n...(truncated)';
            }
            return { url, text };
          }

          return { url, error: `Unsupported content type: ${contentType}` };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return { url, error: msg };
        }
      })
    );

    res.json({ results });
  });

  return router;
}

/** HTMLからテキストを抽出（簡易版） */
function extractTextFromHtml(html: string): string {
  // script/style タグの中身を除去
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // HTMLタグを除去
  text = text.replace(/<[^>]+>/g, ' ');
  // HTMLエンティティをデコード
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  // 連続空白を整理
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}
