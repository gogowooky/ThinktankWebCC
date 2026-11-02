import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ listMeta: vi.fn() }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: backend } }));
import { TTVault } from './TTVault';
import { FirebaseSignInRequiredError } from '../platform/web/FirebaseAuthService';

const meta = {
  thinkid: '2026-11-02-000000', category: 'memo', title: 'メモ', keywords: '', relatedIds: '',
  sizeBytes: 6, isDeleted: false, createdAt: '', updatedAt: '', metadata: {},
};

beforeEach(() => {
  vi.useFakeTimers();
  backend.listMeta.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('reports sign-in required without retrying and notifies the view', async () => {
  backend.listMeta.mockRejectedValue(new FirebaseSignInRequiredError());
  const vault = new TTVault('test');
  const notified = vi.fn(); vault.AddOnUpdate('test', notified);
  await vault.LoadCache();
  expect(backend.listMeta).toHaveBeenCalledTimes(1);
  expect(vault.IsLoaded).toBe(false);
  expect(vault.LoadError?.kind).toBe('signin');
  expect(notified).toHaveBeenCalledTimes(1);
});

it('reports other failures only after the final retry', async () => {
  backend.listMeta.mockRejectedValue(new Error('Firebase Project ID が設定されていません。'));
  const vault = new TTVault('test');
  const loading = vault.LoadCache();
  await vi.runAllTimersAsync();
  await loading;
  expect(backend.listMeta).toHaveBeenCalledTimes(3);
  expect(vault.LoadError).toEqual({ kind: 'error', message: 'Firebase Project ID が設定されていません。' });
});

it('clears the error once a reload succeeds after signing in', async () => {
  backend.listMeta.mockRejectedValueOnce(new FirebaseSignInRequiredError()).mockResolvedValueOnce([meta]);
  const vault = new TTVault('test');
  await vault.LoadCache();
  expect(vault.LoadError?.kind).toBe('signin');
  await vault.ReloadAll();
  expect(vault.LoadError).toBeNull();
  expect(vault.IsLoaded).toBe(true);
  expect(vault.Count).toBe(1);
});
