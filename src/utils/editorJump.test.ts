import { describe, it, expect } from 'vitest';
import { jumpPosition, requestEditorOpen, takeEditorOpen, type JumpEditor } from './editorJump';
import { findHighlightRanges, type HighlightRange } from './highlightMatches';

/** Monaco の findMatches（正規表現・大文字小文字を区別しない）に相当する最小の代役。 */
function fakeEditor(text: string): JumpEditor {
  const lines = text.split('\n');
  return {
    getModel: () => ({
      getLineCount: () => lines.length,
      findMatches: (search: string) => {
        const found: { range: HighlightRange }[] = [];
        lines.forEach((line, index) => {
          const re = new RegExp(search, 'gi');
          let m: RegExpExecArray | null;
          while ((m = re.exec(line)) !== null) {
            found.push({
              range: {
                startLineNumber: index + 1,
                startColumn: m.index + 1,
                endLineNumber: index + 1,
                endColumn: m.index + 1 + m[0].length,
              },
            });
            if (m[0].length === 0) re.lastIndex++;
          }
        });
        return found;
      },
    }),
  };
}

const SAMPLE = ['one', 'two abc', 'three', 'four abc tail', 'five'].join('\n');

describe('jumpPosition（行番号指定）', () => {
  it('指定行の行頭を返す', () => {
    expect(jumpPosition(fakeEditor(SAMPLE), { kind: 'line', line: 3 })).toEqual({ lineNumber: 3, column: 1 });
  });

  it('本文の行数を超える指定は最終行へ丸める', () => {
    expect(jumpPosition(fakeEditor(SAMPLE), { kind: 'line', line: 99 })).toEqual({ lineNumber: 5, column: 1 });
  });

  it('0以下の指定は先頭行へ丸める', () => {
    expect(jumpPosition(fakeEditor(SAMPLE), { kind: 'line', line: 0 })).toEqual({ lineNumber: 1, column: 1 });
  });
});

describe('jumpPosition（検索語指定）', () => {
  it('本文の先頭から数えて最初のヒットを返す（2つめ以降は選ばない）', () => {
    expect(jumpPosition(fakeEditor(SAMPLE), { kind: 'search', word: 'abc' })).toEqual({ lineNumber: 2, column: 5 });
  });

  it('大文字小文字は区別しない', () => {
    expect(jumpPosition(fakeEditor(SAMPLE), { kind: 'search', word: 'ABC' })).toEqual({ lineNumber: 2, column: 5 });
  });

  it('ヒットが無ければ null（カーソルを動かさない）', () => {
    expect(jumpPosition(fakeEditor(SAMPLE), { kind: 'search', word: 'zzz' })).toBeNull();
  });
});

describe('findHighlightRanges', () => {
  it('カンマ・空白区切りの語をOR条件で探す', () => {
    const ranges = findHighlightRanges(fakeEditor('alpha\nbravo\ncharlie'), 'charlie, alpha');
    expect(ranges.map(r => r.startLineNumber)).toEqual([1, 3]);
  });

  it('正規表現のメタ文字は文字として扱う', () => {
    expect(findHighlightRanges(fakeEditor('abc'), 'a.c')).toHaveLength(0);
    expect(findHighlightRanges(fakeEditor('a.c'), 'a.c')).toHaveLength(1);
  });

  it('語が空なら何も返さない', () => {
    expect(findHighlightRanges(fakeEditor(SAMPLE), '   ')).toEqual([]);
  });
});

describe('受け渡し', () => {
  it('取り出しは一度だけで、次のマウントには持ち越さない', () => {
    requestEditorOpen('2026-09-17-190336', { kind: 'line', line: 12 });
    expect(takeEditorOpen('2026-09-17-190336')).toEqual({ jump: { kind: 'line', line: 12 } });
    expect(takeEditorOpen('2026-09-17-190336')).toBeUndefined();
  });

  // 行き先なしでも依頼そのものは残す。TextEditorMedia はこれを見てフォーカスを当てる。
  it('行き先を指定しなくても依頼は受け取れる', () => {
    requestEditorOpen('2026-09-17-190337');
    expect(takeEditorOpen('2026-09-17-190337')).toEqual({ jump: undefined });
  });

  it('預けていないThinkでは undefined', () => {
    expect(takeEditorOpen('2026-01-01-000000')).toBeUndefined();
  });
});
