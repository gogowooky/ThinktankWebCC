/**
 * highlighterPattern.ts
 * Highlighter の検索キーワードを解釈し、各モードに応じた正規表現パターンを生成する。
 *
 * モード:
 * - matchCase: 大文字・小文字を区別する (aA)
 * - isRegex: 正規表現モード (.*)
 * - matchWidth: 全角・半角を区別する (全半) ※既定は英数字のみ区別しない (false)
 *
 * ルール:
 * - 単語区切り: 半角スペースおよび全角スペース（\u3000）
 * - 半角・全角の対象範囲: 英数字のみ
 */

export interface HighlighterPatternOptions {
  matchCase?: boolean;
  isRegex?: boolean;
  matchWidth?: boolean;
}

/** 半角空白および全角空白（\u3000）で単語を分割 */
export function splitHighlighterWords(groupStr: string): string[] {
  return groupStr.split(/[ \u3000]+/).map(w => w.trim()).filter(w => w.length > 0);
}

/** カンマでグループ分割（最大5グループ） */
export function splitHighlighterGroups(highlightWord: string): string[] {
  return highlightWord.split(',').slice(0, 5);
}

/**
 * 英数字の半角・全角を展開する（英数字のみ対象）。
 * matchCase が false の場合は、大文字小文字双方の全角・半角文字を含めた文字クラスを生成する。
 */
export function expandZenHanAlphanumeric(text: string, matchCase: boolean = false): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);

    // 半角数字 0-9
    if (code >= 0x30 && code <= 0x39) {
      const zen = String.fromCharCode(code - 0x30 + 0xFF10);
      result += `[${char}${zen}]`;
    }
    // 全角数字 ０-９
    else if (code >= 0xFF10 && code <= 0xFF19) {
      const han = String.fromCharCode(code - 0xFF10 + 0x30);
      result += `[${han}${char}]`;
    }
    // 半角英大文字 A-Z
    else if (code >= 0x41 && code <= 0x5A) {
      const zenUpper = String.fromCharCode(code - 0x41 + 0xFF21);
      if (matchCase) {
        result += `[${char}${zenUpper}]`;
      } else {
        const hanLower = char.toLowerCase();
        const zenLower = String.fromCharCode(code - 0x41 + 0xFF41);
        result += `[${char}${hanLower}${zenUpper}${zenLower}]`;
      }
    }
    // 半角英小文字 a-z
    else if (code >= 0x61 && code <= 0x7A) {
      const zenLower = String.fromCharCode(code - 0x61 + 0xFF41);
      if (matchCase) {
        result += `[${char}${zenLower}]`;
      } else {
        const hanUpper = char.toUpperCase();
        const zenUpper = String.fromCharCode(code - 0x61 + 0xFF21);
        result += `[${char}${hanUpper}${zenLower}${zenUpper}]`;
      }
    }
    // 全角英大文字 Ａ-Ｚ
    else if (code >= 0xFF21 && code <= 0xFF3A) {
      const hanUpper = String.fromCharCode(code - 0xFF21 + 0x41);
      if (matchCase) {
        result += `[${hanUpper}${char}]`;
      } else {
        const hanLower = hanUpper.toLowerCase();
        const zenLower = String.fromCharCode(code - 0xFF21 + 0xFF41);
        result += `[${hanUpper}${hanLower}${char}${zenLower}]`;
      }
    }
    // 全角英小文字 ａ-ｚ
    else if (code >= 0xFF41 && code <= 0xFF5A) {
      const hanLower = String.fromCharCode(code - 0xFF41 + 0x61);
      if (matchCase) {
        result += `[${hanLower}${char}]`;
      } else {
        const hanUpper = hanLower.toUpperCase();
        const zenUpper = String.fromCharCode(code - 0xFF41 + 0xFF21);
        result += `[${hanLower}${hanUpper}${char}${zenUpper}]`;
      }
    } else {
      result += char;
    }
  }
  return result;
}

/** 単語から正規表現パターン文字列を生成 */
export function buildWordPattern(word: string, options: HighlighterPatternOptions = {}): string {
  if (options.isRegex) {
    return word;
  }
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (options.matchWidth) {
    return escaped;
  }
  return expandZenHanAlphanumeric(escaped, options.matchCase ?? false);
}

/** 単語リストからグループ用の RegExp を生成（失敗時は null） */
export function buildRegexFromWords(
  words: string[],
  options: HighlighterPatternOptions = {},
  captureGroup: boolean = true
): RegExp | null {
  if (words.length === 0) return null;
  const patterns = words.map(w => buildWordPattern(w, options));
  const flags = options.matchCase ? 'g' : 'gi';
  const joined = patterns.join('|');
  const expr = captureGroup ? `(${joined})` : joined;
  try {
    return new RegExp(expr, flags);
  } catch {
    return null;
  }
}
