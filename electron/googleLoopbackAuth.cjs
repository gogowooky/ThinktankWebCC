'use strict';

/**
 * electron/googleLoopbackAuth.cjs
 * Electron 版の Google ログイン。画面（app:// や localhost:5173）からのポップアップ方式は、
 * Google が戻り先として app:// を許可しないため製品版で動かない。そこで「デスクトップ アプリ」用の
 * OAuth クライアントで、いつものブラウザにログイン画面を開き、127.0.0.1 の一時的な待ち受けで結果を受け取る
 * （PKCE 付き。デスクトップ用クライアントは 127.0.0.1 のどのポートへの戻りも許可される）。
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
// 中継役に要るのは Firebase へのログインだけ（Drive は G: をファイルとして読む）
const SCOPE = 'openid email profile';

/**
 * Google Cloud コンソールからダウンロードした JSON（{"installed": {...}}）を読む。
 * デスクトップ用クライアントの secret は、Google の説明どおり配布物に含めても秘密として扱われない値。
 */
function loadDesktopClient(candidatePaths) {
  for (const p of candidatePaths) {
    try {
      if (!p || !fs.existsSync(p)) continue;
      const json = JSON.parse(fs.readFileSync(p, 'utf8'));
      const c = json.installed || json;
      if (c && typeof c.client_id === 'string' && c.client_id) {
        return { clientId: c.client_id, clientSecret: typeof c.client_secret === 'string' ? c.client_secret : '' };
      }
    } catch {
      // 壊れたファイルは次の候補へ
    }
  }
  return null;
}

function base64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createPkce() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function buildAuthUrl({ clientId, redirectUri, challenge, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

const DONE_PAGE = (message) =>
  `<!doctype html><meta charset="utf-8"><title>Thinktank</title>` +
  `<body style="font-family:sans-serif;padding:2rem">${message}<br>このタブは閉じてかまいません。</body>`;

/**
 * ブラウザでログインしてもらい、Google のアクセストークンを返す。
 * @param {{ clientId: string, clientSecret: string, openExternal: (url: string) => Promise<void> | void,
 *           timeoutMs?: number, fetchImpl?: typeof fetch }} options
 */
function signInWithGoogleLoopback({ clientId, clientSecret, openExternal, timeoutMs = 5 * 60_000, fetchImpl = fetch }) {
  const { verifier, challenge } = createPkce();
  const state = base64Url(crypto.randomBytes(16));

  return new Promise((resolve, reject) => {
    let settled = false;
    const server = http.createServer();
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      if (err) reject(err);
      else resolve(value);
    };
    const timer = setTimeout(
      () => finish(new Error('ブラウザでのログインが時間内に終わりませんでした。もう一度お試しください。')),
      timeoutMs,
    );

    server.on('request', async (req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      if (!code && !error) {
        // favicon などログインの戻り以外の要求
        res.writeHead(404).end();
        return;
      }
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(DONE_PAGE('ログインの確認に失敗しました。'));
        finish(new Error('ログインの応答を確認できませんでした（state が一致しません）。'));
        return;
      }
      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(DONE_PAGE('ログインは取り消されました。'));
        finish(new Error(`Google のログインが完了しませんでした (${error})。`));
        return;
      }
      try {
        const redirectUri = `http://127.0.0.1:${server.address().port}`;
        const body = new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        });
        const tokenRes = await fetchImpl(TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        const data = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok || !data.access_token) {
          throw new Error(`Google のトークンを取得できませんでした (${data.error_description || data.error || tokenRes.status})。`);
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(DONE_PAGE('Thinktank へのログインが完了しました。'));
        finish(null, { accessToken: data.access_token, idToken: data.id_token || '' });
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(DONE_PAGE('ログインに失敗しました。アプリの画面を確認してください。'));
        finish(err);
      }
    });

    server.on('error', (err) => finish(err));
    server.listen(0, '127.0.0.1', async () => {
      const redirectUri = `http://127.0.0.1:${server.address().port}`;
      try {
        await openExternal(buildAuthUrl({ clientId, redirectUri, challenge, state }));
      } catch (err) {
        finish(err);
      }
    });
  });
}

module.exports = { loadDesktopClient, createPkce, buildAuthUrl, signInWithGoogleLoopback };
