/**
 * KeywordHighlighter.ts
 * Editorのキーワードハイライト機能
 * 
 * Editor.Keywordの値をパースし、Monaco Editorのデコレーションを生成
 */

import { getKeywordColorMode, type KeywordStyle } from './ColorTheme';

/**
 * キーワードグループ
 */
export interface KeywordGroup {
    groupIndex: number;  // 1-6
    keywords: string[];
    style: KeywordStyle;
}

/**
 * パース結果
 */
export interface ParsedKeywords {
    groups: KeywordGroup[];
}

/**
 * Editor.Keywordの値をパースしてグループに分割
 * 
 * 形式: "keyword1 keyword2, keyword3 keyword4, ..."
 * - カンマ区切りでグループ1-6に分割
 * - スペース区切りで個別キーワードに分割
 * 
 * @param keywordText Editor.Keywordの値
 * @param colorMode KeywordColorModeの値（Default/Subtle/None）
 */
export function parseKeywords(keywordText: string, colorMode: string = 'Default'): ParsedKeywords {
    if (!keywordText || keywordText.trim() === '') {
        return { groups: [] };
    }

    const colorModeData = getKeywordColorMode(colorMode);
    const groupTexts = keywordText.split(',');
    const groups: KeywordGroup[] = [];

    for (let i = 0; i < Math.min(groupTexts.length, 6); i++) {
        const groupText = groupTexts[i].trim();
        if (!groupText) continue;

        // スペースで分割して個別キーワードに
        const keywords = groupText.split(/\s+/).filter(k => k.length > 0);
        if (keywords.length === 0) continue;

        const groupIndex = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6;
        const style = colorModeData[`Keyword${groupIndex}`];

        groups.push({
            groupIndex,
            keywords,
            style
        });
    }

    return { groups };
}

/**
 * Monaco Editorのデコレーションオプションを生成
 */
export function createDecorationOptions(style: KeywordStyle): {
    inlineClassName: string;
    inlineStyle: string;
} {
    const styles: string[] = [];

    if (style.foreground && style.foreground !== 'inherit') {
        styles.push(`color: ${style.foreground}`);
    }
    if (style.background && style.background !== 'transparent') {
        styles.push(`background-color: ${style.background}`);
    }
    if (style.fontWeight === 'bold') {
        styles.push('font-weight: bold');
    }
    if (style.underline) {
        styles.push('text-decoration: underline');
    }

    return {
        inlineClassName: `keyword-highlight-${style.foreground?.replace('#', '')}`,
        inlineStyle: styles.join('; ')
    };
}

/**
 * テキスト内のキーワードを検索してデコレーション配列を生成
 * 
 * @param text エディタのテキスト内容
 * @param parsedKeywords パース済みキーワード
 * @returns Monaco EditorのIModelDeltaDecoration形式の配列
 */
export function findKeywordMatches(
    text: string,
    parsedKeywords: ParsedKeywords
): Array<{
    range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
    options: { inlineClassName?: string; };
    groupIndex: number;
    style: KeywordStyle;
}> {
    const matches: Array<{
        range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
        options: { inlineClassName?: string; };
        groupIndex: number;
        style: KeywordStyle;
    }> = [];

    if (!text || parsedKeywords.groups.length === 0) {
        return matches;
    }

    const lines = text.split('\n');

    for (const group of parsedKeywords.groups) {
        for (const keyword of group.keywords) {
            if (!keyword) continue;

            // 大文字小文字を無視して検索
            const regex = new RegExp(escapeRegExp(keyword), 'gi');

            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                const line = lines[lineIndex];
                let match;

                while ((match = regex.exec(line)) !== null) {
                    matches.push({
                        range: {
                            startLineNumber: lineIndex + 1,
                            startColumn: match.index + 1,
                            endLineNumber: lineIndex + 1,
                            endColumn: match.index + match[0].length + 1
                        },
                        options: {
                            inlineClassName: `keyword-group-${group.groupIndex}`
                        },
                        groupIndex: group.groupIndex,
                        style: group.style
                    });
                }
            }
        }
    }

    return matches;
}

/**
 * 正規表現の特殊文字をエスケープ
 */
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * キーワードハイライト用のCSSスタイルを生成
 */
export function generateKeywordStyles(colorMode: string = 'Default'): string {
    const mode = getKeywordColorMode(colorMode);

    let css = '';
    for (let i = 1; i <= 6; i++) {
        const keywordKey = `Keyword${i}` as keyof typeof mode;
        const style = mode[keywordKey] as KeywordStyle;

        const styles: string[] = [];
        if (style.foreground && style.foreground !== 'inherit') {
            styles.push(`color: ${style.foreground} !important`);
        }
        if (style.background && style.background !== 'transparent') {
            styles.push(`background-color: ${style.background} !important`);
        }
        if (style.fontWeight === 'bold') {
            styles.push('font-weight: bold !important');
        }
        if (style.underline) {
            styles.push('text-decoration: underline !important');
        }

        css += `.keyword-group-${i} { ${styles.join('; ')} }\n`;
    }

    return css;
}
