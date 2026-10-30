import { describe, expect, it } from 'vitest';
import {
  createLinkFile,
  formatLinkTag,
  linkAffiliationOf,
  linkTagNameOf,
  parentFolderOf,
  parseLegacyLinks,
  parseLinkFile,
  parseLinkTag,
  pathRootOf,
  serializeLinkFile,
} from './linkFormat';

describe('linkTagNameOf', () => {
  it.each([
    ['https://mail.google.com/mail/u/0/#inbox/18f3abc012345678', 'gmail'],
    ['https://drive.google.com/file/d/1AbC/view', 'gdrive'],
    ['https://docs.google.com/document/d/1AbC/edit', 'gdrive'],
    ['https://photos.google.com/share/AF1Q', 'gphoto'],
    ['https://photos.app.goo.gl/abcd', 'gphoto'],
    ['https://notebook.google.com/notebook/xyz', 'gnb'],
    ['https://notebooklm.google.com/notebook/xyz', 'gnb'],
    ['https://example.com/page', 'link'],
    ['mailto:someone@example.com', 'link'],
  ] as const)('%s → %s', (target, tag) => {
    expect(linkTagNameOf(target)).toBe(tag);
  });

  it('ホスト名は完全一致で判定し、似せたホストやhttpはlinkにする', () => {
    expect(linkTagNameOf('https://photos.google.com.example.test/x')).toBe('link');
    expect(linkTagNameOf('https://evil.example/drive.google.com')).toBe('link');
    expect(linkTagNameOf('http://drive.google.com/x')).toBe('link');
  });

  it.each([
    'C:\\Users\\a\\b.md',
    'c:/Users/a/b.md',
    '\\\\server\\share\\x.xlsx',
    '/home/a/b.txt',
    'file:///C:/a/b.txt',
    'report.pdf',
  ])('%s はパス', target => {
    expect(linkTagNameOf(target)).toBe('path');
  });
});

describe('Affiliation', () => {
  it('URLはサーバーアドレス（ポートを含む）', () => {
    expect(linkAffiliationOf('https://example.com/a?b=1', 'PC1')).toBe('example.com');
    expect(linkAffiliationOf('http://localhost:5173/x', 'PC1')).toBe('localhost:5173');
  });

  it('パスは親フォルダを取得する', () => {
    expect(pathRootOf('c:\\Users\\a\\b.md')).toBe('C:');
    expect(pathRootOf('\\\\srv\\share\\dir\\x')).toBe('\\\\srv\\share');
    expect(pathRootOf('/home/a/b')).toBe('/home');
    expect(parentFolderOf('C:\\Users\\a\\b.md')).toBe('C:\\Users\\a');
    expect(parentFolderOf('D:\\x')).toBe('D:\\');
    expect(parentFolderOf('\\\\srv\\share\\dir\\x')).toBe('\\\\srv\\share\\dir');
    expect(parentFolderOf('/home/a/b')).toBe('/home/a');
    expect(linkAffiliationOf('C:\\Users\\a\\b.md', 'MYPC')).toBe('(MYPC)C:\\Users\\a');
    expect(linkAffiliationOf('\\\\srv\\share\\x', 'MYPC')).toBe('(MYPC)\\\\srv\\share');
  });

  it('PC名や親フォルダが分からない場合も判明分を記録する', () => {
    expect(linkAffiliationOf('D:\\x', '')).toBe('(unknown)D:\\');
    expect(linkAffiliationOf('report.pdf', 'MYPC')).toBe('(MYPC)');
  });
});

describe('linkファイルの書式', () => {
  it('1行目タイトル・2行目=・3行目から見出しの順で書く', () => {
    const text = serializeLinkFile(createLinkFile('Example Domain', 'https://example.com/', 'PC1'));
    expect(text).toBe([
      'Example Domain',
      '=',
      '# Link',
      'https://example.com/',
      '# Affiliation',
      'example.com',
      '# Abstract',
    ].join('\n'));
  });

  it('serialize → parse で往復する', () => {
    const file = { title: '資料', link: 'C:\\a\\b.md', affiliation: '(PC1)C:\\a', abstract: '概要1\n概要2' };
    const serialized = serializeLinkFile(file);
    expect(serialized).toContain('# Link\n"C:\\a\\b.md"');
    expect(serialized).toContain('# Affiliation\n"(PC1)C:\\a"');
    expect(parseLinkFile(serialized)).toEqual(file);
  });

  it('旧来の引用符なしpathも読み取れる', () => {
    expect(parseLinkFile('T\n=\n# Link\nC:\\a\\b.jpg\n# Affiliation\nPC:C:\n# Abstract')).toMatchObject({
      link: 'C:\\a\\b.jpg', affiliation: 'PC:C:',
    });
  });

  it('2行目が空行やCRLFでも読める', () => {
    expect(parseLinkFile('T\r\n\r\n# Link\r\nhttps://a.example/\r\n# Abstract\r\nメモ')).toEqual({
      title: 'T', link: 'https://a.example/', affiliation: '', abstract: 'メモ',
    });
  });

  it('旧書式は先頭のリンクを読む', () => {
    const legacy = 'リンク集\n* [Anthropic](https://www.anthropic.com)\n* https://github.com';
    expect(parseLegacyLinks(legacy)).toEqual([
      { title: 'Anthropic', url: 'https://www.anthropic.com' },
      { title: 'https://github.com', url: 'https://github.com' },
    ]);
    expect(parseLinkFile(legacy)).toEqual({ title: 'リンク集', link: 'https://www.anthropic.com', affiliation: '', abstract: '' });
  });

  it('リンクが無ければ null', () => {
    expect(parseLinkFile('タイトルだけ')).toBeNull();
    expect(parseLinkFile('T\n=\n# Link\n\n# Abstract\nx')).toBeNull();
  });
});

describe('参照タグ', () => {
  it('タグ名とThinkIDを組み立て・読み取る（大文字小文字は問わない）', () => {
    expect(formatLinkTag('gdrive', '2026-10-30-120000')).toBe('[gdrive:2026-10-30-120000]');
    expect(parseLinkTag('[GDrive:2026-10-30-120000]')).toEqual({ tag: 'gdrive', thinkId: '2026-10-30-120000' });
    expect(parseLinkTag('[path: 2026-10-30-120000-a3f9 ]')).toEqual({ tag: 'path', thinkId: '2026-10-30-120000-a3f9' });
  });

  it('値がThinkIDでない・未知のタグ名は対象外', () => {
    expect(parseLinkTag('[GMail:from:a@example.com]')).toBeNull();
    expect(parseLinkTag('[memo:2026-10-30-120000]')).toBeNull();
    expect(parseLinkTag('link:2026-10-30-120000')).toBeNull();
  });

  it('廃止した [links:ID] は [link:ID] として読む', () => {
    expect(parseLinkTag('[links:2026-10-30-120000]')).toEqual({ tag: 'link', thinkId: '2026-10-30-120000' });
  });
});
