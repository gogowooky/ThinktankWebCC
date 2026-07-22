'use strict';

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs   = require('fs');

// パッケージ版（electron-builder）は package.json の "name" からアプリ名・userDataパスを
// 自動的に決定するが、開発時（`electron electron/main.cjs` を直接起動）は同じ仕組みが
// 働かず、Electron既定の "Electron" にフォールバックしてしまう。userDataパスが
// dev/パッケージ版で食い違わないよう、ここで明示的に固定する（app.getPath('userData')
// を呼ぶ前に設定する必要がある）。
app.setName('thinktank');

const isDev    = process.env.NODE_ENV === 'development';
const VAULT_DIR = path.join(app.getPath('userData'), 'thinktank', 'vault');

// ── ヘルパー ──────────────────────────────────────────────────────────────

function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
}

function recordPath(id) {
  return path.join(VAULT_DIR, `${id}.json`);
}

function splitContent(fullContent) {
  const nl = fullContent.indexOf('\n');
  if (nl === -1) return { title: fullContent, body: '' };
  return { title: fullContent.slice(0, nl), body: fullContent.slice(nl + 1) };
}

function toMeta(record) {
  const { content: _content, ...meta } = record;
  return meta;
}

function buildRecord({ id, contentType, title, body, keywords, relatedIds, sizeBytes, isDeleted, createdAt, updatedAt }) {
  return {
    id, contentType, title,
    content:    body,
    keywords:   keywords   || null,
    relatedIds: relatedIds || null,
    sizeBytes,
    isDeleted,
    createdAt,
    updatedAt,
  };
}

// ── IPC ハンドラー ────────────────────────────────────────────────────────

ipcMain.handle('storage:listMeta', () => {
  ensureVaultDir();
  return fs.readdirSync(VAULT_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(VAULT_DIR, f), 'utf8'));
        return toMeta(data);
      } catch { return null; }
    })
    .filter(Boolean);
});

ipcMain.handle('storage:getContent', (_event, id) => {
  const p = recordPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return data.content ?? null;
  } catch { return null; }
});

ipcMain.handle('storage:save', (_event, payload) => {
  ensureVaultDir();
  const { id, contentType, fullContent, keywords, relatedIds } = payload;
  const { title, body } = splitContent(fullContent);
  const now = new Date().toISOString();
  const p   = recordPath(id);

  let createdAt = now;
  if (fs.existsSync(p)) {
    try { createdAt = JSON.parse(fs.readFileSync(p, 'utf8')).createdAt || now; } catch {}
  }

  const record = buildRecord({
    id, contentType, title, body, keywords, relatedIds,
    sizeBytes: Buffer.byteLength(fullContent, 'utf8'),
    isDeleted: false,
    createdAt,
    updatedAt: now,
  });

  fs.writeFileSync(p, JSON.stringify(record, null, 2), 'utf8');
  return toMeta(record);
});

ipcMain.handle('storage:delete', (_event, id) => {
  const p = recordPath(id);
  if (!fs.existsSync(p)) return;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    data.isDeleted = true;
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
});

ipcMain.handle('storage:search', (_event, query) => {
  ensureVaultDir();
  const q = (query || '').toLowerCase();
  return fs.readdirSync(VAULT_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(VAULT_DIR, f), 'utf8')); }
      catch { return null; }
    })
    .filter(d => d && !d.isDeleted && (
      (d.title   || '').toLowerCase().includes(q) ||
      (d.content || '').toLowerCase().includes(q) ||
      (d.keywords|| '').toLowerCase().includes(q)
    ))
    .map(toMeta);
});

// ── BigQuery 同期 ─────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

ipcMain.handle('storage:syncFromServer', async (_event, serverUrl) => {
  ensureVaultDir();
  const base = (serverUrl || 'http://localhost:8080').replace(/\/$/, '');

  // 1. サーバーからメタ一覧を取得
  const serverMetas = await fetchJson(`${base}/api/bq/files/meta`);

  // ローカルより新しいものだけを対象に絞る
  let skipped = 0;
  const toSync = serverMetas.filter(meta => {
    const p = recordPath(meta.id);
    if (fs.existsSync(p)) {
      const local = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (local.updatedAt >= meta.updatedAt) { skipped++; return false; }
    }
    return true;
  });

  // 2. コンテンツを並行取得（対象が多くても順次待ちにしない）
  const fetched = await Promise.all(toSync.map(async (meta) => {
    const p = recordPath(meta.id);
    const isNew = !fs.existsSync(p);
    const res = await fetch(`${base}/api/bq/files/${encodeURIComponent(meta.id)}/content`);
    const content = res.status === 404 ? '' : await res.json();
    return { meta, content, isNew };
  }));

  let added = 0, updated = 0;
  for (const { meta, content, isNew } of fetched) {
    const record = buildRecord({
      id:          meta.id,
      contentType: meta.contentType,
      title:       meta.title || '',
      body:        content || '',
      keywords:    meta.keywords,
      relatedIds:  meta.relatedIds,
      sizeBytes:   meta.sizeBytes || 0,
      isDeleted:   meta.isDeleted || false,
      createdAt:   meta.createdAt,
      updatedAt:   meta.updatedAt,
    });
    fs.writeFileSync(recordPath(meta.id), JSON.stringify(record, null, 2), 'utf8');
    isNew ? added++ : updated++;
  }

  return { added, updated, skipped, total: serverMetas.length };
});

// ── ウィンドウ作成 ──────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width:  1400,
    height: 900,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ── アプリ起動 ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  ensureVaultDir();
  if (isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          // Monaco Editor（TextEditorMedia）は @monaco-editor/react のデフォルト挙動で
          // CDN（cdn.jsdelivr.net）から vs/loader.js 等を取得する。開発時のみ許可する。
          'Content-Security-Policy': [
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* https://cdn.jsdelivr.net; " +
            "connect-src 'self' ws://localhost:* http://localhost:* https://cdn.jsdelivr.net; " +
            "worker-src 'self' blob: https://cdn.jsdelivr.net;",
          ],
        },
      });
    });
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
