import { describe, expect, it } from 'vitest';
import {
  applySelection, canSend, getModelNames, modelChoices, modelIdsOf, normalizeModelNames, onModelNamesChange,
  selectModel, selectionFor, setModelNames,
} from './aiChatModelStatus';

describe('AIChat model status', () => {
  it('keeps the entered order, reading old display names as IDs and dropping duplicates', () => {
    expect(normalizeModelNames('claude-sonnet-5, claude-opus-5')).toBe('claude-sonnet-5,claude-opus-5');
    expect(normalizeModelNames('Opus 5,claude-opus-5')).toBe('claude-opus-5');
    expect(normalizeModelNames('')).toBe('None');
    expect(normalizeModelNames('None')).toBe('None');
    expect(modelIdsOf('None')).toEqual([]);
  });

  it('uses the entered CSV as the whole list and sends its first model', () => {
    setModelNames('OpenAI', 'gpt-7-nova,gpt-6-luna');
    expect(getModelNames('OpenAI')).toBe('gpt-7-nova,gpt-6-luna');
    expect(selectionFor('OpenAI')).toEqual({ provider: 'openai', model: 'gpt-7-nova' });
    setModelNames('Claude', 'claude-sonnet-5'); setModelNames('Gemini', ''); setModelNames('GNB', ''); setModelNames('OpenAI', '');
    expect(canSend('OpenAI')).toBe(false);
    expect(canSend('Local')).toBe(false);
    expect(modelChoices().map(c => c.selection.model)).toEqual(['claude-sonnet-5']);
  });

  it('treats configured Notebook IDs as GNB model choices', () => {
    setModelNames('GNB', 'notebook-1,notebook-2');
    expect(selectionFor('GNB')).toEqual({ provider: 'gnb', model: 'notebook-1' });
    expect(canSend('GNB')).toBe(true);
    expect(modelChoices().filter(c => c.name === 'GNB').map(c => c.selection.model)).toEqual(['notebook-1', 'notebook-2']);
  });

  it('moves a picked model to the front, adds an explicitly applied one and notifies only on change', () => {
    setModelNames('Claude', 'claude-opus-5,claude-sonnet-5,claude-haiku-4-5');
    let calls = 0;
    const off = onModelNamesChange(() => { calls++; });
    expect(applySelection({ provider: 'anthropic', model: 'claude-haiku-4-5' })).toBe('Claude');
    expect(getModelNames('Claude')).toBe('claude-haiku-4-5,claude-opus-5,claude-sonnet-5');
    applySelection({ provider: 'anthropic', model: 'claude-haiku-4-5' });
    selectModel('Claude', 'not-listed');
    expect(getModelNames('Claude')).toBe('claude-haiku-4-5,claude-opus-5,claude-sonnet-5');
    expect(calls).toBe(1);
    applySelection({ provider: 'anthropic', model: 'claude-new' });
    expect(getModelNames('Claude')).toBe('claude-new,claude-haiku-4-5,claude-opus-5,claude-sonnet-5');
    off();
  });
});
