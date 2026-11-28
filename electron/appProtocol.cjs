'use strict';

/**
 * electron/appProtocol.cjs
 * パッケージ版の画面を配信するカスタムプロトコル app://thinktank/ と、画面に被せる CSP。
 */

const { protocol, session, net: electronNet } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// ── カスタムプロトコル app://thinktank/ ハンドラ登録 ─────────────────────────

function registerAppProtocol(appRoot) {
  const distDir = path.join(appRoot(), 'dist');
  protocol.handle('app', (request) => {
    const urlObj = new URL(request.url);
    let relPath = decodeURIComponent(urlObj.pathname || '/');
    if (relPath === '/' || relPath === '') {
      relPath = '/index.html';
    }
    const safeRel = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
    let targetPath = path.join(distDir, safeRel);
    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
      targetPath = path.join(distDir, 'index.html');
    }
    return electronNet.fetch(pathToFileURL(targetPath).toString());
  });
}

// ── CSP ────────────────────────────────────────────────────────────────────

/** 応答ヘッダーから埋め込み拒否だけを取り除く（CSP の他のディレクティブは残す）。ヘッダー名は大文字小文字を問わない */
function allowFraming(headers) {
  if (!headers) return headers;
  const result = {};
  for (const [name, values] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === 'x-frame-options') continue;
    if (lower === 'content-security-policy') {
      const kept = values
        .map(v => v.split(';').filter(d => !/^\s*frame-ancestors\b/i.test(d)).join(';').trim())
        .filter(v => v.replace(/;/g, '').trim() !== '');
      if (kept.length > 0) result[name] = kept;
      continue;
    }
    result[name] = values;
  }
  return result;
}

function installCsp(isDev) {
  const csp = isDev
    ? "default-src 'self' app: 'unsafe-inline' 'unsafe-eval' http://localhost:*; " +
      "connect-src 'self' app: ws://localhost:* http://localhost:* https://*.googleapis.com https://*.firebaseio.com https://script.google.com https://script.googleusercontent.com; " +
      "img-src 'self' app: data: blob:; worker-src 'self' app: blob:; " +
      // linkファイルの「リンク先表示」で https のページを iframe に埋め込む
      "frame-src 'self' app: https:; " +
      "object-src 'none'; base-uri 'none';"
    : "default-src 'self' app:; script-src 'self' app: 'unsafe-eval'; style-src 'self' app: 'unsafe-inline'; " +
      "img-src 'self' app: data: blob:; font-src 'self' app: data:; connect-src 'self' app: https://*.googleapis.com https://*.firebaseio.com https://script.google.com https://script.googleusercontent.com; " +
      "frame-src 'self' app: https:; " +
      "worker-src 'self' app: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none';";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // 埋め込んだ外部ページ（subFrame）にアプリの CSP は被せない（そのページ自身のスクリプトが止まる）。
    // linkファイルの「リンク先表示」では、利用者が選んだリンク先をアプリ自身が埋め込むだけなので、
    // サイトの埋め込み拒否（X-Frame-Options / frame-ancestors）も外して表示する
    if (details.resourceType === 'subFrame') {
      callback({ responseHeaders: allowFraming(details.responseHeaders) });
      return;
    }
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
    });
  });
}

module.exports = { registerAppProtocol, allowFraming, installCsp };
