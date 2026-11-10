import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeviceId, resetDeviceIdCacheForTest } from './deviceId';

let values: Map<string, string>;

beforeEach(() => {
  resetDeviceIdCacheForTest();
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetDeviceIdCacheForTest();
});

describe('getDeviceId', () => {
  it('Electron 版は VaultEngine の Device ID を使う', async () => {
    vi.stubGlobal('window', { electronAPI: { vault: { getConfig: async () => ({ deviceId: 'pc_MYPC_a1b2c3' }) } } });
    expect(await getDeviceId()).toBe('pc_MYPC_a1b2c3');
    expect(values.size).toBe(0);
  });

  it('ブラウザ版は web_ の id を発行して localStorage に保存し、次回も同じ id を使う', async () => {
    vi.stubGlobal('window', {});
    const id = await getDeviceId();
    expect(id).toMatch(/^web_[0-9a-f]{8}$/);
    expect(values.get('thinktank.web.deviceId')).toBe(id);
    resetDeviceIdCacheForTest();
    expect(await getDeviceId()).toBe(id);
  });

  it('Electron 側から取れなければブラウザ版と同じ方法で発行する', async () => {
    vi.stubGlobal('window', { electronAPI: { vault: { getConfig: async () => { throw new Error('ipc'); } } } });
    expect(await getDeviceId()).toMatch(/^web_[0-9a-f]{8}$/);
  });
});
