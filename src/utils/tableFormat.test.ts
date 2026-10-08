import { describe, expect, it } from 'vitest';
import { parseTableContent, readColHeader, tableContentWithBodyHeader, tableSectionToMetadataForm } from './tableFormat';

describe('table の列ヘッダー（colheader）', () => {
  it('colheader があればそれを列とし、> と | の行はコメントとして扱う', () => {
    const [section] = parseTableContent('連絡先\n> 旧ヘッダー,x\n| md表,y\n# メモ\n; 注記\n山田,a@example.com', '氏名,メール');
    expect(section.columns).toEqual(['氏名', 'メール']);
    expect(section.rows).toEqual([['山田', 'a@example.com']]);
    expect(section.rawLines.filter(r => r.type === 'comment').map(r => r.text)).toEqual(['> 旧ヘッダー,x', '| md表,y', '# メモ', '; 注記']);
  });

  it('colheader が無い旧形式は最初の > 行を列ヘッダーとして読む', () => {
    const [section] = parseTableContent('連絡先\n> 氏名,メール\n> 2行目\n山田,a@example.com');
    expect(section.columns).toEqual(['氏名', 'メール']);
    expect(section.headerSource).toBe('body');
    expect(section.rawLines.map(r => r.type)).toEqual(['columns', 'comment', 'data']);
  });

  it('保存時は列ヘッダーを colheader へ移し、本文から > 行を消す（コメントと桁揃えは保持）', () => {
    const [section] = parseTableContent('キー表\n> focus, action,key\n# 注記\nA    ,B      ,C');
    const { content, colheader } = tableSectionToMetadataForm('キー表', section);
    expect(colheader).toBe('focus, action,key');
    expect(content).toBe('キー表\n# 注記\nA    ,B      ,C');
    const [reread] = parseTableContent(content, colheader);
    expect(reread.columns).toEqual(section.columns);
    expect(reread.rows).toEqual(section.rows);
    expect(tableSectionToMetadataForm('キー表', reread)).toEqual({ content, colheader });
  });

  it('列の並び替えを colheader と本文の両方へ反映する', () => {
    const [section] = parseTableContent('t\n1,2', 'a,b');
    expect(tableSectionToMetadataForm('t', section, [1, 0])).toEqual({ content: 't\n2,1', colheader: 'b,a' });
  });

  it('本文だけを読む処理向けに colheader を > 行へ戻す', () => {
    expect(tableContentWithBodyHeader('t\n1,2', 'a,b')).toBe('t\n> a,b\n1,2');
    expect(tableContentWithBodyHeader('t', 'a,b')).toBe('t\n> a,b');
    expect(tableContentWithBodyHeader('t\n1,2', undefined)).toBe('t\n1,2');
    expect(parseTableContent(tableContentWithBodyHeader('t\n> 注記\n1,2', 'a,b'))[0].columns).toEqual(['a', 'b']);
  });

  it('colheader は空でない文字列だけを有効とする', () => {
    expect(readColHeader({ colheader: 'a,b' })).toBe('a,b');
    expect(readColHeader({ colheader: '  ' })).toBeUndefined();
    expect(readColHeader({ colheader: ['a'] })).toBeUndefined();
    expect(readColHeader(undefined)).toBeUndefined();
  });
});
