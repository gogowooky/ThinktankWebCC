/**
 * server/index.ts
 * Express + WebSocket server entry point
 *
 * Production: serves static files from dist/ + REST API + WebSocket
 * Development: API server only (Vite handles frontend)
 */

import express from 'express';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

import { createBigQueryRoutes } from './routes/bigqueryRoutes.js';
import { createChatRoutes } from './routes/chatRoutes.js';
import { createFetchRoutes } from './routes/fetchRoutes.js';
import { createViewRoutes } from './routes/viewRoutes.js';
import { bigqueryService } from './services/BigQueryService.js';
import { chatService } from './services/ChatService.js';
import { authMiddleware, authRoutes } from './middleware/authMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '10mb' }));

// Auth routes and middleware
app.use('/api/auth', authRoutes());
app.use(authMiddleware());

// Static files (production build)
app.use(express.static(path.join(projectRoot, 'dist')));

// API routes
app.use('/api/bq', createBigQueryRoutes());
app.use('/api/chat', createChatRoutes());
app.use('/api', createFetchRoutes());

// View routes (content rendering for WebView iframe / browser)
app.use('/view', createViewRoutes());

// SPA fallback
app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(projectRoot, 'dist', 'index.html'));
});

// HTTP + WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const clients: Set<WebSocket> = new Set();

wss.on('connection', (ws: WebSocket) => {
  console.log('[WebSocket] Client connected');
  clients.add(ws);

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('[WebSocket] Received:', message.type);

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

function broadcastToOthers(sender: WebSocket, message: unknown): void {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

export function broadcastToAll(message: unknown): void {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

async function startServer() {
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

  chatService.initialize();

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server available at ws://localhost:${PORT}/ws`);
  });
}

startServer();
