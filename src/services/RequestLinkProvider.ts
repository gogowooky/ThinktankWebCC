/**
 * RequestLinkProvider.ts
 * TTRequestsのDeterminantパターンをMonaco EditorのLinkProviderとして提供
 */

import type * as Monaco from 'monaco-editor';
import { TTModels } from '../models/TTModels';
import { TTRequest } from '../models/TTRequest';

/**
 * リンク情報の拡張インターフェース
 */
export interface RequestLink extends Monaco.languages.ILink {
    requestId: string;
    matchedText: string;
}

/**
 * パターンキャッシュ
 * TTRequestsから生成したパターンをキャッシュして、毎回の再生成を防ぐ
 */
let cachedPatterns: { id: string; name: string; regex: RegExp }[] | null = null;

/**
 * パターンキャッシュを無効化
 * TTRequestsコレクションが変更された際に呼び出す
 */
export function invalidatePatternCache(): void {
    cachedPatterns = null;
    console.log('[RequestLinkProvider] パターンキャッシュを無効化しました');
}

/**
 * TTRequestsからDeterminantパターンを取得（キャッシュ付き）
 */
export function getRequestPatterns(): { id: string; name: string; regex: RegExp }[] {
    // キャッシュがあればそれを返す
    if (cachedPatterns !== null) {
        return cachedPatterns;
    }

    const models = TTModels.Instance;

    if (!models?.Requests) {
        console.log(`[RequestLinkProvider] Requests not available`);
        return [];
    }

    const items = models.Requests.GetItems();
    console.log(`[RequestLinkProvider] パターンキャッシュを生成中... (${items.length} 件)`);

    const patterns: { id: string; name: string; regex: RegExp }[] = [];

    for (const item of models.Requests.GetItems()) {
        const request = item as TTRequest;
        if (!request.Determinant) continue;

        try {
            // 名前付きグループをキャプチャグループに変換
            // 標準構文: (?<name>...) → (...)
            // カスタム構文: (<name>?...) → (...)
            let cleanedPattern = request.Determinant;
            cleanedPattern = cleanedPattern.replace(/\(\?<[^>]+>/g, '(');  // 標準構文
            cleanedPattern = cleanedPattern.replace(/\(<[^>]+>\?/g, '(');  // カスタム構文

            const regex = new RegExp(cleanedPattern, 'g');
            patterns.push({
                id: request.ID,
                name: request.Name,
                regex
            });
        } catch (e) {
            console.warn(`[RequestLinkProvider] Invalid regex in ${request.ID}:`, e);
        }
    }

    // キャッシュに保存
    cachedPatterns = patterns;
    console.log(`[RequestLinkProvider] パターンキャッシュを生成完了 (${patterns.length} パターン)`);

    return patterns;
}

/**
 * テキスト内でパターンにマッチする箇所を検出してリンクを生成
 */
export function findRequestLinks(text: string, patterns: { id: string; name: string; regex: RegExp }[]): RequestLink[] {
    const links: RequestLink[] = [];
    const lines = text.split('\n');

    // 重複チェック用のSet: "行番号:開始列:終了列" をキーとする
    const registeredRanges = new Set<string>();

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const lineNumber = lineIndex + 1; // Monaco Editorは1-indexed

        for (const pattern of patterns) {
            // 正規表現をリセット（globalフラグ使用時は必要）
            pattern.regex.lastIndex = 0;

            let match;
            while ((match = pattern.regex.exec(line)) !== null) {
                const startColumn = match.index + 1; // Monaco Editorは1-indexed
                const endColumn = startColumn + match[0].length;

                // 空マッチを防ぐ
                if (match[0].length === 0) {
                    pattern.regex.lastIndex++;
                    continue;
                }

                // 重複チェック: 同じ範囲に既にリンクがあればスキップ
                const rangeKey = `${lineNumber}:${startColumn}:${endColumn}`;
                if (registeredRanges.has(rangeKey)) {
                    continue;
                }
                registeredRanges.add(rangeKey);

                links.push({
                    range: {
                        startLineNumber: lineNumber,
                        startColumn,
                        endLineNumber: lineNumber,
                        endColumn
                    },
                    // シンプルなURLスキームを使用（ホバー表示を読みやすくするため）
                    // 実際のマッチテキストはmatchedTextプロパティで保持
                    url: `#${pattern.id}`,
                    // tooltipでコロンを使うとマークダウンリンクとして誤解釈されるため矢印を使用
                    tooltip: `${pattern.name} → ${match[0]}`,
                    requestId: pattern.id,
                    matchedText: match[0]
                });
            }
        }
    }

    return links;
}

/**
 * Monaco Editor用のLinkProviderを生成
 */
export function createRequestLinkProvider(): Monaco.languages.LinkProvider {
    return {
        provideLinks: (model: Monaco.editor.ITextModel): Monaco.languages.ProviderResult<Monaco.languages.ILinksList> => {
            const text = model.getValue();
            const patterns = getRequestPatterns();
            const links = findRequestLinks(text, patterns);

            // HoverProviderに任せるためtooltipを削除
            const linksWithoutTooltip = links.map(link => ({
                ...link,
                tooltip: undefined
            }));

            return {
                links: linksWithoutTooltip as Monaco.languages.ILink[]
            };
        },

        resolveLink: (_link: Monaco.languages.ILink): Monaco.languages.ProviderResult<Monaco.languages.ILink> => {
            // リンク解決を行わない（nullを返す）ことで、
            // onMouseDownイベントが発火し、TTEventsで処理できるようにする
            // ホバー表示はHoverProviderで提供されるので影響なし
            return null;
        }
    };
}

/**
 * マッチ情報のインターフェース
 */
export interface RequestMatch {
    lineNumber: number;
    startColumn: number;
    endColumn: number;
    requestId: string;
    requestName: string;
    matchedText: string;
}

/**
 * テキスト内のパターンマッチを検索
 */
export function findRequestMatches(text: string, patterns: { id: string; name: string; regex: RegExp }[]): RequestMatch[] {
    const matches: RequestMatch[] = [];
    const lines = text.split('\n');
    const registeredRanges = new Set<string>();

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const lineNumber = lineIndex + 1;

        for (const pattern of patterns) {
            pattern.regex.lastIndex = 0;

            let match;
            while ((match = pattern.regex.exec(line)) !== null) {
                const startColumn = match.index + 1;
                const endColumn = startColumn + match[0].length;

                if (match[0].length === 0) {
                    pattern.regex.lastIndex++;
                    continue;
                }

                const rangeKey = `${lineNumber}:${startColumn}:${endColumn}`;
                if (registeredRanges.has(rangeKey)) {
                    continue;
                }
                registeredRanges.add(rangeKey);

                matches.push({
                    lineNumber,
                    startColumn,
                    endColumn,
                    requestId: pattern.id,
                    requestName: pattern.name,
                    matchedText: match[0]
                });
            }
        }
    }

    return matches;
}

/**
 * Monaco Editor用のHoverProviderを生成
 * 「name:対象文字(ctrl+click)」形式で表示
 */
export function createRequestHoverProvider(): Monaco.languages.HoverProvider {
    return {
        provideHover: (model: Monaco.editor.ITextModel, position: Monaco.Position): Monaco.languages.ProviderResult<Monaco.languages.Hover> => {
            const text = model.getValue();
            const patterns = getRequestPatterns();
            const matches = findRequestMatches(text, patterns);

            // 現在の位置にマッチするリンクを検索
            const lineNumber = position.lineNumber;
            const column = position.column;

            for (const m of matches) {
                if (m.lineNumber === lineNumber && column >= m.startColumn && column <= m.endColumn) {
                    return {
                        range: {
                            startLineNumber: m.lineNumber,
                            startColumn: m.startColumn,
                            endLineNumber: m.lineNumber,
                            endColumn: m.endColumn
                        },
                        contents: [
                            { value: `**${m.requestName}:** ${m.matchedText}` }
                        ]
                    };
                }
            }

            return null;
        }
    };
}

