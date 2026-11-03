// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentStorageMode, resetCachesIfStorageModeChanged } from './storageMode';

function setElectronMode(storageMode: 'firestore' | 'local' | null) {
  (window as unknown as { electronAPI?: unknown }).electronAPI = storageMode
    ? { appMode: { storageMode } }
    : undefined;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('indexedDB', { deleteDatabase: vi.fn() });
});

afterEach(() => {
  setElectronMode(null);
  vi.unstubAllGlobals();
});

describe('運用モードの切り替え時の記録の消去', () => {
  it('Web版は常に Firestore で、記録を消さない', () => {
    setElectronMode(null);
    localStorage.setItem('tt-ui-state-v4', 'state');
    expect(currentStorageMode()).toBe('firestore');
    expect(resetCachesIfStorageModeChanged()).toBe(false);
    expect(localStorage.getItem('tt-ui-state-v4')).toBe('state');
  });

  it('切替機能より前の版から Firestore で起動したときは消さない', () => {
    setElectronMode('firestore');
    localStorage.setItem('tt-ui-state-v4', 'state');
    expect(resetCachesIfStorageModeChanged()).toBe(false);
    expect(localStorage.getItem('tt-ui-state-v4')).toBe('state');
    expect(localStorage.getItem('tt-storage-mode-last')).toBe('firestore');
  });

  it('モードが変わったら UI状態・補助パネルの選択・Vaultキャッシュを消し、設定は残す', () => {
    setElectronMode('local');
    localStorage.setItem('tt-storage-mode-last', 'firestore');
    localStorage.setItem('tt-ui-state-v4', 'state');
    localStorage.setItem('thinktank.support.selection:vault_ver2:Working', '2026-11-01-000000');
    localStorage.setItem('tt-app-zoom', '1.2');
    expect(resetCachesIfStorageModeChanged()).toBe(true);
    expect(localStorage.getItem('tt-ui-state-v4')).toBeNull();
    expect(localStorage.getItem('thinktank.support.selection:vault_ver2:Working')).toBeNull();
    expect(localStorage.getItem('tt-app-zoom')).toBe('1.2');
    expect(localStorage.getItem('tt-storage-mode-last')).toBe('local');
    expect(indexedDB.deleteDatabase).toHaveBeenCalledWith('thinktank_vault_cache_v1');
    expect(resetCachesIfStorageModeChanged()).toBe(false);
  });
});
