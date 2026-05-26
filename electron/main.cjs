'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

const isDev    = process.env.NODE_ENV === 'development';
const VAULT_DIR = path.join(app.getPath('userData'), 'thinktank', 'vault');
const HISTORY_DIR = path.join(app.getPath('userData'), 'thinktank', 'history');

// ── ヘルパー ──────────────────────────────────────────────────────────────

function ensureVaultDir() {
  if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
}

function ensureHistoryDir() {
  if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

function historyPath(historyId) {
  return path.join(HISTORY_DIR, `${historyId}.json`);
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

  const record = {
    id, contentType, title,
    content:    body,
    keywords:   keywords   || null,
    relatedIds: relatedIds || null,
    sizeBytes:  Buffer.byteLength(fullContent, 'utf8'),
    isDeleted:  false,
    createdAt,
    updatedAt:  now,
  };

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

ipcMain.handle('storage:listHistoryMeta', (_event, thinkId) => {
  ensureHistoryDir();
  return fs.readdirSync(HISTORY_DIR)
    .filter(f => f.endsWith('.json') && f.startsWith(thinkId + '_'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), 'utf8'));
        const { content: _content, ...meta } = data;
        return meta;
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
});

ipcMain.handle('storage:getHistoryContent', (_event, historyId) => {
  const p = historyPath(historyId);
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return data.content ?? null;
  } catch { return null; }
});

ipcMain.handle('storage:saveHistory', (_event, payload) => {
  ensureHistoryDir();
  const { thinkId, timestamp, fullContent, summary } = payload;
  const { title, body } = splitContent(fullContent);
  const tsSafe = timestamp.replace(/[:T]/g, '-').replace(/Z/g, '');
  const historyId = `${thinkId}_${tsSafe}`;
  const p = historyPath(historyId);

  const record = {
    historyId,
    thinkId,
    timestamp,
    title,
    content: body,
    contentType: 'memo',
    summary: summary || null,
  };

  fs.writeFileSync(p, JSON.stringify(record, null, 2), 'utf8');
  const { content: _content, ...meta } = record;
  return meta;
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

  let added = 0, updated = 0, skipped = 0;

  for (const meta of serverMetas) {
    const p = recordPath(meta.id);
    // ローカルより新しいものだけ取得
    if (fs.existsSync(p)) {
      const local = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (local.updatedAt >= meta.updatedAt) { skipped++; continue; }
    }

    // 2. コンテンツを取得
    const res = await fetch(`${base}/api/bq/files/${encodeURIComponent(meta.id)}/content`);
    const content = res.status === 404 ? '' : await res.json();

    const record = {
      id:         meta.id,
      contentType:meta.contentType,
      title:      meta.title      || '',
      content:    content         || '',
      keywords:   meta.keywords   || null,
      relatedIds: meta.relatedIds || null,
      sizeBytes:  meta.sizeBytes  || 0,
      isDeleted:  meta.isDeleted  || false,
      createdAt:  meta.createdAt,
      updatedAt:  meta.updatedAt,
    };

    const isNew = !fs.existsSync(p);
    fs.writeFileSync(p, JSON.stringify(record, null, 2), 'utf8');
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
