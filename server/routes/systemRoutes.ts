import { Router } from 'express';
import { execFile } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEARCH_TAG_FILE = resolve(__dirname, '../../docs/DefaultSearchTag.md');

// search-tags は副作用のない参照データ（検索URLテンプレート）の読み取り専用APIで、
// 秘匿すべき情報を含まない。apiAuth（共有シークレット）の前段で公開し、
// Viteのdevプロキシ経由でしかヘッダーが付与されない構成に依存させない
// （パッケージ版Electronやプロキシなし環境でも動くようにするため）。
export function createPublicSystemRoutes(): Router {
  const router = Router();

  router.get('/search-tags', (_req, res) => {
    try {
      const text = readFileSync(SEARCH_TAG_FILE, 'utf-8');
      const tags: Record<string, string> = {};
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const firstComma = trimmed.indexOf(',');
        const lastComma  = trimmed.lastIndexOf(',');
        if (firstComma === -1 || firstComma === lastComma) continue;
        const id  = trimmed.slice(0, firstComma).trim();
        const url = trimmed.slice(lastComma + 1).trim();
        if (id && url) tags[id] = url;
      }
      res.json(tags);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  return router;
}

export function createSystemRoutes(): Router {
  const router = Router();

  router.post('/open', (req, res) => {
    const { path: filePath } = req.body as { path?: unknown };
    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    console.log(`[Server] Attempting to open path: ${filePath}`);

    // シェル文字列組み立てを避け、execFile + 引数配列で渡すことで
    // コマンドインジェクション（`;`, `&&`, バッククォート等の注入）を防ぐ。
    const platform = process.platform;
    const [cmd, args] = platform === 'win32'
      ? ['cmd', ['/c', 'start', '', filePath]]
      : platform === 'darwin'
        ? ['open', [filePath]]
        : ['xdg-open', [filePath]];

    execFile(cmd, args, (error) => {
      if (error) {
        console.error(`[Server] Failed to open path: ${filePath}`, error);
        res.status(500).json({ error: 'failed to open path' });
        return;
      }
      res.json({ success: true });
    });
  });

  return router;
}
