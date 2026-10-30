/**
 * このPCの名前（OSのホスト名）。linkファイルの Affiliation に使う。
 * ブラウザ版ではOSのホスト名を知る手段が無いので空文字を返す。
 */

let cached: Promise<string> | null = null;

export function getPcName(): Promise<string> {
  const relay = window.electronAPI?.relay;
  if (!relay) return Promise.resolve('');
  cached ??= relay.getStatus()
    .then(status => status.deviceName || '')
    .catch(() => { cached = null; return ''; });
  return cached;
}
