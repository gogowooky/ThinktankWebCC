import React, { useState, useEffect } from 'react';
import './SearchApp.css';
import { localSearchService } from '../../services/storage/LocalSearchService';

interface FileRecord {
    file_id: string;
    title: string | null;
    file_type: string;
    category: string | null;
    content: string | null;
    content_preview?: string; // 旧仕様バックエンド用のフォールバック
    metadata: Record<string, unknown> | null;
    size_bytes: number | null;
    created_at: string;
    updated_at: string;
}

export const SearchApp: React.FC = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<FileRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    // 初回マウント時にURLパラメータからクエリを取得して検索
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const q = params.get('q');
        if (q) {
            setQuery(q);
            performSearch(q);
        }
    }, []);

    const performSearch = async (searchQuery: string) => {
        if (!searchQuery.trim()) return;

        setIsLoading(true);
        setError(null);
        setHasSearched(true);
        setResults([]);

        // 段206: オフライン時はLocalSearchServiceを使用
        if (!navigator.onLine) {
            try {
                const localResults = await localSearchService.search(searchQuery);
                // LocalSearchResult を FileRecord 形式に変換
                const mapped: FileRecord[] = localResults.map(r => ({
                    file_id: r.id,
                    title: r.title,
                    file_type: 'md',
                    category: 'Memo',
                    content: r.snippet,
                    metadata: null,
                    size_bytes: null,
                    created_at: r.updateDate,
                    updated_at: r.updateDate,
                }));
                setResults(mapped);
            } catch (err: any) {
                setError(`オフライン検索に失敗しました: ${err?.message ?? err}`);
            } finally {
                setIsLoading(false);
            }
            return;
        }

        try {
            // 検索対象を Memo カテゴリに限定
            const url = `/api/bq/ttsearch?q=${encodeURIComponent(searchQuery)}&category=Memo`;
            const response = await fetch(url);

            if (!response.ok) {
                let errorMsg = `検索に失敗しました (${response.status})`;
                try {
                    const text = await response.text();
                    if (text && text.trim().startsWith('{')) {
                        const errData = JSON.parse(text);
                        errorMsg = errData.error || errorMsg;
                    } else if (text) {
                        errorMsg += ' - バックエンドサーバーが起動していない可能性があります。';
                    }
                } catch (e) {
                    // ignore
                }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            setResults(data.results || []);
        } catch (err: any) {
            console.error('Search error details:', err, 'Type:', typeof err, 'Message:', err?.message, 'Online status:', navigator.onLine);
            let detailedError = err.message || err.toString() || '通信エラーが発生しました';

            // "Offline", "Failed to fetch" などのネットワーク関連エラーにヒントを付与
            if (detailedError === 'Offline' || detailedError === 'Failed to fetch' || !navigator.onLine) {
                detailedError += ' - ネットワーク未接続、またはバックエンドサーバー(Viteプロキシ設定先8080)がシャットダウンしているか、通信が遮断されています。';
            }
            setError(detailedError);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();

        // "/ttsearch?q=urlencode(キーワード)" でサービスを再呼出しする
        const url = new URL(window.location.href);
        url.searchParams.set('q', query);

        // 親ウィンドウにナビゲーション先URLを通知（WebView.Keywordに反映させる）
        // Keywords/タイトルには人間が読めるURLを保持
        const relativeUrl = decodeURIComponent(url.pathname + url.search);
        window.parent.postMessage({
            type: 'TT_WEBVIEW_NAVIGATE',
            url: relativeUrl
        }, '*');

        window.location.href = url.toString();
    };


    // コンテンツのスニペット生成とキーワードのハイライト（複数キーワード対応）
    const highlightSnippet = (content: string | null, contentPreview: string | undefined, keyword: string) => {
        const textToSearch = content || contentPreview;
        if (!textToSearch) return <span style={{ color: 'red' }}>※コンテントが取得できません</span>;

        const cleanContent = textToSearch.replace(/[#*`>\\n\\r]+/g, ' ');
        if (!keyword.trim()) return <span>{cleanContent.substring(0, 200)}...</span>;

        // キーワードをスペースで分割
        const keywords = keyword.toLowerCase().split(/\\s+/).filter(k => k.length > 0);
        if (keywords.length === 0) return <span>{cleanContent.substring(0, 200)}...</span>;

        const lowerContent = cleanContent.toLowerCase();

        // 最初に見つかったキーワードの出現位置を探す
        let firstIndex = -1;
        for (const kw of keywords) {
            const idx = lowerContent.indexOf(kw);
            if (idx !== -1 && (firstIndex === -1 || idx < firstIndex)) {
                firstIndex = idx;
            }
        }

        // どのキーワードも見つからなかった場合（BigQueryの曖昧検索でヒットし、本文に完全一致文字がない場合など）
        // ユーザーに「なぜ先頭が表示されているか」が分かるようにラベルを付与
        if (firstIndex === -1) {
            return (
                <span className="search-result-snippet-fallback">
                    <span style={{ color: '#888', fontSize: '0.9em', marginRight: '4px' }}>[関連・タイトル等でヒット]</span>
                    {cleanContent.substring(0, 200)}...
                </span>
            );
        }

        // スニペットの抽出範囲（前50文字、後150文字など）
        const start = Math.max(0, firstIndex - 50);
        const end = Math.min(cleanContent.length, firstIndex + 150);

        const snippetText = cleanContent.substring(start, end);

        // スニペット内でキーワードをすべてハイライトする関数
        const renderHighlightedText = (text: string, words: string[]) => {
            if (!words.length) return <span>{text}</span>;

            // 検索用の正規表現を作成（エスケープ処理し、大文字小文字無視）
            const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'));
            const regex = new RegExp(`(${escapedWords.join('|')})`, 'gi');

            const parts = text.split(regex);
            return (
                <span>
                    {parts.map((part, i) =>
                        regex.test(part) ? <strong key={i}>{part}</strong> : <React.Fragment key={i}>{part}</React.Fragment>
                    )}
                </span>
            );
        };

        return (
            <span>
                {start > 0 ? '...' : ''}
                {renderHighlightedText(snippetText, keywords)}
                {end < cleanContent.length ? '...' : ''}
            </span>
        );
    };

    return (
        <div className="search-app-container">
            <div className="search-header">
                <form className="search-input-wrapper" onSubmit={handleSearch}>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Thinktank内を検索"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                    <button type="submit" className="search-button" disabled={isLoading}>
                        検索
                    </button>
                </form>
            </div>

            {isLoading && <div className="search-loading">検索中...</div>}

            {error && <div className="search-error">{error}</div>}

            {!isLoading && !error && hasSearched && results.length === 0 && (
                <div className="search-empty">「{query}」に一致するメモは見つかりませんでした。</div>
            )}

            {!isLoading && !error && results.length > 0 && (
                <div className="search-results">
                    {results.map((item) => (
                        <div key={item.file_id} className="search-result-item">
                            <a
                                className="search-result-title"
                                tabIndex={0}
                                data-request-id="TTObject"
                                data-request-tag={`[TTMemo:${item.file_id}]`}
                            >
                                {item.file_id} : {item.title || "Untitled"}
                            </a>
                            <div className="search-result-snippet">
                                {highlightSnippet(item.content, item.content_preview, query)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
