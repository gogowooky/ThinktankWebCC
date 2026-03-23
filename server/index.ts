/**
 * server/index.ts
 * Express サーバーのエントリポイント
 * 
 * 本番環境 (Cloud Run) で使用するサーバー
 * WebSocket対応で複数ブラウザ間のリアルタイム同期に対応
 */

import express from 'express';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

import { createBigQueryRoutes } from './routes/bigqueryRoutes.js';
import { createChatRoutes } from './routes/chatRoutes.js';
import { bigqueryService } from './services/BigQueryService.js';
import { authMiddleware, authRoutes } from './middleware/authMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// プロジェクトルートは server/ の親ディレクトリ
const projectRoot = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 8080;

// JSON パーサー設定
app.use(express.json({ limit: '10mb' }));

// 認証ルートとミドルウェア
app.use('/api/auth', authRoutes());
app.use(authMiddleware());

// 静的ファイル配信 (dist ディレクトリ)
app.use(express.static(path.join(projectRoot, 'dist')));

// APIルートのマウント
app.use('/api/bq', createBigQueryRoutes());
app.use('/api/chats', createChatRoutes());   // Phase 11 段122

// SPA フォールバック
app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(projectRoot, 'dist', 'index.html'));
});

// HTTP サーバーを作成（WebSocket用）
const server = http.createServer(app);

// WebSocket サーバーを作成
const wss = new WebSocketServer({ server, path: '/ws' });

// 接続中のクライアントセット
const clients: Set<WebSocket> = new Set();

// WebSocket接続処理
wss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Client connected');
    clients.add(ws);

    ws.on('message', (data: Buffer) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('[WebSocket] Received:', message.type);

            // content-updateメッセージを他のクライアントにブロードキャスト
            if (message.type === 'content-update') {
                broadcastToOthers(ws, message);
            }
        } catch (e) {
            console.error('[WebSocket] Invalid message:', e);
        }
    });

    ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('[WebSocket] Error:', error);
        clients.delete(ws);
    });
});

// 送信元以外の全クライアントにブロードキャスト
function broadcastToOthers(sender: WebSocket, message: unknown): void {
    const data = JSON.stringify(message);
    clients.forEach(client => {
        if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// 全クライアントにブロードキャスト（APIからも呼び出し可能）
export function broadcastToAll(message: unknown): void {
    const data = JSON.stringify(message);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// サーバー起動
async function startServer() {
    // BigQuery API の初期化（環境変数が設定されている場合のみ）
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        const bqInitialized = await bigqueryService.initialize();
        if (bqInitialized) {
            console.log('BigQuery API initialized successfully');
        } else {
            console.warn('BigQuery API initialization failed');
        }
    } else {
        console.log('GOOGLE_SERVICE_ACCOUNT_KEY not set, BigQuery API disabled');
    }

    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`WebSocket server available at ws://localhost:${PORT}/ws`);
    });
}

startServer();
