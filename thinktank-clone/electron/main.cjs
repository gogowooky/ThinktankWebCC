// Electron メインプロセス：IPC受信、ローカルFSのCRUD（仕様書05 §2）
// CJS固定（ES Module 形式に書き換えないこと）

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const VAULT_DIR = () => path.join(app.getPath('userData'), 'thinktank', 'vault');

async function ensureDir() {
  await fs.mkdir(VAULT_DIR(), { recursive: true });
}

function filePath(id) {
  const safe = String(id).replace(/[\\/:*?"<>|]/g, '_');
  return path.join(VAULT_DIR(), `${safe}.json`);
}

function splitContent(fullContent) {
  const idx = fullContent.indexOf('\n');
  if (idx < 0) return { title: fullContent, body: '' };
  return { title: fullContent.slice(0, idx), body: fullContent.slice(idx + 1) };
}

async function readAll() {
  await ensureDir();
  const files = await fs.readdir(VAULT_DIR());
  const result = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      result.push(JSON.parse(await fs.readFile(path.join(VAULT_DIR(), f), 'utf-8')));
    } catch {
      // 壊れたファイルはスキップ
    }
  }
  return result;
}

const toMeta = (rec) => {
  const { content, ...meta } = rec;
  return meta;
};

ipcMain.handle('tt:listMeta', async () => {
  const all = await readAll();
  return all.filter((t) => !t.isDeleted).map(toMeta);
});

ipcMain.handle('tt:getContent', async (_e, id) => {
  try {
    const rec = JSON.parse(await fs.readFile(filePath(id), 'utf-8'));
    if (rec.isDeleted) return null;
    return rec.content === '' ? rec.title : `${rec.title}\n${rec.content}`;
  } catch {
    return null;
  }
});

ipcMain.handle('tt:save', async (_e, payload) => {
  await ensureDir();
  const { title, body } = splitContent(payload.fullContent ?? '');
  const now = new Date().toISOString();
  let createdAt = now;
  try {
    const existing = JSON.parse(await fs.readFile(filePath(payload.id), 'utf-8'));
    createdAt = existing.createdAt || now;
  } catch {
    // 新規作成
  }
  const rec = {
    id: payload.id,
    contentType: payload.contentType || 'memo',
    title,
    content: body,
    keywords: payload.keywords ?? '',
    relatedIds: payload.relatedIds ?? '',
    sizeBytes: Buffer.byteLength(payload.fullContent ?? '', 'utf-8'),
    isDeleted: false,
    createdAt,
    updatedAt: now,
  };
  await fs.writeFile(filePath(payload.id), JSON.stringify(rec, null, 2), 'utf-8');
  return toMeta(rec);
});

ipcMain.handle('tt:delete', async (_e, id) => {
  try {
    const rec = JSON.parse(await fs.readFile(filePath(id), 'utf-8'));
    rec.isDeleted = true;
    rec.updatedAt = new Date().toISOString();
    await fs.writeFile(filePath(id), JSON.stringify(rec, null, 2), 'utf-8');
  } catch {
    // 存在しなければ何もしない
  }
});

ipcMain.handle('tt:search', async (_e, query) => {
  const q = String(query).toLowerCase();
  const all = await readAll();
  return all
    .filter((t) => !t.isDeleted)
    .filter((t) =>
      t.title.toLowerCase().includes(q)
      || t.content.toLowerCase().includes(q)
      || (t.keywords || '').toLowerCase().includes(q))
    .map(toMeta);
});

// 差分同期（仕様書05 §4）: Expressサーバーのメタと比較してローカルへインポート
ipcMain.handle('tt:syncFromServer', async () => {
  const base = process.env.THINKTANK_SERVER ?? 'http://localhost:8081';
  const metaRes = await fetch(`${base}/api/bq/files/meta`);
  if (!metaRes.ok) throw new Error(`サーバー接続失敗: ${metaRes.status}`);
  const serverMetas = await metaRes.json();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const meta of serverMetas) {
    let local = null;
    try {
      local = JSON.parse(await fs.readFile(filePath(meta.id), 'utf-8'));
    } catch {
      // ローカル未保存
    }
    if (local && local.updatedAt >= meta.updatedAt) {
      skipped++;
      continue;
    }
    const contentRes = await fetch(`${base}/api/bq/files/${encodeURIComponent(meta.id)}/content`);
    if (!contentRes.ok) continue;
    const { content } = await contentRes.json();
    const idx = content.indexOf('\n');
    const rec = {
      ...meta,
      title: idx < 0 ? content : content.slice(0, idx),
      content: idx < 0 ? '' : content.slice(idx + 1),
    };
    await ensureDir();
    await fs.writeFile(filePath(meta.id), JSON.stringify(rec, null, 2), 'utf-8');
    if (local) updated++;
    else added++;
  }
  return { added, updated, skipped, total: serverMetas.length };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
