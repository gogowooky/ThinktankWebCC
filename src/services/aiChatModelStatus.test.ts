import { describe, expect, it } from 'vitest';
import {
  applySelection, availableModels, canSend, getModelNames, loadAiModelCatalog, modelChoices, normalizeModelNames, onModelNamesChange,
  selectionFor, setModelNames,
} from './aiChatModelStatus';

describe('AIChat model status', () => {
  it('keeps the stored order until the server list arrives, reading old display names as IDs', () => {
    expect(normalizeModelNames('Claude', 'claude-sonnet-5,claude-opus-5', null)).toBe('claude-sonnet-5,claude-opus-5');
    expect(normalizeModelNames('Claude', 'Opus 5', null)).toBe('claude-opus-5');
    expect(normalizeModelNames('Gemini', '', null)).toBe('None');
  });

  it('lists every available model with the selected one first and drops unknown IDs', () => {
    const list = ['gemini-3.6-flash', 'gemini-3.5-pro', 'gemini-3.5-flash-lite'];
    expect(normalizeModelNames('Gemini', 'gemini-3.5-pro', list)).toBe('gemini-3.5-pro,gemini-3.6-flash,gemini-3.5-flash-lite');
    expect(normalizeModelNames('Gemini', 'gemini-2.0-flash', list)).toBe('gemini-3.6-flash,gemini-3.5-pro,gemini-3.5-flash-lite');
    expect(normalizeModelNames('OpenAI', 'gpt-5.6', [])).toBe('None');
  });

  it('applies the server catalog while keeping the stored selection first', async () => {
    setModelNames('Claude', 'claude-sonnet-5');
    expect(await loadAiModelCatalog(async () => ({
      anthropic: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'], openai: [], gemini: ['gemini-3.6-flash'],
    }))).toBe(true);
    expect(getModelNames('Claude')).toBe('claude-sonnet-5,claude-opus-5,claude-haiku-4-5');
    expect(getModelNames('OpenAI')).toBe('None');
    expect(selectionFor('Gemini')).toEqual({ provider: 'gemini', model: 'gemini-3.6-flash' });
    expect(canSend('OpenAI')).toBe(false);
    expect(canSend('Local')).toBe(false);
    expect(modelChoices().map(c => c.selection.model)).toEqual(['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5', 'gemini-3.6-flash']);
  });

  it('moves a picked model to the front and notifies listeners only on change', () => {
    let calls = 0;
    const off = onModelNamesChange(() => { calls++; });
    expect(applySelection({ provider: 'anthropic', model: 'claude-haiku-4-5' })).toBe('Claude');
    expect(getModelNames('Claude')).toBe('claude-haiku-4-5,claude-opus-5,claude-sonnet-5');
    applySelection({ provider: 'anthropic', model: 'claude-haiku-4-5' });
    expect(calls).toBe(1);
    off();
  });

  it('leaves the state alone when the catalog cannot be fetched', async () => {
    expect(await loadAiModelCatalog(async () => { throw new Error('offline'); })).toBe(false);
  });

  it('does not publish a catalog whose owner expired while reading', async () => {
    const before = [getModelNames('Claude'), getModelNames('OpenAI'), getModelNames('Gemini')];
    let current = true;
    let finish!: (value: unknown) => void;
    const pending = loadAiModelCatalog(() => new Promise(resolve => { finish = resolve; }), () => current);
    let notifications = 0;
    const off = onModelNamesChange(() => { notifications++; });
    try {
      current = false;
      finish({ anthropic: ['expired'], openai: ['expired'], gemini: ['expired'] });
      expect(await pending).toBe(false);
      expect([getModelNames('Claude'), getModelNames('OpenAI'), getModelNames('Gemini')]).toEqual(before);
      expect(notifications).toBe(0);
    } finally { off(); }
  });

  it('stops applying remaining providers when a model notification expires the owner', async () => {
    const beforeOpenAI = availableModels('OpenAI'), beforeGemini = availableModels('Gemini');
    let current = true;
    const off = onModelNamesChange(() => { current = false; });
    try {
      expect(await loadAiModelCatalog(async () => ({
        anthropic: ['applied-before-expiry'], openai: ['expired'], gemini: ['expired'],
      }), () => current)).toBe(false);
      expect(getModelNames('Claude')).toBe('applied-before-expiry');
      expect(availableModels('OpenAI')).toBe(beforeOpenAI);
      expect(availableModels('Gemini')).toBe(beforeGemini);
    } finally { off(); }
  });
});
