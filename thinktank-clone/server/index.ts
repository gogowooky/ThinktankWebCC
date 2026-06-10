// サーバー起動、ミドルウェア設定、APIルートの登録

import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bigqueryRoutes } from './routes/bigqueryRoutes.ts';
import { chatRoutes } from './routes/chatRoutes.ts';

// dotenv 非依存の .env 読み込み（プロジェクト直下 / server/ の順に探索）
const serverDir = path.dirname(fileURLToPath(import.meta.url));
for (const envPath of [path.join(serverDir, '..', '.env'), path.join(serverDir, '.env')]) {
  try {
    const text = fs.readFileSync(envPath, 'utf-8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // .env が無ければスキップ
  }
}

const app = express();
const PORT = Number(process.env.PORT ?? 8081);

app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.use('/api/bq', bigqueryRoutes);
app.use('/api/chat', chatRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, provider: process.env.AI_PROVIDER ?? 'anthropic' });
});

app.listen(PORT, () => {
  console.log(`[thinktank-clone] server listening on http://localhost:${PORT}`);
});
