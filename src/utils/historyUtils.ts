/**
 * historyUtils.ts
 * フィルター・検索履歴の永続化管理
 */

const MAX_HISTORY = 20;

export function loadHistory(key: string): string[] {
  try {
    const data = localStorage.getItem(key);
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
  localStorage.setItem(key, JSON.stringify(next));
  return next;
}

export function clearHistory(key: string): void {
  localStorage.removeItem(key);
}

export function removeHistoryItem(key: string, value: string): string[] {
  const next = loadHistory(key).filter(h => h !== value);
  localStorage.setItem(key, JSON.stringify(next));
  return next;
}
