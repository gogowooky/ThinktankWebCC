import { describe, expect, it } from 'vitest';
import { parseRawThinkText, rawFieldsToContent, rawTextMatchesThink, toRawThinkText, type RawThinkSource } from './rawThinkText';

const think = (): RawThinkSource => ({
  ID: '2026-10-09-120000', ContentType: 'memo', Content: '# 開発日記\n本文1\n本文2',
  Keywords: 'a,b', RelatedIDs: '2026-10-01-000000', UpdatedAt: '2026-10-09T03:00:00.000Z',
  Metadata: { highlightWord: '日記', datagrid: { activeIdx: 1 }, since: '2026-10-01' },
});

describe('raw think text (YAML + body)', () => {
  it('puts base fields and metadata in the YAML and the body after it', () => {
    const text = toRawThinkText(think());
    expect(text.startsWith('---\nthinkid: 2026-10-09-120000\ncategory: memo\ntitle: \'# 開発日記\'\n')).toBe(true);
    expect(text).toContain('highlightWord: 日記');
    expect(text.endsWith('---\n本文1\n本文2')).toBe(true);
  });

  it('round-trips without changing metadata value types', () => {
    const t = think();
    const fields = parseRawThinkText(toRawThinkText(t));
    if ('error' in fields) throw new Error(fields.error);
    expect(rawFieldsToContent(fields)).toBe(t.Content);
    expect(fields.keywords).toBe('a,b');
    expect(fields.relatedIds).toBe('2026-10-01-000000');
    // 日付らしき文字列が Date に化けない
    expect(fields.metadata).toEqual(t.Metadata);
    expect(rawTextMatchesThink(toRawThinkText(t), t)).toBe(true);
  });

  it('reads edits to title, keywords, related_ids, metadata and ignores thinkid/category/updated_at', () => {
    const edited = toRawThinkText(think())
      .replace("title: '# 開発日記'", "title: '# 新しい題'")
      .replace('keywords: a,b', 'keywords: x')
      .replace('thinkid: 2026-10-09-120000', 'thinkid: other')
      .replace('category: memo', 'category: table')
      .replace('highlightWord: 日記', 'highlightWord: 新')
      .replace('本文2', '本文2を編集');
    const fields = parseRawThinkText(edited);
    if ('error' in fields) throw new Error(fields.error);
    expect(rawFieldsToContent(fields)).toBe('# 新しい題\n本文1\n本文2を編集');
    expect(fields.keywords).toBe('x');
    expect(fields.metadata.highlightWord).toBe('新');
    expect(fields.metadata).not.toHaveProperty('thinkid');
    expect(fields.metadata).not.toHaveProperty('category');
  });

  it('treats a formatting-only difference as the same content', () => {
    const t = think();
    const reordered = '---\ncategory: memo\nthinkid: 2026-10-09-120000\ntitle: "# 開発日記"\nkeywords: "a,b"\n'
      + 'related_ids: "2026-10-01-000000"\nhighlightWord: 日記\ndatagrid: { activeIdx: 1 }\nsince: "2026-10-01"\n---\n本文1\n本文2';
    expect(rawTextMatchesThink(reordered, t)).toBe(true);
  });

  it('reports broken YAML instead of saving', () => {
    expect(parseRawThinkText('本文だけ')).toHaveProperty('error');
    expect(parseRawThinkText('---\ntitle: a\n本文')).toHaveProperty('error');
    expect(parseRawThinkText('---\ntitle: [a\n---\n本文')).toHaveProperty('error');
    expect(parseRawThinkText('---\n- a\n---\n本文')).toHaveProperty('error');
  });
});
