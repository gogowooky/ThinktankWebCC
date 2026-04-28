/**
 * viewRoutes.ts
 * コンテンツ表示用ルート
 *
 * /view/{viewType}?{params} 形式のURLに対して、
 * スタンドアロンHTMLページを返す。
 *
 * WebViewのiframe内表示、およびブラウザ単独表示の両方で使用。
 *
 * 現在のviewType:
 *   /view/markdown?category=Memos&id={id} - MarkdownをHTML変換して表示
 *
 * 将来の拡張例:
 *   /view/chat?session={id}
 *   /view/search?q={keyword}&category={cat}
 *   /view/related?id={id}
 */

import { Router, Request, Response } from 'express';
import { bigqueryService } from '../services/BigQueryService.js';
import { markdownToHtml } from '../utils/markdownToHtml.js';

const PAGE_STYLE = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #1e1e1e; color: #ccc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px; line-height: 1.7;
  padding: 24px 32px; max-width: 900px; margin: 0 auto;
}
h1, h2, h3, h4, h5, h6 { color: #e0e0e0; margin: 1em 0 0.4em; }
h1 { font-size: 1.6em; border-bottom: 1px solid #444; padding-bottom: 6px; }
h2 { font-size: 1.3em; border-bottom: 1px solid #333; padding-bottom: 4px; }
h3 { font-size: 1.15em; }
p { margin: 0.5em 0; }
ul, ol { margin: 0.5em 0; padding-left: 1.5em; }
li { margin: 0.2em 0; }
code { background: #2d2d30; padding: 2px 5px; border-radius: 3px; font-size: 0.9em; }
pre { background: #2d2d30; padding: 12px; border-radius: 6px; overflow-x: auto; }
pre code { background: none; padding: 0; }
a { color: #4fc1ff; text-decoration: none; }
a:hover { text-decoration: underline; }
hr { border: none; border-top: 1px solid #444; margin: 1em 0; }
strong { color: #e0e0e0; }
.error { color: #ff6b6b; text-align: center; margin-top: 2em; }
`;

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function createViewRoutes(): Router {
  const router = Router();

  /**
   * GET /view/markdown?category=Memos&id={id}
   * BigQueryからアイテム取得 → Markdown→HTML変換 → HTML返却
   */
  router.get('/markdown', async (req: Request, res: Response) => {
    const id = (Array.isArray(req.query.id) ? req.query.id[0] : req.query.id) as string | undefined;

    if (!id) {
      res.status(400).send(wrapHtml('Error', '<p class="error">Parameter "id" is required</p>'));
      return;
    }

    try {
      const result = await bigqueryService.getFile(id);

      if (!result.success || !result.data || result.data.length === 0) {
        res.status(404).send(wrapHtml('Not Found', `<p class="error">Item not found: ${id}</p>`));
        return;
      }

      const record = result.data[0];
      const content = record.content || '';
      const title = record.title || id;
      const html = markdownToHtml(content);

      res.send(wrapHtml(title + ' - Thinktank', html));
    } catch (error) {
      console.error('[ViewRoutes] Markdown error:', error);
      res.status(500).send(wrapHtml('Error', '<p class="error">Internal Server Error</p>'));
    }
  });

  return router;
}
