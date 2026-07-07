import { Router } from 'express';
import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEARCH_TAG_FILE = resolve(__dirname, '../../docs/DefaultSearchTag.md');

export function createSystemRoutes(): Router {
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

  router.post('/open', (req, res) => {
    const { path: filePath } = req.body;
    if (!filePath) {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    console.log(`[Server] Attempting to open path: ${filePath}`);

    const platform = process.platform;
    let cmd = '';
    if (platform === 'win32') {
      cmd = `cmd /c start "" "${filePath}"`;
    } else if (platform === 'darwin') {
      cmd = `open "${filePath}"`;
    } else {
      cmd = `xdg-open "${filePath}"`;
    }

    exec(cmd, (error) => {
      if (error) {
        console.error(`[Server] Failed to open path: ${filePath}`, error);
        res.status(500).json({ error: error.message });
        return;
      }
      res.json({ success: true });
    });
  });

  return router;
}
