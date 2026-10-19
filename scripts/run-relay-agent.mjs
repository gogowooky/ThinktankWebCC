#!/usr/bin/env node
/**
 * scripts/run-relay-agent.mjs
 * Web版の開発・運用時に、Electron（PC版ウィンドウ）を開かずに
 * バックグラウンド（ターミナル）で中継役エージェント（RelayAgent）および
 * ローカル開発プロキシサーバー（http://localhost:8080）を常駐起動するスクリプト。
 *
 * これにより、Vite の /api/* プロキシエラー（ECONNREFUSED）を防止し、
 * 新 Vault（.md + .support.json）とローカル AI CLI に直結して動作する。
 */

import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config();

const { VaultEngine } = require('../electron/vaultEngine.cjs');
const aiCliRunner = require('../electron/aiCliRunner.cjs');
const { RelayAgent } = require('../electron/relayAgent.cjs');
const shared = require('../electron/shared-dist/index.js');

const PORT = Number(process.env.PORT || 8080);
const appRootDir = process.cwd();
const userDataDir = path.join(os.homedir(), '.thinktank-relay');

function resolveDefaultVaultDir() {
  if (process.env.THINKTANK_VAULT_DIR) {
    return process.env.THINKTANK_VAULT_DIR;
  }
  const gDriveCandidates = [
    'G:\\マイドライブ\\Thinktank\\vault_ver2',
    'G:\\My Drive\\Thinktank\\vault_ver2',
  ];
  for (const candidate of gDriveCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.resolve(appRootDir, '.staging_vault/Thinktank/vault_ver2');
}

const defaultVaultDir = resolveDefaultVaultDir();

const vaultEngine = new VaultEngine({
  userDataDir,
  appRootDir,
  defaultVaultDir,
  deviceIdPrefix: 'agent',
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

function isSameOriginRequest(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || '';
  return (
    origin === `http://localhost:${PORT}` ||
    origin === `http://127.0.0.1:${PORT}` ||
    origin === 'http://localhost:5173' ||
    origin === 'http://127.0.0.1:5173' ||
    (projectId &&
      (origin === `https://${projectId}.web.app` ||
        origin === `https://${projectId}.firebaseapp.com`))
  );
}

// localhost は Firebase Auth の承認済みドメインに既定で含まれるため、ここでポップアップログインできる
function renderLoginPage() {
  const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || '',
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
    appId: process.env.VITE_FIREBASE_APP_ID || '',
  };
  const current = relayAgent.getStatus();
  const initial = {
    signedIn: current.firebaseSignedIn,
    email: current.firebaseEmail,
    uid: current.firebaseUid,
  };
  const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thinktank 中継役PC ログイン</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 560px; margin: 40px auto; padding: 0 16px; color: #16161f; background: #f2f7fa; }
  button { padding: 8px 14px; font-size: 14px; border-radius: 4px; border: 1px solid #1d618f; background: #1d618f; color: #fff; cursor: pointer; margin-right: 6px; }
  button.secondary { background: #fff; color: #1d618f; }
  #status { margin-top: 16px; padding: 10px; border-radius: 6px; background: #fff; border: 1px solid rgba(29,97,143,.28); white-space: pre-wrap; }
</style>
</head>
<body>
<h1>中継役PC（${current.deviceId}）の Firebase ログイン</h1>
<p>Web版で使っているのと同じ Google アカウントでログインしてください。</p>
<button id="login">Google でログイン</button>
<button id="logout" class="secondary">ログアウト</button>
<div id="status"></div>
<script type="module">
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
  import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
  const initial = ${json(initial)};
  const statusEl = document.getElementById('status');
  const show = (s) => { statusEl.textContent = s; };
  show(initial.signedIn ? 'ログイン中: ' + (initial.email || '(メール不明)') + '\\nUID: ' + initial.uid : '未ログイン');
  const auth = getAuth(initializeApp(${json(firebaseConfig)}));
  document.getElementById('login').onclick = async () => {
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      const res = await fetch('/relay-login/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: cred.user.refreshToken, email: cred.user.email || '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
      show('ログインしました: ' + (data.email || '(メール不明)') + '\\nUID: ' + data.uid + '\\nこのタブは閉じてかまいません。');
    } catch (e) {
      show('ログイン失敗: ' + (e && e.message ? e.message : e));
    }
  };
  document.getElementById('logout').onclick = async () => {
    await signOut(auth).catch(() => {});
    await fetch('/relay-login/signout', { method: 'POST' });
    show('ログアウトしました。');
  };
</script>
</body>
</html>`;
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

    // 0. Firebase ログイン（中継役PCを Web版と同じ Google アカウントの uid で Firestore に接続する）
    if (pathname === '/relay-login' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderLoginPage());
      return;
    }

    if (pathname === '/relay-login/session' && req.method === 'GET') {
      if (!isSameOriginRequest(req)) {
        sendJson(res, 403, { error: 'Forbidden origin' });
        return;
      }
      const st = relayAgent.getStatus();
      sendJson(res, 200, {
        signedIn: st.firebaseSignedIn,
        uid: st.firebaseUid || '',
        email: st.firebaseEmail || '',
        refreshToken: relayAgent.config.firebaseRefreshToken || '',
        deviceId: st.deviceId,
        pairingSecret: st.pairingSecret,
        firebaseProjectId: st.firebaseProjectId || '',
      });
      return;
    }

    if (pathname.startsWith('/relay-login/') && req.method === 'POST') {
      // 他のサイトから自分の refresh token を送り込まれ、別アカウントの領域を待ち受けさせられるのを防ぐ
      if (!isSameOriginRequest(req)) {
        sendJson(res, 403, { error: 'Forbidden origin' });
        return;
      }
      if (pathname === '/relay-login/token') {
        const body = await readJsonBody(req);
        if (!body.refreshToken) {
          sendJson(res, 400, { error: 'refreshToken is required' });
          return;
        }
        try {
          const st = await relayAgent.setFirebaseRefreshToken(body.refreshToken, body.email || '');
          console.log(`[RelayAgent] Firebase にログインしました: ${st.firebaseEmail || '(メール不明)'} (uid: ${st.firebaseUid})`);
          sendJson(res, 200, { ok: true, uid: st.firebaseUid, email: st.firebaseEmail });
        } catch (err) {
          sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
        return;
      }
      if (pathname === '/relay-login/signout') {
        relayAgent.signOutFirebase();
        console.log('[RelayAgent] Firebase からログアウトしました。');
        sendJson(res, 200, { ok: true });
        return;
      }
    }

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

    // 2. Vault Storage API (/api/vault/* -> 新 VaultEngine に直結)
    if (pathname === '/api/vault/files/meta' && req.method === 'GET') {
      sendJson(res, 200, getMetaListCached());
      return;
    }

    if (pathname === '/api/vault/files/search' && req.method === 'GET') {
      const q = urlObj.searchParams.get('q') || '';
      const results = vaultEngine.search(q, 200);
      sendJson(res, 200, results);
      return;
    }

    const contentMatch = pathname.match(/^\/api\/vault\/files\/([^/]+)\/content$/);
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

    if (pathname === '/api/vault/files' && req.method === 'POST') {
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

    const deleteMatch = pathname.match(/^\/api\/vault\/files\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      const thinkid = decodeURIComponent(deleteMatch[1]);
      vaultEngine.deleteRecord(thinkid);
      invalidateMetaCache();
      sendJson(res, 200, { ok: true });
      return;
    }

    // 3. AI 会話（/api/think-support/conversations/*）。履歴と保存は画面側が /api/vault 経由で行う
    if (pathname === '/api/think-support/conversations/status' && req.method === 'GET') {
      const preferredCli = vaultEngine.config.preferredCli || 'claude';
      sendJson(res, 200, {
        enabled: true,
        provider: `local-cli:${preferredCli}`,
        model: `${preferredCli}-isolated`,
      });
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

    // 4. E2EE Relay 直接エンドポイント (/api/relay/encrypted)
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
    console.log(`[RelayAgent] ポート ${PORT} は既に別プロセスが使用中です。Firestore 中継待機のみ継続します。`);
  } else {
    console.error('[RelayAgent] HTTP Server Error:', err);
  }
});

// Vault 読み書きと AI CLI 実行を認証なしで受けるので、LAN 上の第三者から届かないようループバックに限定する
server.listen(PORT, '127.0.0.1', () => {
  console.log('====================================================');
  console.log(` Thinktank Headless Relay Agent & Local Vault Server (Port ${PORT})`);
  console.log('====================================================');
  console.log(` Vault Dir         : ${vaultEngine.getVaultDir()}`);
  console.log(` Device ID         : ${status.deviceId}`);
  console.log(` Pairing Secret    : ${status.pairingSecret}`);
  console.log(` Firebase Project  : ${status.firebaseProjectId || '(未設定: ローカル http://localhost:' + PORT + ' で直接応答中)'}`);
  console.log(` Available AI CLIs : ${status.activeRelayConfig.capabilities.availableClis.join(', ') || 'none'}`);
  const loginState = relayAgent.getStatus();
  console.log(
    ` Firebase Login    : ${
      loginState.firebaseSignedIn
        ? `${loginState.firebaseEmail || '(メール不明)'} (uid: ${loginState.firebaseUid})`
        : `未ログイン → http://localhost:${PORT}/relay-login を開いてログインしてください`
    }`,
  );
  console.log('====================================================');
  console.log('Ctrl+C で終了します。Web版からの /api/* リクエストもこの新 Vault & AI CLI で直接処理します。');
});
