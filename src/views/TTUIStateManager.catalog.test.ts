// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ vault: undefined as unknown }));
vi.mock('../models/TTModels', () => ({ TTModels: { get Instance() { return { Vault: mocks.vault }; } } }));
vi.mock('../services/storage/StorageManager', () => ({ StorageManager: { instance: { mode: 'pwa' } } }));
import { TTVault } from '../models/TTVault';
import { AI_MODEL_CATALOG, getModelNames, setAvailableModels, setModelNames } from '../services/aiChatModelStatus';
import { TTApplication } from './TTApplication';
import { TTUIStateManager } from './TTUIStateManager';

const manager = TTUIStateManager.instance;
beforeEach(() => {
  TTApplication.resetInstance(); localStorage.clear(); mocks.vault = new TTVault('test');
  setAvailableModels('Claude', ['baseline']); setAvailableModels('OpenAI', []); setAvailableModels('Gemini', []);
});
afterEach(() => { TTApplication.resetInstance(); vi.restoreAllMocks(); });

it('applies the built-in catalog without any network request, keeping the stored selection first', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const app = TTApplication.Instance; manager.init(app);
  setAvailableModels('Claude', [...AI_MODEL_CATALOG.anthropic]); setModelNames('Claude', 'claude-opus-5');
  const notify = vi.spyOn(app, 'NotifyUpdated');
  manager.refreshAiModelCatalog();
  expect(getModelNames('Claude').split(',')[0]).toBe('claude-opus-5');
  expect(getModelNames('Claude').split(',').sort()).toEqual([...AI_MODEL_CATALOG.anthropic].sort());
  expect(getModelNames('OpenAI')).toBe(AI_MODEL_CATALOG.openai.join(','));
  expect(notify).toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('updates the shared catalog even before an application is attached', () => {
  manager.refreshAiModelCatalog();
  expect(getModelNames('Gemini').split(',')[0]).toBe(AI_MODEL_CATALOG.gemini[0]);
});
