/**
 * server/index.ts (v6)
 * Express サーバーエントリポイント
 * port 8080: BigQuery CRUD API + AI チャット API + Embedding/セマンティック検索 API（Phase 15）
 */

// 最初の import であることが重要（.env の値を参照する他モジュールより必ず先に評価させるため）
import './loadEnv.js';

import express from 'express';
import path    from 'path';
import fs      from 'fs';
import { fileURLToPath } from 'url';
import { createBigQueryRoutes }   from './routes/bigqueryRoutes.js';
import { bigqueryService }        from './services/BigQueryService.js';
import { createDriveRoutes }      from './routes/driveRoutes.js';
import { driveService }           from './services/driveService.js';
import { createChatRoutes }       from './routes/chatRoutes.js';
import { createSystemRoutes, createPublicSystemRoutes } from './routes/systemRoutes.js';
import { vectorStoreService }     from './services/VectorStoreService.js';
import { apiAuth }                from './middleware/apiAuth.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const PORT = process.env['PORT'] ?? 8080;

const app = express();
app.use(express.json({ limit: '50mb' }));

// CORS: 既知のオリジン（Vite dev server）以外にはヘッダーを返さない。
// 同一オリジン（Cloud Run 上で dist/ を配信するケース）はブラウザが CORS
// ヘッダーを参照しないため、ここに含めなくても正常に動作する。
const CORS_ALLOWED_ORIGINS = new Set(['http://localhost:5173']);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ALLOWED_ORIGINS.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Thinktank-Api-Key');
  }
  next();
});
app.options(/(.*)/, (_req, res) => { res.sendStatus(204); });

// ヘルスチェック（認証不要）
app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });

// 検索タグ一覧（認証不要・副作用のない参照データ）。Viteのdevプロキシに依存せず
// パッケージ版Electron/本番でも動かすため apiAuth の手前で公開する。
app.use('/api/system', createPublicSystemRoutes());

// 以降の /api/* は共有シークレット認証（API_SHARED_SECRET 未設定時はスキップ）
app.use('/api', apiAuth);

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

  // アセット（/assets/以下）または明示的な拡張子を持つファイルへのリクエストで、
  // 物理ファイルが存在しない場合は index.html ではなく 404 を返す
  if (req.path.startsWith('/assets/') || /\.[a-zA-Z0-9]+$/.test(req.path)) {
    res.status(404).send('Not Found');
    return;
  }

  const indexPath = path.join(projectRoot, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
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
