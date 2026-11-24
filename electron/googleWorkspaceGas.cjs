'use strict';

/**
 * electron/googleWorkspaceGas.cjs
 * 利用者自身の Google Apps Script（scripts/gas/googleWorkspace.gs）へ問い合わせて
 * Gmail（読取）・Google カレンダー（読取）・Google Tasks（読取）・Google ドライブ（読み書き）を実行する。
 */

const DEFAULT_TIMEOUT_MS = 25_000;

/** 公開URLは script.google.com の /macros/s/.../exec だけを受け付ける（合言葉を他所へ送らない） */
function isValidGasUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && u.hostname === 'script.google.com' && /^\/macros\/s\/[^/]+\/exec$/.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * GAS ウェブアプリへ JSON POST を送る。
 * @param {{ url: string, token: string, kind: string, params?: Record<string, unknown>, timeoutMs?: number, fetchImpl?: typeof fetch }} options
 */
async function callGoogleWorkspaceGas({
  url,
  token,
  kind,
  params = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  const cleanUrl = String(url || '').trim();
  const cleanToken = String(token || '').trim();
  if (!cleanUrl || !cleanToken) {
    throw new Error('Google Workspace 連携（GAS）が未設定です。Thinktank > 設定 > Google Workspace 連携（GAS）で URL と合言葉を設定してください。');
  }
  if (!isValidGasUrl(cleanUrl)) {
    throw new Error('Google Workspace 連携（GAS）の URL が不正です（https://script.google.com/macros/s/…/exec の形式で指定してください）。');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('この実行環境では fetch が利用できません。');
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...params, token: cleanToken, kind }),
      redirect: 'follow',
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) {
      throw new Error(`GAS への接続が失敗しました（HTTP ${res.status}）`);
    }
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error('GAS から JSON 以外の応答が返りました。デプロイ設定（アクセスできるユーザー: 全員）を確認してください。');
    }
    if (!data || typeof data !== 'object' || data.ok !== true) {
      const reason = data && typeof data.error === 'string' ? data.error : '不明なエラー';
      if (reason === 'unauthorized') {
        throw new Error('GAS の合言葉（token）が一致しません。設定を確認してください。');
      }
      throw new Error(`GAS エラー: ${reason}`);
    }
    return data;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`Google Workspace 連携（GAS）がタイムアウトしました（${Math.round(timeoutMs / 1000)}秒）`);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function testGoogleWorkspaceGas({ url, token, fetchImpl }) {
  if (!isValidGasUrl(url)) {
    return { ok: false, message: 'URLは https://script.google.com/macros/s/…/exec の形で入力してください。' };
  }
  if (!String(token || '').trim()) {
    return { ok: false, message: '合言葉を入力してください。' };
  }
  try {
    const res = await callGoogleWorkspaceGas({ url, token, kind: 'ping', timeoutMs: 12_000, fetchImpl });
    const caps = Array.isArray(res.capabilities) ? `（対応機能: ${res.capabilities.join(', ')}）` : '';
    return { ok: true, message: `接続できました${caps}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

module.exports = {
  isValidGasUrl,
  callGoogleWorkspaceGas,
  testGoogleWorkspaceGas,
};
