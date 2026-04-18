/**
 * LocalSearchService.ts
 * Phase 10 段206: オフライン全文検索 — IndexedDBキャッシュを対象にした部分文字列マッチ
 *
 * オンライン時は /api/bq/ttsearch を使用し、
 * オフライン時はこのサービスが IndexedDB 上のキャッシュを検索する。
 */

import { StorageManager } from './StorageManager';

export interface LocalSearchResult {
    id: string;
    title: string;
    snippet: string;
    updateDate: string;
}

export class LocalSearchService {
    /**
     * IndexedDB内のキャッシュメモを全文検索する。
     * キー `memo_content_*` を対象に、クエリを空白で分割して AND 検索する。
     *
     * @param query   検索クエリ文字列（スペース区切りで複数語 AND 検索）
     * @param limit   最大件数（デフォルト200）
     * @returns 検索結果（updated_at降順）
     */
    async search(query: string, limit = 200): Promise<LocalSearchResult[]> {
        if (!query.trim()) return [];

        const terms = query.trim().toLowerCase().split(/\s+/).filter(t => t.length > 0);
        if (terms.length === 0) return [];

        try {
            // IndexedDB の全キャッシュキーを取得
            const listResult = await StorageManager.local.list('', '');
            if (!listResult.success || !listResult.data) return [];

            const memoKeys = (listResult.data as string[]).filter(k => k.startsWith('memo_content_'));

            const results: LocalSearchResult[] = [];

            for (const key of memoKeys) {
                const loadResult = await StorageManager.local.load(key);
                if (!loadResult.success || !loadResult.data) continue;

                let cached: { content?: string; updateDate?: string } = {};
                try {
                    cached = JSON.parse(loadResult.data as string);
                } catch {
                    continue;
                }

                const content = (cached.content || '').toLowerCase();
                const allMatch = terms.every(t => content.includes(t));
                if (!allMatch) continue;

                const memoId = key.replace('memo_content_', '');
                const firstLine = (cached.content || '').split('\n')[0].replace(/^#+\s*/, '').trim();
                const title = firstLine || memoId;
                const snippet = this._extractSnippet(cached.content || '', terms[0], 100);

                results.push({
                    id: memoId,
                    title,
                    snippet,
                    updateDate: cached.updateDate || '',
                });

                if (results.length >= limit) break;
            }

            // updateDate 降順ソート
            results.sort((a, b) => (b.updateDate > a.updateDate ? 1 : -1));
            return results;
        } catch (e) {
            console.error('[LocalSearchService] 検索失敗:', e);
            return [];
        }
    }

    private _extractSnippet(content: string, term: string, range: number): string {
        const lower = content.toLowerCase();
        const idx = lower.indexOf(term.toLowerCase());
        if (idx === -1) return content.slice(0, range * 2);
        const start = Math.max(0, idx - range);
        const end = Math.min(content.length, idx + term.length + range);
        return (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '');
    }
}

export const localSearchService = new LocalSearchService();
