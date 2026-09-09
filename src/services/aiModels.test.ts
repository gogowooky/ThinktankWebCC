// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_MODEL_OPTIONS, loadAiModelSelection, modelLabel } from './aiModels';
import { isAllowedAiModel, resolveGeminiModel } from '../../server/config/aiModels';

describe('Gemini model migration', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  it('migrates a saved Flash selection and persists it', () => {
    localStorage.setItem('panel', JSON.stringify({ provider: 'gemini', model: 'gemini-2.5-flash' }));
    const selection = loadAiModelSelection('panel');
    expect(selection).toEqual({ provider: 'gemini', model: 'gemini-3.5-flash' });
    expect(JSON.parse(localStorage.getItem('panel')!)).toEqual(selection);
    expect(modelLabel(selection)).toBe('Gemini 3.5 Flash');
  });
  it('still migrates when storage is read-only', () => {
    localStorage.setItem('panel', JSON.stringify({ provider: 'gemini', model: 'gemini-2.5-flash' }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('read-only'); });
    expect(loadAiModelSelection('panel').model).toBe('gemini-3.5-flash');
  });
  it('preserves other selections', () => {
    const selection = { provider: 'gemini', model: 'gemini-2.5-pro' };
    localStorage.setItem('panel', JSON.stringify(selection));
    expect(loadAiModelSelection('panel')).toEqual(selection);
  });
  it('accepts current options and legacy Flash, but rejects arbitrary requests', () => {
    for (const option of AI_MODEL_OPTIONS) expect(isAllowedAiModel(option.provider, option.model)).toBe(true);
    expect(isAllowedAiModel('gemini', 'gemini-2.5-flash')).toBe(true);
    expect(isAllowedAiModel('openai', 'gemini-2.5-flash')).toBe(false);
    expect(isAllowedAiModel('gemini', 'unknown')).toBe(false);
    expect(resolveGeminiModel()).toBe('gemini-3.5-flash');
    expect(resolveGeminiModel('gemini-2.5-flash')).toBe('gemini-3.5-flash');
  });
});
