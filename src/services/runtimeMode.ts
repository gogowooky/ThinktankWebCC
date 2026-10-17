import { StorageManager } from './storage/StorageManager';

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

/**
 * ブラウザ版でローカル中継（scripts/run-relay-agent.mjs、Vite の /api プロキシ経由）を使っているか。
 * Firebase Hosting 上では /api の転送先がないため、ここが true になるのは localhost の開発時だけ。
 */
export function usesLocalRelay(): boolean {
  if (typeof window === 'undefined' || isElectron()) return false;
  const host = window.location?.hostname || '';
  if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) return false;
  return StorageManager.instance?.webProvider === 'local';
}
