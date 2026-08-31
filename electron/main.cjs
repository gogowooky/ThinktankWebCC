'use strict';

const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const path   = require('path');
const fs     = require('fs');
const net    = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');

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
  const files = fs.readdirSync(VAULT_DIR).filter(f => f.endsWith('.json'));

  // 読み取り失敗を握り潰すと「0件ロード」という結果だけが残り原因を追えなくなる。
  // 権限エラー(EPERM/EACCES)とJSON破損を区別できるよう、種類ごとに集計して出す。
  const errors = new Map();
  const metas  = [];
  for (const f of files) {
    try {
      metas.push(toMeta(JSON.parse(fs.readFileSync(path.join(VAULT_DIR, f), 'utf8'))));
    } catch (e) {
      const key = `${e.code ?? 'parse'}: ${String(e.message).slice(0, 80)}`;
      errors.set(key, (errors.get(key) ?? 0) + 1);
    }
  }

  if (errors.size > 0) {
    console.error(`[Vault] listMeta: ${files.length}件中 ${files.length - metas.length}件を読めませんでした`);
    for (const [k, v] of errors) console.error(`  ${v}件  ${k}`);
  }
  return metas;
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

/**
 * BigQuery 同期の取得先と認証情報を決める。
 *
 * /api/* は共有シークレット認証が有効なので、ヘッダーを付けないと 401 になる。
 * レンダラー側は vite proxy がヘッダーを注入してくれるが、この同期処理は
 * メインプロセスから直接サーバーを叩くため proxy を経由しない。
 */
function getSyncTarget(explicitUrl) {
  // パッケージ版: 自前で起動したサーバー（BigQuery 認証情報を持つ）を使う
  if (!explicitUrl && serverOrigin) {
    return { base: serverOrigin, apiKey: serverApiKey };
  }
  // dev: concurrently が起動した 8080 のサーバー。鍵は server/.env から読む。
  // localhost は ::1 に解決されうるが、サーバーは 127.0.0.1 バインドなので明示する。
  const base = (explicitUrl || 'http://127.0.0.1:8080').replace(/\/$/, '');
  return { base, apiKey: serverApiKey || loadServerEnv().API_SHARED_SECRET };
}

async function fetchJson(url, apiKey) {
  const res = await fetch(url, { headers: apiKey ? { 'X-Thinktank-Api-Key': apiKey } : {} });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

ipcMain.handle('storage:syncFromServer', async (_event, serverUrl) => {
  ensureVaultDir();
  const { base, apiKey } = getSyncTarget(serverUrl);
  const authHeaders = apiKey ? { 'X-Thinktank-Api-Key': apiKey } : {};

  // 1. サーバーからメタ一覧を取得
  const serverMetas = await fetchJson(`${base}/api/bq/files/meta`, apiKey);

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
    const res = await fetch(`${base}/api/bq/files/${encodeURIComponent(meta.id)}/content`, { headers: authHeaders });
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}: content ${meta.id}`);
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

// ── ローカルサーバー管理（パッケージ版） ────────────────────────────────────
//
// dev では concurrently が server(8080) と vite(5173) を起動するため、ここでは何もしない。
// パッケージ版には起動役がいないので、メインプロセスが dist-server を子プロセスとして
// 起動し、UI もそのサーバー自身から配信する。
//
// file:// で dist/index.html を読み込まない理由:
//   ① 相対パス '/api/...' が file:///api/... に解決されサーバーへ到達できない
//   ② onHeadersReceived が発火せず CSP を適用できない
// サーバー配信（http://127.0.0.1:PORT）にすれば、どちらも自然に解決する。

let serverProcess = null;
let serverApiKey  = null;
/** 自前で起動したローカルサーバーのオリジン。dev（起動しない）では null */
let serverOrigin  = null;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/**
 * アプリのルートディレクトリ。
 *   開発時        : <repo>/electron/main.cjs   → <repo>
 *   パッケージ版  : resources/app/electron/main.cjs → resources/app
 * どちらも __dirname の 1 つ上で一致する。
 *
 * app.getAppPath() は使わないこと。開発時（electron に main.cjs のパスを直接渡す起動）
 * では <repo>/electron を返し、リポジトリ直下にならないため server/.env や
 * dist-server を取り違える。
 */
function appRoot() {
  return path.join(__dirname, '..');
}

/**
 * サーバー実体の場所を返す。
 *
 * dist-server は extraResources（resources/ 直下）ではなくアプリ本体側に置く。
 * resources/dist-server から起動すると Node のモジュール解決が
 * resources/dist-server/node_modules → resources/node_modules … と辿るため、
 * asar 内の node_modules にある express 等を解決できず起動に失敗する。
 * アプリ本体側（resources/app/）に置けば resources/app/node_modules が
 * 解決パスに入る（この配置のため package.json で asar: false にしている）。
 */
function resolveServerEntry() {
  return path.join(appRoot(), 'dist-server', 'index.js');
}

/**
 * サーバー用の環境変数を読む。
 * パッケージ版には server/.env が同梱されないため、userData 配下の server.env を
 * 第一候補にする（利用者が API キー等を後から設定できる場所）。
 */
function loadServerEnv() {
  const candidates = [
    // インストール後に利用者が API キー等を設定する場所（最優先）
    path.join(app.getPath('userData'), 'server.env'),
    // 開発時のリポジトリ内 .env（パッケージには含めない）
    path.join(appRoot(), 'server', '.env'),
  ];

  const env = {};
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    console.log(`[main] server env loaded from ${file}`);
    break;
  }

  // `npm run server:dev` のインライン処理と同じ展開（キーファイルのパス → 中身）
  if (env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE && !env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      env.GOOGLE_SERVICE_ACCOUNT_KEY = fs.readFileSync(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, 'utf8');
    } catch (e) {
      console.error(`[main] service account key の読み込みに失敗: ${e.message}`);
    }
  }
  return env;
}

// 低速マシンでも起動を落とさないよう余裕をとる（通常は1秒未満で応答する）
async function waitForHealth(origin, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!serverProcess) throw new Error('ローカルサーバーが起動直後に終了しました');
    try {
      const res = await fetch(`${origin}/api/health`);
      if (res.ok) return;
    } catch { /* 起動待ち */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('ローカルサーバーが応答しませんでした');
}

async function startLocalServer() {
  const entry = resolveServerEntry();
  if (!fs.existsSync(entry)) {
    throw new Error(`サーバー実体が見つかりません: ${entry}（npm run build:server 済みか確認）`);
  }

  const port = await findFreePort();
  // 127.0.0.1 バインドに加え、同一マシンの他プロセスからの呼び出しも弾く。
  // 起動ごとに使い捨てで、ディスクには残さない。
  serverApiKey = crypto.randomBytes(32).toString('hex');

  const env = {
    ...process.env,
    ...loadServerEnv(),
    ELECTRON_RUN_AS_NODE: '1',   // Electron バイナリを素の Node として使う（node の別途インストール不要）
    PORT:                 String(port),
    API_SHARED_SECRET:    serverApiKey,
  };
  delete env.K_SERVICE;          // ローカル起動なので公開ホスティング判定に入れない

  serverProcess = spawn(process.execPath, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  serverProcess.stdout.on('data', d => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr.on('data', d => process.stderr.write(`[server] ${d}`));
  serverProcess.on('exit', (code, signal) => {
    console.error(`[main] ローカルサーバーが終了しました (code=${code}, signal=${signal})`);
    serverProcess = null;
  });

  const origin = `http://127.0.0.1:${port}`;
  await waitForHealth(origin);
  serverOrigin = origin;
  console.log(`[main] ローカルサーバー起動: ${origin}`);
  return origin;
}

function stopLocalServer() {
  if (!serverProcess) return;
  const proc = serverProcess;
  serverProcess = null;   // exit ハンドラでのエラーログを抑止する
  proc.kill();
}

// ── CSP ────────────────────────────────────────────────────────────────────
//
// 以前は if (isDev) の中でしか設定しておらず、パッケージ版が CSP なしで出荷される
// 状態だった（開発時だけ緩く保護し、本番は無防備という逆転）。両方に適用する。
// Monaco は monacoSetup.ts の loader.config({ monaco }) でバンドル済みのため、
// cdn.jsdelivr.net の許可は不要。

function installCsp() {
  const csp = isDev
    ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; " +
      "connect-src 'self' ws://localhost:* http://localhost:*; " +
      "img-src 'self' data: blob:; worker-src 'self' blob:; " +
      "object-src 'none'; base-uri 'none';"
    // パッケージ版は UI も API も同一オリジン（http://127.0.0.1:PORT）なので 'self' で足りる。
    // 'unsafe-eval' は Monaco が必要とするため残す。
    : "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; " +
      "worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none';";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
    });
  });
}

// ── ウィンドウ作成 ──────────────────────────────────────────────────────────

function createWindow(startUrl) {
  const win = new BrowserWindow({
    width:  1400,
    height: 900,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
      // レンダラーへローカルサーバーの共有シークレットを渡す経路。
      // preload が process.argv から読み取り、contextBridge 経由で公開する。
      additionalArguments: serverApiKey ? [`--tt-api-key=${serverApiKey}`] : [],
    },
  });

  // パッケージ版は devtools を開かないため、レンダラー側のエラーが完全に見えなくなる。
  // 警告以上をメインプロセスの標準出力へ転送し、障害調査の手掛かりを残す。
  // Electron 42 で引数がイベントオブジェクト形式に変わったため、両形式を受ける。
  win.webContents.on('console-message', (...args) => {
    const e = args[0];
    const isNewApi = e && typeof e === 'object' && 'level' in e && typeof e.level === 'string';
    const level   = isNewApi ? e.level : args[1];
    const message = isNewApi ? e.message : args[2];
    const severe  = isNewApi ? (level === 'warning' || level === 'error') : level >= 2;
    if (severe) console.log(`[renderer:${level}] ${message}`);
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[main] 画面の読み込みに失敗: ${desc} (${code}) ${url}`);
  });

  // 未保存の変更があるまま閉じられるのを防ぐ（PROJECT_REVIEW_REPORT.md D-1）。
  // ブラウザの beforeunload だけでは Electron はダイアログを出さないため、
  // メインプロセス側で確認する。判定・フラッシュはレンダラー（App.tsx）が公開する
  // window 関数を executeJavaScript で呼び出す（IPC 配線を増やさない）。
  let forceClose = false;
  win.on('close', (e) => {
    if (forceClose) return;
    e.preventDefault();
    (async () => {
      let dirty = false;
      try {
        dirty = await win.webContents.executeJavaScript(
          '!!(window.__ttHasUnsavedChanges && window.__ttHasUnsavedChanges())'
        );
      } catch (err) {
        console.error('[main] 未保存チェックに失敗:', err);
      }
      if (!dirty) { forceClose = true; win.close(); return; }

      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['保存して終了', '保存せず終了', 'キャンセル'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        message: '未保存の変更があります',
        detail: 'エディタに保存されていない変更があります。',
      });
      if (response === 2) return; // キャンセル
      if (response === 0) {
        try {
          await win.webContents.executeJavaScript(
            '(window.__ttFlushAllSaves ? window.__ttFlushAllSaves() : null)', true
          );
        } catch (err) {
          console.error('[main] 保存フラッシュに失敗:', err);
        }
      }
      forceClose = true;
      win.close();
    })();
  });

  // TT_SELFTEST=1 のときだけ、レンダラーから API へ実際に到達できるかを検証する
  if (process.env.TT_SELFTEST === '1') {
    console.log('[selftest] 有効');
    win.webContents.once('did-finish-load', async () => {
      const probe = `(async () => {
        const api = window.electronAPI;
        const cfg = api && api.apiConfig;
        const hasKey = !!(cfg && cfg.apiKey);
        const withKey = await fetch('/api/bq/files/meta', {
          headers: cfg && cfg.apiKey ? { 'X-Thinktank-Api-Key': cfg.apiKey } : {},
        }).then(r => r.status).catch(e => 'ERR ' + e.message);
        const without = await fetch('/api/bq/files/meta').then(r => r.status).catch(e => 'ERR ' + e.message);
        const csp = await fetch(location.href).then(r => r.headers.get('content-security-policy')).catch(() => null);
        let evalBlocked = null;
        try { (0, eval)('1+1'); evalBlocked = false; } catch { evalBlocked = true; }

        // ストレージ経路の実測（Electron では IPC が Vault の読み込み元）
        let ipcMetaCount = null, ipcError = null, contentLen = null;
        try {
          const metas = await api.storage.listMeta();
          ipcMetaCount = Array.isArray(metas) ? metas.length : typeof metas;
          if (Array.isArray(metas) && metas.length) {
            const c = await api.storage.getContent(metas[0].id);
            contentLen = c === null ? null : c.length;
          }
        } catch (e) { ipcError = String(e && e.message || e); }

        // 一覧が実際に描画されたか（仮想スクロールのため可視分のみ）
        await new Promise(r => setTimeout(r, 2500));
        const renderedTitles = document.querySelectorAll('.thoughts-list__title').length;

        return JSON.stringify({
          hasElectronAPI: !!api, hasKey, withKey, without, evalBlocked,
          ipcMetaCount, ipcError, contentLen, renderedTitles,
          csp: csp ? csp.slice(0, 45) + '...' : null
        });
      })()`;
      try {
        console.log('[selftest]', await win.webContents.executeJavaScript(probe));
      } catch (e) {
        console.log('[selftest] failed:', e.message);
      }
    });
  }

  // リスナーをすべて登録してから読み込む（did-fail-load 等を取りこぼさないため）
  win.loadURL(startUrl);
  if (isDev) win.webContents.openDevTools({ mode: 'detach' });
}

// ── アプリ起動 ─────────────────────────────────────────────────────────────

app.whenReady()
  .then(async () => {
    ensureVaultDir();
    // userData の解決結果が環境によって食い違う事故が起きうるため、
    // 実際に読み書きするディレクトリと件数を起動時に必ず記録する
    console.log(`[Vault] userData=${app.getPath('userData')}`);
    console.log(`[Vault] dir=${VAULT_DIR} files=${fs.readdirSync(VAULT_DIR).filter(f => f.endsWith('.json')).length}`);
    installCsp();

    // dev: concurrently が起動済みの vite(5173) を読む。サーバーは二重起動しない
    //      （CLAUDE.md の「electron:dev を多重起動しない」に該当するため）
    const startUrl = isDev ? 'http://localhost:5173' : await startLocalServer();

    // BigQuery 同期の接続先・認証が解決できるかを起動時に確認する（読み取りのみ）
    if (process.env.TT_SELFTEST === '1') {
      const t = getSyncTarget();
      let status = 'n/a';
      try {
        const r = await fetch(`${t.base}/api/bq/files/meta`, {
          headers: t.apiKey ? { 'X-Thinktank-Api-Key': t.apiKey } : {},
        });
        status = `HTTP ${r.status}` + (r.ok ? ` / ${(await r.json()).length}件` : '');
      } catch (e) { status = 'ERR ' + e.message; }
      console.log(`[selftest] syncTarget base=${t.base} hasKey=${!!t.apiKey} -> ${status}`);
    }

    createWindow(startUrl);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl);
    });
  })
  .catch(err => {
    console.error('[main] 起動に失敗しました:', err);
    stopLocalServer();
    app.quit();
  });

app.on('before-quit',        stopLocalServer);
app.on('will-quit',          stopLocalServer);
app.on('window-all-closed', () => {
  stopLocalServer();
  if (process.platform !== 'darwin') app.quit();
});
