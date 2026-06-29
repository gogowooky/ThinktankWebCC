/**
 * server/index.ts (v6)
 * Express サーバーエントリポイント
 * port 8080: BigQuery CRUD API + AI チャット API + Embedding/セマンティック検索 API（Phase 15）
 */

import express from 'express';
import path    from 'path';
import { fileURLToPath } from 'url';
import { createBigQueryRoutes }   from './routes/bigqueryRoutes.js';
import { bigqueryService }        from './services/BigQueryService.js';
import { createDriveRoutes }      from './routes/driveRoutes.js';
import { driveService }           from './services/driveService.js';
import { createChatRoutes }       from './routes/chatRoutes.js';
import { createSystemRoutes }     from './routes/systemRoutes.js';
import { vectorStoreService }     from './services/VectorStoreService.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const PORT = process.env['PORT'] ?? 8080;

const app = express();
app.use(express.json({ limit: '50mb' }));

// CORS（Vite dev server + WPF WebView2）
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.options(/(.*)/, (_req, res) => { res.sendStatus(204); });

// ヘルスチェック
app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });

// BigQuery CRUD
app.use('/api/bq', createBigQueryRoutes());

// Google Drive upload
app.use('/api/drive', createDriveRoutes());

// AI チャット（Phase 14）
app.use('/api/chat', createChatRoutes());

// システム関連API (DoOnCursorPos 用ローカルファイル起動)
app.use('/api/system', createSystemRoutes());

// 静的ファイル（本番ビルド）
app.use(express.static(path.join(projectRoot, 'dist')));
app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api/')) { res.status(404).json({ error: 'Not found' }); return; }
  const indexPath = path.join(projectRoot, 'dist', 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('<p>Dev mode: open <a href="http://localhost:5173">http://localhost:5173</a></p>');
  }
});

async function start() {
  // 先に listen してリクエストを受け付ける（初期化完了を待たない）
  app.listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
  });

  const key = process.env['GOOGLE_SERVICE_ACCOUNT_KEY'];
  if (!key) {
    console.log('[Server] GOOGLE_SERVICE_ACCOUNT_KEY not set — BigQuery/Drive/Embedding disabled');
    return;
  }

  const [bqOk, driveOk] = await Promise.all([
    bigqueryService.initialize(),
    driveService.initialize(),
  ]);
  console.log(bqOk    ? '[Server] BigQuery initialized'  : '[Server] BigQuery init failed');
  console.log(driveOk ? '[Server] Drive initialized'     : '[Server] Drive init failed');

  if (bqOk) {
    const bq  = bigqueryService.getBigQuery()!;
    const pid = bigqueryService.getProjectId()!;
    await vectorStoreService.initialize(bq, pid);
    console.log('[Server] VectorStore (cleanup) initialized');
  }
}

start();
