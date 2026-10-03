/**
 * historyUtils.ts
 * フィルター・検索履歴の永続化管理
 */

const MAX_HISTORY = 20;

function currentKey(key: string): string {
  return key === 'ov-filter' ? 'seeds-filter' : key;
}

export function loadHistory(key: string): string[] {
  try {
    const data = localStorage.getItem(currentKey(key)) ?? (key === 'seeds-filter' ? localStorage.getItem('ov-filter') : null);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error(`[HistoryUtils] Failed to load history for ${key}:`, e);
    return [];
  }
}

export function saveHistory(key: string, value: string): string[] {
  if (!value.trim()) return loadHistory(key);
  const prev = loadHistory(key).filter(h => h !== value);
  const next = [value, ...prev].slice(0, MAX_HISTORY);
  localStorage.setItem(currentKey(key), JSON.stringify(next));
  return next;
}

export function clearHistory(key: string): void {
  localStorage.removeItem(currentKey(key));
  if (key === 'seeds-filter') localStorage.removeItem('ov-filter');
}

export function removeHistoryItem(key: string, value: string): string[] {
  const next = loadHistory(key).filter(h => h !== value);
  localStorage.setItem(currentKey(key), JSON.stringify(next));
  return next;
}
