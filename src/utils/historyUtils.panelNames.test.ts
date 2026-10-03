import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearHistory, loadHistory, saveHistory } from './historyUtils';

beforeEach(() => {
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  });
});
afterEach(() => vi.unstubAllGlobals());

it('continues the saved Seeds filter history from the old key', () => {
  localStorage.setItem('ov-filter', JSON.stringify(['旧検索']));
  expect(loadHistory('seeds-filter')).toEqual(['旧検索']);
  expect(saveHistory('seeds-filter', '新検索')).toEqual(['新検索', '旧検索']);
  expect(JSON.parse(localStorage.getItem('seeds-filter')!)).toEqual(['新検索', '旧検索']);
  clearHistory('seeds-filter');
  expect(localStorage.getItem('ov-filter')).toBeNull();
});
