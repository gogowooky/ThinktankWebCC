/**
 * deviceId.ts
 * この端末の id。Thinkファイル保存時の metadata.savedDeviceId と、linkファイルの「# 作成端末」に記録する。
 *
 * - Electron 版: VaultEngine が発行・保存している Device ID（例 `pc_MYPC_a1b2c3`）。
 *   設定画面の PC連携に表示される Device ID と同じ値。
 * - ブラウザ版: 初回に `web_<16進8桁>` を発行して localStorage に保存する。
 *   ブラウザ（プロファイル）ごとに別の id になり、サイトデータを消すと新しい id になる。
 */

const WEB_DEVICE_ID_KEY = 'thinktank.web.deviceId';

let cached: Promise<string> | null = null;
let resolved = '';

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

/** localStorage が使えない環境（プライベートブラウズ等）では、この起動中だけの id になる */
function webDeviceId(): string {
  try {
    const saved = localStorage.getItem(WEB_DEVICE_ID_KEY)?.trim();
    if (saved) return saved;
  } catch {
    // 読めなければ新しく発行する
  }
  const id = `web_${randomHex(4)}`;
  try {
    localStorage.setItem(WEB_DEVICE_ID_KEY, id);
  } catch {
    // 保存できなくても今回の起動中は同じ id を使う
  }
  return id;
}

async function resolveDeviceId(): Promise<string> {
  if (typeof window === 'undefined') return '';
  const getConfig = window.electronAPI?.vault?.getConfig;
  if (getConfig) {
    try {
      const id = (await getConfig())?.deviceId?.trim();
      if (id) return id;
    } catch {
      // Electron 側から取れなければブラウザ版と同じ方法で発行する
    }
  }
  return webDeviceId();
}

/** この端末の id。取得できない環境（テスト等で window が無い）では空文字 */
export function getDeviceId(): Promise<string> {
  cached ??= resolveDeviceId()
    .catch(() => '')
    .then(id => { resolved = id; return id; });
  return cached;
}

/** 取得済みの id を待たずに返す（まだ取得していなければ空文字） */
export function peekDeviceId(): string {
  return resolved;
}

/** テスト用: キャッシュを捨てる */
export function resetDeviceIdCacheForTest(): void {
  cached = null;
  resolved = '';
}
