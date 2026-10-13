import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncResult = { added: 1, updated: 2, skipped: 3, total: 6 };

beforeEach(() => {
  // StorageManager is a singleton; each test must select the backend again.
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function electronStorage() {
  const syncFromServer = vi.fn().mockResolvedValue(syncResult);
  const fetch = vi.fn(() => { throw new Error('Electron sync must use IPC'); });
  vi.stubGlobal('window', { electronAPI: { storage: { syncFromServer } } });
  vi.stubGlobal('fetch', fetch);
  const { StorageManager } = await import('./StorageManager');
  const storage = StorageManager.instance;
  expect(storage.mode).toBe('electron');
  return { storage, syncFromServer, fetch };
}

describe('Electron sync server selection', () => {
  it('keeps the URL unset through StorageManager so the main process can choose its server', async () => {
    const { storage, syncFromServer, fetch } = await electronStorage();

    await expect(storage.syncFromServer()).resolves.toEqual(syncResult);

    expect(syncFromServer).toHaveBeenCalledTimes(1);
    expect(syncFromServer).toHaveBeenCalledWith(undefined);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes an explicitly selected server unchanged to IPC', async () => {
    const { storage, syncFromServer, fetch } = await electronStorage();
    const serverUrl = 'http://127.0.0.1:18080';

    await expect(storage.syncFromServer(serverUrl)).resolves.toEqual(syncResult);

    expect(syncFromServer).toHaveBeenCalledTimes(1);
    expect(syncFromServer).toHaveBeenCalledWith(serverUrl);
    expect(fetch).not.toHaveBeenCalled();
  });
});
