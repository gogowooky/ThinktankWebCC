/**
 * wait-for-server.mjs
 * バックエンドサーバー（port 8080）の起動を待ってからViteを起動するヘルパー
 *
 * Usage: node server/wait-for-server.mjs && vite
 */

const MAX_WAIT = 30_000; // 最大30秒待機
const INTERVAL = 500;    // 500msごとにリトライ
const URL = 'http://localhost:8080/api/bq/versions';

const start = Date.now();

async function check() {
  while (Date.now() - start < MAX_WAIT) {
    try {
      const res = await fetch(URL);
      if (res.ok) {
        console.log('[wait-for-server] Backend is ready');
        process.exit(0);
      }
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, INTERVAL));
  }
  // タイムアウトしてもViteは起動する（ローカルモードで動作可能）
  console.warn('[wait-for-server] Backend not ready after 30s, starting Vite anyway');
  process.exit(0);
}

check();
