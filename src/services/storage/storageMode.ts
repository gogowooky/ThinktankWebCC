/**
 * storageMode.ts
 * PC版の運用モード（Firestore / ローカル）。モードは起動時に決まり、起動中は変わらない。
 * docs/261103/ローカル運用モード.md
 */

export type StorageMode = 'firestore' | 'local';

const LAST_MODE_KEY = 'tt-storage-mode-last';
const UI_STATE_KEY = 'tt-ui-state-v4';
const SUPPORT_SELECTION_PREFIX = 'thinktank.support.selection:';
const VAULT_CACHE_DB = 'thinktank_vault_cache_v1';

export function currentStorageMode(): StorageMode {
  return typeof window !== 'undefined' && window.electronAPI?.appMode?.storageMode === 'local'
    ? 'local'
    : 'firestore';
}

export function isLocalStorageMode(): boolean {
  return currentStorageMode() === 'local';
}

/**
 * 前回の起動とモードが違えば、前のモードの Think を指す画面側の記録を消す。
 * 開いていたタブ・選択中の Think などが、もう一方のデータの thinkid を指したまま残らないようにする。
 */
export function resetCachesIfStorageModeChanged(): boolean {
  if (typeof window === 'undefined' || !window.electronAPI) return false;
  const mode = currentStorageMode();
  let last: string | null;
  try {
    last = localStorage.getItem(LAST_MODE_KEY);
  } catch {
    return false;
  }
  // 記録が無いのはモード切替ができる前の版からの起動で、そのときは Firestore だった
  if ((last ?? 'firestore') === mode) {
    if (last === null) localStorage.setItem(LAST_MODE_KEY, mode);
    return false;
  }
  try {
    localStorage.removeItem(UI_STATE_KEY);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(SUPPORT_SELECTION_PREFIX)) localStorage.removeItem(key);
    }
    if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(VAULT_CACHE_DB);
  } finally {
    localStorage.setItem(LAST_MODE_KEY, mode);
  }
  return true;
}
