/**
 * EmbeddingApiService.ts
 * Phase 15: /api/embeddings/* を呼び出すクライアントヘルパー。
 */

const BASE = '/api/embeddings';

export interface SemanticSearchResult {
  id:            string;
  similarity:    number;
  title:         string;
  contentType:   string;
  keywords:      string;
  relatedIds:    string;
  updatedAt:     string;
  isKeywordOnly?: boolean;
}

export interface BatchProgress {
  type:       'progress' | 'done' | 'error';
  total:      number;
  processed:  number;
  failed:     number;
  message?:   string;
  lastError?: string;
}

export async function semanticSearch(
  query: string,
  limit = 20,
  hybrid = false,
): Promise<SemanticSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit), hybrid: String(hybrid) });
  const res = await fetch(`${BASE}/search?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  const data = await res.json() as { results: SemanticSearchResult[] };
  return data.results;
}

export async function generateEmbedding(entryId: string, content: string): Promise<void> {
  const res = await fetch(`${BASE}/generate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ entryId, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
}

export async function batchGenerateEmbeddings(
  skipExisting = true,
  onProgress?: (p: BatchProgress) => void,
): Promise<BatchProgress> {
  const res = await fetch(`${BASE}/batch`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ skipExisting }),
  });
  if (!res.ok) throw new Error(`Batch failed: ${res.statusText}`);

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  let last: BatchProgress = { type: 'progress', total: 0, processed: 0, failed: 0 };
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const payload = JSON.parse(line.slice(6)) as BatchProgress;
        last = payload;
        onProgress?.(payload);
      } catch { /* ignore parse errors */ }
    }
  }
  return last;
}

export async function getEmbeddingStatus(): Promise<{ count: number; model: string; dimensions: number }> {
  const res = await fetch(`${BASE}/status`);
  if (!res.ok) throw new Error(res.statusText);
  return res.json() as Promise<{ count: number; model: string; dimensions: number }>;
}
