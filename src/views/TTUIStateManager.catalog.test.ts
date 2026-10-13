// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  vault: undefined as unknown,
  fetch: vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(),
}));
vi.mock('../models/TTModels', () => ({ TTModels: { get Instance() { return { Vault: mocks.vault }; } } }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: { mode: 'pwa' } } }));
vi.mock('../services/apiClient', () => ({ apiFetch: mocks.fetch }));
import { TTVault } from '../models/TTVault';
import { availableModels, getModelNames, setAvailableModels } from '../services/aiChatModelStatus';
import { TTApplication } from './TTApplication';
import { TTUIStateManager } from './TTUIStateManager';

const manager = TTUIStateManager.instance;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function catalog(model: string) {
  return new Response(JSON.stringify({ anthropic: [model], openai: [], gemini: [] }), { status: 200 });
}
function init() {
  const app = TTApplication.Instance; manager.init(app); return app;
}
function signal(index: number) { return mocks.fetch.mock.calls[index][1]?.signal as AbortSignal; }
beforeEach(() => {
  TTApplication.resetInstance(); localStorage.clear(); mocks.vault = new TTVault('test');
  mocks.fetch.mockReset(); vi.useFakeTimers();
  setAvailableModels('Claude', ['baseline']); setAvailableModels('OpenAI', []); setAvailableModels('Gemini', []);
});
afterEach(() => { TTApplication.resetInstance(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('aborts the disposed owner and ignores its late catalog after a new application has loaded', async () => {
  const old = init(); const response = deferred<Response>();
  mocks.fetch.mockReturnValueOnce(response.promise).mockResolvedValueOnce(catalog('new-app-model'));
  const oldRequest = manager.refreshAiModelCatalog();
  const oldNotify = vi.spyOn(old, 'NotifyUpdated');
  TTApplication.resetInstance();
  expect(signal(0).aborted).toBe(true);
  const next = init(); const nextNotify = vi.spyOn(next, 'NotifyUpdated');
  await manager.refreshAiModelCatalog();
  expect(getModelNames('Claude')).toBe('new-app-model');
  oldNotify.mockClear(); nextNotify.mockClear();
  response.resolve(catalog('old-app-model')); await oldRequest;
  expect(availableModels('Claude')).toEqual(['new-app-model']);
  expect(getModelNames('Claude')).toBe('new-app-model');
  expect(oldNotify).not.toHaveBeenCalled();
  expect(nextNotify).not.toHaveBeenCalled();
});

it('keeps the newer request when two catalogs for the same application finish out of order', async () => {
  init(); const response = deferred<Response>();
  mocks.fetch.mockReturnValueOnce(response.promise).mockResolvedValueOnce(catalog('latest'));
  const oldRequest = manager.refreshAiModelCatalog();
  await manager.refreshAiModelCatalog();
  expect(signal(0).aborted).toBe(true);
  response.resolve(catalog('outdated')); await oldRequest;
  expect(getModelNames('Claude')).toBe('latest');
});

it('invalidates a pending request when the same application is initialized again', async () => {
  const app = init(); const response = deferred<Response>();
  mocks.fetch.mockReturnValueOnce(response.promise);
  const pending = manager.refreshAiModelCatalog();
  manager.init(app);
  const before = getModelNames('Claude');
  expect(signal(0).aborted).toBe(true);
  response.resolve(catalog('before-reinit')); await pending;
  expect(getModelNames('Claude')).toBe(before);
});

it('does not cancel the new owner when an old application detaches again', async () => {
  const old = init(); TTApplication.resetInstance(); init();
  const response = deferred<Response>(); mocks.fetch.mockReturnValueOnce(response.promise);
  const pending = manager.refreshAiModelCatalog();
  manager.detach(old);
  expect(signal(0).aborted).toBe(false);
  response.resolve(catalog('current')); await pending;
  expect(getModelNames('Claude')).toBe('current');
});
