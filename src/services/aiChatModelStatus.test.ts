import { describe, expect, it } from 'vitest';
import {
  AI_MODEL_CATALOG, applyAiModelCatalog, applySelection, availableModels, canSend, getModelNames, modelChoices, normalizeModelNames, onModelNamesChange,
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

  it('applies a catalog while keeping the stored selection first', () => {
    setModelNames('Claude', 'claude-sonnet-5');
    applyAiModelCatalog({
      anthropic: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'], openai: [], gemini: ['gemini-3.6-flash'],
    });
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

  it('uses the built-in catalog by default', () => {
    applyAiModelCatalog();
    expect(availableModels('OpenAI')).toEqual(AI_MODEL_CATALOG.openai);
    expect(getModelNames('Local')).toBe('None');
  });
});
