#!/usr/bin/env node
/**
 * scripts/run-relay-agent.mjs
 * Web版の開発・運用時に、Electron（PC版ウィンドウ）を開かずに
 * バックグラウンド（ターミナル）で中継役エージェント（RelayAgent）および
 * ローカル開発プロキシサーバー（http://localhost:8080）を常駐起動するスクリプト。
 *
 * これにより、Vite の /api/* プロキシエラー（ECONNREFUSED）を防止し、
 * BigQuery サーバー無しでも新 Vault（.md + .support.json）とローカル AI CLI に直結して動作する。
 */

import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { VaultEngine } = require('../electron/vaultEngine.cjs');
const aiCliRunner = require('../electron/aiCliRunner.cjs');
const { RelayAgent } = require('../electron/relayAgent.cjs');
const shared = require('../electron/shared-dist/index.js');

const PORT = Number(process.env.PORT || 8080);
const appRootDir = process.cwd();
const userDataDir = path.join(os.homedir(), '.thinktank-relay');
const defaultVaultDir =
  process.env.THINKTANK_VAULT_DIR ||
  path.resolve(appRootDir, '.staging_vault/Thinktank/vault_ver2');

const vaultEngine = new VaultEngine({
  userDataDir,
  appRootDir,
  defaultVaultDir,
});

const relayAgent = new RelayAgent({
  userDataDir,
  vaultEngine,
  aiCliRunner,
});

const status = relayAgent.saveConfig({
  enabled: true,
  ...(process.env.VITE_FIREBASE_PROJECT_ID
    ? { firebaseProjectId: process.env.VITE_FIREBASE_PROJECT_ID }
    : {}),
  ...(process.env.VITE_FIREBASE_UID ? { firebaseUid: process.env.VITE_FIREBASE_UID } : {}),
  ...(process.env.VITE_RELAY_PAIRING_SECRET
    ? { pairingSecret: process.env.VITE_RELAY_PAIRING_SECRET }
    : {}),
});

// メモリキャッシュ（5,504件の listMeta を毎回ディスクスキャンせず即座に返すため）
let cachedMetaList = null;

function getMetaListCached() {
  if (!cachedMetaList) {
    cachedMetaList = vaultEngine.listMeta();
  }
  return cachedMetaList;
}

function invalidateMetaCache() {
  cachedMetaList = null;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    const urlObj = new URL(req.url || '/', `http://localhost:${PORT}`);
    const pathname = urlObj.pathname;

    // 1. Health Check
    if (pathname === '/api/health') {
      sendJson(res, 200, {
        status: 'ok',
        mode: 'local-vault-relay',
        vaultDir: vaultEngine.getVaultDir(),
        deviceId: status.deviceId,
      });
      return;
    }

    // 2. Vault Storage API (/api/bq/* 互換エンドポイント -> 新 VaultEngine に直結)
    if (pathname === '/api/bq/files/meta' && req.method === 'GET') {
      sendJson(res, 200, getMetaListCached());
      return;
    }

    if (pathname === '/api/bq/files/search' && req.method === 'GET') {
      const q = urlObj.searchParams.get('q') || '';
      const results = vaultEngine.search(q, 200);
      sendJson(res, 200, results);
      return;
    }

    const contentMatch = pathname.match(/^\/api\/bq\/files\/([^/]+)\/content$/);
    if (contentMatch && req.method === 'GET') {
      const thinkid = decodeURIComponent(contentMatch[1]);
      const body = vaultEngine.getContent(thinkid);
      if (body === null) {
        sendJson(res, 404, { error: 'Not found' });
      } else {
        sendJson(res, 200, body);
      }
      return;
    }

    if (pathname === '/api/bq/files' && req.method === 'POST') {
      const body = await readJsonBody(req);
      try {
        const savedMeta = vaultEngine.saveRecord(body);
        invalidateMetaCache();
        sendJson(res, 200, savedMeta);
      } catch (err) {
        if (err && err.code === 'VERSION_CONFLICT') {
          sendJson(res, 409, {
            error: err.message,
            serverUpdatedAt: err.currentUpdatedAt || '',
          });
        } else {
          sendJson(res, 500, { error: err.message || String(err) });
        }
      }
      return;
    }

    const deleteMatch = pathname.match(/^\/api\/bq\/files\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      const thinkid = decodeURIComponent(deleteMatch[1]);
      vaultEngine.deleteRecord(thinkid);
      invalidateMetaCache();
      sendJson(res, 200, { ok: true });
      return;
    }

    // 3. AI Model Catalog & Conversation Status (/api/think-support/conversations/*)
    if (pathname === '/api/think-support/conversations/models' && req.method === 'GET') {
      sendJson(res, 200, {
        anthropic: ['claude-sonnet-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-haiku-4-5'],
        openai: ['gpt-5.6'],
        gemini: ['gemini-3.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
        local: ['None'],
      });
      return;
    }

    if (pathname === '/api/think-support/conversations/status' && req.method === 'GET') {
      const preferredCli = vaultEngine.config.preferredCli || 'claude';
      sendJson(res, 200, {
        enabled: true,
        provider: `local-cli:${preferredCli}`,
        model: `${preferredCli}-isolated`,
      });
      return;
    }

    // 会話履歴の取得
    const chatHistoryMatch = pathname.match(
      /^\/api\/think-support\/conversations\/(?:chats\/([^/]+)(?:\/bundles\/([^/]+))?|bundles\/([^/]+))$/,
    );
    if (chatHistoryMatch && req.method === 'GET') {
      const targetId = decodeURIComponent(
        chatHistoryMatch[1] || chatHistoryMatch[2] || chatHistoryMatch[3] || '',
      );
      const rec = vaultEngine.getRecord(targetId);
      const log = rec?.support?.thinkConversations || { schemaVersion: 1, turns: [] };
      sendJson(res, 200, log);
      return;
    }

    // 会話 Turn の生成（ローカル AI CLI 設定隔離実行）
    if (pathname === '/api/think-support/conversations/turns' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { requestId, context, question, provider, model } = body;
      const profile = vaultEngine.getActiveDomainProfile();

      let cliName = vaultEngine.config.preferredCli || 'claude';
      if (typeof provider === 'string') {
        const p = provider.toLowerCase();
        if (p.includes('anthropic') || p.includes('claude')) cliName = 'claude';
        else if (p.includes('openai') || p.includes('gpt')) cliName = 'codex';
        else if (p.includes('gemini')) cliName = 'gemini';
      }

      const relatedDocuments = Array.isArray(context?.sources)
        ? context.sources.map((s) => ({
            thinkid: s.thinkId,
            title: s.title,
            category: s.contentType,
            excerpt: String(s.content || '').slice(0, 2000),
          }))
        : [];

      const aiRes = await aiCliRunner.runDomainAiConversation({
        cliName,
        model,
        profile,
        panelRole: context?.scope === 'chat-only' ? 'Thinktank' : 'Discuss',
        bundleId: context?.bundleId || 'default',
        bundleTitle: context?.sources?.[0]?.title || context?.bundleId || 'Chat',
        bundleSummary: context?.manualState?.values?.goal || '',
        currentPhase: context?.manualState?.values?.stage || '',
        nextAction: context?.manualState?.values?.nextAction || '',
        relatedDocuments,
        userMessage: question || '',
      });

      const turn = {
        schemaVersion: 1,
        id: requestId || `turn_${Date.now()}`,
        createdAt: new Date().toISOString(),
        question: question || '',
        context,
        answer: {
          reply: aiRes.reply || '（応答なし）',
          insufficientEvidence: Boolean(aiRes.insufficientEvidence),
          citations: [],
          proposals: [],
        },
        provider: provider || 'anthropic',
        model: model || 'claude-sonnet-5',
      };
      sendJson(res, 200, turn);
      return;
    }

    // 会話 Turn の保存
    const saveTurnMatch = pathname.match(
      /^\/api\/think-support\/conversations\/(?:chats\/([^/]+)(?:\/bundles\/([^/]+))?|bundles\/([^/]+))\/turns\/([^/]+)$/,
    );
    if (saveTurnMatch && req.method === 'PUT') {
      const targetId = decodeURIComponent(
        saveTurnMatch[1] || saveTurnMatch[2] || saveTurnMatch[3] || '',
      );
      const turn = await readJsonBody(req);
      const rec = vaultEngine.getRecord(targetId);
      const existingLog = rec?.support?.thinkConversations || { schemaVersion: 1, turns: [] };
      const existingTurns = Array.isArray(existingLog.turns) ? existingLog.turns : [];
      const nextTurns = existingTurns.some((t) => t.id === turn.id)
        ? existingTurns
        : [...existingTurns, turn];
      const nextLog = { schemaVersion: 1, turns: nextTurns };
      vaultEngine.saveSupportMetadata(targetId, { thinkConversations: nextLog });
      invalidateMetaCache();
      sendJson(res, 200, { ok: true, turns: nextTurns });
      return;
    }

    // 4. ThinkSupport & Progress 互換エンドポイント
    const supportBundleMatch = pathname.match(/^\/api\/think-support\/bundles\/([^/]+)$/);
    if (supportBundleMatch) {
      const bundleId = decodeURIComponent(supportBundleMatch[1]);
      if (req.method === 'GET') {
        const rec = vaultEngine.getRecord(bundleId);
        sendJson(res, 200, rec?.support?.thinkSupport || null);
        return;
      }
      if (req.method === 'PUT') {
        const body = await readJsonBody(req);
        vaultEngine.saveSupportMetadata(bundleId, { thinkSupport: body });
        invalidateMetaCache();
        sendJson(res, 200, body);
        return;
      }
    }

    const progressBundleMatch = pathname.match(/^\/api\/progress\/bundles\/([^/]+)$/);
    if (progressBundleMatch) {
      const bundleId = decodeURIComponent(progressBundleMatch[1]);
      if (req.method === 'GET') {
        const rec = vaultEngine.getRecord(bundleId);
        sendJson(res, 200, rec?.support?.bundleProgress || null);
        return;
      }
      if (req.method === 'PUT') {
        const body = await readJsonBody(req);
        vaultEngine.saveSupportMetadata(bundleId, { bundleProgress: body });
        invalidateMetaCache();
        sendJson(res, 200, body);
        return;
      }
    }

    // 5. E2EE Relay 直接エンドポイント (/api/relay/encrypted)
    if (pathname === '/api/relay/encrypted' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const out = await relayAgent.handleEncryptedRequest(body);
      sendJson(res, 200, out);
      return;
    }

    // 未定義の /api/* には空オブジェクトを返してプロキシエラーを防ぐ
    if (pathname.startsWith('/api/')) {
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[RelayServer Error]', err);
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.log(`[RelayAgent] ポート ${PORT} は既に別プロセス（Express等）が使用中です。Firestore 中継待機のみ継続します。`);
  } else {
    console.error('[RelayAgent] HTTP Server Error:', err);
  }
});

server.listen(PORT, () => {
  console.log('====================================================');
  console.log(` Thinktank Headless Relay Agent & Local Vault Server (Port ${PORT})`);
  console.log('====================================================');
  console.log(` Vault Dir         : ${vaultEngine.getVaultDir()}`);
  console.log(` Device ID         : ${status.deviceId}`);
  console.log(` Pairing Secret    : ${status.pairingSecret}`);
  console.log(` Firebase Project  : ${status.firebaseProjectId || '(未設定: ローカル http://localhost:' + PORT + ' で直接応答中)'}`);
  console.log(` Available AI CLIs : ${status.activeRelayConfig.capabilities.availableClis.join(', ') || 'none'}`);
  console.log('====================================================');
  console.log('Ctrl+C で終了します。Web版からの /api/* リクエストもこの新 Vault & AI CLI で直接処理します。');
});
