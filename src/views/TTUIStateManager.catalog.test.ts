// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ vault: undefined as unknown }));
vi.mock('../models/TTModels', () => ({ TTModels: { get Instance() { return { Vault: mocks.vault }; } } }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: { mode: 'pwa' } } }));
import { TTVault } from '../models/TTVault';
import { AI_CHAT_PROVIDER_NAMES, getModelNames, setModelNames } from '../services/aiChatModelStatus';
import { TTApplication } from './TTApplication';
import { TTUIStateManager } from './TTUIStateManager';

const manager = TTUIStateManager.instance;
beforeEach(() => {
  TTApplication.resetInstance(); localStorage.clear(); mocks.vault = new TTVault('test');
  for (const name of AI_CHAT_PROVIDER_NAMES) setModelNames(name, 'stale-model');
});
afterEach(() => { TTApplication.resetInstance(); vi.restoreAllMocks(); });

it('starts every provider with no model and requests nothing over the network', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  manager.init(TTApplication.Instance);
  await manager.ensureThinkExists(mocks.vault as TTVault);
  for (const name of AI_CHAT_PROVIDER_NAMES) expect(getModelNames(name)).toBe('None');
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('keeps the model lists the user entered across a restart', async () => {
  manager.init(TTApplication.Instance);
  manager.applyProperty('AIChat.ModelNames.OpenAI', 'gpt-7-nova,gpt-6-luna');
  setModelNames('OpenAI', '');
  await manager.ensureThinkExists(mocks.vault as TTVault);
  expect(getModelNames('OpenAI')).toBe('gpt-7-nova,gpt-6-luna');
});
